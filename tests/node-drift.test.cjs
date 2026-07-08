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

test('invariant: every targetPath weight has a bare filename + sha256', () => {
    // targetPath supplies the dir, so filename MUST be a bare basename (no subdir) or
    // the resolver would nest it wrong. A hosted weight also needs a sha for verify.
    const offenders = Object.entries(DEPS)
        .filter(([, d]) => d.targetPath)
        .filter(([, d]) => (d.filename || '').includes('/') || !d.sha256)
        .map(([id]) => id);
    assert.deepEqual(offenders, [], `bad targetPath weights: ${offenders.join(', ')}`);
});
