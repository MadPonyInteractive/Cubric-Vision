'use strict';
// MPI-438 — guard the set that `remoteModels.ensureUniversalNodesOnVolume()` installs.
//
// The contract (universal_workflows.js): every type:'custom_nodes' dep installs WITH the
// engine and is never tracked per-workflow. The LOCAL engine honours it via
// checkUniversalWorkflowDepsStatus(). On a Pod the "engine" is image + volume, so the
// remote twin must install exactly the CODE-ONLY packs — the ones _isImageResident()
// says the image does NOT bake.
//
// Found live 2026-08-04: Resize Video died with `missing_node_type VHS_LoadVideoPath` on
// a volume that had never installed Wan 2.2, because VideoHelperSuite is declared by only
// 2 of 18 models. Head Swap has the same defect through inpaint-cropandstitch (3 of 18).
//
// Three regressions this locks out:
//   1. The selection loses a code-only pack → that universal op silently breaks again on
//      a volume whose models don't happen to carry it.
//   2. A BAKED pack leaks into the selection → the wrapper is asked to volume-install a
//      node that lives in the image, which cd's into a /workspace folder that does not
//      exist ("[Errno 2] No such file or directory", the MPI-244 failure).
//   3. A dep arrives without `id`/`filename`/`url` → remoteInstallDep builds a body the
//      wrapper cannot act on, and the ensure reports success having installed nothing.
const assert = require('assert');
const { getUniversalWorkflowDeps } = require('../routes/shared');
const remoteModels = require('../routes/remoteModels');

const universal = getUniversalWorkflowDeps();
assert.ok(universal.length > 0, 'the universal dep set must not be empty');

// remoteInstallDep sends `dep.id` as the wrapper's install key and the app dedupes on it.
// All 112 DEPS entries currently self-identify (`dep.id === its key`); this holds that.
for (const dep of universal) {
    assert.ok(dep && typeof dep.id === 'string' && dep.id.length > 0,
        `every universal dep must carry its id (got ${JSON.stringify(dep && dep.id)})`);
}

// The SHIPPED selection — the same call ensureUniversalNodesOnVolume() makes. Asserting a
// local copy of the expression here would pass while the real filter drifted.
const codeOnly = remoteModels._universalVolumeNodeDeps();
const ids = new Set(codeOnly.map((d) => d.id));

// The two packs measured live-broken, plus the one every universal graph uses.
for (const id of ['ComfyUI-VideoHelperSuite', 'comfyui-inpaint-cropandstitch', 'ComfyUI-MpiNodes']) {
    assert.ok(ids.has(id),
        `${id} is a CODE-ONLY universal pack and must be in the remote ensure set — ` +
        'dropping it is how Resize Video / Head Swap broke on a Pod volume');
}

// Baked packs ride the image. Asking the wrapper to volume-install one is the MPI-244 bug.
for (const id of ['comfyui_controlnet_aux', 'ComfyUI-LTXVideo', 'RES4LYF',
    'ComfyUI-Impact-Pack', 'comfyui-kjnodes', 'ComfyUI-Frame-Interpolation', 'ComfyUI-Impact-Subpack']) {
    assert.ok(!ids.has(id),
        `${id} is installRequirements:true (BAKED into the Pod image) and must NOT be volume-installed`);
}

// engineAsset WEIGHTS are in the universal set too (upscalers, detectors). The ensure
// installs NODES only — a weight sent down the custom_nodes body shape has no folder.
for (const dep of codeOnly) {
    assert.strictEqual(dep.type, 'custom_nodes',
        `only custom_nodes may reach the node ensure (got ${dep.id} type=${dep.type})`);
}
assert.ok(universal.some((d) => d.engineAsset === true),
    'sanity: the universal set should still contain engineAsset weights, which the filter drops');

// remoteInstallDep reads filename + url off each dep; a missing one installs nothing while
// still returning 202-ish success.
for (const dep of codeOnly) {
    assert.ok(dep.filename && !dep.filename.includes('/') && !dep.filename.includes('\\'),
        `${dep.id}: custom_nodes filename must be a bare folder name (got ${dep.filename})`);
    assert.ok(typeof dep.url === 'string' && /^https?:\/\//.test(dep.url),
        `${dep.id}: needs a fetchable url for the wrapper volume install (got ${dep.url})`);
}

console.log(`universal-nodes-remote: OK — ${codeOnly.length} code-only pack(s) selected ` +
    `(${[...ids].join(', ')}), ${universal.length - codeOnly.length} baked/weight dep(s) excluded`);
