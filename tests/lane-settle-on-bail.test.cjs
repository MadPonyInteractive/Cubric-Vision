/**
 * tests/lane-settle-on-bail.test.cjs — MPI-463
 *
 * `generationStore.register()` in commandExecutor's dispatch body TAKES A LANE SLOT.
 * `generationService._laneBusy(lane)` derives busy-ness from the store's `running` list,
 * and `_dispatchNextCue` skips any lane that reads busy — so a registered job that never
 * reaches a terminal phase wedges that lane for the REST OF THE APP'S LIFE.
 *
 * That is not hypothetical. Eleven pre-dispatch failure exits between the register() call
 * and the /prompt POST called `exec.onError` and returned WITHOUT settling the store job:
 * op-not-installed, arch-weight-missing, workflow-resolve, trimmed-video prep, missing
 * LoRA/upscale model, empty required media slot, model-not-local, workflow fetch, injector
 * throw, input-defaults prep, and preview-latent staging. Any one of them left the next
 * generation stuck on QUEUED forever while the ENGINE queue was empty and the server log
 * said nothing — a wedge that reads as a hung engine and is cured only by restarting.
 *
 * The fix is structural: `_failBail` settles the job to PHASES.ERROR and then reports, and
 * every pre-dispatch bail routes through it. This test pins that shape, because the hole
 * reopens the moment someone adds a TWELFTH bail with a bare `exec.onError` — which is
 * exactly how the first eleven accumulated.
 *
 * The post-dispatch catch is NOT covered here: it settles once at its own top, so its
 * branches are legitimately allowed to call exec.onError directly.
 */
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const EXECUTOR = path.join(__dirname, '..', 'js', 'services', 'commandExecutor.js');
const src = fs.readFileSync(EXECUTOR, 'utf8');
const lines = src.split(/\r?\n/);

/** The line index of the first line matching `needle`, or -1. */
const findLine = (needle, from = 0) => lines.findIndex((l, i) => i >= from && l.includes(needle));

/**
 * The pre-dispatch region: from the store registration that takes the lane, to the
 * runWorkflow call that hands the graph to the engine. Every failure exit inside it
 * must settle the job before returning.
 */
function preDispatchRegion() {
    const start = findLine('generationStore.register({');
    assert.ok(start > 0, 'generationStore.register({ not found — did the dispatch body move?');
    const end = findLine('.runWorkflow(', start);
    assert.ok(end > start, 'runWorkflow( not found after register — did the dispatch boundary move?');
    return { start, end };
}

test('the pre-dispatch region still exists and is the region we think it is', () => {
    const { start, end } = preDispatchRegion();
    assert.ok(end - start > 100, `pre-dispatch region is only ${end - start} lines — the anchors probably drifted`);
    assert.ok(
        src.includes('const _failBail = (err) => {'),
        '_failBail is gone — every pre-dispatch bail would now strand its lane',
    );
});

test('_failBail settles the store job to a terminal before reporting', () => {
    const at = findLine('const _failBail = (err) => {');
    const body = lines.slice(at, at + 5).join('\n');
    assert.match(
        body,
        /generationStore\.settle\(jobId, PHASES\.ERROR/,
        '_failBail must settle to PHASES.ERROR — that terminal is what releases the lane',
    );
    assert.match(body, /exec\.onError\?\.\(err\)/, '_failBail must still report the error to the caller');
});

test('no pre-dispatch failure exit calls exec.onError without settling', () => {
    const { start, end } = preDispatchRegion();

    // The only legitimate exec.onError calls in this region are the two bail HELPERS:
    // _abortedBail (settles to CANCELLED) and _failBail (settles to ERROR). Anything
    // else is a bail that strands the lane.
    const offenders = [];
    for (let i = start; i <= end; i++) {
        if (!lines[i].includes('exec.onError?.(')) continue;
        const context = lines.slice(Math.max(start, i - 4), i + 1).join('\n');
        const settles = /generationStore\.(settle|advance)\(jobId, PHASES\.(ERROR|CANCELLED)/.test(context);
        if (!settles) offenders.push(`${i + 1}: ${lines[i].trim()}`);
    }

    assert.deepStrictEqual(
        offenders,
        [],
        'these pre-dispatch bails report an error without settling the store job — each one '
        + 'permanently wedges its lane. Call _failBail(err) instead:\n' + offenders.join('\n'),
    );
});

test('every pre-dispatch bail routes through _failBail', () => {
    const { start, end } = preDispatchRegion();
    const region = lines.slice(start, end + 1).join('\n');
    // `const _failBail = (err) =>` does not match `_failBail(`, so every hit is a CALL.
    const routed = (region.match(/_failBail\(/g) || []).length;
    assert.ok(
        routed >= 11,
        `only ${routed} pre-dispatch bails route through _failBail — 11 were found when this was fixed. `
        + 'If one was legitimately removed, lower this floor deliberately.',
    );
});
