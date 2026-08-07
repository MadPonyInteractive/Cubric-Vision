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

const ROOT = path.join(os.tmpdir(), 'mpi462-sweep-' + process.pid);
process.env.CUBRIC_MODELS_ROOT = ROOT;

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
        const m = (d.size || '').match(/^([\d.]+)\s*(GB|MB|KB|B)$/i);
        const mult = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 };
        // Sparse — the completeness check stats size, so it must match, but this
        // costs no real disk.
        const fd = fs.openSync(p, 'w');
        fs.ftruncateSync(fd, m ? Math.round(parseFloat(m[1]) * mult[m[2].toUpperCase()]) : 1024);
        fs.closeSync(fd);
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

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
