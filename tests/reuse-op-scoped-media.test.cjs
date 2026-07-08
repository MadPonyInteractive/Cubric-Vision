'use strict';

// MPI-225 — a PromptBox start-frame chip left over from a prior i2v must NOT be
// snapshotted into a t2i's persisted generationSettings.mediaItems (t2i declares
// no image input). That phantom image was the root of the reuse-404 chain: it lit
// up "Use Images" on a text-to-image card, injected the wrong image on reuse, and
// propagated an orphan-prone frame ref into downstream i2v preview-assets.
//
// Two guards mirrored from source:
//   1. persist filter  — js/services/generationService.js  _opScopedMediaItems
//   2. reuse-read heal — js/utils/promptReuse.js  saved-image op-gate
// Both key off getCommandMediaInputs(op): t2i → [] slots; i2v → an image slot.

const assert = require('node:assert/strict');
const test = require('node:test');

// --- op media-input contract stub (mirrors commandRegistry) ---
const SLOTS = {
    t2i:     [],
    i2v_ms:  [{ mediaType: 'image', key: 'startFrame' }],
};
const getCommandMediaInputs = (op) => SLOTS[op] || [];

// --- 1. persist filter (generationService _opScopedMediaItems) ---
function opScopedMediaItems(operation, mediaItems = []) {
    const slots = getCommandMediaInputs(operation);
    if (!slots.length) return [];
    return mediaItems.filter(item => {
        const type = item?.mediaType ?? item?.type ?? null;
        return slots.some(slot => slot.mediaType === type);
    });
}

// --- 2. reuse-read heal (promptReuse saved-image op-gate) ---
function savedImageGate(acceptsImage, savedItems) {
    return savedItems.filter(m => acceptsImage || (m.mediaType ?? m.type) !== 'image');
}

const staleFrame = { role: 'startFrame', mediaType: 'image', url: '…/t2i_005.png' };
const audioClip  = { role: 'audio', mediaType: 'audio', url: '…/voice.wav' };

test('t2i persist strips a leftover start-frame chip', () => {
    assert.deepEqual(opScopedMediaItems('t2i', [staleFrame]), []);
});

test('i2v persist keeps its start-frame', () => {
    assert.deepEqual(opScopedMediaItems('i2v_ms', [staleFrame]), [staleFrame]);
});

test('reuse-read drops phantom saved image on a t2i (no image input)', () => {
    // acceptsImage=false for t2i
    assert.deepEqual(savedImageGate(false, [staleFrame, audioClip]), [audioClip]);
});

test('reuse-read keeps images when the op DOES accept image input', () => {
    assert.deepEqual(savedImageGate(true, [staleFrame, audioClip]), [staleFrame, audioClip]);
});
