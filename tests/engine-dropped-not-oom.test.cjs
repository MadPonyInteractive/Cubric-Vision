'use strict';

// MPI-563 — a remote WS drop was reported to the user as an out-of-memory error.
//
// comfyController._onWsDropped() raises an error tagged `code: 'engine_dropped'`
// whose MESSAGE reads "the Pod may have run out of memory and restarted". The
// out-of-memory branch in commandExecutor classifies on `err.message` (ComfyUI's
// own OOM arrives with no code), so it matched that text and returned first —
// and there was no `engine_dropped` branch at all. Every remote drop, whatever
// its cause, showed "the inputs are likely too large. Try smaller or shorter
// media", dropping the one instruction that actually helps: reconnect.
//
// The defect is ORDER, so that is what this pins — against the real sources, not
// a replica. commandExecutor.js does not import into bare Node (browser-absolute
// paths in its graph), hence the read-and-assert rather than a behavioural test.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const EXEC = read('js/services/commandExecutor.js');
const CONTROLLER = read('js/services/comfyController.js');

// The exact regex literal from the OOM branch.
const OOM_TEST = /\/\\b\(memoryerror\|out of memory\|/;

test('the dropped-engine error still carries the words the OOM branch matches', () => {
    // If this ever stops being true the ordering guard below is moot — but so is
    // the bug, so it should be retired deliberately, not silently.
    const dropped = CONTROLLER.slice(CONTROLLER.indexOf('_onWsDropped()'));
    const msgEnd = dropped.indexOf("err.code = 'engine_dropped'");
    assert.ok(msgEnd > 0, "_onWsDropped no longer sets code 'engine_dropped'");
    assert.match(dropped.slice(0, msgEnd), /out of memory/i);
});

test('commandExecutor has an engine_dropped branch', () => {
    assert.ok(
        EXEC.includes("err?.code === 'engine_dropped'"),
        'engine_dropped is unhandled — the OOM regex will claim it again',
    );
});

test('engine_dropped is classified BEFORE the message-based OOM branch', () => {
    const dropIdx = EXEC.indexOf("err?.code === 'engine_dropped'");
    const oomIdx = EXEC.search(OOM_TEST);
    assert.ok(oomIdx > 0, 'OOM branch regex not found — update this test');
    // Guard the -1: a MISSING branch would otherwise satisfy `dropIdx < oomIdx`
    // and this test would pass on the exact bug it exists to catch. (Caught by
    // mutation-testing this file, not by writing it.)
    assert.ok(dropIdx > 0, 'engine_dropped branch is absent, not merely misordered');
    assert.ok(
        dropIdx < oomIdx,
        `engine_dropped (${dropIdx}) must be tested before the OOM regex (${oomIdx})`,
    );
});

test('the OOM branch stays message-based, so genuine ComfyUI OOM still lands', () => {
    // ComfyUI OOM has no err.code; narrowing this branch to a code would silently
    // send real OOMs to the bug-reporter dialog.
    const oomIdx = EXEC.search(OOM_TEST);
    const branch = EXEC.slice(oomIdx, oomIdx + 400);
    assert.match(branch, /err\?\.message/);
});
