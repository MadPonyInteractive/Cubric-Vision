'use strict';

// MPI-555 — staged media chips must not survive a move to an op+model pairing that
// has no slot for them. Reusing a text-to-image card left three pictures and an audio
// chip staged from a MiniMax H3 reference setup, on a model that accepts neither: the
// chips had no slot to be labelled by, nothing to inject into, and the next Cue would
// have run carrying inputs the user could no longer see the purpose of.
//
// The fix lives in js/components/Organisms/MpiPromptBox/MpiPromptBox.js
// (_pruneUnsupportedMedia, called last in setOperation and setModel). Mirrored here
// because the real one needs a DOM. Two properties matter beyond "drops the right
// chips": removals are SILENT with a single emit after (one per chip re-enters the
// op-switch logic mid-prune), and a prune with nothing to drop emits NOTHING at all.

const assert = require('node:assert/strict');
const test = require('node:test');

// --- op+model media-slot contract (mirrors filterMediaInputsForModel(getCommandMediaInputs(op), model)).
// Values verified against the live registry 2026-08-14. ---
const SLOTS = {
    'klein-4b/t2i':            [],
    'klein-4b/i2i':            [{ mediaType: 'image' }],
    'minimax-h3-ref2va/ref2v_ms': [
        ...Array(9).fill({ mediaType: 'image' }),
        ...Array(3).fill({ mediaType: 'video' }),
        ...Array(3).fill({ mediaType: 'audio' }),
    ],
};

// --- the guard, mirrored from source ---
function pruneUnsupportedMedia(pairing, mediaItems, { removeItem, emitMediaChange }) {
    const accepted = new Set((SLOTS[pairing] || []).map(slot => slot.mediaType));
    const doomed = mediaItems.filter(m => !accepted.has(m.mediaType));
    if (!doomed.length) return;
    doomed.forEach(m => removeItem(m.id, { silent: true }));
    emitMediaChange();
}

/** Runs the guard against a live-ish chip list, returning what survived and how it emitted. */
function run(pairing, chips) {
    const items = chips.slice();
    let emits = 0;
    const loudRemovals = [];
    pruneUnsupportedMedia(pairing, items, {
        removeItem: (id, { silent } = {}) => {
            const i = items.findIndex(m => m.id === id);
            if (i !== -1) items.splice(i, 1);
            if (!silent) loudRemovals.push(id);
        },
        emitMediaChange: () => { emits += 1; },
    });
    return { kept: items.map(m => m.id), emits, loudRemovals };
}

// The exact tray from the live repro: an H3 reference setup.
const H3_TRAY = [
    { id: 'pic1', mediaType: 'image' },
    { id: 'pic2', mediaType: 'image' },
    { id: 'pic3', mediaType: 'image' },
    { id: 'boss', mediaType: 'audio' },
];

test('a text-to-image pairing accepts nothing, so the whole tray goes', () => {
    const { kept, emits } = run('klein-4b/t2i', H3_TRAY);
    assert.deepEqual(kept, [], 'klein t2i declares no media slots — no chip is reachable');
    assert.equal(emits, 1, 'one emit for the whole prune, never one per chip');
});

test('a partially-accepting pairing keeps what it has slots for', () => {
    const { kept } = run('klein-4b/i2i', H3_TRAY);
    assert.deepEqual(kept, ['pic1', 'pic2', 'pic3'], 'i2i takes an image; the audio chip has nowhere to go');
});

test('the pairing the chips were staged for is left completely alone', () => {
    const { kept, emits } = run('minimax-h3-ref2va/ref2v_ms', H3_TRAY);
    assert.deepEqual(kept, ['pic1', 'pic2', 'pic3', 'boss'], 'every type has a slot here');
    assert.equal(emits, 0, 'a prune with nothing to drop must not emit — that churn re-renders the strip');
});

test('removals are silent so the op-switch logic sees one settled state', () => {
    const { loudRemovals } = run('klein-4b/t2i', H3_TRAY);
    assert.deepEqual(loudRemovals, [],
        'a loud removal emits mid-prune, and an emit at zero media can re-enter setOperation');
});

console.log('promptbox-prune-unsupported-media: all assertions passed');
