'use strict';
// MPI-413 — guard the curated Python dependency set.
//
// The engine installs ONE file (dev_configs/python_deps.txt) instead of letting each
// custom node resolve its own requirements.txt on the user's machine. Two properties
// make that safe, and both are easy to lose in a regeneration or an edit:
//
//   1. The file must never name the engine-owned torch stack. `--no-emit-package torch`
//      alone does NOT achieve this: torch is a real transitive of diffusers/ultralytics/
//      kornia, so a naive compile emits pinned `triton`, ~16 `nvidia-*` wheels and (on
//      Linux) `cuda-toolkit` — the exact several-GB stack MPI-413's Evidence A landed on
//      a CPU-only box with no NVIDIA driver.
//   2. It must install with `--no-deps`. Without that flag pip re-derives the removed
//      entries from the packages that declare them, putting three cv2 builds back in the
//      engine and making `import cv2` last-writer-wins again.
//
// Regenerate with: node scripts/compile-node-deps.mjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const lockText = fs.readFileSync(path.join(REPO, 'dev_configs', 'python_deps.txt'), 'utf8');
const dmSrc = fs.readFileSync(path.join(REPO, 'routes', 'downloadManager.js'), 'utf8');
const sharedSrc = fs.readFileSync(path.join(REPO, 'routes', 'shared.js'), 'utf8');
const comfySrc = fs.readFileSync(path.join(REPO, 'routes', 'comfy.js'), 'utf8');

/** Distribution names the lock pins, ignoring comments, markers and specifiers. */
const pinned = lockText
    .split(/\r?\n/)
    .map(l => l.replace(/\s+#.*$/, '').trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(l.split(';')[0].trim()))
    .filter(Boolean)
    .map(m => m[1].toLowerCase().replace(/[-_.]+/g, '-'));

assert.ok(pinned.length > 50, `lock looks truncated — only ${pinned.length} packages`);

// 1. No engine-owned torch stack. nvidia-ml-py is the deliberate exception: a small
// pure-Python NVML binding ultralytics needs, carrying no CUDA runtime.
const engineOwned = pinned.filter(n =>
    ['torch', 'torchvision', 'torchaudio', 'triton'].includes(n)
    || n.startsWith('cuda-')
    || (n.startsWith('nvidia-') && n !== 'nvidia-ml-py'));
assert.deepStrictEqual(engineOwned, [],
    `python_deps.txt must never pin the engine-owned torch stack, found: ${engineOwned.join(', ')}`);

// 2. Exactly ONE opencv distribution — they all install into the same `cv2` namespace.
const opencv = pinned.filter(n => n.startsWith('opencv-'));
assert.deepStrictEqual(opencv, ['opencv-contrib-python-headless'],
    `exactly one opencv build may be pinned (contrib+headless is the superset), found: ${opencv.join(', ')}`);

// 2b. MPI-472 — `imageio-ffmpeg` ships the ffmpeg BINARY, and our own MpiSaveVideo node
// hard-requires one: help_funcs.find_ffmpeg() tries VHS_FORCE_FFMPEG_PATH, then this
// import, then shutil.which("ffmpeg"). The Windows portable engine satisfies neither of
// the other two, so without this pin every video op on every model fails at the last
// node, after the full sample (observed live 2026-08-07). `imageio` is a DIFFERENT
// package that bundles no binary — the lock pinning it is not this pin.
assert.ok(pinned.includes('imageio-ffmpeg'),
    'python_deps.txt must pin imageio-ffmpeg — MpiSaveVideo has no other ffmpeg source on '
    + 'the portable engine, and it was only ever declared by a node requirements.txt we do '
    + 'not install');

// 3. The installer must pass --no-deps, or property 1 and 2 are undone at install time.
const install = sharedSrc.match(/runPipCommand\(\[\s*'install',\s*'-r',\s*PYTHON_DEPS_PATH[^\]]*\]/);
assert.ok(install, 'shared.js must install PYTHON_DEPS_PATH via runPipCommand');
assert.ok(install[0].includes("'--no-deps'"),
    `the curated install MUST use --no-deps (got: ${install[0]})`);

// 3b. MPI-459 — the pass must run with the engine DOWN. Its only caller is the spawn
// path in /comfy/start, BEFORE the process is launched; running it from the install path
// meant pip had to replace packages the live engine had imported, which on Windows is a
// hard `WinError 5` on cv2.pyd and a deterministic `Download Failed` on every install.
assert.ok(!/ensureCuratedPythonDeps\s*\(/.test(dmSrc),
    'the curated pip pass must NOT run from the model-install path — the engine is up there');
const startIdx = comfySrc.indexOf("router.post('/comfy/start'");
const callIdx = comfySrc.indexOf('await ensureCuratedPythonDeps(', startIdx);
const spawnIdx = comfySrc.indexOf('processState.activeComfyProcess = spawn(', startIdx);
assert.ok(startIdx >= 0 && callIdx > startIdx && spawnIdx > callIdx,
    'ensureCuratedPythonDeps must be awaited inside /comfy/start, before the spawn');

// 4. The per-node requirements step must stay gone. If it comes back it re-introduces
// the 13-resolve shape the curated file replaced, and it runs AFTER this install.
assert.ok(!/runPipCommand\(\[\s*'install',\s*'-r',\s*reqPath/.test(dmSrc),
    'the per-node `pip install -r <node>/requirements.txt` step must not return — '
    + 'node dependencies come from the curated set');
assert.ok(!/runCustomCommand\(dep\.installRequirementsCommand/.test(dmSrc),
    'the per-node installRequirementsCommand step must not return in the LOCAL path '
    + '(the field itself stays — remoteModels.js still sends it to the Pod wrapper)');

// 5. Every node the lock is compiled from must still be declared. The compile reads ALL
// of them, not the `installRequirements: true` subset — that flag is the Pod's bake/volume
// split, and filtering the drift check on it is what hid MPI-472.
const nodeLock = JSON.parse(fs.readFileSync(path.join(REPO, 'dev_configs', 'node_lock.json'), 'utf8'));
const withReqs = Object.keys(nodeLock.nodes);
assert.ok(withReqs.length > 0, 'node_lock must declare at least one custom node');
assert.ok(lockText.includes('--no-deps'),
    'python_deps.txt must carry its own "install with --no-deps" instruction footer');

console.log(`curated-python-deps: ${pinned.length} pinned, 0 engine-owned, 1 opencv, `
    + `${withReqs.length} source nodes — all assertions passed`);

// ── MPI-457: the marker must share site-packages' fate ───────────────────────
// The marker is a CLAIM ABOUT site-packages. At ENGINE_ROOT it outlived the thing it
// described: `/engine/upgrade`'s full reinstall removes `<root>/<COMFY_DIR>`, which on
// Windows contains `python_embeded/Lib/site-packages`, while the marker one level up
// survived. Next `/comfy/start` saw a matching hash, skipped the install, and ComfyUI
// booted with `No module named 'cv2'` / `'pywt'` — controlnet_aux, RES4LYF, both Impact
// packs and LTXVideo all IMPORT FAILED, 17 shipped class_types gone, silently.
// Measured live on 2026-08-07; the wipe was the only upgrade path before MPI-457.
const { curatedDepsMarkerPath } = require('../routes/shared');
const { getPythonBin, getEngineRoot, COMFY_DIR } = require('../routes/platformEngine');

const marker = curatedDepsMarkerPath();
const engineRoot = getEngineRoot();

assert.strictEqual(
    path.dirname(marker),
    path.dirname(getPythonBin(engineRoot)),
    'the marker must sit next to the interpreter whose site-packages it describes'
);
assert.notStrictEqual(
    path.resolve(path.dirname(marker)),
    path.resolve(engineRoot),
    'ENGINE_ROOT is exactly where it outlived the wipe — never put it back there'
);

if (process.platform === 'win32') {
    // The Windows wipe removes <root>/<COMFY_DIR>. The marker must be INSIDE that, so a
    // reinstall cannot inherit a stale one.
    const wiped = path.resolve(path.join(engineRoot, COMFY_DIR));
    assert.ok(
        path.resolve(marker).startsWith(wiped + path.sep),
        `the marker must be inside the tree the wipe removes (${wiped}), got ${marker}`
    );
}

console.log('curated-python-deps: marker placement OK');
