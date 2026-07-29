// MPI-376. The canvas undo stack. Everything interesting here is arithmetic and
// bookkeeping — rect clamping, the byte budget, redo invalidation, and the SWAP
// that lets one stored snapshot drive both directions. All of it is silent when
// wrong: a bad clamp restores the wrong box, a bad budget grows without bound,
// and a broken swap makes redo replay the undo.
//
// The canvas is stubbed rather than jsdom'd: UndoStack only ever calls
// createElement('canvas'), width/height, getContext, clearRect and drawImage.

const assert = require('node:assert');
const test = require('node:test');

/** Minimal HTMLCanvasElement stand-in that records the 2D ops performed on it. */
function fakeCanvas(w = 0, h = 0) {
    const c = { width: w, height: h, ops: [] };
    c.getContext = () => ({
        canvas: c,
        clearRect: (x, y, cw, ch) => c.ops.push(['clearRect', x, y, cw, ch]),
        drawImage: (...args) => c.ops.push(['drawImage', ...args.slice(1)]),
    });
    return c;
}

global.document = { createElement: () => fakeCanvas() };

/** Two 100×50 layers, the shape MaskManager.undoLayers() hands over. */
function layers() {
    return [fakeCanvas(100, 50), fakeCanvas(100, 50)]
        .map(canvas => ({ canvas, ctx: canvas.getContext('2d') }));
}

const FULL_BYTES = 100 * 50 * 4 * 2; // both layers, whole canvas

async function makeStack(maxBytes) {
    const { UndoStack } = await import('../js/components/Primitives/MpiCanvas/managers/UndoStack.js');
    return new UndoStack(maxBytes);
}

test('record() of a null rect covers the whole layer and prices it', async () => {
    const s = await makeStack();
    s.record(layers());
    assert.strictEqual(s.depth, 1);
    assert.strictEqual(s.bytes, FULL_BYTES);
    assert.strictEqual(s.lastEntryBytes, FULL_BYTES);
});

test('a rect is clamped to the canvas, and one fully outside stores nothing', async () => {
    const s = await makeStack();
    // Overhangs the right/bottom edge: 80..120 × 40..60 clips to 20×10.
    s.record(layers(), { x: 80, y: 40, w: 40, h: 20 });
    assert.strictEqual(s.bytes, 20 * 10 * 4 * 2);

    const s2 = await makeStack();
    s2.record(layers(), { x: 500, y: 500, w: 10, h: 10 });
    assert.strictEqual(s2.depth, 0, 'an off-canvas rect must not push an empty entry');
});

test('undo CLEARS the rect before drawing the snapshot back', async () => {
    // Load-bearing: the mask layers are white-on-TRANSPARENT, so a plain
    // source-over drawImage cannot remove a pixel and the stroke would survive.
    const s = await makeStack();
    const ls = layers();
    s.record(ls, { x: 10, y: 5, w: 20, h: 10 });
    ls.forEach(l => { l.canvas.ops.length = 0; });

    assert.strictEqual(s.undo(), true);
    for (const l of ls) {
        const kinds = l.canvas.ops.map(o => o[0]);
        const clearAt = kinds.indexOf('clearRect');
        assert.ok(clearAt >= 0, 'no clearRect — an undo would leave the edit behind');
        assert.deepStrictEqual(l.canvas.ops[clearAt], ['clearRect', 10, 5, 20, 10]);
        assert.ok(kinds.indexOf('drawImage', clearAt) > clearAt, 'snapshot must be drawn AFTER the clear');
    }
});

test('undo then redo is available, and a new edit invalidates the redo branch', async () => {
    const s = await makeStack();
    s.record(layers());
    s.undo();
    assert.strictEqual(s.canRedo(), true);
    assert.strictEqual(s.canUndo(), false);

    s.record(layers());
    assert.strictEqual(s.canRedo(), false, 'a fresh edit must drop the redo branch');
    assert.strictEqual(s.redo(), false);
});

test('discarding the redo branch credits its bytes back', async () => {
    // Caught live: `bytes` counted a discarded redo entry forever, so a session of
    // undo-then-edit-again inflated the total and evicted real history early.
    const s = await makeStack();
    s.record(layers());
    s.record(layers());
    assert.strictEqual(s.bytes, FULL_BYTES * 2);

    s.undo();
    assert.strictEqual(s.bytes, FULL_BYTES * 2, 'an undone entry still holds its pixels');

    s.record(layers()); // drops the redo branch
    assert.strictEqual(s.depth, 2);
    assert.strictEqual(s.bytes, FULL_BYTES * 2, 'bytes must match the RETAINED set, not everything ever pushed');
});

test('undo/redo bottom out instead of throwing', async () => {
    const s = await makeStack();
    assert.strictEqual(s.undo(), false);
    assert.strictEqual(s.redo(), false);
});

test('the byte budget evicts the oldest entry but never the last one', async () => {
    const s = await makeStack(FULL_BYTES * 2 + 1);
    s.record(layers());
    s.record(layers());
    s.record(layers());
    assert.strictEqual(s.depth, 2, 'oldest entry should have been evicted');
    assert.strictEqual(s.bytes, FULL_BYTES * 2);

    // A single entry larger than the whole budget still has to be undoable.
    const tiny = await makeStack(1);
    tiny.record(layers());
    assert.strictEqual(tiny.depth, 1);
    assert.strictEqual(tiny.canUndo(), true);
});

test('begin/commit stores only the committed rect; abort stores nothing', async () => {
    const s = await makeStack();
    s.begin(layers());
    s.commit({ x: 0, y: 0, w: 4, h: 4 });
    assert.strictEqual(s.bytes, 4 * 4 * 4 * 2, 'a stroke must cost its dirty rect, not the whole layer');

    const s2 = await makeStack();
    s2.begin(layers());
    s2.abort();
    s2.commit({ x: 0, y: 0, w: 4, h: 4 });
    assert.strictEqual(s2.depth, 0, 'commit after abort must not resurrect the capture');
});

test('clear() drops history and the pending capture', async () => {
    const s = await makeStack();
    s.record(layers());
    s.undo();
    s.begin(layers());
    s.clear();
    assert.strictEqual(s.depth, 0);
    assert.strictEqual(s.bytes, 0);
    assert.strictEqual(s.canRedo(), false);
    s.commit(null);
    assert.strictEqual(s.depth, 0, 'a pending capture must not survive clear()');
});
