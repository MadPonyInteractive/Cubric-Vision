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
 *   1. Capture node: >=1 node titled Output_Image / Output_Video / Output_Preview.
 *   2. Seed convention (MPI-257): if any node exposes a noise_seed widget, a node
 *      titled "Input_Seed" must exist — else the seedless-dedupe guard mis-fires.
 *   3. Converter integrity: every required input of every emitted node is satisfied
 *      (widget value or link), and no link points at a node not in the graph.
 *
 * NOTE (MPI-300): the old "deprecated bare-title" check is GONE. The injection
 * contract is now purely prefix-based — the app injects ONLY Input_* nodes and reads
 * ONLY Output_* nodes (author convention: prefix + colour those nodes yellow). Any
 * un-prefixed node is by definition workflow-internal, so its title is the author's
 * to choose freely (descriptive debug names like "steps" / "denoise" are welcome).
 * The bare-vocabulary blocklist existed only to migrate pre-prefix legacy workflows,
 * a migration now complete, and had become a false-positive on internal debug titles.
 *
 * Requires a running ComfyUI (/object_info) for the required-input check — same
 * engine the converter used. COMFY_URL overrides http://127.0.0.1:8188.
 */

import fs from 'node:fs/promises';
import process from 'node:process';
import http from 'node:http';

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';

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

  // 1. Capture node present.
  const hasCapture = nodes.some(([, n]) => CAPTURE_TITLES.has(titleOf(n).toLowerCase()));
  if (!hasCapture) {
    violations.push(
      `no capture node — every workflow needs a node titled Output_Image / Output_Video / Output_Preview. ` +
      `Title the result node in the ComfyUI graph and re-export.`
    );
  }

  // 2. Seed convention — a noise_seed anywhere ⇒ an Input_Seed node must exist.
  const hasNoiseSeed = nodes.some(([, n]) => n.inputs && 'noise_seed' in n.inputs);
  const hasInputSeed = nodes.some(([, n]) => titleOf(n).toLowerCase() === 'input_seed');
  if (hasNoiseSeed && !hasInputSeed) {
    violations.push(
      `a sampler exposes noise_seed but no node is titled "Input_Seed" (MPI-257). Without it the ` +
      `seedless-dedupe guard mis-fires and blocks re-runs. Add/title an Input_Seed node feeding noise_seed and re-export.`
    );
  }

  // 3. Converter integrity — unknown node class + dangling links. We do NOT re-check
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

  // 4. Injection reachability — every Input_* node must have a live path to a capture
  // node. The app injects BY TITLE and never checks the graph, so an Input_* that feeds
  // nothing (or feeds only a dead branch) accepts the value and silently drops it: the
  // user picks an image, the model never sees it, and there is no error anywhere.
  // Bypassed/muted nodes are already stripped by the converter, so a slot that routed
  // through one arrives here orphaned — which is exactly how qwen_edit's Input_Image_2
  // died (MPI-300: it fed a bypassed ImageResizeKJv2, caught only by hand-tracing links).
  const consumersOf = new Map();   // producer id -> [consumer id]
  for (const [id, node] of nodes) {
    for (const v of Object.values(node.inputs || {})) {
      if (!isLink(v)) continue;
      const src = String(v[0]);
      if (!consumersOf.has(src)) consumersOf.set(src, []);
      consumersOf.get(src).push(id);
    }
  }
  // Any Output_* counts as a terminus here, not just the three CAPTURE_TITLES: Apps ship
  // numbered captures (Output_Image_2/_3) and side outputs (Output_prompt), and a slot that
  // feeds one of those is genuinely wired. Check 1 above still demands a primary capture.
  const captureIds = new Set(nodes.filter(([, n]) => /^output_/i.test(titleOf(n))).map(([id]) => id));
  const reaches = (startId) => {
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length) {
      const cur = stack.pop();
      if (captureIds.has(cur)) return true;
      for (const next of consumersOf.get(cur) || []) {
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    return false;
  };
  // A refiner stage runs its sampler with `add_noise: false`, which makes that sampler's
  // noise_seed a dead input — so an Input_Seed feeding nothing is CORRECT there, not a
  // dropped injection (MPI-303: wan22_i2v_stage2 was filed as a bug on exactly this and
  // closed as not-a-bug; stage 2 refines stage 1's latent, all variance comes from
  // stage 1's seed). Exempt Input_Seed only when no sampler in the graph could consume a
  // seed at all; any live noise_seed means a real Input_Seed orphan is still a real bug.
  const anySeedConsumer = nodes.some(([, n]) =>
    n.inputs && 'noise_seed' in n.inputs && n.inputs.add_noise !== false
  );
  for (const [id, node] of nodes) {
    const title = titleOf(node);
    if (!/^input_/i.test(title)) continue;
    if (title.toLowerCase() === 'input_seed' && !anySeedConsumer) continue;
    if (!reaches(id)) {
      violations.push(
        `node ${id} titled "${title}" never reaches a capture node — the app will inject into it ` +
        `and the value is silently discarded. Reconnect it in the ComfyUI graph (or drop the node) and re-export.`
      );
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
