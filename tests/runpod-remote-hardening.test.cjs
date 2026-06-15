'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const test = require('node:test');

function responseOf({ status = 200, json, text, headers } = {}) {
    const bodyText = text ?? (json !== undefined ? JSON.stringify(json) : '');
    const bodyJson = json !== undefined ? json : (bodyText ? JSON.parse(bodyText) : {});
    const headerMap = new Map(Object.entries(headers || {}));
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (name) => headerMap.get(String(name).toLowerCase()) || null },
        async text() { return bodyText; },
        async json() { return bodyJson; },
        body: null,
    };
}

async function withServer(router, fn) {
    const app = express();
    app.use(express.json());
    app.use(router);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
        await fn(baseUrl);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function fresh(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

function loadRemoteProxyHarness(overrides = {}) {
    const remoteEngine = fresh('../routes/remoteEngine');
    const runpodRemote = fresh('../routes/runpodRemote');
    const logger = fresh('../routes/logger');

    const originals = {
        remoteEngine: {
            getWrapperToken: remoteEngine.getWrapperToken,
            setWrapperToken: remoteEngine.setWrapperToken,
            clearWrapperToken: remoteEngine.clearWrapperToken,
            generateWrapperToken: remoteEngine.generateWrapperToken,
            getRunPodApiKey: remoteEngine.getRunPodApiKey,
            waitForWrapperReady: remoteEngine.waitForWrapperReady,
            proxyUrl: remoteEngine.proxyUrl,
        },
        client: {
            dataCenters: runpodRemote.client.dataCenters,
            startPod: runpodRemote.client.startPod,
            createPod: runpodRemote.client.createPod,
            stopPod: runpodRemote.client.stopPod,
            deletePod: runpodRemote.client.deletePod,
            listPods: runpodRemote.client.listPods,
            getPod: runpodRemote.client.getPod,
        },
        logger: {
            info: logger.info,
            warn: logger.warn,
            error: logger.error,
        },
        fetch: global.fetch,
    };

    Object.assign(remoteEngine, overrides.remoteEngine || {});
    Object.assign(runpodRemote.client, overrides.client || {});
    logger.info = (...args) => { if (overrides.log) overrides.log('info', args); };
    logger.warn = (...args) => { if (overrides.log) overrides.log('warn', args); };
    logger.error = (...args) => { if (overrides.log) overrides.log('error', args); };
    if (overrides.fetch) global.fetch = overrides.fetch;

    const remoteProxy = fresh('../routes/remoteProxy');

    return {
        remoteProxy,
        cleanup() {
            Object.assign(remoteEngine, originals.remoteEngine);
            Object.assign(runpodRemote.client, originals.client);
            logger.info = originals.logger.info;
            logger.warn = originals.logger.warn;
            logger.error = originals.logger.error;
            global.fetch = originals.fetch;
            delete require.cache[require.resolve('../routes/remoteProxy')];
        },
    };
}

test('runpodRemote.redactSecret scrubs api key, query param, and bearer token', { concurrency: false }, () => {
    const { redactSecret } = fresh('../routes/runpodRemote');
    const raw = 'https://x.test?api_key=rpa_1234567890 token=Bearer abcdefghi rpa_deadbeef';
    const out = redactSecret(raw);
    assert.equal(out.includes('rpa_1234567890'), false);
    assert.equal(out.includes('api_key=rpa_1234567890'), false);
    assert.equal(out.includes('Bearer abcdefghi'), false);
    assert.match(out, /api_key=\[REDACTED\]/);
    assert.match(out, /Bearer \[REDACTED\]/);
    assert.match(out, /rpa_\[REDACTED\]/);
});

test('secretRedaction redacts generic token query values and token fields', { concurrency: false }, () => {
    const { redactSecrets } = fresh('../routes/secretRedaction');
    const raw = 'wss://x.test/ws?clientId=abc&token=0123456789abcdef token: 0123456789abcdef';
    const out = redactSecrets(raw);
    assert.equal(out.includes('0123456789abcdef'), false);
    assert.match(out, /token=\[REDACTED\]/);
    assert.match(out, /token: \[REDACTED\]/i);
});

test('runpodRemote validate route returns 400 when no API key is available', { concurrency: false }, async () => {
    const runpodRemote = fresh('../routes/runpodRemote');
    runpodRemote.setApiKeyResolver(async () => null);
    await withServer(runpodRemote.router, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/runpod/account/validate`);
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), {
            error: 'no_api_key',
            message: 'RunPod API key not set',
        });
    });
});

test('runpodRemote validate route reports invalid credentials without throwing', { concurrency: false }, async () => {
    const runpodRemote = fresh('../routes/runpodRemote');
    const originalValidate = runpodRemote.client.validate;
    runpodRemote.setApiKeyResolver(async () => 'rpa_fake_key');
    runpodRemote.client.validate = async () => ({ valid: false, status: 401 });
    try {
        await withServer(runpodRemote.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/runpod/account/validate`);
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), { valid: false, status: 401 });
        });
    } finally {
        runpodRemote.client.validate = originalValidate;
    }
});

test('remoteEngine.waitForWrapperReady tolerates transient fetch failures and returns ready health', { concurrency: false }, async () => {
    const remoteEngine = fresh('../routes/remoteEngine');
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
        calls += 1;
        if (calls < 3) throw new Error('network down');
        return responseOf({ status: 200, json: { ready: true, comfy_ready: true } });
    };
    try {
        const out = await remoteEngine.waitForWrapperReady('pod-1', { timeoutMs: 50, intervalMs: 0 });
        assert.equal(out.ready, true);
        assert.deepEqual(out.health, { ready: true, comfy_ready: true });
        assert.equal(calls, 3);
    } finally {
        global.fetch = originalFetch;
    }
});

test('logger ring buffer stores redacted secrets instead of raw values', { concurrency: false }, () => {
    const logger = fresh('../routes/logger');
    logger.error('runpod', 'request failed api_key=rpa_abcdefghi', new Error('Bearer abcdefghijklmnop token=0123456789abcdef'));
    const recent = logger.getRecentLogs();
    assert.equal(recent.includes('rpa_abcdefghi'), false);
    assert.equal(recent.includes('abcdefghijklmnop'), false);
    assert.equal(recent.includes('0123456789abcdef'), false);
    assert.match(recent, /api_key=\[REDACTED\]/);
    assert.match(recent, /Bearer \[REDACTED\]/);
});

test('system github issue route redacts secrets before building the payload', { concurrency: false }, async () => {
    const axios = fresh('axios');
    const originalPost = axios.post;
    const originalToken = process.env.GITHUB_TOKEN;
    const originalRepo = process.env.GITHUB_REPO;
    const captured = [];
    process.env.GITHUB_TOKEN = 'ghs_test';
    process.env.GITHUB_REPO = 'owner/repo';
    axios.post = async (_url, payload) => {
        captured.push(payload);
        return { data: { html_url: 'https://github.test/issues/1', number: 1 } };
    };
    const systemRouter = fresh('../routes/system');
    try {
        await withServer(systemRouter, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/github/create-issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'RunPod failed rpa_1234567890',
                    message: 'proxy token=0123456789abcdef exploded',
                    summary: 'Clicked connect with Bearer abcdefghijklmnop',
                    log: 'api_key=rpa_1234567890\nwss://x.test/ws?token=0123456789abcdef',
                    build: { appVersion: '0.1.0', stage: 'alpha', hash: 'abcdef1' },
                }),
            });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
        });
        assert.equal(captured.length >= 1, true);
        const payload = captured[0];
        const text = JSON.stringify(payload);
        assert.equal(text.includes('rpa_1234567890'), false);
        assert.equal(text.includes('0123456789abcdef'), false);
        assert.equal(text.includes('abcdefghijklmnop'), false);
        assert.match(text, /REDACTED/);
    } finally {
        axios.post = originalPost;
        process.env.GITHUB_TOKEN = originalToken;
        process.env.GITHUB_REPO = originalRepo;
    }
});

test('remoteProxy reconnect returns unavailable when the saved GPU is no longer available', { concurrency: false }, async () => {
    const deleted = [];
    const harness = loadRemoteProxyHarness({
        remoteEngine: {
            getRunPodApiKey: async () => 'rpa_fake_key',
            getWrapperToken: async () => 'wrapper-token',
            setWrapperToken: async () => {},
            clearWrapperToken: async () => {},
            generateWrapperToken: () => 'generated-token',
            waitForWrapperReady: async () => ({ ready: true, health: { ready: true } }),
            proxyUrl: () => 'https://proxy.test',
        },
        client: {
            dataCenters: async () => [{ id: 'eu-1', gpuAvailability: [] }],
            deletePod: async (_key, podId) => {
                deleted.push(podId);
                return { ok: true, status: 200, json: {} };
            },
            listPods: async () => ({ ok: true, status: 200, json: [] }),
        },
    });
    try {
        await withServer(harness.remoteProxy.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/remote/pod/reconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ podId: 'pod-old', gpuTypeId: 'gpu-x', datacenter: 'eu-1', volumeId: 'vol-1' }),
            });
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), { unavailable: true, gpuTypeId: 'gpu-x' });
            assert.deepEqual(deleted, ['pod-old']);
        });
    } finally {
        harness.cleanup();
    }
});

test('remoteProxy reconnect recreates the pod when warm start fails', { concurrency: false }, async () => {
    const startCalls = [];
    const createCalls = [];
    const setTokenCalls = [];
    const harness = loadRemoteProxyHarness({
        remoteEngine: {
            getRunPodApiKey: async () => 'rpa_fake_key',
            getWrapperToken: async () => 'wrapper-token',
            setWrapperToken: async (token, podId) => { setTokenCalls.push({ token, podId }); },
            clearWrapperToken: async () => {},
            generateWrapperToken: () => 'generated-token',
            waitForWrapperReady: async () => ({ ready: true, health: { ready: true } }),
            proxyUrl: (podId) => `https://${podId}.proxy.test`,
        },
        client: {
            dataCenters: async () => [{ id: 'eu-1', gpuAvailability: [{ available: true, gpuTypeId: 'gpu-x' }] }],
            startPod: async (_key, podId) => {
                startCalls.push(podId);
                return { ok: false, status: 500, json: { error: 'host full' } };
            },
            deletePod: async () => ({ ok: true, status: 200, json: {} }),
            createPod: async (_key, spec) => {
                createCalls.push(spec);
                return { ok: true, status: 200, json: { id: 'pod-new' } };
            },
            listPods: async () => ({ ok: true, status: 200, json: [] }),
        },
    });
    try {
        await withServer(harness.remoteProxy.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/remote/pod/reconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ podId: 'pod-old', gpuTypeId: 'gpu-x', datacenter: 'eu-1', volumeId: 'vol-1' }),
            });
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), {
                starting: true,
                ready: false,
                podId: 'pod-new',
                recreated: true,
            });
            assert.deepEqual(startCalls, ['pod-old']);
            assert.equal(createCalls.length, 1);
            assert.equal(createCalls[0].networkVolumeId, 'vol-1');
            assert.deepEqual(setTokenCalls, [{ token: 'generated-token', podId: 'pod-new' }]);
        });
    } finally {
        harness.cleanup();
    }
});

test('remoteProxy teardown stops the tracked pod when delete-on-quit is disabled', { concurrency: false }, async () => {
    const stopCalls = [];
    const harness = loadRemoteProxyHarness({
        remoteEngine: {
            getRunPodApiKey: async () => 'rpa_fake_key',
            getWrapperToken: async () => 'wrapper-token',
            clearWrapperToken: async () => {},
        },
        client: {
            stopPod: async (_key, podId) => {
                stopCalls.push(podId);
                return { ok: true, status: 200, json: {} };
            },
            listPods: async () => ({ ok: true, status: 200, json: [] }),
        },
    });
    try {
        harness.remoteProxy.setRemoteMode({ active: true, podId: 'pod-stop', deleteOnQuit: false });
        await withServer(harness.remoteProxy.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/remote/pod/teardown`, { method: 'POST' });
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), { ok: true, action: 'stop', podId: 'pod-stop', reaped: [] });
            assert.deepEqual(stopCalls, ['pod-stop']);
        });
    } finally {
        harness.cleanup();
    }
});

test('remoteProxy teardown deletes the tracked pod when delete-on-quit is enabled', { concurrency: false }, async () => {
    const deleteCalls = [];
    const clearCalls = [];
    const harness = loadRemoteProxyHarness({
        remoteEngine: {
            getRunPodApiKey: async () => 'rpa_fake_key',
            getWrapperToken: async () => 'wrapper-token',
            clearWrapperToken: async () => { clearCalls.push('cleared'); },
        },
        client: {
            deletePod: async (_key, podId) => {
                deleteCalls.push(podId);
                return { ok: true, status: 200, json: {} };
            },
            listPods: async () => ({ ok: true, status: 200, json: [] }),
        },
    });
    try {
        harness.remoteProxy.setRemoteMode({ active: true, podId: 'pod-delete', deleteOnQuit: true });
        await withServer(harness.remoteProxy.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/remote/pod/teardown`, { method: 'POST' });
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), { ok: true, action: 'delete', podId: 'pod-delete', reaped: [] });
            assert.deepEqual(deleteCalls, ['pod-delete']);
            assert.equal(clearCalls.length, 2);
        });
    } finally {
        harness.cleanup();
    }
});

test('remoteProxy interrupt route returns 409 when remote mode is inactive', { concurrency: false }, async () => {
    const harness = loadRemoteProxyHarness();
    try {
        await withServer(harness.remoteProxy.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/proxy/interrupt`, { method: 'POST' });
            assert.equal(res.status, 409);
            assert.deepEqual(await res.json(), { error: 'remote_inactive' });
        });
    } finally {
        harness.cleanup();
    }
});

test('remoteProxy interrupt route returns relay_failed when the upstream call drops mid-flight', { concurrency: false }, async () => {
    const originalFetch = global.fetch;
    const harness = loadRemoteProxyHarness({
        remoteEngine: {
            getWrapperToken: async () => 'wrapper-token',
            proxyUrl: () => 'https://proxy.test',
        },
        fetch: async (url, options) => {
            if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
            throw new Error('socket hang up');
        },
    });
    try {
        harness.remoteProxy.setRemoteMode({ active: true, podId: 'pod-live' });
        await withServer(harness.remoteProxy.router, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/proxy/interrupt`, { method: 'POST' });
            assert.equal(res.status, 502);
            assert.deepEqual(await res.json(), { error: 'relay_failed' });
        });
    } finally {
        harness.cleanup();
    }
});
