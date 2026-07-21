#!/usr/bin/env node
/**
 * workflow-to-api.mjs — convert ComfyUI browser (LiteGraph) workflow exports
 * into API-format prompt JSON, so you can save once from the ComfyUI browser
 * and batch-convert into the shape Cubric's pipeline consumes.
 *
 * Usage:
 *   node scripts/workflow-to-api.mjs [srcDir] [outDir]
 *   node scripts/workflow-to-api.mjs path/to/one.json          # single file -> stdout
 *
 * Defaults: srcDir = comfy_workflows/raw, outDir = comfy_workflows
 *
 * Widget names are resolved from the LIVE engine's /object_info (port 8188) —
 * exactly how the ComfyUI backend knows a node's input names. Engine must be up.
 *
 * Fidelity ported from ComfyUI_frontend graphToPrompt:
 *   - mode 4 (BYPASS): node dropped, its outputs rewired to the matching upstream input.
 *   - mode 2 (NEVER/mute): node dropped, dead links to it removed.
 *   - control_after_generate widgets consume an extra positional value (skipped).
 *   - array widget values wrapped as { __value__ } so backend won't read them as links.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';

// LiteGraph link tuple indices: [id, originNode, originSlot, targetNode, targetSlot, type]
const L_ORIGIN = 1, L_ORIGIN_SLOT = 2;
const MODE_MUTE = 2, MODE_BYPASS = 4;

// UI-only nodes that never execute — the frontend omits them from the prompt.
// Reroute/PrimitiveNode are also handled as bypass-style passthrough by resolveLink
// because a live upstream link still resolves past them.
const VIRTUAL_NODES = new Set(['Note', 'MarkdownNote', 'Reroute', 'PrimitiveNode', 'GetNode', 'SetNode']);

// stdlib http.get, not fetch — global fetch (undici) leaves keep-alive sockets
// that assert-crash at process teardown on Node 24/Windows.
function fetchObjectInfo() {
  return new Promise((resolve, reject) => {
    http.get(`${COMFY}/object_info`, { headers: { connection: 'close' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`/object_info returned ${res.statusCode}`)); res.resume(); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', (e) => reject(new Error(`Cannot reach ComfyUI at ${COMFY} (${e.message}). Start the engine first.`)));
  });
}

/**
 * Ordered widget-input names for a node class, and which of them carry a
 * control_after_generate companion value. Mirrors LiteGraph widget expansion:
 * only inputs whose type is NOT a node-connection (i.e. primitive/combo) become
 * positional widgets_values entries.
 */
const PRIMITIVE = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);
const isWidgetType = (type) => Array.isArray(type) || PRIMITIVE.has(type);

/**
 * Walk a def's input spec, consuming widgets_values positionally, emitting named
 * entries into `out`. Handles control_after_generate (skips its companion value)
 * and COMFY_DYNAMICCOMBO_V3 (the selected option expands nested inputs, flattened
 * as `<name>.<subkey>`). `linkedNames` = input slots that are links, not widgets,
 * so they consume no positional value. Returns the next value index.
 */
function emitWidgets(def, vals, out, linkedNames, prefix = '', vi = 0) {
  const req = def?.input?.required || {};
  const opt = def?.input?.optional || {};
  const order = def?.input_order?.required
    ? [...def.input_order.required, ...(def.input_order.optional || [])]
    : [...Object.keys(req), ...Object.keys(opt)];

  for (const name of order) {
    const spec = req[name] || opt[name];
    if (!spec) continue;
    const type = spec[0];
    const opts = spec[1] || {};
    const fullName = prefix + name;

    // Dynamic combo: value picks an option; that option's nested inputs expand inline.
    if (type === 'COMFY_DYNAMICCOMBO_V3') {
      if (vi >= vals.length) break;
      const picked = vals[vi++];
      out[fullName] = picked;
      const chosen = (opts.options || []).find((o) => o.key === picked);
      if (chosen?.inputs) {
        // Build a mini-def so we recurse with the same rules.
        vi = emitWidgets({ input: chosen.inputs }, vals, out, linkedNames, `${fullName}.`, vi);
      }
      continue;
    }

    if (!isWidgetType(type)) continue;                        // link type, not a widget
    // forceInput: always a socket, never a widget — occupies NO positional value.
    if (opts.forceInput) continue;
    if (vi >= vals.length) break;
    // A widget converted to an input socket keeps its positional value but the
    // link supplies the real value — consume the slot, don't emit (link loop wins).
    if (!linkedNames.has(fullName)) out[fullName] = wrap(vals[vi]);
    // The frontend appends a control_after_generate combo to any INT widget named
    // seed/noise_seed (addValueControlWidgets), even when /object_info omits the
    // flag — that phantom value ("fixed"/"randomize") sits in widgets_values and
    // must be skipped, else every later widget shifts by one.
    // ...but ONLY at the top level. Inside a dynamic combo's expanded inputs the
    // frontend does NOT add the control widget, so a nested INT named `seed`
    // (e.g. TextGenerate's sampling_mode.seed) has no companion value. Applying
    // the heuristic there eats the next widget's slot and shifts every value
    // after it by one — silently, since the result is still valid JSON.
    const hasControl = opts.control_after_generate
      || (!prefix && type === 'INT' && (name === 'seed' || name === 'noise_seed'));
    vi += hasControl ? 2 : 1;                                 // skip control companion value
  }
  return vi;
}

function wrap(value) {
  // Array widget value would collide with a [nodeId, slot] link tuple — wrap it.
  return Array.isArray(value) ? { __value__: value } : value;
}

/**
 * Walk from a target node's input link through bypass/mute AND virtual wiring
 * (Reroute, KJNodes SetNode/GetNode teleport) to a real source [nodeId, slot].
 * ctx = { nodesById, linksById, setByName } where setByName maps a Set/Get
 * variable name -> the SetNode that defines it.
 */
function resolveLink(startNode, startSlot, ctx, seen = new Set()) {
  const { nodesById, linksById, setByName } = ctx;
  let node = startNode, slot = startSlot;
  while (true) {
    const inSlot = node.inputs?.[slot];
    if (!inSlot || inSlot.link == null) return null;         // dead end
    const link = linksById.get(inSlot.link);
    if (!link) return null;
    let origin = nodesById.get(link[L_ORIGIN]);
    if (!origin) return null;
    let originSlot = link[L_ORIGIN_SLOT];

    if (seen.has(origin.id)) return null;                    // cycle guard
    if (origin.mode === MODE_MUTE) return null;              // muted -> no output

    // GetNode has no inputs — jump to its SetNode twin (matched by variable name).
    if (origin.type === 'GetNode') {
      seen.add(origin.id);
      const varName = origin.widgets_values?.[0];
      const setNode = setByName.get(varName);
      if (!setNode) return null;
      node = setNode; slot = 0;                              // SetNode's single input
      continue;
    }
    // SetNode / Reroute — single passthrough input.
    if (origin.type === 'SetNode' || origin.type === 'Reroute') {
      seen.add(origin.id);
      node = origin; slot = 0;
      continue;
    }
    if (origin.mode === MODE_BYPASS) {
      seen.add(origin.id);
      const inIdx = bypassInputIndex(origin, originSlot);
      if (inIdx === -1) return null;
      node = origin; slot = inIdx;                           // hop through
      continue;
    }
    return [String(origin.id), originSlot];                  // live source
  }
}

/** Which input a bypassed node forwards for a given output slot: same index, else first matching type. */
function bypassInputIndex(node, outSlot) {
  const outType = node.outputs?.[outSlot]?.type;
  const inputs = node.inputs || [];
  if (inputs[outSlot] && (inputs[outSlot].type === outType || outType === '*' || !outType)) return outSlot;
  const byType = inputs.findIndex((i) => i.type === outType);
  return byType;                                             // -1 if none
}

function convert(workflow, objectInfo) {
  const nodes = workflow.nodes || [];
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const linksById = new Map((workflow.links || []).map((l) => [l[0], l]));
  // KJNodes SetNode publishes a named wire; its GetNode twins read it by name.
  const setByName = new Map(
    nodes.filter((n) => n.type === 'SetNode').map((n) => [n.widgets_values?.[0], n])
  );
  const ctx = { nodesById, linksById, setByName };
  const output = {};

  for (const node of nodes) {
    if (node.mode === MODE_MUTE || node.mode === MODE_BYPASS) continue;
    if (VIRTUAL_NODES.has(node.type)) continue;             // UI-only, never in prompt
    const def = objectInfo[node.type];
    if (!def) {
      throw new Error(`Unknown node type "${node.type}" (id ${node.id}) — not in this engine's /object_info. Install the custom node, or it was renamed.\n  Find which pack ships it: node scripts/resolve-comfy-node.mjs ${node.type}`);
    }

    const inputs = {};

    // Names of input slots that carry a live link (a widget dragged to a socket,
    // or a real node input) — these keep a positional value but the link wins.
    const linkedNames = new Set(
      (node.inputs || []).filter((s) => s.link != null).map((s) => s.name)
    );

    // Widget values: usually a positional array; some nodes (VHS) serialize an
    // object keyed by widget name — map those straight across.
    const wv = node.widgets_values;
    if (wv && !Array.isArray(wv) && typeof wv === 'object') {
      const req = def.input?.required || {}, opt = def.input?.optional || {};
      for (const [name, value] of Object.entries(wv)) {
        if (!(name in req) && !(name in opt)) continue;       // skip UI-only keys (videopreview, etc.)
        if (linkedNames.has(name)) continue;                  // link wins
        inputs[name] = wrap(value);
      }
    } else {
      // Positional array. Handles control_after_generate + dynamic combos + forceInput.
      emitWidgets(def, wv || [], inputs, linkedNames);
    }

    // Input links -> [originId, originSlot], resolving through bypass/mute/virtual.
    for (let i = 0; i < (node.inputs?.length || 0); i++) {
      const inSlot = node.inputs[i];
      if (inSlot.link == null) continue;
      const resolved = resolveLink(node, i, ctx);
      if (resolved) inputs[inSlot.name] = resolved;
    }

    output[String(node.id)] = {
      inputs,
      class_type: node.type,
      _meta: { title: node.title || def.display_name || node.type },
    };
  }

  // Dead-link cleanup: drop any link tuple pointing at a node we didn't emit.
  for (const { inputs } of Object.values(output)) {
    for (const [k, v] of Object.entries(inputs)) {
      if (Array.isArray(v) && v.length === 2 && !output[v[0]]) delete inputs[k];
    }
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const objectInfo = await fetchObjectInfo();

  // Single-file mode -> stdout
  if (args[0] && args[0].endsWith('.json')) {
    const wf = JSON.parse(await fs.readFile(args[0], 'utf8'));
    if (!wf.nodes) throw new Error(`${args[0]} is not a LiteGraph export (no .nodes[]). Already API format?`);
    process.stdout.write(JSON.stringify(convert(wf, objectInfo), null, 2) + '\n');
    return;
  }

  const srcDir = path.resolve(REPO_ROOT, args[0] || 'comfy_workflows/raw');
  const outDir = path.resolve(REPO_ROOT, args[1] || 'comfy_workflows');
  if (!existsSync(srcDir)) throw new Error(`Source dir not found: ${srcDir}`);
  // raw/ holds the user's ONLY editable LiteGraph sources — never a write target.
  // A mis-routed outDir here would silently overwrite them with API JSON the user
  // cannot re-edit. Refuse outright.
  const RAW_DIR = path.resolve(REPO_ROOT, 'comfy_workflows/raw');
  const relToRaw = path.relative(RAW_DIR, outDir);
  if (!relToRaw.startsWith('..')) {  // '' (== raw) or a subdir of raw → refuse
    throw new Error(`REFUSING to write into raw/ (user-owned LiteGraph source): ${outDir}`);
  }
  await fs.mkdir(outDir, { recursive: true });

  const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith('.json'));
  if (!files.length) { console.log(`No .json in ${srcDir}`); return; }

  let ok = 0;
  for (const f of files) {
    const src = path.join(srcDir, f);
    try {
      const wf = JSON.parse(await fs.readFile(src, 'utf8'));
      if (!wf.nodes) { console.warn(`SKIP ${f}: not a LiteGraph export (no .nodes[])`); continue; }
      const api = convert(wf, objectInfo);
      await fs.writeFile(path.join(outDir, f), JSON.stringify(api, null, 2) + '\n');
      console.log(`OK   ${f}  (${Object.keys(api).length} nodes)`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${f}: ${e.message}`);
    }
  }
  console.log(`\n${ok}/${files.length} converted -> ${outDir}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
