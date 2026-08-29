/**
 * MPI-462 — the post-uninstall orphan sweep.
 *
 * The sweep deletes user weights, so what matters is not only that it collects
 * the stranded file but that it REFUSES everything else. Runs the real
 * `_orphanedDepIds` / `_sweepOrphanedDeps` against a throwaway CUBRIC_MODELS_ROOT
 * — no app, no port 3000, the real G:\CubricModels untouched.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// MUST precede every app require: it pins BOTH roots at temp dirs before
// routes/shared.js captures ENGINE_ROOT at module load.
// Setting only CUBRIC_MODELS_ROOT is not hermetic — the disk
// answers here go through getCustomRoot() and landed on the real G:\CubricModels,
// which is what made this file red on the dev machine and green on CI. See the helper.
const { ROOT } = require('./helpers/sandbox-roots.cjs');

const dm = require('../routes/downloadManager.js');
const { DEPS } = require('../js/data/modelConstants/dependencies.js');
const { MODELS } = require('../js/data/modelConstants/models.js');
const { resolveFullUniverse } = require('../js/data/modelConstants/resolveModelDeps.js');
const { getUniversalWorkflowDepIds } = require('../routes/shared.js');

// A model with no operation groups: placing its whole universe makes it installed.
const FLAT = MODELS.find(m => m.id === 'boogu-edit-balanced');
// Stranded exactly as the user's was: the shared text encoder with neither tier installed.
const ORPHAN = 'boogu-qwen3vl-8b-clip';

function place(depIds) {
    for (const id of depIds) {
        const d = DEPS[id];
        if (!d || !d.filename) continue;
        const p = path.join(ROOT, d.filename);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        // ponytail: empty file. isCompleteOnDisk() is `exists && no .cubricdl marker`
        // (routes/downloadCompletion.js) — it never stats size, so the declared dep
        // size is irrelevant here. The old fixture ftruncate'd to d.size believing
        // that was sparse; NTFS allocates it for real, so every run wrote ~30 GiB
        // and the sweep TRASHED it, filling the dev machine's Recycle Bin (MPI-499).
        fs.closeSync(fs.openSync(p, 'w'));
    }
}

const reset = () => { fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true }); };
const onDisk = id => fs.existsSync(path.join(ROOT, DEPS[id].filename));
const sweep = () => dm._sweepOrphanedDeps(ROOT, ROOT, null);

test('collects a dep no installed model wants', async () => {
    reset();
    place([ORPHAN]);
    const swept = await sweep();
    assert.ok(swept.some(s => s.depId === ORPHAN), 'orphan should be swept');
    assert.equal(onDisk(ORPHAN), false, 'orphan file should be gone');
});

test('refuses a dep an installed model still wants', async () => {
    reset();
    // The whole flat model on disk => it is installed => it defends its own deps.
    place(resolveFullUniverse(FLAT));
    const swept = await sweep();
    assert.equal(swept.some(s => s.depId === ORPHAN), false, 'must not sweep a dep of an installed model');
    assert.equal(onDisk(ORPHAN), true, 'file an installed model needs must survive');
});

test('never sweeps custom_nodes (the local MpiNodes folder is a symlink to its source repo)', async () => {
    reset();
    const protectedMap = await dm._localSharedDepsMap(null);
    const ids = dm._orphanedDepIds(protectedMap);
    const nodes = ids.filter(id => DEPS[id].type === 'custom_nodes');
    assert.deepEqual(nodes, [], 'custom_nodes must never be classified as orphans');
});

test('never sweeps a universal or engine-anchored dep', async () => {
    reset();
    const protectedMap = await dm._localSharedDepsMap(null);
    const ids = dm._orphanedDepIds(protectedMap);
    const universal = new Set(getUniversalWorkflowDepIds());
    assert.ok(universal.size > 0, 'universal set must be non-empty or this test proves nothing');
    for (const id of ids) {
        assert.equal(universal.has(id), false, `universal dep ${id} must not be an orphan`);
        assert.equal(!!DEPS[id].targetPath, false, `engine-anchored dep ${id} must not be an orphan`);
    }
});

test('refuses to touch anything outside the managed models root', async () => {
    reset();
    place([ORPHAN]);
    const outside = path.join(os.tmpdir(), 'mpi462-elsewhere-' + process.pid);
    fs.rmSync(outside, { recursive: true, force: true });
    fs.mkdirSync(outside, { recursive: true });
    // Managed root is `outside`, but the files live in ROOT — nothing may be deleted.
    const swept = await dm._sweepOrphanedDeps(outside, ROOT, null);
    assert.deepEqual(swept, [], 'no dep resolves inside the managed root');
    assert.equal(onDisk(ORPHAN), true, 'file outside the managed root must survive');
    fs.rmSync(outside, { recursive: true, force: true });
});

// ── MPI-500: the Recycle Bin toggle ─────────────────────────────────────────
// Both modes are checked through a STUBBED trash fn. Exercising the real one would
// put entries in the developer's Recycle Bin on every test run, which is the exact
// pollution MPI-499 was raised to stop.

test('default (no preference) deletes permanently and never reaches the bin', async () => {
    reset();
    place([ORPHAN]);
    let trashed = 0;
    dm._setTrashFnForTests(() => { trashed += 1; return Promise.resolve(); });
    try {
        const swept = await dm._sweepOrphanedDeps(ROOT, ROOT, null);
        assert.ok(swept.some(s => s.depId === ORPHAN), 'orphan should still be swept');
        assert.equal(trashed, 0, 'trash must not be called when no preference is supplied');
        assert.equal(onDisk(ORPHAN), false, 'orphan file should be gone');
    } finally {
        dm._setTrashFnForTests(null);
    }
});

test('useRecycleBin routes the same file to the bin instead', async () => {
    reset();
    place([ORPHAN]);
    const binned = [];
    dm._setTrashFnForTests((p) => { binned.push(p); fs.rmSync(p); return Promise.resolve(); });
    try {
        const swept = await dm._sweepOrphanedDeps(ROOT, ROOT, null, true);
        assert.ok(swept.some(s => s.depId === ORPHAN), 'orphan should still be swept');
        assert.deepEqual(binned, [path.join(ROOT, DEPS[ORPHAN].filename)], 'the orphan is what got trashed');
    } finally {
        dm._setTrashFnForTests(null);
    }
});

test('a bin refusal (over quota) still frees the disk', async () => {
    reset();
    place([ORPHAN]);
    // Windows refuses a file bigger than the Recycle Bin quota: windows-trash.exe
    // exits 255 and throws. The uninstall must NOT silently no-op. (MPI-258)
    dm._setTrashFnForTests(() => Promise.reject(new Error('windows-trash.exe exited 255')));
    try {
        const swept = await dm._sweepOrphanedDeps(ROOT, ROOT, null, true);
        assert.ok(swept.some(s => s.depId === ORPHAN), 'a bin refusal must not abandon the sweep');
        assert.equal(onDisk(ORPHAN), false, 'the fallback delete must really free the file');
    } finally {
        dm._setTrashFnForTests(null);
    }
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
