'use strict';

// MPI-434 — the LOCAL ComfyUI port is one value carried as four separate literals,
// because the sites live in three module systems that cannot share an import: the
// CJS backend (routes/shared.js), the ESM renderer (comfyController, memoryOps) and
// the CJS main process (main.js). That is the half-wire shape this repo keeps getting
// burned by, and the failure is silent in the worst way — a stale `:8188` in main.js
// leaves the Origin spoof unmatched and ComfyUI 403s every call with "request with
// non matching host and origin", while a stale serverAddress sends the renderer at a
// port nothing is listening on.
//
// So this reads the REAL shipped sources. A mirrored copy of the constants would pass
// here while the actual files regressed, which is exactly the bug it exists to catch.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The one true port, taken from the backend source of truth. */
function sourceOfTruthPort() {
    const m = read('routes/shared.js').match(/^const COMFYUI_PORT = (\d+);/m);
    assert.ok(m, 'routes/shared.js must declare `const COMFYUI_PORT = <number>;`');
    return Number(m[1]);
}

test('the local ComfyUI port is not ComfyUI\'s 8188 default', () => {
    // The whole point of MPI-434: a user running stock ComfyUI owns 8188, and we
    // must not land on top of them.
    assert.notStrictEqual(sourceOfTruthPort(), 8188,
        'COMFYUI_PORT is back on ComfyUI\'s default — a user\'s own ComfyUI will be adopted instead of ours (MPI-434)');
});

test('the port is outside the Windows ephemeral range', () => {
    // Windows hands out 49152-65535 for outbound sockets; binding in there races
    // with whatever the OS already handed to another process.
    const port = sourceOfTruthPort();
    assert.ok(port > 1024 && port < 49152, `COMFYUI_PORT ${port} must be in 1025-49151`);
});

test('every local consumer carries the same port as routes/shared.js', () => {
    const port = sourceOfTruthPort();

    /** @type {Array<{file: string, what: string, re: RegExp}>} */
    const sites = [
        {
            file: 'js/services/comfyController.js',
            what: 'serverAddress (renderer HTTP base + ws:// URL)',
            re: /serverAddress:\s*"127\.0\.0\.1:(\d+)"/,
        },
        {
            file: 'js/shell/memoryOps.js',
            what: 'direct /extra/unload_models fallback',
            re: /fetch\('http:\/\/127\.0\.0\.1:(\d+)\/extra\/unload_models'/,
        },
        {
            file: 'main.js',
            what: 'Electron Origin spoof target (a mismatch 403s every ComfyUI call)',
            re: /details\.requestHeaders\['Origin'\] = 'http:\/\/127\.0\.0\.1:(\d+)'/,
        },
    ];

    for (const site of sites) {
        const m = read(site.file).match(site.re);
        assert.ok(m, `${site.file}: could not find ${site.what} — did the line move? (MPI-434)`);
        assert.strictEqual(Number(m[1]), port,
            `${site.file} (${site.what}) uses port ${m[1]} but routes/shared.js says ${port}`);
    }

    // main.js matches the URL on the port twice — the request hook and the response
    // hook. One updated and one left behind breaks CORS while auth still works, which
    // is a genuinely confusing half-state.
    const mainMatches = read('main.js').match(/details\.url\.includes\(':(\d+)'\)/g) || [];
    assert.strictEqual(mainMatches.length, 2, 'main.js should guard both webRequest hooks on the port');
    for (const raw of mainMatches) {
        const n = Number(raw.match(/(\d+)/)[1]);
        assert.strictEqual(n, port, `main.js url guard uses ${n} but routes/shared.js says ${port}`);
    }
});

test('the REMOTE Pod port stays on 8188', () => {
    // The Pod runs its own ComfyUI on 8188 inside its container, on a different
    // machine — there is no collision to dodge, and the RunPod proxy hostname
    // (<podId>-8188.proxy.runpod.net) is derived from it. Dragging these along with
    // the local move would break remote generation for everyone.
    assert.match(read('routes/remotePodLifecycle.js'), /spec\.ports\.push\('8188\/http'\)/,
        'the Pod must still expose 8188 (MPI-434 moved the LOCAL engine only)');
    assert.match(
        read('js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.js'),
        /\$\{podId\}-8188\.proxy\.runpod\.net/,
        'the RunPod proxy link must still target 8188 (MPI-434 moved the LOCAL engine only)');
});

test('/comfy/start attaches to an engine it did not open, and probes BEFORE spawning', () => {
    // 48188 is shared across app instances (MPI-484), so an answering port means the
    // engine is UP — attach. This replaces MPI-434's 409, which was written when the
    // engine sat on ComfyUI's default 8188 and an occupant really was foreign.
    //
    // The probe must still sit BEFORE the spawn, and for a sharper reason than before:
    // reach spawn() with the port occupied and a second ComfyUI fails to bind and dies,
    // leaving the instance with a DEAD engine — worse than the dialog this replaced.
    const src = read('routes/comfy.js');
    const probeAt = src.indexOf("logger.info('comfy', `Engine already serving on");
    const spawnAt = src.indexOf('processState.activeComfyProcess = spawn(');
    assert.ok(probeAt > 0, 'routes/comfy.js must ATTACH to an already-serving ComfyUI port (MPI-484)');
    assert.ok(spawnAt > 0, 'routes/comfy.js must still spawn ComfyUI');
    assert.ok(probeAt < spawnAt, 'the occupancy probe must run BEFORE the spawn, not after');
    assert.doesNotMatch(src, /res\.status\(409\)\.json\(\{ error: msg \}\)/,
        'the MPI-434 refusal must be gone — our own shared engine is not a stranger');
});

test('/comfy/status asks the port before reporting the engine down', () => {
    // The twin of the above. `activeComfyProcess` answers "did I spawn it", not "is an
    // engine up", so an instance attached to a shared engine must not report it dead —
    // the badge would contradict a /comfy/start that just returned success.
    const src = read('routes/comfy.js');
    const statusAt = src.indexOf("router.get('/comfy/status'");
    const streamAt = src.indexOf("router.get('/comfy/events/stream'");
    assert.ok(statusAt > 0 && streamAt > statusAt, 'could not isolate the /comfy/status handler');
    const handler = src.slice(statusAt, streamAt);
    assert.match(handler, /const alive = ax && await ax\.get\(`http:\/\/127\.0\.0\.1:\$\{COMFYUI_PORT\}\/history`/,
        '/comfy/status must probe the shared port when it holds no child of its own (MPI-484)');
    assert.match(handler, /if \(!alive\) return res\.json\(\{ running: false/,
        'only a port that does NOT answer may be reported as running:false');
});
