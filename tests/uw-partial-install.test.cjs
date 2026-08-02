'use strict';

// MPI-427 — the universal-workflow dep set spans TWO hosts: every custom_node is a
// github.com zip, every engineAsset weight is on the model host. A user whose network
// blocks one of them still downloads the other half perfectly.
//
// The bug this file guards: startUniversalWorkflowInstall used to reject the moment any
// dep failed, and the reject sat ABOVE the custom-node install. So a blocked model host
// threw away a full set of perfectly-downloaded nodes, unextracted — and because the
// drift check reads "no folder" as missing, boot re-ran the same repair and threw them
// away again, every launch, forever. Reported by a user whose ISP intercepts the model
// host: 44/44 model-host downloads dead, 45/45 github.com downloads fine, an engine that
// could never get one node installed, and no way to generate.
//
// These are ORDER and WIRING invariants, so they are checked lockstep against the real
// source rather than re-implemented — a mirrored copy of the logic would keep passing
// while the shipped file regressed. Same approach as remote-engine-assets.test.cjs
// guarding the real Pod Dockerfile.
//
// Run: node tests/uw-partial-install.test.cjs

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
}

const REPO = path.join(__dirname, '..');
const downloadManagerSrc = fs.readFileSync(path.join(REPO, 'routes', 'downloadManager.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(REPO, 'routes', 'engine.js'), 'utf8');

/** The body of one top-level `async function <name>(` up to the next top-level function. */
function functionBody(src, name) {
    const start = src.indexOf(`async function ${name}(`);
    assert.notEqual(start, -1, `${name} not found — did it get renamed?`);
    const rest = src.slice(start + 10);
    const nextFn = rest.search(/\n(?:async )?function /);
    return nextFn === -1 ? rest : rest.slice(0, nextFn);
}

const uwBody = functionBody(downloadManagerSrc, 'startUniversalWorkflowInstall');

test('the nodes that downloaded are installed BEFORE the failure is reported', () => {
    const installAt = uwBody.indexOf('_runCustomNodeInstall(');
    const throwAt = uwBody.indexOf('throw depFailure');
    assert.notEqual(installAt, -1, 'the custom-node install call is gone');
    assert.notEqual(throwAt, -1, 'the deferred throw is gone');
    assert.ok(
        installAt < throwAt,
        'REGRESSION: the throw moved back above the custom-node install — a blocked '
        + 'model host will again discard every node that downloaded fine from github.com'
    );
});

test('the dep wait resolves with the failure instead of rejecting past the install', () => {
    // A reject() anywhere in this function jumps the install block by construction.
    assert.ok(
        !/\breject\(/.test(uwBody),
        'REGRESSION: something rejects inside startUniversalWorkflowInstall again — the '
        + 'wait must RESOLVE with the error so the code below it still runs'
    );
    assert.ok(
        /const depFailure = await new Promise\(\(resolve\) =>/.test(uwBody),
        'the single-arg (resolve-only) wait is the shape the deferred throw depends on'
    );
});

test('the thrown error carries the job so a catching caller can still finish the nodes', () => {
    assert.ok(
        /depFailure\.modelJob = modelJob/.test(uwBody),
        'REGRESSION: the job no longer rides on the error — the two engine-provision '
        + 'callers catch it, and without the job they skip finishCustomNodeInstall entirely'
    );
});

test('BOTH engine-provision callers keep the job on failure', () => {
    // Windows (archive) and Linux/macOS (uv-bootstrap) each pass skipCustomNodeInstall=true
    // and finish the nodes themselves. A one-platform fix here is a false done: the other
    // platform silently keeps the original bug.
    const recoveries = engineSrc.match(/uwModelJob = err\.modelJob \|\| null/g) || [];
    assert.equal(
        recoveries.length, 2,
        `expected BOTH provision paths to recover the job, found ${recoveries.length}. `
        + '_provisionWindowsEngine and _provisionUvEngine must each do it.'
    );
});

test('a repair that fails on weights alone does not report an engine error', () => {
    // /engine/repair-deps runs on the BOOT gate, which releases on engine:complete and
    // NOT on engine:error. Broadcasting an error when every custom node is installed and
    // only weights are outstanding locked the user out of the app entirely, behind a
    // Retry that failed identically every time.
    const catchAt = engineSrc.indexOf('UW deps repair failed');
    assert.notEqual(catchAt, -1, 'the repair-deps catch is gone');
    const tail = engineSrc.slice(catchAt, catchAt + 1800);
    assert.ok(
        /nodesOutstanding/.test(tail),
        'REGRESSION: repair-deps no longer distinguishes an outstanding NODE from an '
        + 'outstanding weight — a weights-only failure must not park the user on the error screen'
    );
    assert.ok(
        /if \(nodesOutstanding\.length\)[\s\S]*engine:error[\s\S]*engine:complete/.test(tail),
        'nodes outstanding → engine:error; nodes all present → engine:complete (releases the gate)'
    );
});

test('the boot gate has an escape from a failed repair', () => {
    const shellSrc = fs.readFileSync(path.join(REPO, 'js', 'shell.js'), 'utf8');
    const modalSrc = fs.readFileSync(
        path.join(REPO, 'js', 'components', 'Compounds', 'MpiEngineInstall', 'MpiEngineInstall.js'), 'utf8');
    assert.ok(
        /Events\.on\('engine:gate-release'/.test(shellSrc),
        'the boot gate must listen for the repair escape or the button does nothing'
    );
    assert.ok(
        /Events\.emit\('engine:gate-release'\)/.test(modalSrc),
        'the modal must emit it'
    );
    // Deliberately NOT engine:install-skipped: that one means "I will use RunPod
    // instead" and the RunPod settings switch follows it back ON (MpiRunpodSettings).
    // Reusing it here would make Settings show a local-engine skip the user never chose.
    assert.ok(
        !/continueAnyway[\s\S]{0,400}engine:install-skipped/.test(modalSrc),
        'the repair escape must not reuse engine:install-skipped'
    );
});

console.log(`\n${passed} passed`);
