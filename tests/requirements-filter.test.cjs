// MPI-370 — comfyui_controlnet_aux's requirements.txt ends with an unmarked
// `onnxruntime-gpu`, which has no macOS wheel at any version. pip fails the WHOLE
// file over that one name, so every Mac user was blocked at first install of any
// depth model. If this filter breaks, macOS install silently dies again — and the
// only symptom the user sees is a Retry button that can never succeed.
const assert = require('assert');
const { _filterRequirements } = require('../routes/downloadManager');

// The real locked body (Fannovel16/comfyui_controlnet_aux @ e8b689a5).
const REAL = [
    'torch', 'importlib_metadata', 'huggingface_hub', 'scipy', 'opencv-python',
    'filelock', 'numpy', 'Pillow', 'einops', 'torchvision', 'pyyaml',
    'scikit-image', 'python-dateutil', 'mediapipe>=0.8.0', 'fvcore', 'yapf',
    'omegaconf', 'ftfy', 'addict', 'yacs', 'yapf', 'trimesh[easy]',
    'albumentations', 'scikit-learn', 'matplotlib', 'onnxruntime-gpu',
].join('\n');

const filtered = _filterRequirements(REAL, ['onnxruntime-gpu']);
assert.ok(filtered !== null, 'the real requirements body must be changed');
assert.ok(!/onnxruntime-gpu/.test(filtered), 'onnxruntime-gpu must be gone');
assert.ok(/^torch$/m.test(filtered), 'torch must survive — losing it breaks the node');
assert.strictEqual(filtered.split('\n').length, REAL.split('\n').length - 1,
    'exactly one line may be dropped');

// Version specifiers, extras and environment markers all name the same package.
for (const line of ['onnxruntime-gpu>=1.17', 'onnxruntime-gpu==1.2.0', 'onnxruntime-gpu[foo]',
    'onnxruntime-gpu ; sys_platform == "linux"', '  onnxruntime-gpu  ']) {
    const out = _filterRequirements(`torch\n${line}`, ['onnxruntime-gpu']);
    assert.strictEqual(out, 'torch', `must drop specifier form: ${line}`);
}

// A longer package name that merely starts with the dropped name must survive.
assert.strictEqual(_filterRequirements('onnxruntime-gpu-extra\ntorch', ['onnxruntime-gpu']), null,
    'onnxruntime-gpu-extra is a different package and must be kept');

// null when nothing matches — this is what keeps Windows/Linux files byte-identical.
assert.strictEqual(_filterRequirements('torch\nnumpy', ['onnxruntime-gpu']), null,
    'no match must return null so the caller skips the write');
assert.strictEqual(_filterRequirements('torch', []), null, 'empty drop list is a no-op');

// Idempotent: the second pass over an already-filtered body changes nothing.
assert.strictEqual(_filterRequirements(filtered, ['onnxruntime-gpu']), null,
    're-running the filter must be a no-op');

// Comments naming the package are prose, not requirements.
assert.strictEqual(_filterRequirements('# needs onnxruntime-gpu\ntorch', ['onnxruntime-gpu']), null,
    'a comment mentioning the package must not count as a match');

// ── Wiring ───────────────────────────────────────────────────────────────────
// The filter is useless if the field never reaches the install loop. MPI-149 lost
// pipPins/installRequirementsCommand to exactly this whitelist, so assert BOTH the
// registry declaration and the depJob passthrough, not just the pure function.
const fs = require('fs');
const { pathToFileURL } = require('url');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../routes/downloadManager.js'), 'utf8');
const createDepJob = src.match(/function _createDepJob\(dep\)\s*\{([\s\S]*?)\n\}/);
assert.ok(createDepJob, '_createDepJob must exist');
assert.ok(/requirementsDrop:\s*dep\.requirementsDrop/.test(createDepJob[1]),
    '_createDepJob must carry requirementsDrop — it is a whitelist, and omitting the '
    + 'field silently disables the macOS strip on the universal-workflow path');

(async () => {
    const imp = (p) => import(pathToFileURL(path.resolve(__dirname, '..', p)).href);
    const { DEPS } = await imp('js/data/modelConstants/dependencies.js');
    const dep = DEPS['comfyui_controlnet_aux'];
    assert.ok(dep, 'comfyui_controlnet_aux must exist in the dep registry');
    assert.ok(dep.requirementsDrop && Array.isArray(dep.requirementsDrop.darwin),
        'comfyui_controlnet_aux must declare a darwin drop list');
    assert.ok(dep.requirementsDrop.darwin.includes('onnxruntime-gpu'),
        'onnxruntime-gpu must be dropped on darwin — without it every Mac user is '
        + 'blocked at first install of any depth model');
    assert.ok(!dep.requirementsDrop.win32 && !dep.requirementsDrop.linux,
        'Windows and Linux resolve the CUDA wheel fine and must not be filtered');

    // MPI-387 — Impact-Pack's requirements.txt line 10 is a git+ URL. pip shells out
    // to `git clone` for it, and no portable engine ships git, so this failed 100% of
    // clean installs on every platform and Retry could never clear it.
    const impact = DEPS['ComfyUI-Impact-Pack'];
    const SAM2 = 'git+https://github.com/facebookresearch/sam2';
    assert.ok(impact, 'ComfyUI-Impact-Pack must exist in the dep registry');
    for (const plat of ['win32', 'darwin', 'linux']) {
        assert.ok(impact.requirementsDrop && impact.requirementsDrop[plat]?.includes(SAM2),
            `Impact-Pack must drop the sam2 git+ URL on ${plat} — no portable engine ships git`);
    }

    // _filterRequirements matches with `name === d` after trim+lowercase, so the drop
    // string must be BYTE-EXACT against the locked requirements.txt. A `.git` suffix or
    // a stray space makes this a silent no-op that still fails every clean install.
    // Verified against ltdrdata/ComfyUI-Impact-Pack @ 429d0159.
    const IMPACT_REAL = [
        'segment-anything', 'scikit-image', 'piexif', 'transformers',
        'opencv-python-headless', 'scipy', 'numpy', 'dill', 'matplotlib', SAM2,
    ].join('\n');
    const filtered = _filterRequirements(IMPACT_REAL, [SAM2]);
    assert.ok(filtered !== null, 'the sam2 line must actually match — null means nothing was dropped');
    assert.ok(!filtered.includes('facebookresearch'), 'sam2 must be gone from the filtered body');
    assert.ok(filtered.includes('segment-anything'),
        'SAM 1 must survive — MPI-380 kept it as the Impact segment refiner');
    assert.strictEqual(filtered.split('\n').length, 9, 'exactly one line may be dropped');

    console.log('requirements-filter: all assertions passed');
})();
