'use strict';

// MPI-469 — the REMOTE uninstall must not report files it never deleted.
//
// The wrapper answers 'deleted' | 'not_found' | 'unsupported'; the route used to push
// every non-'unsupported' answer into removed[], so a dep that was never on the volume
// read as a successful delete (measured on a Pod 2026-08-07: nvidia-pid reported 8
// removed with 1 real file). This drives the REAL route over a stubbed wrapper — no
// Pod, no network — and asserts the buckets, because removed[] rides the response and
// the download:uninstalled broadcast into the renderer's toast copy.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const express = require('express');

process.env.CUBRIC_MODELS_ROOT = path.join(os.tmpdir(), 'mpi469-' + process.pid);

const remoteModels = require('../routes/remoteModels.js');
const dm = require('../routes/downloadManager.js');
const { MODELS } = require('../js/data/modelConstants/models.js');
const { resolveFullUniverse } = require('../js/data/modelConstants/resolveModelDeps.js');
const { DEPS } = require('../js/data/modelConstants/dependencies.js');
const { getUniversalWorkflowDepIds } = require('../routes/shared.js');

// A model with no operation groups: its whole universe on the volume = installed.
// Same pick as tests/orphan-sweep-remote.test.cjs.
const MODEL = MODELS.find(m => m.id === 'boogu-edit-balanced');
const UNIVERSAL = new Set(getUniversalWorkflowDepIds());
// Only deps the loop actually reaches — universal deps short-circuit into keptUniversal.
const DELETABLE = resolveFullUniverse(MODEL, null, 'remote').filter(id => !UNIVERSAL.has(id));

// ── Stubbed wrapper ───────────────────────────────────────────────────────────
// `present` is the fake volume: a dep in it deletes, a dep outside it is 'not_found'.
let present = new Set();
let deleteStatusOverride = null;

remoteModels.isRemoteActive = () => true;
remoteModels.remoteModelsCheck = async (models) => {
    const results = {};
    for (const m of models || []) {
        const deps = (m.deps || []).map(d => ({ ...d, installed: present.has(d.id) }));
        results[m.id] = { deps, installed: deps.length > 0 && deps.every(d => d.installed) };
    }
    return { results };
};
remoteModels.remoteUninstallDep = async (dep) => {
    if (deleteStatusOverride) return { status: deleteStatusOverride, id: dep.id };
    if (!present.has(dep.id)) return { status: 'not_found', id: dep.id };
    present.delete(dep.id);
    return { status: 'deleted', id: dep.id };
};

async function uninstall(baseUrl, depIds) {
    const res = await fetch(`${baseUrl}/comfy/models/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            modelId: MODEL.id,
            dependencies: depIds.map(id => DEPS[id]).filter(Boolean),
            deleteFiles: true,
        }),
    });
    return res.json();
}

test('remote uninstall reports only the deps the wrapper actually deleted', async (t) => {
    const app = express();
    app.use(express.json());
    app.use(dm.router);
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    t.after(() => server.close());

    // ── The measured case: one dep on the volume, the rest never there ────────
    const onVolume = DELETABLE[0];
    present = new Set([onVolume]);
    let data = await uninstall(baseUrl, DELETABLE);

    assert.deepEqual(data.removed.map(r => r.depId), [onVolume],
        'only the dep that was on the volume may be reported removed');
    const absent = data.keptModelFiles.filter(k => k.reason === 'already-absent').map(k => k.depId);
    assert.deepEqual(absent.sort(), DELETABLE.slice(1).sort(),
        "every not_found dep lands in keptModelFiles with the local twin's reason string");

    // ── Nothing on the volume: nothing removed, no false success ──────────────
    present = new Set();
    data = await uninstall(baseUrl, DELETABLE);
    assert.equal(data.removed.length, 0, 'an empty volume must report zero removed');
    assert.equal(data.keptModelFiles.filter(k => k.reason === 'already-absent').length, DELETABLE.length);

    // ── An OLD Pod image (no delete endpoint) still reads as unsupported ──────
    // The brief's watch-item: with not_found no longer inflating removed[], the
    // `anyUnsupported && removed.length === 0` early-return can newly fire. It should —
    // nothing was deleted and the image cannot delete, so the install record survives.
    deleteStatusOverride = 'unsupported';
    present = new Set(DELETABLE);
    data = await uninstall(baseUrl, DELETABLE);
    deleteStatusOverride = null;
    assert.equal(data.success, false);
    assert.equal(data.remoteUnsupported, 'uninstall');
});
