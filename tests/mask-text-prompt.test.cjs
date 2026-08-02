// MPI-384. The count is not a UI nicety — it is part of the prompt SAM3 parses.
// Proven live on the bench engine (2026-07-29, t2i_002.png):
//   'horn:2' + individual_masks -> 2 chips
//   'horn'   + individual_masks -> 1 chip      <- the trap
//   'horn:2, eye:2'             -> 4 chips     <- per-category stamping
// So a category that reaches the graph WITHOUT its `:N` silently caps at one
// detection, with no error anywhere. These are the cases that produce that.

const assert = require('node:assert');
const test = require('node:test');

test('every category carries the count, not just the last one', async () => {
    const { stampDetectionCount } = await import('../js/utils/maskTextPrompt.js');
    assert.strictEqual(stampDetectionCount('bikini', 2), 'bikini:2');
    assert.strictEqual(stampDetectionCount('horn, eye', 2), 'horn:2, eye:2');
    assert.strictEqual(stampDetectionCount('  strap ,  purse  ', 3), 'strap:3, purse:3');
});

test('a user-typed :N never survives — the count input is the only source', async () => {
    const { stampDetectionCount } = await import('../js/utils/maskTextPrompt.js');
    // 'horn:3:2' would parse as the category 'horn:3' capped at 2.
    assert.strictEqual(stampDetectionCount('horn:3', 2), 'horn:2');
    assert.strictEqual(stampDetectionCount('horn:3, eye', 1), 'horn, eye');
});

// A count of 1 must reach the graph BARE. sam3_clip.py's tokenizer early-outs on
// "one category, cap 1" and hands super() the raw string, so ':1' is tokenized as
// literal text and the match falls under threshold. Measured 2026-08-02 on
// depth_008.png @ threshold 0.5: 'hair:1' -> 0 masks, 'hair' -> 1, 'hair:2' -> 2.
test('a count of 1 is never stamped — :1 poisons the SAM3 tokenizer', async () => {
    const { stampDetectionCount } = await import('../js/utils/maskTextPrompt.js');
    assert.strictEqual(stampDetectionCount('hair', 1), 'hair');
    assert.strictEqual(stampDetectionCount('hair, shirt', 1), 'hair, shirt');
});

test('empty input yields empty, so the viewer gate can refuse the run', async () => {
    const { stampDetectionCount } = await import('../js/utils/maskTextPrompt.js');
    for (const empty of ['', '   ', ',,', undefined, null]) {
        assert.strictEqual(stampDetectionCount(empty, 2), '', `${JSON.stringify(empty)} should stamp to ''`);
    }
});

test('a nonsense count still produces a legal cap', async () => {
    const { stampDetectionCount } = await import('../js/utils/maskTextPrompt.js');
    assert.strictEqual(stampDetectionCount('horn', 0), 'horn');
    assert.strictEqual(stampDetectionCount('horn', -5), 'horn');
    assert.strictEqual(stampDetectionCount('horn', NaN), 'horn');
    assert.strictEqual(stampDetectionCount('horn', 2.6), 'horn:3');
});
