/**
 * media-slot-ordinal-roles.test.cjs — MPI-330 regression.
 *
 * Ordinal slots (qwenEdit/krea2Edit "image 1/2/3") are positional aliases:
 * strip order is the meaning. Saved/restored chips carry the DERIVED role
 * (inputImage/inputImage2/...), so after removing chip 1 the survivors stayed
 * tagged inputImage2/inputImage3 and the role-first assignment stranded the
 * REQUIRED inputImage slot — Qwen-Edit's block_if_empty Input_Image then
 * ExecutionBlocked the whole graph into a silent zero-output.
 *
 * stripOrdinalMediaRoles drops those stale tags so the positional fill assigns
 * by item order (always matching the numbered chip badges). Non-ordinal roles
 * (startFrame/endFrame, Head Swap's image1/image2) must stay sticky (MPI-306:
 * slots are sparse and semantic — never repack).
 *
 * The assignment loop below mirrors commandExecutor._buildParams' role-first
 * passes (importing commandExecutor pulls in the whole app graph); the mirror
 * is the same explicit-then-positional shape used by MpiPromptBox too.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

/** Mirror of the role-first slot assignment (explicit pass, then positional). */
function assignSlots(slots, items) {
    const usedIds = new Set();
    const assigned = new Map();
    for (const slot of slots) {
        const explicit = items.find(i =>
            i.role === slot.key && i.mediaType === slot.mediaType && i.url && !usedIds.has(i.id));
        if (!explicit) continue;
        usedIds.add(explicit.id);
        assigned.set(slot.key, explicit);
    }
    for (const slot of slots) {
        if (assigned.has(slot.key)) continue;
        const item = items.find(i =>
            i.mediaType === slot.mediaType && i.url && !usedIds.has(i.id));
        if (!item) continue;
        usedIds.add(item.id);
        assigned.set(slot.key, item);
    }
    return assigned;
}

test('qwenEdit: removing chip 1 must not strand the required Input_Image', async () => {
    const { getCommandMediaInputs, stripOrdinalMediaRoles } = await import('../js/data/commandRegistry.js');
    const slots = getCommandMediaInputs('qwenEdit');
    assert.ok(slots.every(s => s.ordinal === true), 'qwenEdit slots must be ordinal');

    // Chips as they exist AFTER removing the restored chip 1: survivors still
    // tagged with their old ordinal roles.
    const items = [
        { id: 'b', url: 'b.png', mediaType: 'image', role: 'inputImage2' },
        { id: 'c', url: 'c.png', mediaType: 'image', role: 'inputImage3' },
    ];

    // The regression: without stripping, the explicit pass consumes both items
    // and the required first slot ends up EMPTY.
    const broken = assignSlots(slots, items);
    assert.strictEqual(broken.get('inputImage'), undefined, 'repro precondition: stale roles strand slot 1');

    const fixed = assignSlots(slots, stripOrdinalMediaRoles(slots, items));
    assert.strictEqual(fixed.get('inputImage')?.id, 'b', 'first surviving chip must fill Input_Image');
    assert.strictEqual(fixed.get('inputImage2')?.id, 'c');
    assert.strictEqual(fixed.get('inputImage3'), undefined);
});

test('krea2Edit slots are ordinal too', async () => {
    const { getCommandMediaInputs } = await import('../js/data/commandRegistry.js');
    assert.ok(getCommandMediaInputs('krea2Edit').every(s => s.ordinal === true));
});

test('non-ordinal roles stay sticky (startFrame/endFrame, Head Swap)', async () => {
    const { getCommandMediaInputs, stripOrdinalMediaRoles } = await import('../js/data/commandRegistry.js');

    // i2v: an END-frame-only box must keep its endFrame tag, never slide into
    // startFrame by position.
    const i2vSlots = getCommandMediaInputs('i2v');
    const endOnly = [{ id: 'e', url: 'e.png', mediaType: 'image', role: 'endFrame' }];
    assert.deepStrictEqual(stripOrdinalMediaRoles(i2vSlots, endOnly), endOnly, 'endFrame tag must survive');

    // Head Swap: image2 (the SOURCE head) alone must not repack into image1
    // (the TARGET) — MPI-306 ran the swap backwards exactly this way.
    const hsSlots = getCommandMediaInputs('appHeadSwap');
    const sourceOnly = [{ id: 's', url: 's.png', mediaType: 'image', role: 'image2' }];
    assert.deepStrictEqual(stripOrdinalMediaRoles(hsSlots, sourceOnly), sourceOnly, 'Head Swap roles must stay sticky');
    const hs = assignSlots(hsSlots, stripOrdinalMediaRoles(hsSlots, sourceOnly));
    assert.strictEqual(hs.get('image2')?.id, 's');
});
