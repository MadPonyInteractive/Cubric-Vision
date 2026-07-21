'use strict';
// MPI-242 thread 1 — negative-prompt capability gate.
// Guards the INVERTED default: every other capability is absent ⇒ false, but
// negativePrompt is absent ⇒ TRUE. Get it backwards and every existing model
// silently loses its negative prompt.
const assert = require('assert');

/** Mirrors MpiPromptBox._refreshNegToggle's `show` predicate. */
const showNeg = (includeNegative, model) =>
    includeNegative === true && model?.capabilities?.negativePrompt !== false;

// ── the inverted default ──────────────────────────────────────────────────────
assert.strictEqual(showNeg(true, { capabilities: {} }), true,
    'absent capability must mean SUPPORTED (inverted default)');
assert.strictEqual(showNeg(true, {}), true,
    'absent capabilities bag must mean SUPPORTED');
assert.strictEqual(showNeg(true, null), true,
    'null model must not hide the toggle (boot order: model arrives late)');

// Every shipped model today omits negativePrompt ⇒ none may regress.
const SHIPPED = [
    { capabilities: { multiStage: true, audio: false, branchingContinue: true, motion: true } },
    { capabilities: { multiStage: true, audio: true } },
    { capabilities: { multiStage: false, audio: false } },
    {},
];
for (const m of SHIPPED) assert.strictEqual(showNeg(true, m), true, 'no shipped model may lose its negative');

// ── the opt-out ───────────────────────────────────────────────────────────────
assert.strictEqual(showNeg(true, { capabilities: { negativePrompt: false } }), false,
    'explicit false hides the toggle (Krea2-Turbo)');
assert.strictEqual(showNeg(true, { capabilities: { negativePrompt: true } }), true,
    'explicit true shows it');

// ── surface gate still dominates ──────────────────────────────────────────────
assert.strictEqual(showNeg(false, { capabilities: {} }), false,
    'a surface that opts out of negatives never shows the toggle');
assert.strictEqual(showNeg(undefined, { capabilities: {} }), false,
    'includeNegative must be strictly true (default false)');

// A typo'd key (e.g. `suportsNegative`) must NOT silently hide the toggle —
// it lands as an unknown key, negativePrompt stays absent ⇒ still supported.
assert.strictEqual(showNeg(true, { capabilities: { suportsNegative: false } }), true,
    'a misspelled key must fail OPEN, not silently disable negatives');

// ── stranded-mode reset ───────────────────────────────────────────────────────
// Mirrors the !show branch: when the toggle vanishes mid-edit, snap to positive.
function applyGate(st, includeNegative, model) {
    const show = showNeg(includeNegative, model);
    if (show === st.mounted) return st;
    if (!show) {
        const next = { ...st, mounted: false };
        if (st.isNegativeMode) {
            next.isNegativeMode = false;
            next.textarea = st.positiveValue;
            next.emitted = 'positive';
        }
        return next;
    }
    return { ...st, mounted: true };
}

const editingNegative = {
    mounted: true, isNegativeMode: true,
    positiveValue: 'a cat', negativeValue: 'blurry', textarea: 'blurry', emitted: null,
};
const stranded = applyGate(editingNegative, true, { capabilities: { negativePrompt: false } });
assert.strictEqual(stranded.mounted, false, 'toggle unmounts');
assert.strictEqual(stranded.isNegativeMode, false, 'mode snaps back to positive');
assert.strictEqual(stranded.textarea, 'a cat', 'textarea shows the positive value, not the orphaned negative');
assert.strictEqual(stranded.emitted, 'positive', 'consumers are told the mode changed');
assert.strictEqual(stranded.negativeValue, 'blurry', 'the negative VALUE is retained (still persisted)');

// Not editing the negative ⇒ unmount silently, no mode-change event.
const idle = { mounted: true, isNegativeMode: false, positiveValue: 'a cat', negativeValue: 'blurry', textarea: 'a cat', emitted: null };
const quiet = applyGate(idle, true, { capabilities: { negativePrompt: false } });
assert.strictEqual(quiet.emitted, null, 'no spurious mode-change when already positive');

// Idempotence: re-running the gate with no change must not re-mount/re-emit.
const settled = applyGate(stranded, true, { capabilities: { negativePrompt: false } });
assert.strictEqual(settled, stranded, 'no-op when the gate state already matches');

// Switching BACK to a negative-capable model remounts.
const restored = applyGate(stranded, true, { capabilities: {} });
assert.strictEqual(restored.mounted, true, 'toggle returns for a capable model');
assert.strictEqual(restored.negativeValue, 'blurry', 'the retained negative is still there');

console.log('negative-prompt-gate: all assertions passed');
