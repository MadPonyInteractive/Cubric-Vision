'use strict';
// MPI-242 — guard the Pod bake/volume split around comfyui_controlnet_aux.
//
// Its requirements.txt lists bare `torch` and `torchvision` (no version constraint),
// which USED to be a live hazard here: the default installer ran
// `pip install -r requirements.txt --upgrade`, and `--upgrade` on an unconstrained
// name resolves from PyPI, which ships no `+cu130` wheels — and losing +cu130
// destroys the ~10x cold fault-in fix (MPI-187).
//
//   pip install --dry-run --upgrade torch      -> "Would install torch-2.13.0"      ✗
//   pip install --dry-run -r requirements.txt  -> "torch ... (2.12.0+cu130)" ok     ✓
//
// That hazard is gone. MPI-413 removed the per-node requirements step from BOTH
// engines: nothing resolves this pack's requirements.txt any more, the Pod bakes the
// one curated dev_configs/python_deps.in set with --no-deps, and the Dockerfile
// re-pins the cu130 trio afterwards. So the two repairs this file used to assert on
// were both deleted as dead data — `pipPins` by MPI-630, `installRequirementsCommand`
// by MPI-646 — and their assertions went with them. Keeping an assertion about a code
// path that no longer runs is exactly what pushes the next node to invent dead data to
// satisfy it (ComfyUI-MelodramaBox did that with pipPins).
//
// The shared libs both repairs used to pin are pinned in dev_configs/python_deps.in,
// guarded by curated-python-deps.test.cjs. What stays here is the bake split, which is
// still live: it decides what the Pod image contains and when it must be rebuilt.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// MPI-293: read nodesDeps.js — dependencies.js only SPREADS `...nodesDeps` and holds
// no inline custom_nodes block text, so this regex found nothing there (assert null).
const src = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'data', 'modelConstants', 'nodesDeps.js'),
    'utf8',
);

// Pull the comfyui_controlnet_aux dep block out of the module source (no ESM import
// from a .cjs test).
const m = src.match(/'comfyui_controlnet_aux':\s*\{([\s\S]*?)\n    \},/);
assert.ok(m, 'comfyui_controlnet_aux dep must exist');
const block = m[1];

// 1. It is a baked node (has requirements.txt) => Pod image rebuild is required.
assert.ok(/installRequirements:\s*true/.test(block),
    'has a requirements.txt => installRequirements:true => baked into the Pod image');

// 2. The sibling facok node is code-only => must NOT be baked.
const f = src.match(/'ComfyUI-Krea2-ControlNet':\s*\{([\s\S]*?)\n    \},/);
assert.ok(f, 'ComfyUI-Krea2-ControlNet dep must exist');
assert.ok(/installRequirements:\s*false/.test(f[1]),
    'facok repo is __init__.py + nodes.py only, no requirements.txt => installRequirements:false');

console.log('controlnet-aux-torch-guard: all assertions passed');
