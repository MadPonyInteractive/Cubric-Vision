'use strict';

// MPI-460 — a transport failure mid-stream must retry the SAME url and resume from the
// partial, not go terminal on the first blip. Live cost of the missing retry: a 25GB LTX
// transformer failed at 8.4GB because the stall watchdog (MPI-291) force-errored a quiet
// socket into a path that had no retry in it.
//
// This drives the REAL FileDownloader against a local server that kills the first
// connection mid-body and answers the follow-up Range request — the only way to prove the
// retry actually resumes (MPI-317 contract) rather than restarting from zero.
// Run: node tests/download-retry.test.cjs
//
// MPI-716 added a SECOND case on the same harness: a body written a chunk at a time, to
// prove the slow-stream WARN latches once on a stream that is slow but perfectly alive —
// the case every existing guard misses, because they all fire on DEAD.

const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const logger = require('../routes/logger.js');
const { FileDownloader, _setSlowStreamThresholdsForTests, _writeProbe } = require('../routes/downloadManager.js');

const BODY = crypto.randomBytes(200 * 1024);
const BODY_SHA = crypto.createHash('sha256').update(BODY).digest('hex');
const CUT_AT = 50 * 1024;

const requests = [];

function startServer() {
    const server = http.createServer((req, res) => {
        // NDH's resumeFromFile asks for the total with a HEAD before it re-requests the
        // body (it is only given `downloaded`/`fileName`), so a resume is TWO round trips.
        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Length': String(BODY.length), 'Accept-Ranges': 'bytes' });
            res.end();
            return;
        }
        requests.push(req.headers.range || null);
        const range = /^bytes=(\d+)-/.exec(req.headers.range || '');
        if (range) {
            const from = Number(range[1]);
            res.writeHead(206, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(BODY.length - from),
                'Content-Range': `bytes ${from}-${BODY.length - 1}/${BODY.length}`,
                'Accept-Ranges': 'bytes',
            });
            res.end(BODY.subarray(from));
            return;
        }
        // First attempt: promise the whole file, deliver a slice, then kill the socket —
        // the shape of every mid-stream transport failure (and of a forceStall() stop).
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(BODY.length),
            'Accept-Ranges': 'bytes',
        });
        res.write(BODY.subarray(0, CUT_AT), () => req.socket.destroy());
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// MPI-716 — the same shape as startServer(), with the body dribbled out instead of cut.
// THROTTLE_BPS is well under the 1 MB/s floor, so the stream is genuinely sub-floor while
// never going quiet: NDH's socket timeout, the MPI-291 watchdog and the MPI-460 retry all
// stay silent, which is precisely the gap the WARN exists to fill.
const SLOW_CHUNK = 8 * 1024;
const SLOW_CHUNK_MS = 100; // ≈80 KB/s
function startThrottledServer() {
    const server = http.createServer((req, res) => {
        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Length': String(BODY.length), 'Accept-Ranges': 'bytes' });
            res.end();
            return;
        }
        // No cf-ray header — this is not Cloudflare, and the WARN must degrade cleanly.
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(BODY.length),
            'Accept-Ranges': 'bytes',
        });
        let sent = 0;
        const timer = setInterval(() => {
            if (sent >= BODY.length) {
                clearInterval(timer);
                res.end();
                return;
            }
            res.write(BODY.subarray(sent, sent + SLOW_CHUNK));
            sent += SLOW_CHUNK;
        }, SLOW_CHUNK_MS);
        res.on('close', () => clearInterval(timer));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function testSlowStreamWarn() {
    // Compress the 60s production window — the point under test is the LATCH, not the
    // wall-clock constant, and a minute of real time buys the suite nothing.
    _setSlowStreamThresholdsForTests(1024 * 1024, 1_000);

    const warns = [];
    const infos = [];
    const realWarn = logger.warn.bind(logger);
    const realInfo = logger.info.bind(logger);
    logger.warn = (category, message) => { warns.push(String(message)); };
    logger.info = (category, message) => { infos.push(String(message)); };

    const server = await startThrottledServer();
    const port = server.address().port;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-716-'));
    const localPath = path.join(dir, 'slow.safetensors');

    const depJob = {
        id: 'test-slow-dep',
        modelId: 'test-model',
        url: `http://127.0.0.1:${port}/slow.bin`,
        localPath,
        sha256Expected: BODY_SHA,
        status: 'downloading',
        downloadedBytes: 0,
        totalBytes: 0,
    };

    const dl = new FileDownloader(depJob, localPath);
    try {
        await dl.download();
        const deadline = Date.now() + 30_000;
        while (depJob.status === 'downloading' && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 100));
        }
        // The probe is fire-and-forget off the WARN, so give it a moment to land before
        // asserting on it — it must not be awaited on the download path.
        const probeDeadline = Date.now() + 5_000;
        while (!infos.some(m => m.includes('write probe')) && Date.now() < probeDeadline) {
            await new Promise(r => setTimeout(r, 50));
        }
    } finally {
        logger.warn = realWarn;
        logger.info = realInfo;
        server.close();
        _setSlowStreamThresholdsForTests(1024 * 1024, 60_000);
    }

    assert.equal(depJob.status, 'complete', `slow dep ended ${depJob.status}: ${depJob.error || ''}`);
    const slowWarns = warns.filter(m => m.includes('slow stream'));
    assert.equal(slowWarns.length, 1, `exactly one WARN per dep, got ${slowWarns.length}: ${slowWarns.join(' | ')}`);
    assert.equal(dl._slowWarned, true, 'the latch must be set');

    const line = slowWarns[0];
    assert.ok(line.includes(depJob.id), `WARN names the dep: ${line}`);
    assert.match(line, /slow stream — [\d.]+ (B|KB|MB)\/s sustained \d+s/, `WARN names a rate: ${line}`);
    assert.ok(line.includes(`from 127.0.0.1:${port}`), `WARN names the host it is streaming from: ${line}`);
    assert.ok(line.includes('cf-ray: -'), `no cf-ray must degrade to "-": ${line}`);
    assert.ok(!line.includes('peer -'), `the peer IP comes off the real socket: ${line}`);

    // The probe rides the SAME latch, so it runs at most once per dep and leaves nothing.
    const probeLines = infos.filter(m => m.includes('write probe'));
    assert.equal(probeLines.length, 1, `exactly one write probe per dep, got ${probeLines.length}`);
    assert.match(probeLines[0], /write probe — [\d.]+ (B|KB|MB|GB)\/s writing 8 MB \(fsynced\)/,
        `probe names a rate for a real fsynced write: ${probeLines[0]}`);
    const leftovers = (await fs.readdir(dir)).filter(f => f.startsWith('.cubric-write-probe-'));
    assert.deepEqual(leftovers, [], `probe must delete its temp file, found ${leftovers.join(', ')}`);

    await fs.remove(dir);
    console.log('  ok  a slow-but-alive stream warns exactly once, naming rate, host, peer and POP');
    console.log('  ok  the write probe fires once off that latch, names an fsynced rate, and cleans up');
}

// MPI-716 — the probe's failure path. Telemetry must never become a new way to fail, so
// a probe that cannot even open its file logs and resolves; it does not reject into the
// progress handler that called it, and it leaves nothing behind.
async function testWriteProbeSurvivesItsOwnFailure() {
    const warns = [];
    const realWarn = logger.warn.bind(logger);
    logger.warn = (category, message) => { warns.push(String(message)); };
    const missingDir = path.join(os.tmpdir(), 'mpi-716-does-not-exist', 'nor-this');
    try {
        await _writeProbe(missingDir, 'test-probe-dep'); // must resolve, not reject
    } finally {
        logger.warn = realWarn;
    }
    assert.ok(warns.some(m => m.includes('write probe failed')),
        `a failed probe warns instead of throwing: ${warns.join(' | ')}`);
    assert.equal(await fs.pathExists(missingDir), false, 'a failed probe creates nothing');
    console.log('  ok  a write probe that throws logs, resolves, and leaves nothing behind');
}

async function main() {
    const server = await startServer();
    const port = server.address().port;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-460-'));
    const localPath = path.join(dir, 'weight.safetensors');

    const depJob = {
        id: 'test-retry-dep',
        modelId: 'test-model',
        url: `http://127.0.0.1:${port}/file.bin`,
        localPath,
        sha256Expected: BODY_SHA,
        status: 'downloading',
        downloadedBytes: 0,
        totalBytes: 0,
    };

    const dl = new FileDownloader(depJob, localPath);
    // The live trigger, exactly: NDH does NOT emit 'error' on a socket that dies
    // mid-body (v2.1.11 — the MPI-291 finding, re-measured here), so the stall watchdog's
    // forceStall() is what actually routes a dead stream into the error path. Fire it once
    // the first slice has landed, which is the shape of the 2026-08-06 failure.
    dl.onProgress = () => {
        if (dl._stalledOnce) return;
        dl._stalledOnce = true;
        setTimeout(() => dl.forceStall(), 300);
    };
    await dl.download();

    const deadline = Date.now() + 30_000;
    while (depJob.status === 'downloading' && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
    }

    server.close();

    assert.equal(depJob.status, 'complete', `dep ended ${depJob.status}: ${depJob.error || ''}`);
    assert.equal(dl._attempts, 1, 'exactly one retry should have been spent');
    assert.equal(requests.length, 2, 'the dead connection must be retried once');
    assert.equal(requests[0], null, 'first attempt is a plain GET');
    assert.equal(requests[1], `bytes=${CUT_AT}-`,
        'the retry must RESUME from the partial, not restart from zero');

    const onDisk = await fs.readFile(localPath);
    assert.equal(onDisk.length, BODY.length, 'file is whole');
    assert.equal(crypto.createHash('sha256').update(onDisk).digest('hex'), BODY_SHA,
        'resumed bytes are not appended garbage (MPI-258 Bug 2 guard)');

    await fs.remove(dir);
    console.log('  ok  a killed connection retries the same url and resumes from the partial');

    await testSlowStreamWarn();
    await testWriteProbeSurvivesItsOwnFailure();
    console.log('\n4 passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
