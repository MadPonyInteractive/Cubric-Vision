/**
 * gallery-entry-text-op.test.cjs — MPI-388.
 *
 * Entering the Gallery with an empty PromptBox used to leave whatever op the
 * MPI-247 per-model memory remembered — often a media-hungry one picked in
 * History — selected over a box with nothing in it, so Run could only toast a
 * missing input. The Gallery block now asks the box to drop to the model's
 * text-only op on entry, reusing MPI-356's path rather than forking it.
 *
 * Both halves of that decision are pure and live in commandRegistry, so they
 * are pinned here: `isTextOnlyOp` decides whether the remembered op can still
 * run on an empty box, and `pickTextOnlyOp` decides what to land on.
 *
 * Honest scope: this is NOT a negative control against unfixed HEAD — the two
 * functions are new, so they pass trivially. What it locks is the contract the
 * Gallery entry path depends on. The behavioural control is the app trip in
 * .agents/mpi-kanban/tasks/MPI-388/validation.md.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const KREA2 = { mediaType: 'image', supportedOps: ['t2i', 'i2i', 'control', 'krea2Edit', 'upscale', 'detail'] };
const WAN = { mediaType: 'video', supportedOps: ['i2v_ms', 't2v_ms'] };
// Gallery has no canvas, so it never claims a mask tool. Empty box on entry.
const GALLERY_ENTRY = { imageCount: 0, videoCount: 0, canMask: false };

test('isTextOnlyOp separates the ops that survive an empty box from the ones that cannot', async () => {
    const { isTextOnlyOp, commands } = await import('../js/data/commandRegistry.js');

    assert.strictEqual(isTextOnlyOp('t2i'), true);
    assert.strictEqual(isTextOnlyOp('t2v_ms'), true);
    assert.strictEqual(isTextOnlyOp('i2i'), false);
    assert.strictEqual(isTextOnlyOp('krea2Edit'), false);
    assert.strictEqual(isTextOnlyOp('upscale'), false);
    // An op key that no longer exists must not read as runnable — the caller
    // uses a false here to mean "drop", which is the safe direction.
    assert.strictEqual(isTextOnlyOp('nope'), false);

    // Contract, not a spot check: every op declaring a media requirement is
    // media-hungry by this predicate. Adding an op with requiresImages > 0 that
    // slipped through would silently survive an empty box.
    const wrong = Object.keys(commands).filter(k =>
        isTextOnlyOp(k) && (((commands[k].requiresImages ?? 0) > 0) || ((commands[k].requiresVideo ?? 0) > 0)));
    assert.deepStrictEqual(wrong, []);
});

test('pickTextOnlyOp lands an empty Gallery box on the model text op', async () => {
    const { pickTextOnlyOp } = await import('../js/data/commandRegistry.js');

    assert.strictEqual(pickTextOnlyOp('image', KREA2, GALLERY_ENTRY), 't2i');
    assert.strictEqual(pickTextOnlyOp('video', WAN, GALLERY_ENTRY), 't2v_ms');
});

test('pickTextOnlyOp never returns a mask op, and returns null when the model has no text op', async () => {
    const { pickTextOnlyOp, commands } = await import('../js/data/commandRegistry.js');

    // inpaint takes no image slot of its own but needs a mask, so it reads as
    // "text-only" on requires* alone. Landing on it in the Gallery would swap
    // one un-runnable op for another.
    assert.strictEqual(commands.inpaint.requiresMask, true);
    const MASKY = { mediaType: 'image', supportedOps: ['inpaint', 'i2i'] };
    assert.strictEqual(pickTextOnlyOp('image', MASKY, { imageCount: 0, videoCount: 0, canMask: true }), null);

    const NO_TEXT_OP = { mediaType: 'image', supportedOps: ['i2i', 'upscale'] };
    assert.strictEqual(pickTextOnlyOp('image', NO_TEXT_OP, GALLERY_ENTRY), null);
});

test('pickTextOnlyOp prefers an available op over a merely present one', async () => {
    const { pickTextOnlyOp, getAvailableCommands } = await import('../js/data/commandRegistry.js');

    // With chips staged, t2i is present but NOT available (its max image slots
    // is 0). The picker still returns it: the caller only ever asks on an empty
    // box, and returning null there would leave the dead op selected.
    const staged = getAvailableCommands('image', KREA2, { imageCount: 2, canMask: false });
    assert.strictEqual(staged.find(c => c.key === 't2i').available, false);
    assert.strictEqual(pickTextOnlyOp('image', KREA2, { imageCount: 2, canMask: false }), 't2i');

    // On the path that actually runs it — empty box — the op it lands on is
    // available, so the strip renders it enabled and Run works.
    const entry = getAvailableCommands('image', KREA2, GALLERY_ENTRY);
    assert.strictEqual(entry.find(c => c.key === 't2i').available, true);
});
