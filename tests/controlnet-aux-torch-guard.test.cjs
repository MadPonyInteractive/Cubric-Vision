'use strict';
// MPI-242 — guard the cu130 torch against comfyui_controlnet_aux.
//
// It is the FIRST baked custom node whose requirements.txt lists bare `torch` and
// `torchvision` (no version constraint). The node does NOT need a different torch —
// the engine's 2.12.0+cu130 satisfies it. The hazard is OUR flag: the default
// installer runs `pip install -r requirements.txt --upgrade`, and `--upgrade` on an
// unconstrained name resolves from PyPI, which ships no `+cu130` wheels.
//
//   pip install --dry-run --upgrade torch      -> "Would install torch-2.13.0"      ✗
//   pip install --dry-run -r requirements.txt  -> "torch ... (2.12.0+cu130)" ok     ✓
//
// Losing +cu130 destroys the ~10x cold fault-in fix (MPI-187).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'data', 'modelConstants', 'dependencies.js'),
    'utf8',
);

// Pull the comfyui_controlnet_aux dep block out of the module source (no ESM import
// from a .cjs test).
const m = src.match(/'comfyui_controlnet_aux':\s*\{([\s\S]*?)\n    \},/);
assert.ok(m, 'comfyui_controlnet_aux dep must exist');
const block = m[1];

// 1. It MUST override the default pip path, or --upgrade clobbers torch.
const cmd = block.match(/installRequirementsCommand:\s*'([^']+)'/);
assert.ok(cmd, 'must declare installRequirementsCommand to bypass the --upgrade default');

// 2. That command must NOT carry --upgrade.
assert.ok(!/--upgrade/.test(cmd[1]),
    `installRequirementsCommand must not use --upgrade (got: ${cmd[1]})`);

// 3. runCustomCommand (routes/shared.js) only swaps the interpreter when argv[0] is
//    exactly "python" — anything else is spawned verbatim and would miss the
//    embedded interpreter.
assert.strictEqual(cmd[1].split(' ')[0], 'python',
    'command must start with bare "python" so runCustomCommand swaps in python_embeded');
assert.ok(/-r\s+requirements\.txt/.test(cmd[1]), 'command must install the requirements file');

// 4. pipPins must NOT pin torch/torchvision. `pip install torch==2.12.0+cu130` has no
//    --index-url on this path and those wheels are absent from PyPI, so such a pin
//    would FAIL and abort the whole node install.
const pins = block.match(/pipPins:\s*\[([\s\S]*?)\]/);
assert.ok(pins, 'pipPins must exist to correct the other unpinned shared libs');
assert.ok(!/torch/i.test(pins[1]),
    'pipPins must NOT contain torch/torchvision — no --index-url here, the pin would fail');

// 5. The shared libs its requirements.txt leaves unpinned must still be pinned, or
//    they float and drift the whole engine (the MPI-217 lesson, via RES4LYF).
for (const pkg of ['numpy', 'opencv-python', 'pillow', 'scipy', 'scikit-image', 'einops']) {
    assert.ok(pins[1].includes(`${pkg}==`), `pipPins must pin ${pkg}`);
}

// 6. It is a baked node (has requirements.txt) => Pod image rebuild is required.
assert.ok(/installRequirements:\s*true/.test(block),
    'has a requirements.txt => installRequirements:true => baked into the Pod image');

// 7. The sibling facok node is code-only => must NOT be baked.
const f = src.match(/'ComfyUI-Krea2-ControlNet':\s*\{([\s\S]*?)\n    \},/);
assert.ok(f, 'ComfyUI-Krea2-ControlNet dep must exist');
assert.ok(/installRequirements:\s*false/.test(f[1]),
    'facok repo is __init__.py + nodes.py only, no requirements.txt => installRequirements:false');

console.log('controlnet-aux-torch-guard: all assertions passed');
