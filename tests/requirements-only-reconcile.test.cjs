'use strict';
// MPI-253b — guard the fast-`requirements_only` SSE-race settle in downloadManager.
//
// Krea2 is the first model to declare a custom_node as a model dep. When that node
// is already on the volume, _startRemoteDownload re-queues it with
// `requirementsOnly: true` to re-run pip idempotently. The wrapper returns 202
// `started` (NOT `already_installed`, so the .then() can't settle it) and emits
// `models:install-complete` within ~1-2s — often before the SSE has attached, so
// the completion is lost and the model hangs at 100%. The fix arms a one-shot
// `_reconcileOutstandingRemoteDeps` (volume-truth backstop) 3s after dispatch.
//
// The live race needs a Pod; here we lock the structural invariants that, if
// broken, silently reintroduce the hang. No mocks, no framework.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'downloadManager.js'),
    'utf8',
);

// 1. An already-installed custom_node in an install request must still be sent with
//    requirementsOnly (the self-heal that triggers the race path). If this branch is
//    removed, the race can't happen — but neither can the self-heal, so assert it.
assert.ok(/toInstall\.push\(\{\s*\.\.\.dep,\s*requirementsOnly:\s*true\s*\}\)/.test(src),
    'an already-installed custom_node must be re-queued with requirementsOnly:true');

// 2. The dispatch loop must detect a fast requirementsOnly dep...
assert.ok(/hasFastRequirementsOnly\s*=\s*toInstall\.some\(\s*d\s*=>\s*d\.requirementsOnly\s*\)/.test(src),
    'must compute hasFastRequirementsOnly from toInstall');

// 3. ...and arm a delayed _reconcileOutstandingRemoteDeps to settle a missed
//    fast-complete SSE. Without this, the Krea2 re-install hang returns.
const armBlock = src.match(/if\s*\(\s*hasFastRequirementsOnly\s*\)\s*\{[\s\S]*?_reconcileOutstandingRemoteDeps\(\)[\s\S]*?\}/);
assert.ok(armBlock, 'hasFastRequirementsOnly must arm a _reconcileOutstandingRemoteDeps call');

// 4. It must be a DELAYED reconcile (setTimeout), not inline — the whole point is to
//    run AFTER the SSE has had its chance, so an inline call would race the same way.
assert.ok(/setTimeout\([\s\S]*?_reconcileOutstandingRemoteDeps/.test(src),
    'the reconcile must be scheduled via setTimeout (delayed), not called inline');

// 5. The reconcile backstop it leans on must still only settle deps the wrapper
//    reports installed:true — it must never force-complete an in-flight download.
assert.ok(/entry\.installed === true/.test(src),
    '_reconcileOutstandingRemoteDeps must gate on entry.installed === true (volume truth)');

console.log('requirements-only-reconcile: all assertions passed');
