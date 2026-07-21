'use strict';
// MPI-255 — guard the LOST-COMPLETION backstop in the remote stall watchdog.
//
// A remote dep whose bytes are 100% in (downloadedBytes >= totalBytes > 0) but whose
// status is still 'downloading' has a MISSED terminal SSE: the wrapper fired
// models:install-complete into a not-yet-attached or dropped stream, so it never
// settled and the model hangs at 100% forever ("tanking at 100%"). This hits any
// fast-settling dep — a requirements_only node pip no-op OR a weight whose final tick
// was lost. The old backstop only reconciled after the full 90s stall window; the fix
// reconciles against volume truth on the normal 15s watchdog poll the moment a dep is
// all-bytes-in-but-unsettled.
//
// The live race needs a Pod; here we lock the structural invariants that, if broken,
// silently reintroduce the hang. No mocks, no framework.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'downloadManager.js'),
    'utf8',
);

// Isolate the stall-watchdog interval body so the checks can't match code elsewhere.
const wd = src.match(/_remoteStallTimer = setInterval\(\(\) => \{([\s\S]*?)\n {4}\}, _REMOTE_STALL_POLL_MS\);/);
assert.ok(wd, 'stall watchdog setInterval body must exist');
const body = wd[1];

// 1. The watchdog must detect the all-bytes-in-but-unsettled signature (100% bytes,
//    status still downloading) — the fingerprint of a lost terminal SSE.
assert.ok(/status === 'downloading'/.test(body) && /downloadedBytes[^\n]*>=[^\n]*totalBytes/.test(body),
    'watchdog must detect a dep with all bytes in but status still downloading');

// 2. On that signature it must reconcile against volume truth (not wait for the 90s stall).
assert.ok(/_reconcileOutstandingRemoteDeps\(\)/.test(body),
    'watchdog must call _reconcileOutstandingRemoteDeps on the lost-completion signature');

// 3. The lost-completion branch must run BEFORE the 90s stall gate — otherwise a
//    finished-but-unsettled dep waits the full stall window (the visible hang).
const reconcileIdx = body.indexOf('_reconcileOutstandingRemoteDeps');
const stallGateIdx = body.search(/Date\.now\(\) - _remoteLastTickAt < _REMOTE_STALL_MS/);
assert.ok(reconcileIdx !== -1 && stallGateIdx !== -1 && reconcileIdx < stallGateIdx,
    'the lost-completion reconcile must run before the 90s stall gate, not after it');

// 4. The reconcile backstop it leans on must only settle deps the wrapper reports
//    installed:true — it must never force-complete an in-flight download (or a weight
//    whose sha256 verify has not passed yet).
assert.ok(/entry\.installed === true/.test(src),
    '_reconcileOutstandingRemoteDeps must gate on entry.installed === true (volume truth)');

// 5. The already-installed custom_node self-heal (requirements_only) must still exist —
//    it is one producer of the fast-settle race the backstop now also covers.
assert.ok(/toInstall\.push\(\{\s*\.\.\.dep,\s*requirementsOnly:\s*true\s*\}\)/.test(src),
    'an already-installed custom_node must still be re-queued with requirementsOnly:true');

console.log('requirements-only-reconcile: all assertions passed');
