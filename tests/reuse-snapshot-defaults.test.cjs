/**
 * tests/reuse-snapshot-defaults.test.cjs — MPI-479
 *
 * Reuse Prompt could not recall a control the user never touched. `getOpSettings` and its
 * siblings only ever hold EDITED keys, so a run at the default recorded nothing; the empty
 * bucket was then dropped by `if (Object.keys(_op).length)`, and on the way back
 * `applyPromptReuseSettings` treats an absent bucket as a NO-OP, not a reset. So the live
 * control kept whatever it currently was. Proven on seven of the user's own ref2v_ms
 * sidecars: the five that ran the default `refImageSize` all recorded `op: null`.
 *
 * The fix backfills a RESOLVED default for every control the run actually offered, merged
 * UNDER the stored values. This file pins the four things whose quiet reversal would
 * reopen the hole. It is source-level on purpose: `PromptBoxControls.js` pulls in component
 * modules that use absolute browser paths (`/js/utils/icons.js`), so it cannot be imported
 * under bare Node — the behavioural half was proven in the live renderer instead
 * (138 model × op × historyMode cases, zero divergence from the pre-refactor gate).
 */
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const SERVICE  = read('js', 'services', 'generationService.js');
const CONTROLS = read('js', 'components', 'Organisms', 'MpiPromptBox', 'PromptBoxControls.js');
const PROMPTBOX = read('js', 'components', 'Organisms', 'MpiPromptBox', 'MpiPromptBox.js');

test('the snapshot merges resolved defaults UNDER the stored values, in all three buckets', () => {
    // Order is the whole contract. Reversed, a default would OVERWRITE what the user
    // actually set — a far worse bug than the one being fixed.
    for (const [bucket, pattern] of [
        ['shared', /const _shared = \{ \.\.\._defaults\.shared, \.\.\._clonePlain\(getSharedSettings\(/],
        ['op',     /const _op = \{ \.\.\._defaults\.op, \.\.\._clonePlain\(getOpSettings\(/],
        ['model',  /const _model = \{ \.\.\._defaults\.model, \.\.\._clonePlain\(_ms\) \}/],
    ]) {
        assert.match(
            SERVICE, pattern,
            `the ${bucket} bucket must spread _defaults FIRST and the stored values second — `
            + 'the other order lets a default clobber a value the user deliberately chose',
        );
    }
});

test('ratio and batch are reconciled from injectionParams without requiring the key to pre-exist', () => {
    // Both opt out of the default backfill, so this reconcile is their ONLY route into the
    // record. Guarding it on the key already being there was the same bug one layer up.
    assert.ok(
        !/if \(_shared\.ratioSelector && width && height\)/.test(SERVICE),
        'the ratio reconcile still requires a stored ratioSelector — a user who never opened '
        + 'the ratio picker records no ratio at all, which is exactly the MPI-479 hole',
    );
    assert.ok(
        !/if \('batch' in _shared &&/.test(SERVICE),
        "the batch reconcile still requires 'batch' to already be in the shared bucket",
    );
    assert.match(SERVICE, /if \(Number\.isFinite\(_batchInj\)\) _shared\.batch = _batchInj;/,
        'batch must be taken from the run\'s own injectionParams unconditionally');
});

test('exactly the three shape-mismatched controls opt out of the default backfill', () => {
    // `snapshotDefault: false` means "my STORED shape is not my defaultValue". Today that is
    // ratio (a compound), batch (a dropdown string vs a stored number) and qualityTier
    // (a per-MODEL default _resolveDefault cannot express). A FOURTH opt-out is how this
    // bug comes back one control at a time, so adding one has to be deliberate.
    const optOuts = [];
    const lines = CONTROLS.split(/\r?\n/);
    lines.forEach((l, i) => {
        if (!/^\s*snapshotDefault: false,/.test(l)) return;
        // Walk back to the control id that owns this def block: `    someId: {`
        for (let j = i; j >= 0; j--) {
            const m = /^ {4}([A-Za-z][A-Za-z0-9]*): \{$/.exec(lines[j]);
            if (m) { optOuts.push(m[1]); return; }
        }
        optOuts.push(`<unowned line ${i + 1}>`);
    });
    assert.deepStrictEqual(
        optOuts.sort(), ['batch', 'qualityTier', 'ratio'],
        'the set of controls skipping the reuse-snapshot backfill changed. Each opt-out is a '
        + 'control Reuse Prompt can no longer recall from a default — justify it, then update this list',
    );
});

test('the PromptBox mounts through the shared gate and keeps no inline copy of it', () => {
    assert.match(
        PROMPTBOX,
        /const componentIds = visibleControlIds\(model, activeOperation, \{ historyMode: _context\.historyMode \}\)/,
        'the mount loop must source its ids from visibleControlIds — that shared gate is what stops '
        + 'the snapshot recording a control the model never showed',
    );
    // A re-added inline gate is the drift this extraction exists to prevent: the snapshot would
    // then backfill a HIDDEN control, and for a `shared` (cross-model) control that means reusing
    // an LTX run resets the motionIntensity the user set on Wan.
    assert.ok(
        !/if \(componentId === '\w+'[\s\S]{0,120}?\) continue;/.test(PROMPTBOX),
        'an inline `if (componentId === ...) continue;` gate is back in MpiPromptBox — move it into '
        + 'visibleControlIds so the reuse snapshot sees the same answer',
    );
    assert.match(CONTROLS, /export function visibleControlIds\(model, operation, ctx = \{\}\)/);
    assert.match(CONTROLS, /export function resolveControlDefaults\(model, operation, ctx = \{\}\)/);
});
