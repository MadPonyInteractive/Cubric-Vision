'use strict';

// MPI-276 Phase 5 — uninstall unification (G13) guards.
// Run: node tests/uninstall-guards.test.cjs
//
// Covers the three defects Phase 5 fixed in routes/downloadManager.js's
// /comfy/models/uninstall route + shared-dep guards:
//   1. no server-side engine filter (trusted the wire dep array verbatim)
//   2. no in-flight protection on the remote path; local read the legacy map
//      instead of the store (refCount SOT, G5)
//   3. custom-node delete targeted the long-gone install zip
//      (custom_nodes/<name>.zip) so it no-op'd yet reported the dep removed
//
// The keep-decision + in-flight cases are faithful reductions of the route's
// guard ORDER (universal → shared → pip → delete) and the store liveness query.
// The engine-filter + custom-node path cases exercise the REAL exported helpers.
// The folder-removal case runs against a real temp dir.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    _customNodeUninstallPath,
    _filterDepsForEngine,
} = require('../routes/downloadManager.js');
const { createInstallStore } = require('../routes/install/installStore.js');

// ── Faithful reduction of the uninstall keep/remove decision ──────────────────
// Mirrors the route loop order in downloadManager.js: universal-keep → shared-dep
// guard (whole-model rule + in-flight) → pip-keep → delete. Returns the bucket
// each dep lands in.
function decideUninstall(deps, { universalIds, sharedKeep, inFlightDepIds }) {
    const universal = new Set(universalIds);
    const shared = new Set(sharedKeep);
    const inflight = new Set(inFlightDepIds);
    const out = { removed: [], keptUniversal: [], keptShared: [], keptPip: [] };
    for (const dep of deps) {
        if (universal.has(dep.id)) { out.keptUniversal.push(dep.id); continue; }
        // in-flight folds INTO the shared-keep set (that is exactly how the route
        // builds sharedKeep — _inFlightDepIds are unioned in).
        if (shared.has(dep.id) || inflight.has(dep.id)) { out.keptShared.push(dep.id); continue; }
        if (dep.type === 'custom_nodes' && dep.installRequirements === true) { out.keptPip.push(dep.id); continue; }
        out.removed.push(dep.id);
    }
    return out;
}

// Reduction of _localSharedDepsMap / _remoteSharedDepIds whole-model rule: a dep
// is protected iff SOME OTHER model that is whole-model installed (every dep
// complete) needs it. Tier-family circularity (MPI-258 B1): a sibling with an
// absent transformer is NOT installed, so it protects nothing.
function sharedKeepFromInstalled(models, excludeId, installedFlags) {
    const keep = new Set();
    for (const m of models) {
        if (m.id === excludeId) continue;
        if (installedFlags[m.id] !== true) continue; // whole-model rule
        for (const depId of m.deps) keep.add(depId);
    }
    return keep;
}

// Reduction of _inFlightDepIds: dep ids held by a live (non-terminal) model job
// OTHER than the one being uninstalled — driven by the REAL store.
function inFlightViaStore(store, excludeModelId) {
    const out = new Set();
    for (const job of store.allModelJobs()) {
        if (job.modelId === excludeModelId) continue;
        if (store.MODEL_TERMINAL.has(job.status)) continue;
        for (const d of job.deps) out.add(d.id);
    }
    return out;
}

// ── 1. whole-model-installed rule ─────────────────────────────────────────────

test('shared dep of a whole-model-installed sibling is KEPT', () => {
    const models = [
        { id: 'wan-i2v', deps: ['vae', 'umt5', 'i2v-unet'] },
        { id: 'wan-t2v', deps: ['vae', 'umt5', 't2v-unet'] },
    ];
    const sharedKeep = sharedKeepFromInstalled(models, 'wan-i2v', { 'wan-t2v': true });
    const deps = [{ id: 'vae' }, { id: 'umt5' }, { id: 'i2v-unet' }];
    const r = decideUninstall(deps, { universalIds: [], sharedKeep, inFlightDepIds: [] });
    assert.deepEqual(r.keptShared.sort(), ['umt5', 'vae'], 'shared deps kept');
    assert.deepEqual(r.removed, ['i2v-unet'], 'unshared dep removed');
});

// ── 2. tier-family circularity (MPI-258 B1) ───────────────────────────────────

test('tier family: neither sibling installed → shared deps deletable (no circular keep)', () => {
    // LTX High + Balanced share every non-transformer dep. Both transformers are
    // absent (neither installed). The old per-dep "on disk" test protected the
    // shared copy for BOTH forever. Whole-model rule: absent-transformer sibling
    // is NOT installed → protects nothing.
    const models = [
        { id: 'ltx-high', deps: ['gemma', 'vae', 'lora', 'high-xf'] },
        { id: 'ltx-bal', deps: ['gemma', 'vae', 'lora', 'bal-xf'] },
    ];
    const sharedKeep = sharedKeepFromInstalled(models, 'ltx-high', { 'ltx-bal': false });
    const deps = [{ id: 'gemma' }, { id: 'vae' }, { id: 'lora' }, { id: 'high-xf' }];
    const r = decideUninstall(deps, { universalIds: [], sharedKeep, inFlightDepIds: [] });
    assert.equal(r.keptShared.length, 0, 'nothing protected by an uninstalled sibling');
    assert.deepEqual(r.removed.sort(), ['gemma', 'high-xf', 'lora', 'vae'], 'all deletable');
});

// ── 3. universal keep ─────────────────────────────────────────────────────────

test('universal workflow deps are always kept', () => {
    const deps = [{ id: 'clip-vision' }, { id: 'my-weight' }];
    const r = decideUninstall(deps, { universalIds: ['clip-vision'], sharedKeep: [], inFlightDepIds: [] });
    assert.deepEqual(r.keptUniversal, ['clip-vision']);
    assert.deepEqual(r.removed, ['my-weight']);
});

// ── 4. pip-keep ───────────────────────────────────────────────────────────────

test('custom_node with installRequirements is pip-kept (env pkgs not trashed)', () => {
    const deps = [{ id: 'node-a', type: 'custom_nodes', installRequirements: true }];
    const r = decideUninstall(deps, { universalIds: [], sharedKeep: [], inFlightDepIds: [] });
    assert.deepEqual(r.keptPip, ['node-a']);
    assert.equal(r.removed.length, 0);
});

// ── 5. in-flight protection, BOTH engines (via the real store) ────────────────

test('in-flight dep of another live job is protected (store SOT, refCount deleted)', () => {
    const store = createInstallStore();
    // model-B is live (downloading) and shares 'vae' with the model we uninstall.
    store.registerModelJob({ modelId: 'model-B', engine: 'local', deps: [{ depId: 'vae' }, { depId: 'b-only' }] });
    store.transitionModel('model-B', 'downloading', 'test');
    // model-A (being uninstalled) also owns 'vae'.
    const inflight = inFlightViaStore(store, 'model-A');
    assert.ok(inflight.has('vae'), 'vae held by live model-B');

    const deps = [{ id: 'vae' }, { id: 'a-only' }];
    const r = decideUninstall(deps, { universalIds: [], sharedKeep: [], inFlightDepIds: inflight });
    assert.deepEqual(r.keptShared, ['vae'], 'in-flight dep protected');
    assert.deepEqual(r.removed, ['a-only']);
});

test('a COMPLETED sibling job does NOT protect its dep (no refCount linger)', () => {
    const store = createInstallStore();
    store.registerModelJob({ modelId: 'model-B', engine: 'remote', deps: [{ depId: 'vae' }] });
    store.transitionModel('model-B', 'done', 'test'); // terminal
    const inflight = inFlightViaStore(store, 'model-A');
    assert.equal(inflight.has('vae'), false, 'terminal job releases the dep');
});

test('a job being uninstalled does not self-protect its own deps', () => {
    const store = createInstallStore();
    store.registerModelJob({ modelId: 'model-A', engine: 'local', deps: [{ depId: 'vae' }] });
    store.transitionModel('model-A', 'downloading', 'test');
    const inflight = inFlightViaStore(store, 'model-A'); // exclude self
    assert.equal(inflight.has('vae'), false, 'self excluded');
});

// ── 6. engine filter rejects cross-engine dep arrays (REAL helper) ────────────

test('_filterDepsForEngine drops deps not in the model engine universe', () => {
    // Unknown model → pass-through (documented contract). Use that to prove the
    // filter is a pure intersection against the resolved universe: an unknown id
    // is only kept when the model is unknown.
    const passthrough = _filterDepsForEngine('___no_such_model___', [{ id: 'x' }, { id: 'y' }], 'local');
    assert.equal(passthrough.length, 2, 'unknown model passes through unchanged');

    // A real model filters to its engine universe — deps with foreign ids drop.
    const { MODELS } = require('../js/data/modelConstants/models.js');
    const model = MODELS.find(m => Array.isArray(m?.commonDeps) && m.commonDeps.length > 0)
        || MODELS.find(m => m?.id);
    assert.ok(model, 'have at least one model to test against');
    const realDep = (model.commonDeps && model.commonDeps[0]) || null;
    const input = [{ id: '___foreign_dep___' }];
    if (realDep) input.unshift({ id: realDep });
    const filtered = _filterDepsForEngine(model.id, input, 'local');
    assert.equal(filtered.some(d => d.id === '___foreign_dep___'), false, 'foreign dep rejected');
    if (realDep) assert.ok(filtered.some(d => d.id === realDep), 'genuine engine dep kept');
});

// ── 7. custom-node FOLDER path + actual removal in a temp dir ─────────────────

test('_customNodeUninstallPath targets the extracted FOLDER, not the zip', () => {
    const root = path.join('C:', 'engine', 'custom_nodes');
    const p = _customNodeUninstallPath({ type: 'custom_nodes', filename: 'ComfyUI-Foo' }, root);
    assert.equal(p, path.join(root, 'ComfyUI-Foo'), 'folder path');
    assert.ok(!p.endsWith('.zip'), 'never the long-gone zip');
});

test('custom-node folder is actually removed; a missing path is NOT reported removed', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-uninstall-'));
    try {
        const customNodesRoot = path.join(tmp, 'custom_nodes');
        const nodeDir = _customNodeUninstallPath({ type: 'custom_nodes', filename: 'ComfyUI-Foo' }, customNodesRoot);
        fs.mkdirSync(nodeDir, { recursive: true });
        fs.writeFileSync(path.join(nodeDir, '__init__.py'), '# node');
        assert.ok(fs.existsSync(nodeDir), 'fixture folder exists');

        // Reduction of the route's honest-removed[] logic: only report removed when
        // the path existed and was deleted; a missing path is kept(already-absent).
        async function deleteAndReport(targetPath) {
            const existed = fs.existsSync(targetPath);
            if (existed) fs.rmSync(targetPath, { recursive: true, force: true });
            return existed ? 'removed' : 'already-absent';
        }

        assert.equal(await deleteAndReport(nodeDir), 'removed', 'existing folder removed');
        assert.ok(!fs.existsSync(nodeDir), 'folder gone');

        // Second uninstall of the same (now-gone) node: must NOT lie about removal.
        assert.equal(await deleteAndReport(nodeDir), 'already-absent', 'missing path not reported removed');

        // The OLD bug: deriving the zip path would ALWAYS be already-absent post-
        // extract, so the node folder would survive forever. Prove the folder path
        // and the (bogus) zip path differ.
        const zipPath = path.join(customNodesRoot, 'ComfyUI-Foo.zip');
        assert.notEqual(nodeDir, zipPath, 'folder path is not the zip path');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});
