'use strict';

// Regression test for the custom-node-install → ComfyUI-restart race.
//
// Bug: a model-specific custom node installed while ComfyUI was BOOTING (e.g.
// "start ComfyUI on launch" + Install pressed mid-boot) failed to load — the
// boot node-scan ran before the node's pip deps finished AND the restart-needed
// signal lived ONLY in frontend `state` (lost on app/browser reload). Fix: a
// server-authoritative `processState.comfyNeedsRestart` flag, echoed on
// /comfy/status, honored by the gen gate via EITHER source.
//
// This test pins the gate's decision logic (mirrors js/services/comfyController.js)
// and the server-flag lifecycle (mirrors routes/comfy.js start/status).

const assert = require('assert');

// ── The gen-gate decision (mirrors comfyController.js ensureReady) ─────────────
// Returns 'restart' (stop+start a running ComfyUI), 'start' (spawn fresh),
// or 'ready' (already up, nothing to do).
function gateDecision({ frontendFlag, serverFlag, running, ready }) {
    const needsRestart = frontendFlag || serverFlag === true;
    if (needsRestart && running) return 'restart';      // running/booting + pending → restart
    if (running && ready) return 'ready';               // up and clean
    if (!running) return 'start';                        // spawn fresh (scans nodes anew)
    return 'wait';                                        // running but not ready, no restart
}

// ── Server flag lifecycle (mirrors routes/comfy.js) ───────────────────────────
function installCustomNode(ps, { remoteActive }) {
    if (!remoteActive) ps.comfyNeedsRestart = true;      // local install sets server flag
}
function comfyStart(ps, { alreadyRunning, isUserRestart }) {
    if (isUserRestart) ps.comfyNeedsRestart = false;
    if (alreadyRunning) return;                          // do NOT clear — restart still pending
    ps.comfyNeedsRestart = false;                        // fresh spawn rescans → satisfied
}

function run() {
    // 1. THE RACE: node installed while ComfyUI booting → gate must restart it,
    //    even when the frontend flag was lost (app/browser reload).
    assert.strictEqual(
        gateDecision({ frontendFlag: false, serverFlag: true, running: true, ready: true }),
        'restart',
        'server flag alone must trigger a restart when ComfyUI is running'
    );

    // 2. Booting (running, not ready) + pending → restart, not wait.
    assert.strictEqual(
        gateDecision({ frontendFlag: false, serverFlag: true, running: true, ready: false }),
        'restart',
        'a booting ComfyUI with a pending restart must restart, not be left to finish a poisoned scan'
    );

    // 3. Frontend flag still works (live SSE, no reload).
    assert.strictEqual(
        gateDecision({ frontendFlag: true, serverFlag: false, running: true, ready: true }),
        'restart',
        'frontend flag alone still triggers a restart (live install path)'
    );

    // 4. No pending restart, up and ready → no-op.
    assert.strictEqual(
        gateDecision({ frontendFlag: false, serverFlag: false, running: true, ready: true }),
        'ready',
        'clean running ComfyUI is not needlessly restarted'
    );

    // 5. Stopped + pending → fresh start (its scan picks up the node).
    assert.strictEqual(
        gateDecision({ frontendFlag: false, serverFlag: true, running: false, ready: false }),
        'start',
        'a stopped ComfyUI self-heals on fresh start; no explicit restart needed'
    );

    // 6. Local install sets the server flag; remote install does NOT poison it.
    const psLocal = { comfyNeedsRestart: false };
    installCustomNode(psLocal, { remoteActive: false });
    assert.strictEqual(psLocal.comfyNeedsRestart, true, 'local install sets server flag');

    const psRemote = { comfyNeedsRestart: false };
    installCustomNode(psRemote, { remoteActive: true });
    assert.strictEqual(psRemote.comfyNeedsRestart, false, 'remote install must not set the local server flag');

    // 7. Fresh spawn clears the flag (no restart-loop); "already running" start does NOT.
    const psSpawn = { comfyNeedsRestart: true };
    comfyStart(psSpawn, { alreadyRunning: false, isUserRestart: false });
    assert.strictEqual(psSpawn.comfyNeedsRestart, false, 'fresh spawn clears the flag (scan satisfies it)');

    const psRunning = { comfyNeedsRestart: true };
    comfyStart(psRunning, { alreadyRunning: true, isUserRestart: false });
    assert.strictEqual(psRunning.comfyNeedsRestart, true, 'an "already running" start must NOT clear a pending restart');

    console.log('comfy-needs-restart: all 9 assertions passed');
}

run();
