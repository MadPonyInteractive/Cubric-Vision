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
const {
    FileDownloader,
    _setSlowStreamThresholdsForTests,
    _setRetryTuningForTests,
    _writeProbe,
} = require('../routes/downloadManager.js');

const BODY = crypto.randomBytes(200 * 1024);
const BODY_SHA = crypto.createHash('sha256').update(BODY).digest('hex');
const CUT_AT = 50 * 1024;

// MPI-718 — startServer()'s three knobs. Defaults reproduce the MPI-460 case exactly.
//
// `cutQuiet` is the one that matters, and it is a finding: NDH's own `resumeOnIncomplete`
// (default TRUE, `resumeOnIncompleteMaxRetry: 5`) silently re-requests a body that arrives
// short, so a DESTROYED socket is absorbed inside the downloader and never reaches our
// retry budget at all — measured here, five server requests for two logged retries. A
// socket that goes QUIET holding the response open produces no short body to resume, so
// it reaches the budget the only way it does in production: through MPI-291's watchdog.
// That is also the shape the 2026-09-10 capture logged (`Download stalled — no data
// received.`), so the new cases below use it and the MPI-460 case above keeps the destroy.
let cutsLeft = 1;
let cutSegment = CUT_AT;
let cutQuiet = false;
const heldSockets = new Set();

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
        const from = range ? Number(range[1]) : 0;
        const headers = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(BODY.length - from),
            'Accept-Ranges': 'bytes',
        };
        if (range) headers['Content-Range'] = `bytes ${from}-${BODY.length - 1}/${BODY.length}`;
        res.writeHead(range ? 206 : 200, headers);
        // MPI-718 — the SAME server, one more knob: how many times it cuts, and how much
        // it serves before each cut. `cutsLeft = 1, cutSegment = CUT_AT` is the MPI-460
        // case above, byte for byte. More than one cut is a link that blips repeatedly
        // with real bytes landing in between — the shape of the 2026-09-10 capture.
        if (cutsLeft <= 0) {
            res.end(BODY.subarray(from));
            return;
        }
        cutsLeft -= 1;
        // Promise the whole remainder, deliver a slice, then kill the socket — the shape of
        // every mid-stream transport failure (and of a forceStall() stop). A zero-length
        // segment is MPI-427's case: a route that connects, promises, and delivers nothing.
        const slice = BODY.subarray(from, Math.min(from + cutSegment, BODY.length));
        if (cutQuiet) {
            heldSockets.add(req.socket);
            req.socket.on('close', () => heldSockets.delete(req.socket));
            if (slice.length > 0) res.write(slice);
            return; // no end(), no destroy — the stream just stops moving
        }
        if (slice.length === 0) {
            req.socket.destroy();
            return;
        }
        res.write(slice, () => req.socket.destroy());
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

// MPI-718 — one run of the cut server, with the budget's two constants compressed. The
// point under test is WHAT the attempts are counted against, never the wall clock, so the
// backoff is squeezed to 50ms (the setter maps the real schedule, so its LENGTH — the
// budget itself — cannot be changed by a test) and the 8 MB floor down to something this
// 200 KB body can cross.
const TEST_FLOOR = 16 * 1024;
const TEST_BACKOFF_MS = 50;
// Six cuts of 32 KB across a 200 KB body: more cuts than the budget has attempts, and the
// tail is still unsent when the fourth one lands. Each segment clears TEST_FLOOR, so every
// attempt made real progress — the whole point.
const SEG = 32 * 1024;

async function runCuts({ cuts, segment }) {
    cutsLeft = cuts;
    cutSegment = segment;
    cutQuiet = true;
    requests.length = 0;
    _setRetryTuningForTests(TEST_FLOOR, TEST_BACKOFF_MS);

    const server = await startServer();
    const port = server.address().port;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi-718-'));
    const localPath = path.join(dir, 'weight.safetensors');
    const depJob = {
        id: 'test-budget-dep',
        modelId: 'test-model',
        url: `http://127.0.0.1:${port}/file.bin`,
        localPath,
        sha256Expected: BODY_SHA,
        status: 'downloading',
        downloadedBytes: 0,
        totalBytes: 0,
    };
    const dl = new FileDownloader(depJob, localPath);

    // The retry WARN is the claim this card is judged on — "would the 17:32 blip have read
    // `retry 1/3`?" — so assert on the line the user's app.log actually gets.
    const warns = [];
    const realWarn = logger.warn.bind(logger);
    logger.warn = (category, message) => { warns.push(String(message)); };

    // MPI-291's watchdog with its 60s window compressed to 400ms — NDH v2.1.11 does not
    // emit 'error' on a socket that dies mid-body, so the sweep is what actually routes a
    // dead stream into the error path (the same reason the case above calls forceStall()
    // by hand). forceStall() no-ops while `_downloader` is null, and `_rearm()` restarts
    // `_lastByteTs`, so a retry backoff is never mistaken for a stall.
    const sweep = setInterval(() => {
        if (Date.now() - dl._lastByteTs >= 250) dl.forceStall().catch(() => {});
    }, 50);

    try {
        await dl.download();
        const deadline = Date.now() + 30_000;
        while (depJob.status === 'downloading' && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 50));
        }
    } finally {
        clearInterval(sweep);
        logger.warn = realWarn;
        for (const socket of heldSockets) socket.destroy();
        heldSockets.clear();
        server.close();
        cutsLeft = 1;
        cutSegment = CUT_AT;
        cutQuiet = false;
        _setRetryTuningForTests(8 * 1024 * 1024, null);
    }
    return {
        dl,
        depJob,
        dir,
        localPath,
        ranges: [...requests],
        retryLines: warns.filter(m => m.includes('resumes from disk')),
    };
}

// MPI-718 — the bug, reproduced: four blips with real bytes between them. MPI-460 spent
// its [2s, 5s, 15s] once per FILE, so the fourth was terminal however much had landed —
// live 2026-09-10, qwen3-8b-clip resumed from 2.56 GB on retry 1 and 3.42 GB on retry 2.
async function testBudgetResetsOnProgress() {
    const { depJob, dir, localPath, ranges, retryLines } = await runCuts({ cuts: 6, segment: SEG });

    assert.equal(depJob.status, 'complete',
        `six blips with progress between them must finish, ended ${depJob.status}: ${depJob.error || ''}`);
    // The line the captured 2026-09-10 log would have carried: every blip reads 1/3,
    // because every one of them was preceded by real bytes landing on disk.
    assert.equal(retryLines.length, 6, `one retry per blip, got ${retryLines.length}`);
    for (const line of retryLines) {
        assert.match(line, /retry 1\/3 in/, `each blip starts the budget over: ${line}`);
    }
    assert.equal(ranges.length, 7, `one request per blip plus the tail, got ${ranges.length}: ${ranges.join(' | ')}`);
    assert.equal(ranges[0], null, 'first attempt is a plain GET');
    assert.deepEqual(ranges.slice(1), [1, 2, 3, 4, 5, 6].map(n => `bytes=${SEG * n}-`),
        'every retry RESUMES from the partial, each one further in than the last');

    const onDisk = await fs.readFile(localPath);
    assert.equal(onDisk.length, BODY.length, 'file is whole');
    assert.equal(crypto.createHash('sha256').update(onDisk).digest('hex'), BODY_SHA,
        'four resumes appended real bytes, not garbage (MPI-258 Bug 2 guard)');

    await fs.remove(dir);
    console.log('  ok  six blips with real progress between them complete, budget reset each time');
}

// MPI-427 — the gate that must NOT move. A route that connects and delivers nothing buys
// no budget at all: the user needs the remedy, not 22s of silence before it.
async function testZeroBytesStillTerminal() {
    const { dl, depJob, dir, ranges } = await runCuts({ cuts: 3, segment: 0 });

    assert.equal(depJob.status, 'failed', `zero bytes must stay terminal, got ${depJob.status}`);
    assert.equal(dl._attempts, 0, 'a route that delivered nothing spends no retry (MPI-427)');
    assert.equal(ranges.length, 1, `no retry request may be made, got ${ranges.length}`);

    await fs.remove(dir);
    console.log('  ok  zero bytes on disk still fails immediately — MPI-427 gate unmoved');
}

// MPI-718 — the other side of the floor, and why no separate attempt ceiling exists. A
// stream that dribbles UNDER the floor and dies never resets, so the budget still means
// three failures and the dep goes terminal at 3/3 exactly as it did before this card.
async function testUnderFloorDribbleStillTerminal() {
    const { dl, depJob, dir, ranges, retryLines } = await runCuts({ cuts: 6, segment: TEST_FLOOR / 4 });

    assert.equal(depJob.status, 'failed',
        `an under-floor dribble must still go terminal, got ${depJob.status}`);
    assert.equal(dl._attempts, 3, `the full budget is spent and no more, got ${dl._attempts}`);
    assert.deepEqual(retryLines.map(l => /retry (\d\/\d)/.exec(l)[1]), ['1/3', '2/3', '3/3'],
        'the budget counts up and is never handed back under the floor');
    assert.equal(ranges.length, 4, `three retries and no fourth, got ${ranges.length}`);

    await fs.remove(dir);
    console.log('  ok  a dribble under the floor never resets and still dies at 3/3');
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
    await testBudgetResetsOnProgress();
    await testZeroBytesStillTerminal();
    await testUnderFloorDribbleStillTerminal();
    console.log('\n7 passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
