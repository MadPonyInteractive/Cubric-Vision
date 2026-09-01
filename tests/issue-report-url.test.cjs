'use strict';

/**
 * MPI-675 — the bug-report path must work with NO credentials.
 *
 * Before this, POST /github/create-issue filed the issue through the GitHub API
 * with a GITHUB_TOKEN read from `.env` — which scripts/build-portable.mjs strips
 * from every portable build. The route 500'd for every shipped user and the
 * Report button silently did nothing, which is why issue #2 arrived with no log.
 *
 * These tests pin the replacement: a prefilled issue-form URL built server-side,
 * and a reveal-the-log route. Both run with the GitHub env vars DELETED.
 */

const assert = require('node:assert/strict');
const express = require('express');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the logger at a throwaway user-data dir BEFORE routes/logger is loaded:
// it resolves its path once and caches it. Without this the reveal test below
// finds the developer's real app.log and pops a file-manager window on `npm test`.
const TMP_USER_DATA = path.join(os.tmpdir(), `mpi675-${process.pid}`);
process.env.APP_USER_DATA = TMP_USER_DATA;

// Required AFTER APP_USER_DATA is set, and shared with routes/system: the reveal test
// below swaps `getLogPath` on this instance to pin the route's miss branch.
const logger = require('../routes/logger');

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

/** Load routes/system with GITHUB_TOKEN/GITHUB_REPO absent, as a shipped build has them. */
async function withCredentiallessServer(fn) {
    const originalToken = process.env.GITHUB_TOKEN;
    const originalRepo = process.env.GITHUB_REPO;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPO;
    try {
        await withServer(fresh('../routes/system'), fn);
    } finally {
        if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
        else process.env.GITHUB_TOKEN = originalToken;
        if (originalRepo === undefined) delete process.env.GITHUB_REPO;
        else process.env.GITHUB_REPO = originalRepo;
    }
}

test('issue-url builds a prefilled report with no GitHub credentials present', { concurrency: false }, async () => {
    await withCredentiallessServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/github/issue-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'ComfyUI failed to start',
                message: "Node 'ClownsharKSampler' not found.",
                summary: 'Clicked generate on Krea2',
                build: { appVersion: '1.4.2', stage: 'alpha', hash: 'abcdef1' },
            }),
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);

        const url = new URL(data.url);
        assert.equal(url.origin + url.pathname, 'https://github.com/MadPonyInteractive/Cubric-Vision/issues/new');
        assert.equal(url.searchParams.get('template'), 'bug-report.yml');
        assert.match(url.searchParams.get('title'), /^\[bug\]: ComfyUI failed to start/);
        assert.match(url.searchParams.get('summary'), /Clicked generate on Krea2/);
        assert.match(url.searchParams.get('actual'), /ClownsharKSampler/);
        assert.match(url.searchParams.get('app_version'), /1\.4\.2/);
        assert.match(url.searchParams.get('app_version'), /abcdef1/);
        assert.ok(url.searchParams.get('os_version'), 'os_version must be prefilled');
        assert.ok(['Windows', 'macOS', 'Linux'].includes(url.searchParams.get('platform')));

        // The log is handed over as a FILE, never crammed into the URL — GitHub
        // caps issue-form query length. The field must name where it lives.
        assert.match(url.searchParams.get('logs'), /app\.log/);
    });
});

test('issue-url redacts secrets before they reach the URL', { concurrency: false }, async () => {
    await withCredentiallessServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/github/issue-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'RunPod failed rpa_1234567890',
                message: 'proxy token=0123456789abcdef exploded',
                summary: 'Clicked connect with Bearer abcdefghijklmnop',
                build: { appVersion: '1.4.2', stage: 'alpha', hash: 'abcdef1' },
            }),
        });

        assert.equal(res.status, 200);
        const { url } = await res.json();
        const decoded = decodeURIComponent(url);
        assert.equal(decoded.includes('rpa_1234567890'), false);
        assert.equal(decoded.includes('0123456789abcdef'), false);
        assert.equal(decoded.includes('abcdefghijklmnop'), false);
        assert.match(decoded, /REDACTED/);
    });
});

test('issue-url rejects an empty report instead of building a blank issue', { concurrency: false }, async () => {
    await withCredentiallessServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/github/issue-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).success, false);
    });
});

test('the credentialed auto-file route is gone', { concurrency: false }, async () => {
    await withCredentiallessServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/github/create-issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 't', message: 'm' }),
        });
        assert.equal(res.status, 404);
    });
});

test('logs/reveal answers with the log path even when there is no log to reveal', { concurrency: false }, async () => {
    // The route MUST take its miss branch here: the success branch spawns the OS
    // file manager, and `npm test` may not open a window on anyone's desktop.
    //
    // Deleting app.log does not guarantee that. The logger appends ASYNCHRONOUSLY
    // (routes/logger.js, one queued write per call), so a line emitted by an earlier
    // test in this file can land after the delete and put the file back — which is
    // exactly what happened on CI run 33489276364: 200, not 404, and a real reveal
    // spawned on the runner. Point the route at a path nothing writes to instead;
    // `getLogPath()` is the single place it resolves from, and `fresh()` below
    // re-requires routes/system against this same logger instance.
    const realGetLogPath = logger.getLogPath;
    const missingLog = path.join(TMP_USER_DATA, 'logs', 'never-written.log');
    logger.getLogPath = () => missingLog;
    try {
        await withCredentiallessServer(async (baseUrl) => {
            const res = await fetch(`${baseUrl}/logs/reveal`, { method: 'POST' });
            assert.equal(res.status, 404);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.ok(data.logPath, 'logPath must be present on every outcome');
            assert.equal(data.logPath, missingLog);
        });
    } finally {
        logger.getLogPath = realGetLogPath;
    }
});

test.after(() => fs.rmSync(TMP_USER_DATA, { recursive: true, force: true }));
