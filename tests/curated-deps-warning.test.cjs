'use strict';

/**
 * MPI-673 / issue #2 — a failed curated pip pass must not stay silent.
 *
 * `/comfy/start` runs `ensureCuratedPythonDeps()` with the engine down, and on failure
 * it starts the engine ANYWAY (deliberate — refusing to boot over an offline pip is the
 * worse regression). The engine then comes up with several node packs unimported, and
 * the reason was returned to that one caller and read by nobody: the app looked healthy
 * until a generation died on `Node 'ClownsharKSampler' not found`.
 *
 * These tests pin the two halves of the fix — the reason outlives the response and
 * rides every `/comfy/status` branch, and the frontend both announces it and refuses to
 * dispatch on it — plus the invariant that must NOT change: the start still starts.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Redirect the logger and the engine root BEFORE requiring the routes: both are
// resolved once at module load, and without this the run appends to the developer's
// real app.log and reads their real engine.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi673-'));
process.env.APP_USER_DATA = TMP;
process.env.CUBRIC_ENGINE_ROOT = TMP;

const comfyRouter = require('../routes/comfy');
const { processState } = require('../routes/shared');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** GET /comfy/status off a throwaway server, whatever branch it happens to take. */
async function getStatus() {
    const app = express();
    app.use(express.json());
    app.use(comfyRouter);
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/comfy/status`);
        return await res.json();
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('/comfy/status carries depsWarning, whichever branch answers', async () => {
    processState.lastDepsWarning = null;
    const clean = await getStatus();
    assert.ok('depsWarning' in clean, 'status must always declare the field, not omit it when clean');
    assert.equal(clean.depsWarning, null);

    const reason = 'curated python deps FAILED: pip could not reach the index';
    processState.lastDepsWarning = reason;
    const degraded = await getStatus();
    assert.equal(degraded.depsWarning, reason,
        'the reason must outlive the /comfy/start response — a reloaded UI never saw it');

    processState.lastDepsWarning = null;
});

test('every /comfy/status response branch spreads the flags', () => {
    // The missed-branch bug this guards: `needsRestart` is on four separate res.json
    // calls, and a fifth branch added later silently drops whatever it forgets.
    const src = read('routes/comfy.js');
    const start = src.indexOf("router.get('/comfy/status'");
    assert.ok(start > 0, 'the /comfy/status handler moved — repoint this test');
    const end = src.indexOf('router.', start + 10);
    const handler = src.slice(start, end);
    const responses = handler.match(/res\.json\(\{[^}]*\}/g) || [];
    assert.ok(responses.length >= 4, `expected the handler's response branches, found ${responses.length}`);
    for (const r of responses) {
        assert.ok(r.includes('...flags'), `a /comfy/status branch answers without the flags: ${r}`);
    }
});

test('a failed pass is recorded but still does NOT abort the start (MPI-459)', () => {
    const src = read('routes/comfy.js');
    assert.ok(src.includes('processState.lastDepsWarning = depsWarning;'),
        'the start must record the outcome — writing null on success is what clears a repaired engine');

    // The catch that owns depsWarning may log and record; it may not rethrow or 500,
    // or an offline pip becomes an engine that refuses to boot.
    const c = src.indexOf('depsWarning = `curated python deps FAILED');
    assert.ok(c > 0, 'the curated-deps catch moved — repoint this test');
    const body = src.slice(c, src.indexOf('processState.lastDepsWarning', c));
    assert.ok(!/throw |res\.status\(/.test(body),
        'a failed curated pass must not abort the engine start');
});

test('the frontend announces the warning once and blocks dispatch on it', () => {
    const controller = read('js/services/comfyController.js');

    // Announce on CHANGE: `state` is a Proxy that emits on every assignment and the
    // readiness poll runs once a second, so announcing on presence would both spam
    // `state:changed` and reopen the dialog forever.
    assert.ok(controller.includes('if (warning === state.comfyDepsWarning) return;'),
        'the warning must be announced (and written) only when it changes');
    assert.ok(/_noteDepsWarning\(status\)/.test(controller) && /_noteDepsWarning\(check\)/.test(controller),
        'both the initial status read and the readiness poll must feed the warning');

    // The gate itself: refused before dispatch, local runs only.
    assert.ok(controller.includes("err.code = 'python_deps_broken'"),
        'a degraded local engine must refuse the graph instead of letting ComfyUI reject it');
    assert.ok(controller.includes('this._alwaysLocal || !remoteEngineClient.isRemote()'),
        'the gate is local-only — the Pod runs no curated pass');

    assert.ok(read('js/services/commandExecutor.js').includes("err?.code === 'python_deps_broken'"),
        'the dispatch path must translate the code into the error dialog, not a raw failure');
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
