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

const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const { FileDownloader } = require('../routes/downloadManager.js');

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
    console.log('\n1 passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
