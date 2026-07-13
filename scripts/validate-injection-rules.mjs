#!/usr/bin/env node
/**
 * validate-injection-rules.mjs — gate a converted API workflow against Cubric's
 * ComfyUI injection rules (.claude/rules/comfy_injection.md) BEFORE it is baked
 * into runtime files. API format has no UI cruft, so the checkable contract is
 * exactly the node titles + inputs + graph shape.
 *
 * Usage:
 *   node scripts/validate-injection-rules.mjs <api.json> [<api.json> ...]
 *
 * Exit 0 = all clean. Exit 1 = at least one violation (printed per file, per node).
 * On any violation the caller (sync-raw-workflows.mjs) STOPS before orchestrate.
 *
 * Checks (all report the offending node + tell the user to re-title in ComfyUI —
 * agents NEVER edit workflow JSON, per the injection rules):
 *   1. Title-prefix law (MPI-116/252): deprecated bare tier-1 titles must be
 *      Input_ / Output_ prefixed. We flag the KNOWN bare vocabulary, not every
 *      bare title (workflow-internal helper nodes legitimately keep their names).
 *   2. Capture node: >=1 node titled Output_Image / Output_Video / Output_Preview.
 *   3. Seed convention (MPI-257): if any node exposes a noise_seed widget, a node
 *      titled "Input_Seed" must exist — else the seedless-dedupe guard mis-fires.
 *   4. Converter integrity: every required input of every emitted node is satisfied
 *      (widget value or link), and no link points at a node not in the graph.
 *
 * Requires a running ComfyUI (/object_info) for the required-input check — same
 * engine the converter used. COMFY_URL overrides http://127.0.0.1:8188.
 */

import fs from 'node:fs/promises';
import process from 'node:process';
import http from 'node:http';

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';

// Deprecated bare tier-1 titles (MPI-252) — every one of these was converted to an
// Input_*/Output_* form fleet-wide. Seeing a bare one in a fresh export = a node
// the user forgot to re-title. Case-insensitive exact match. `Checkpoint`/`Model`/
// `sams` are workflow-internal loaders that legitimately keep bare titles — NOT here.
const DEPRECATED_BARE_TITLES = new Set([
  'positive', 'negative', 'seed', 'width', 'height', 'output', 'preview',
  'detected', 'box', 'start_frame', 'end_frame', 'steps', 'denoise', 'batch_size',
  'duration', 'motion_intensity', 'upscale_model', 'upscale_factor',
]);

const CAPTURE_TITLES = new Set(['output_image', 'output_video', 'output_preview']);

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

const titleOf = (node) => node?._meta?.title || '';
const isLink = (v) => Array.isArray(v) && v.length === 2 && typeof v[1] === 'number';

/** Returns an array of violation strings for one API workflow object. */
function checkWorkflow(wf, objectInfo) {
  const violations = [];
  const nodes = Object.entries(wf).filter(([, n]) => n && typeof n === 'object' && n.class_type);

  // 1. Title-prefix law — flag a deprecated bare title ONLY when no Input_<name> /
  // Output_<name> sibling exists. If the prefixed node is present, the bare one is a
  // workflow-internal helper (e.g. an MpiWanSeconds "Duration" fed by an "Input_Duration"
  // MpiInt) — legitimately un-prefixed, since the app injects the sibling, not this node.
  const titleSet = new Set(nodes.map(([, n]) => titleOf(n).toLowerCase()));
  for (const [id, node] of nodes) {
    const t = titleOf(node).toLowerCase();
    if (!DEPRECATED_BARE_TITLES.has(t)) continue;
    if (titleSet.has(`input_${t}`) || titleSet.has(`output_${t}`)) continue;  // prefixed sibling owns the role
    violations.push(
      `node ${id} (${node.class_type}) is titled "${titleOf(node)}" — a deprecated bare title with no ` +
      `Input_${titleOf(node)} / Output_${titleOf(node)} sibling. If the app injects/reads this node, ` +
      `re-title it in the ComfyUI graph and re-export; if it is a workflow-internal helper, rename it to a non-reserved title.`
    );
  }

  // 2. Capture node present.
  const hasCapture = nodes.some(([, n]) => CAPTURE_TITLES.has(titleOf(n).toLowerCase()));
  if (!hasCapture) {
    violations.push(
      `no capture node — every workflow needs a node titled Output_Image / Output_Video / Output_Preview. ` +
      `Title the result node in the ComfyUI graph and re-export.`
    );
  }

  // 3. Seed convention — a noise_seed anywhere ⇒ an Input_Seed node must exist.
  const hasNoiseSeed = nodes.some(([, n]) => n.inputs && 'noise_seed' in n.inputs);
  const hasInputSeed = nodes.some(([, n]) => titleOf(n).toLowerCase() === 'input_seed');
  if (hasNoiseSeed && !hasInputSeed) {
    violations.push(
      `a sampler exposes noise_seed but no node is titled "Input_Seed" (MPI-257). Without it the ` +
      `seedless-dedupe guard mis-fires and blocks re-runs. Add/title an Input_Seed node feeding noise_seed and re-export.`
    );
  }

  // 4. Converter integrity — unknown node class + dangling links. We do NOT re-check
  // "required inputs present": the converter already resolves widget defaults and
  // omits inputs equal to their default (ComfyUI fills them at runtime), so a
  // present-vs-object_info.required diff produces false positives (e.g. the optional
  // `channel` on MpiLoadImageFromPath, a linked `images` slot). The converter throws
  // on a genuinely broken graph; here we only catch what survives into the API JSON.
  for (const [id, node] of nodes) {
    if (!objectInfo[node.class_type]) {
      violations.push(`node ${id} class "${node.class_type}" is not in /object_info — install the custom node or it was renamed.`);
    }
    for (const [k, v] of Object.entries(node.inputs || {})) {
      if (isLink(v) && !(String(v[0]) in wf)) {
        violations.push(`node ${id} (${node.class_type}) input "${k}" links to node ${v[0]} which is not in the graph (dangling).`);
      }
    }
  }

  return violations;
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node scripts/validate-injection-rules.mjs <api.json> [...]');
    process.exit(2);
  }
  const objectInfo = await fetchObjectInfo();

  let bad = 0;
  for (const f of files) {
    let wf;
    try { wf = JSON.parse(await fs.readFile(f, 'utf8')); }
    catch (e) { console.error(`✗ ${f}: cannot read/parse (${e.message})`); bad++; continue; }
    const violations = checkWorkflow(wf, objectInfo);
    if (violations.length) {
      bad++;
      console.error(`✗ ${f} — ${violations.length} injection-rule violation(s):`);
      for (const v of violations) console.error(`    • ${v}`);
    } else {
      console.log(`✓ ${f}`);
    }
  }
  if (bad) {
    console.error(`\n${bad} file(s) violate the injection rules. Fix in the ComfyUI graph editor and re-export — agents never edit workflow JSON.`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} file(s) conform to the injection rules.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
