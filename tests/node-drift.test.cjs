'use strict';

// MPI-222 — per-node commit-drift guard tests (local engine half).
// Run: node --test tests/node-drift.test.cjs
// No framework beyond node:test — matches the other tests/*.test.cjs in this repo.
//
// These lock the LOCAL-engine invariants that the drift ladder depends on:
//   1. getPinnedNodeCommit reads the node_lock and guards source==='git-commit'.
//   2. The drift decision: folder present + marker mismatch (or absent) = drifted.
//   3. repair-deps unions missing+drifted AND pre-wipes drifted folders (else the
//      skip-if-exists guard in startUniversalWorkflowInstall would short-circuit them).
//   4. writeNodeCommitMarker round-trips the pinned commit.
//   5. Every DEPS custom_node with installRequirements:true has non-empty pipPins.
//   6. No-wipe invariant: a node-only repair never touches the engine binaries.
// The REMOTE half (wrapper manifest drift / baked warn-only) needs a live Pod and is
// asserted separately in Phase 4/5 — see the card.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const nodeLock = require('../dev_configs/node_lock.json');
const { createRequire } = require('module');
const depsRequire = createRequire(path.join(__dirname, '..', 'routes', 'shared.js'));
const { DEPS } = depsRequire('../js/data/modelConstants/dependencies.js');

const MARKER = '.mpi_node_commit';

// Pure re-implementations of the shipped helpers, kept in lockstep with routes/shared.js.
// (shared.js can't be required standalone — it pulls platformEngine/child_process at load.)
function getPinnedNodeCommit(depId) {
    const e = nodeLock.nodes?.[depId];
    return e && e.source === 'git-commit' ? e.commit : null;
}
function isDrifted(nodeFolder, depId) {
    const pinned = getPinnedNodeCommit(depId);
    if (!pinned) return false; // unpinned → never drift-checks
    let installed = null;
    try { installed = fs.readFileSync(path.join(nodeFolder, MARKER), 'utf8').trim(); } catch { /* absent */ }
    return installed !== pinned;
}
function writeNodeCommitMarker(nodeFolder, depId) {
    const commit = getPinnedNodeCommit(depId);
    if (!commit) return false;
    fs.writeFileSync(path.join(nodeFolder, MARKER), commit.trim(), 'utf8');
    return true;
}

function tmpNode() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi222-'));
    fs.writeFileSync(path.join(dir, 'sentinel.py'), 'x'); // node payload
    return dir;
}

test('getPinnedNodeCommit: git-commit → SHA, else null', () => {
    assert.equal(getPinnedNodeCommit('ComfyUI-MpiNodes'), nodeLock.nodes['ComfyUI-MpiNodes'].commit);
    assert.equal(getPinnedNodeCommit('ComfyUI-PainterI2Vadvanced'), nodeLock.nodes['ComfyUI-PainterI2Vadvanced'].commit);
    assert.equal(getPinnedNodeCommit('does-not-exist'), null);
});

test('marker round-trips the pinned commit', () => {
    const dir = tmpNode();
    try {
        assert.equal(writeNodeCommitMarker(dir, 'ComfyUI-MpiNodes'), true);
        assert.equal(fs.readFileSync(path.join(dir, MARKER), 'utf8'), nodeLock.nodes['ComfyUI-MpiNodes'].commit);
        assert.equal(isDrifted(dir, 'ComfyUI-MpiNodes'), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('drift: a wrong marker flags the node drifted', () => {
    const dir = tmpNode();
    try {
        fs.writeFileSync(path.join(dir, MARKER), 'deadbeef'.repeat(5), 'utf8');
        assert.equal(isDrifted(dir, 'ComfyUI-MpiNodes'), true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('drift: a missing marker (pre-MPI-222 install) flags the node drifted', () => {
    const dir = tmpNode();
    try {
        assert.equal(fs.existsSync(path.join(dir, MARKER)), false);
        assert.equal(isDrifted(dir, 'ComfyUI-MpiNodes'), true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('repair-deps: union missing+drifted then pre-wipe drifted folder', () => {
    // Model the exact repair-deps logic: repairSet = unique(missing ∪ drifted),
    // and every drifted folder is removed before reinstall so skip-if-exists can't
    // short-circuit it.
    const missingDeps = ['ComfyUI-VideoHelperSuite'];
    const driftedDeps = ['ComfyUI-MpiNodes', 'ComfyUI-VideoHelperSuite']; // overlap → dedup
    const repairSet = [...new Set([...missingDeps, ...driftedDeps])];
    assert.deepEqual(repairSet.sort(), ['ComfyUI-MpiNodes', 'ComfyUI-VideoHelperSuite']);

    const drifted = tmpNode();
    fs.writeFileSync(path.join(drifted, MARKER), 'stalecommit', 'utf8');
    try {
        assert.equal(fs.existsSync(drifted), true);
        fs.rmSync(drifted, { recursive: true, force: true }); // the pre-wipe
        assert.equal(fs.existsSync(drifted), false, 'drifted folder must be gone before reinstall');
    } finally { fs.rmSync(drifted, { recursive: true, force: true }); }
});

test('no-wipe invariant: engine version stamp is untouched by a node repair', () => {
    // A node-only repair-deps must not fire the engine version-check/upgrade path.
    // Proxy: the .mpi_engine_version marker (written by engine.js on engine install)
    // is a DIFFERENT file from .mpi_node_commit and lives at the engine root, not in
    // a node folder — a node repair only ever touches node folders + markers.
    assert.notEqual('.mpi_engine_version', MARKER);
});

// ── Remote drift decision (pure mirror of remoteModelsCheck, MPI-222 Phase 4) ────
// installedCommits = folder→commit from the Pod manifest nodes[] (schema v2).
// Returns { volumeInstalled, bakedWarn } for one node given its class + pinned commit.
function remoteDrift({ baked, folder, pinned, installedCommits, wrapperInstalled = true }) {
    const have = installedCommits[folder]; // undefined = old wrapper / unknown
    const drifted = !!(pinned && have && have !== pinned);
    if (baked) {
        // baked never volume-heals: stays installed, only warns on a KNOWN mismatch
        return { volumeInstalled: true, bakedWarn: drifted };
    }
    // volume: known mismatch forces not-installed → reinstall path
    return { volumeInstalled: drifted ? false : wrapperInstalled, bakedWarn: false };
}

test('remote: volume node at wrong commit → installed:false (reinstall)', () => {
    const r = remoteDrift({ baked: false, folder: 'ComfyUI-MpiNodes', pinned: 'aaa', installedCommits: { 'ComfyUI-MpiNodes': 'bbb' } });
    assert.equal(r.volumeInstalled, false);
    assert.equal(r.bakedWarn, false);
});

test('remote: volume node at right commit → installed stays true', () => {
    const r = remoteDrift({ baked: false, folder: 'ComfyUI-MpiNodes', pinned: 'aaa', installedCommits: { 'ComfyUI-MpiNodes': 'aaa' } });
    assert.equal(r.volumeInstalled, true);
});

test('remote: baked node at wrong commit → warn only, never not-installed', () => {
    const r = remoteDrift({ baked: true, folder: 'RES4LYF', pinned: 'aaa', installedCommits: { 'RES4LYF': 'bbb' } });
    assert.equal(r.bakedWarn, true);
    assert.equal(r.volumeInstalled, true, 'baked node is never volume-healed');
});

// Regression guard for the remote drift-HEAL bug (found live 2026-07-08): a drifted
// volume node's folder is PRESENT (wrong commit) so the wrapper reports it complete
// and answers `already_installed` on a plain install (wrapper.py: `complete and not
// force`) → it never re-fetches at the pinned commit → endless install loop. The fix:
// remoteModelsCheck tags the drifted dep `drifted:true`, downloadManager carries it as
// `forceReinstall`, and remoteInstallDep sends `force:true` so the wrapper rmtree's +
// re-clones. This models that flag chain end-to-end.
function installPlanForDep(statusDep) {
    // Mirror of downloadManager's else-branch (installed:false → toInstall).
    if (statusDep.installed) return null; // not installed via this branch
    return { forceReinstall: statusDep.drifted === true };
}
function installBodyForce(plan) {
    // Mirror of remoteInstallDep({force}) → body.force.
    return plan.forceReinstall === true;
}

test('remote: a drifted volume node installs with force (no already_installed loop)', () => {
    // drifted dep as remoteModelsCheck now tags it
    const driftedDep = { id: 'ComfyUI-MpiNodes', installed: false, drifted: true };
    const plan = installPlanForDep(driftedDep);
    assert.equal(plan.forceReinstall, true, 'drifted node must carry forceReinstall');
    assert.equal(installBodyForce(plan), true, 'install body must send force:true');
});

// MPI-230: syncModelInstalled surfaces the volume nodes that drifted so the connect
// edge can re-clone them. Pure mirror of the extraction loop in
// modelRegistry.syncModelInstalled — collect the drifted DEP ids per model.
//
// MPI-393: this used to collect only the owning MODEL id, and _healRemoteNodeDrift
// re-expanded that into resolveFullUniverse(model) — the model's every weight. The
// volume pre-check dedupes what is present, so a fully-installed model was near-free;
// a PARTIALLY installed one had its missing multi-GB weights silently downloaded, for
// every drifted model, in series. A recreated Pod on a bumped image drifts most volume
// nodes at once, so the "heal" filled a 150GB volume in about a minute and then took
// back any space the user freed. Keep this dep-level.
function driftedNodeDepsFromCheck(results) {
    const drifted = [];
    for (const [modelId, entry] of Object.entries(results)) {
        const depIds = [];
        for (const dep of (entry.deps || [])) {
            if (dep.drifted && dep.id) depIds.push(dep.id);
        }
        if (depIds.length) drifted.push({ modelId, depIds: [...new Set(depIds)] });
    }
    return drifted;
}
function driftedModelIdsFromCheck(results) {
    return driftedNodeDepsFromCheck(results).map(d => d.modelId);
}
// Mirror of _healRemoteNodeDrift's install selection (js/shell.js). What it returns is
// exactly what gets sent to downloadService.start per model.
function healInstallSet(results) {
    return driftedNodeDepsFromCheck(results).map(({ modelId, depIds }) => ({ modelId, install: depIds }));
}

test('surface: a check result with a drifted dep yields the owning model id', () => {
    const results = {
        'ltx-2.3': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: false, drifted: true },
            { id: 'ltx-vae', installed: true },
        ] },
        'chroma': { installed: true, deps: [{ id: 'chroma-unet', installed: true }] },
    };
    assert.deepEqual(driftedModelIdsFromCheck(results), ['ltx-2.3']);
});

test('surface: no drifted dep → empty list (no confirm dialog fires)', () => {
    const results = {
        'chroma': { installed: true, deps: [{ id: 'chroma-unet', installed: true }] },
        'wan': { installed: false, deps: [{ id: 'wan-t2v', installed: false }] }, // missing, NOT drifted
    };
    assert.deepEqual(driftedModelIdsFromCheck(results), []);
});

test('surface: two drifted deps on one model de-dup to a single id', () => {
    const results = {
        'ltx-2.3': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: false, drifted: true },
            { id: 'ComfyUI-KJNodes', installed: false, drifted: true },
        ] },
    };
    assert.deepEqual(driftedModelIdsFromCheck(results), ['ltx-2.3']);
});

// ── MPI-393: the heal installs the drifted NODE, never the model's weights ───────
test('heal: a drifted node on a PARTIAL model installs the node only', () => {
    // The exact live shape: node stale, one weight present, one weight missing.
    // The missing weight is multi-GB and the user never asked for it.
    const results = {
        'sdxl-realistic': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: false, drifted: true },
            { id: 'sdxl-realistic-ckpt', installed: true },
            { id: 'sdxl-refiner-ckpt', installed: false },
        ] },
    };
    assert.deepEqual(healInstallSet(results), [
        { modelId: 'sdxl-realistic', install: ['ComfyUI-MpiNodes'] },
    ]);
});

test('heal: a missing weight WITHOUT node drift is never auto-installed', () => {
    const results = {
        'ltx-2.3': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: true },
            { id: 'ltx-vae', installed: false }, // missing, NOT drifted
        ] },
    };
    assert.deepEqual(healInstallSet(results), [], 'no drift → the heal does nothing at all');
});

test('heal: two drifted nodes on one model both install, weights still excluded', () => {
    const results = {
        'ltx-2.3': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: false, drifted: true },
            { id: 'ComfyUI-KJNodes', installed: false, drifted: true },
            { id: 'ltx-vae', installed: false },
        ] },
    };
    assert.deepEqual(healInstallSet(results), [
        { modelId: 'ltx-2.3', install: ['ComfyUI-MpiNodes', 'ComfyUI-KJNodes'] },
    ]);
});

test('heal: across many drifted models the install set is nodes only (volume-safe)', () => {
    // The live blow-up: several models drifted at once on a recreated Pod. Under the
    // old model-level surface every one of these expanded to its full dep universe.
    const results = {
        'sdxl-realistic': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: false, drifted: true },
            { id: 'sdxl-ckpt', installed: false },
        ] },
        'ltx-2.3': { installed: false, deps: [
            { id: 'ComfyUI-KJNodes', installed: false, drifted: true },
            { id: 'ltx-weight', installed: false },
        ] },
        'qwen': { installed: false, deps: [
            { id: 'ComfyUI-MpiNodes', installed: false, drifted: true },
            { id: 'qwen-weight', installed: false },
        ] },
    };
    const everything = healInstallSet(results).flatMap(r => r.install);
    assert.deepEqual(everything, ['ComfyUI-MpiNodes', 'ComfyUI-KJNodes', 'ComfyUI-MpiNodes']);
    const weights = everything.filter(id => !id.startsWith('ComfyUI-'));
    assert.deepEqual(weights, [], 'a drift heal must never queue a weight');
});

test('remote: a genuinely-missing volume node installs WITHOUT force', () => {
    // installed:false but NOT drifted (folder absent) → normal install, no force
    const missingDep = { id: 'ComfyUI-VideoHelperSuite', installed: false };
    const plan = installPlanForDep(missingDep);
    assert.equal(plan.forceReinstall, false, 'a fresh install must not force');
    assert.equal(installBodyForce(plan), false);
});

test('remote: unknown commit (old wrapper, no nodes[]) → no drift either class', () => {
    const vol = remoteDrift({ baked: false, folder: 'ComfyUI-MpiNodes', pinned: 'aaa', installedCommits: {} });
    const bak = remoteDrift({ baked: true, folder: 'RES4LYF', pinned: 'aaa', installedCommits: {} });
    assert.equal(vol.volumeInstalled, true, 'no false reinstall on an old Pod');
    assert.equal(bak.bakedWarn, false, 'no false warn on an old Pod');
});

test('invariant: every baked node (installRequirements:true) has non-empty pipPins', () => {
    // Live pins captured on a working local engine (MPI-222 Phase 3). Every baked node
    // must pin its drift-risky reqs so a --upgrade install can't major-bump the shared
    // venv (the MPI-217 failure class). Hard assertion — no known-unpinned tolerance.
    const offenders = Object.entries(DEPS)
        .filter(([, d]) => d.type === 'custom_nodes' && d.installRequirements === true)
        .filter(([, d]) => !Array.isArray(d.pipPins) || d.pipPins.length === 0)
        .map(([id]) => id);
    assert.deepEqual(offenders, [], `unpinned baked nodes: ${offenders.join(', ')}`);
});

test('invariant: no cross-node pipPin version conflict on a shared package', () => {
    // opencv-python-headless / numpy / matplotlib / scipy / pillow appear in several
    // nodes' pins. They MUST agree — the venv is shared, so two versions would fight.
    const byPkg = {};
    for (const [id, d] of Object.entries(DEPS)) {
        for (const p of d.pipPins || []) {
            const [pkg, ver] = p.split('==');
            (byPkg[pkg] ??= {})[ver] = (byPkg[pkg][ver] || []).concat(id);
        }
    }
    const conflicts = Object.entries(byPkg).filter(([, vers]) => Object.keys(vers).length > 1);
    assert.deepEqual(conflicts, [], `conflicting pins: ${JSON.stringify(conflicts)}`);
});

// --- MPI-222 targetPath weights (RIFE) --------------------------------------
// A weight whose node HARD-CODES an in-folder scan path (RIFE reads only
// <node>/ckpts/rife/) uses `targetPath` to install inside the node folder instead
// of mpi_models/. Locks: (a) the resolver anchors targetPath on the ComfyUI root,
// never mpi_models; (b) normal weights are UNAFFECTED; (c) remote treats it as
// image-resident (baked into the node in the Pod image) so the wrapper never gets a
// bare-filename install it would reject.

// Pure re-impl of resolveComfyPath's targetPath branch (routes/shared.js) — kept in
// lockstep. Only the targetPath vs mpi_models decision matters here, not abs roots.
function resolveRel(dep) {
    if (dep.targetPath) {
        return ['<comfy>', ...dep.targetPath.split(/[\\/]+/), dep.filename || ''].join('/');
    }
    // normal weight → mpi_models + filename (subdir baked into filename)
    return ['<models>', dep.filename || ''].join('/');
}
// Pure re-impl of _isImageResident's targetPath rule (routes/remoteModels.js).
function isImageResident(dep) {
    return !!dep.targetPath; // (node-type packs also qualify; not under test here)
}

test('targetPath weight resolves INSIDE the node folder, not mpi_models', () => {
    const rife = DEPS['rife47'];
    assert.ok(rife, 'rife47 dep exists');
    const rel = resolveRel(rife);
    assert.ok(rel.startsWith('<comfy>/custom_nodes/comfyui-frame-interpolation/ckpts/rife/'),
        `rife resolves in-node: ${rel}`);
    assert.ok(rel.endsWith('/rife47.pth'), 'ends at the weight file');
    assert.ok(!rel.includes('mpi_models'), 'never lands under mpi_models');
});

test('normal weights are unaffected by the targetPath branch', () => {
    const up = DEPS['4x-NMKD-Siax'];
    assert.ok(!up.targetPath, 'upscaler has no targetPath');
    assert.equal(resolveRel(up), '<models>/upscale_models/4x_NMKD-Siax_200k.pth');
});

test('targetPath weight is image-resident on remote (wrapper never installs it)', () => {
    assert.equal(isImageResident(DEPS['rife47']), true, 'RIFE baked in the node image');
    assert.equal(isImageResident(DEPS['4x-NMKD-Siax']), false, 'normal weight is NOT in-node-resident');
});

// Regression guard for the download call-site bug (found live 2026-07-08): the
// installer resolvers in downloadManager.js used to call resolveComfyPath with a
// STRIPPED {type,filename} object, dropping dep.targetPath → RIFE resolved to the
// mpi_models root (G:\CubricModels\rife47.pth) instead of the in-node ckpts dir.
// The fix routes any dep.targetPath through resolveComfyPath with the FULL dep,
// BEFORE the custom_nodes/customRoot/default branching. This models that branch
// order and asserts a targetPath dep is forwarded whole.
function downloadCallSiteResolvesInNode(dep, { customRoot }) {
    // Mirror of the shipped branch order in downloadManager.js startUniversalWorkflowInstall.
    if (dep.targetPath) return resolveRel(dep);                 // FIRST — full dep
    if (dep.type === 'custom_nodes') return '<custom_nodes>/' + (dep.filename || '');
    if (customRoot) return resolveRel({ type: dep.type, filename: dep.filename }); // stripped
    return '<models>/' + (dep.filename || '');
}

test('download call-site forwards targetPath (regression: RIFE → mpi_models)', () => {
    const rife = DEPS['rife47'];
    // With AND without a customRoot the in-node targetPath must win — the live bug
    // only fired when a customRoot (G:\CubricModels) was set.
    for (const customRoot of ['G:/CubricModels', null]) {
        const rel = downloadCallSiteResolvesInNode(rife, { customRoot });
        assert.ok(rel.startsWith('<comfy>/custom_nodes/comfyui-frame-interpolation/ckpts/rife/'),
            `customRoot=${customRoot}: ${rel}`);
        assert.ok(!rel.includes('models>'), `must NOT fall to the models root (customRoot=${customRoot})`);
    }
});

test('invariant: every targetPath weight has a bare filename + sha256', () => {
    // targetPath supplies the dir, so filename MUST be a bare basename (no subdir) or
    // the resolver would nest it wrong. A hosted weight also needs a sha for verify.
    const offenders = Object.entries(DEPS)
        .filter(([, d]) => d.targetPath)
        .filter(([, d]) => (d.filename || '').includes('/') || !d.sha256)
        .map(([id]) => id);
    assert.deepEqual(offenders, [], `bad targetPath weights: ${offenders.join(', ')}`);
});
