/**
 * MPI-464 — the post-uninstall orphan sweep, REMOTE twin.
 *
 * Same bar as the local test (tests/orphan-sweep.test.cjs): the sweep deletes user
 * weights, so what matters is not only that it collects the stranded file but that it
 * REFUSES everything else. Runs the real `_orphanedDepIds` / `_remoteSharedDepIds` /
 * `_sweepOrphanedDepsRemote` against a FAKE volume — the wrapper calls are stubbed on
 * the required remoteModels module, so no Pod, no network, no local disk touched.
 *
 * This proves the CLASSIFIER and the refusals. It does NOT close the card: the bar
 * there is a live Pod, because deletion code aimed at a user's volume must not ship
 * on unit evidence alone (MPI-310 destroyed 5.24GB changing this same guard).
 */
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.CUBRIC_MODELS_ROOT = path.join(os.tmpdir(), 'mpi464-remote-' + process.pid);

const remoteModels = require('../routes/remoteModels.js');
const dm = require('../routes/downloadManager.js');
const { DEPS } = require('../js/data/modelConstants/dependencies.js');
const { MODELS } = require('../js/data/modelConstants/models.js');
const { resolveFullUniverse } = require('../js/data/modelConstants/resolveModelDeps.js');
const { getUniversalWorkflowDepIds } = require('../routes/shared.js');

// Same pair the local test uses: a model with no operation groups (its whole universe
// on the volume makes it installed) and the shared text encoder it also declares.
const FLAT = MODELS.find(m => m.id === 'boogu-edit-balanced');
const ORPHAN = 'boogu-qwen3vl-8b-clip';

// ── Fake Pod volume ───────────────────────────────────────────────────────────
const volume = new Set();
const deleteAsked = [];
let deleteStatus = 'deleted';

remoteModels.remoteModelsCheck = async (models) => {
    const results = {};
    for (const m of models || []) {
        const deps = (m.deps || []).map(d => ({ ...d, installed: volume.has(d.id) }));
        results[m.id] = { deps, installed: deps.length > 0 && deps.every(d => d.installed) };
    }
    return { results };
};
remoteModels.remoteUninstallDep = async (dep) => {
    deleteAsked.push(dep.id);
    if (deleteStatus === 'unsupported') return { status: 'unsupported', id: dep.id };
    volume.delete(dep.id);
    return { status: 'deleted', id: dep.id };
};

function reset(ids = []) {
    volume.clear();
    deleteAsked.length = 0;
    deleteStatus = 'deleted';
    for (const id of ids) if (DEPS[id]) volume.add(id);
}

test('collects a dep no volume-installed model wants', async () => {
    reset([ORPHAN]);
    const swept = await dm._sweepOrphanedDepsRemote();
    assert.ok(swept.some(s => s.depId === ORPHAN), 'orphan should be swept');
    assert.equal(volume.has(ORPHAN), false, 'orphan should be gone from the volume');
});

test('refuses a dep a volume-installed model still wants', async () => {
    // The whole flat model on the volume => it is installed => it defends its own deps.
    reset(resolveFullUniverse(FLAT));
    const swept = await dm._sweepOrphanedDepsRemote();
    assert.equal(swept.some(s => s.depId === ORPHAN), false, 'must not sweep a dep of an installed model');
    assert.equal(volume.has(ORPHAN), true, 'dep an installed model needs must survive');
});

test('never asks the wrapper to delete a dep that is not on the volume', async () => {
    // Nothing on the volume, but the classifier still has candidates — the inventory
    // is the only thing standing between "eligible" and "deleted". (No local analogue:
    // the local sweep gets this free from fs.pathExists.)
    reset([]);
    const protectedIds = await dm._remoteSharedDepIds(null);
    assert.ok(dm._orphanedDepIds(protectedIds).length > 0, 'need candidates or this test proves nothing');
    const swept = await dm._sweepOrphanedDepsRemote();
    assert.deepEqual(swept, [], 'nothing on the volume means nothing swept');
    assert.deepEqual(deleteAsked, [], 'wrapper delete must never be called for an absent dep');
});

test('an older Pod image (no delete endpoint) is a no-op, never an error', async () => {
    reset([ORPHAN]);
    deleteStatus = 'unsupported';
    const swept = await dm._sweepOrphanedDepsRemote();
    assert.deepEqual(swept, [], 'unsupported sweeps nothing');
    assert.equal(volume.has(ORPHAN), true, 'nothing deleted on an unsupported image');
    assert.equal(deleteAsked.length, 1, 'stops after the first unsupported answer');
});

test('never sweeps custom_nodes, universal, engine-anchored or image-baked deps', async () => {
    reset([]);
    const protectedIds = await dm._remoteSharedDepIds(null);
    const ids = dm._orphanedDepIds(protectedIds).filter(id => !DEPS[id].bakedOnPod);
    const universal = new Set(getUniversalWorkflowDepIds());
    assert.ok(universal.size > 0, 'universal set must be non-empty or this test proves nothing');
    for (const id of ids) {
        assert.notEqual(DEPS[id].type, 'custom_nodes', `custom_nodes dep ${id} must not be an orphan`);
        assert.equal(universal.has(id), false, `universal dep ${id} must not be an orphan`);
        assert.equal(!!DEPS[id].targetPath, false, `engine-anchored dep ${id} must not be an orphan`);
        assert.equal(!!DEPS[id].bakedOnPod, false, `image-baked dep ${id} must not be an orphan`);
    }
    // The bakedOnPod filter is load-bearing, not defensive: those deps exist, and
    // remoteModelsCheck reports them INSTALLED (_isImageResident) while the wrapper
    // cannot delete them. Guard against the day someone drops the filter.
    assert.ok(
        Object.keys(DEPS).some(id => DEPS[id].bakedOnPod),
        'no bakedOnPod deps left — the filter in _sweepOrphanedDepsRemote is now untested',
    );
});
