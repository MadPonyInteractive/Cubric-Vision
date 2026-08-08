'use strict';
// MPI-480 — a transient wrapper status must survive the throw as `err.transient`.
//
// The RunPod proxy 404s /wrapper/models/install for seconds after a Pod starts, while
// /health is ALREADY green. wrapperFetch knows those statuses are transient (it retries
// them), but remoteInstallDep used to throw a bare Error, so the verdict died at the
// throw: downloadManager broadcast download:failed with a message string and no class,
// and the renderer defaulted to the ui:error branch. Live 2026-08-08 on a cold __cpu__
// download Pod, all 12 ltx-23-balanced deps threw "wrapper install 404" inside 0.2s and
// the user got a Download Failed modal offering to file a GitHub issue — for a boot race
// that a re-POST fixed seconds later.
//
// The classification is the fix, NOT a bigger retry budget: the budget is deliberate
// (routes/remoteModels.js) and widening it would hide this instance while leaving a
// genuinely-down wrapper misclassified the same way.
const assert = require('assert');
const Module = require('module');

// Stub the two modules remoteModels resolves its Pod identity + token from, so the real
// remoteInstallDep runs with no app, no port and no Pod.
const stub = (id, exports) => {
    const resolved = require.resolve(id);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
stub('../routes/remoteProxy', { getRemoteMode: () => ({ podId: 'testpod' }), isRemoteActive: () => true });
const realEngine = require('../routes/remoteEngine');
require.cache[require.resolve('../routes/remoteEngine')].exports = {
    ...realEngine,
    getWrapperToken: async () => 'test-token',
    buildAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
    proxyUrl: () => 'http://127.0.0.1:1/',
};

const { remoteInstallDep, isTransientProxyStatus } = require('../routes/remoteModels');

// 1. The status set IS the classification — exactly the proxy's warm-up statuses.
for (const s of [404, 502, 503, 504]) {
    assert.strictEqual(isTransientProxyStatus(s), true, `${s} is a transient proxy status`);
}
for (const s of [200, 202, 400, 401, 403, 409, 500, 501]) {
    assert.strictEqual(isTransientProxyStatus(s), false,
        `${s} is a REAL wrapper answer — flagging it transient would swallow a genuine failure`);
}

// Run the real retry loop without its ~30s of real sleeping.
const realSetTimeout = globalThis.setTimeout;
const runFast = async (fn) => {
    globalThis.setTimeout = (cb) => realSetTimeout(cb, 0);
    try { return await fn(); } finally { globalThis.setTimeout = realSetTimeout; }
};

const respond = (status, body) => {
    globalThis.fetch = async () => ({
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
    });
};

const dep = { id: 'ltx23_t5', type: 'text_encoders', filename: 'text_encoders/t5.safetensors', url: 'https://x/t5' };

(async () => {
    // 2. THE BUG: a proxy 404 that outlives the budget throws WITH the transient verdict.
    respond(404, null);
    await runFast(async () => {
        await assert.rejects(
            () => remoteInstallDep(dep),
            (err) => {
                assert.strictEqual(err.transient, true,
                    'a 404 that exhausted the budget must carry err.transient so the client toasts');
                assert.match(err.message, /404/, 'the real reason still reaches the log');
                return true;
            },
        );
    });

    // 3. A 502 mid-resume is the same condition through a different gateway status.
    respond(502, null);
    await runFast(() => assert.rejects(
        () => remoteInstallDep(dep),
        (err) => err.transient === true,
    ));

    // 4. GUARD (acceptance #2): a GENUINE failure must NOT be flagged — it still reaches
    //    the Report-on-GitHub dialog. A wrapper that answers 400 with a real reason is not
    //    a boot race, and swallowing it into a toast would be the opposite defect.
    respond(400, { message: 'sha256 mismatch for ltx23_t5' });
    await runFast(() => assert.rejects(
        () => remoteInstallDep(dep),
        (err) => {
            assert.ok(!err.transient, 'a real wrapper 400 must stay un-flagged so the error dialog still fires');
            assert.match(err.message, /sha256 mismatch/, 'the genuine reason survives untouched');
            return true;
        },
    ));

    // 5. A 501 (endpoint genuinely absent) is likewise NOT transient — retrying forever
    //    and toasting "not ready yet" would hide a real image/version mismatch.
    respond(501, null);
    await runFast(() => assert.rejects(
        () => remoteInstallDep(dep),
        (err) => !err.transient,
    ));

    console.log('remote-transient-install-toast: 5 checks passed');
})().catch((err) => { console.error(err); process.exit(1); });
