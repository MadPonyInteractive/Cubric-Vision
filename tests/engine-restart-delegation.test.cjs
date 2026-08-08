'use strict';

// MPI-484: a non-owner app instance cannot restart the shared engine, so it delegates.
//
// ENGINE_ROOT is repo-scoped and COMFYUI_PORT is fixed, so every instance shares one
// engine — but stopComfyUI() only kills a handle it owns, so a non-owner's stop is a
// no-op. Before delegation it "restarted" into silence and the custom node it had just
// installed never registered. It now leaves a request file; the owner performs it.
//
// These assertions pin the PROTOCOL in routes/comfy.js rather than re-implementing it,
// because the two regressions that matter here are both orderings, and a mirrored copy
// of the logic would pass while the real file drifted.

const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'comfy.js'), 'utf8');

test('a non-owner delegates the restart instead of reporting a silent success', () => {
    assert.match(src, /const queued = requestEngineRestart\(/,
        'the isUserRestart branch of an ATTACHED start must write a restart request');
    assert.match(src, /message: 'Restart requested', delegated: true/,
        'the caller must be able to tell a delegated restart from a plain attach');
});

test('the owner deletes the request BEFORE restarting, or it restarts forever', () => {
    // The whole loop-prevention story is this ordering: remove the file first, then act.
    // Restart-then-remove leaves the request in place across the stop, and the freshly
    // spawned engine's own watcher reads it again on its next tick — for ever.
    // Scoped to the watcher body — `stopComfyUI()` also appears in the /comfy/stop
    // route, and anchoring across a line break would only test this file's line endings.
    const watcher = src.slice(src.indexOf('function _watchForRestartRequests'));
    const body = watcher.slice(0, watcher.indexOf('router.post'));
    const removeAt = body.indexOf('fs.removeSync(RESTART_REQUEST_FILE)');
    const stopAt = body.indexOf('stopComfyUI()');
    assert.ok(removeAt > 0, 'the owner must delete the request file');
    assert.ok(stopAt > 0, 'the owner must stop the engine as part of honouring a request');
    assert.ok(removeAt < stopAt, 'the request must be deleted BEFORE the restart begins');
});

test('a request older than the running engine is ignored', () => {
    // Without this, the request that CAUSED this engine to start is still on disk when
    // it comes up, so it immediately restarts itself — the same infinite loop by a
    // different door. Dated against our own spawn, not wall-clock age.
    assert.match(src, /const stale = !request \|\| !\(request\.at > spawnedAt\)/,
        'the owner must ignore a request that predates its own process');
});

test('the watcher is armed on spawn and cleared when the engine exits', () => {
    assert.match(src, /_watchForRestartRequests\(Date\.now\(\)\)/,
        'the owner arms the watcher when it spawns the engine');
    const exitBlock = src.slice(src.indexOf("processState.activeComfyProcess.on('exit'"));
    assert.match(exitBlock.slice(0, 1200), /clearInterval\(_restartWatch\)/,
        'an instance that no longer owns an engine must stop watching for restart requests');
});
