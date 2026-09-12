// MPI-738. Enter must insert a newline in a modal textarea.
//
// MpiModal binds `modal.confirm` on EVERY show(), whether or not the dialog
// listens for 'confirm', and hotkeyManager preventDefaults any bound+eligible
// key before dispatching. So the registry's `when` is the only thing standing
// between a textarea and a swallowed Enter — drop it and the notes editor
// silently stops taking new lines with nothing thrown anywhere.

const assert = require('node:assert');
const test = require('node:test');

// The registry is browser code: `when` reaches for these globals directly.
globalThis.HTMLTextAreaElement = class HTMLTextAreaElement {};
globalThis.document = { querySelector: () => null };

test('modal.confirm never fires in a multi-line editor', async () => {
    const { HOTKEY_REGISTRY } = await import('../js/managers/hotkeyRegistry.js');
    const entry = HOTKEY_REGISTRY.find((e) => e.id === 'modal.confirm');

    assert.ok(entry, 'modal.confirm must still be registered');
    assert.equal(typeof entry.when, 'function', 'the gate is the fix — no when, no fix');

    // Blocked: Enter is the newline key here.
    assert.equal(entry.when({ activeElement: new globalThis.HTMLTextAreaElement() }), false);
    assert.equal(entry.when({ activeElement: { isContentEditable: true } }), false);

    // Still confirms: a single-line input, a button, nothing focused.
    assert.equal(entry.when({ activeElement: { isContentEditable: false } }), true);
    assert.equal(entry.when({ activeElement: null }), true);
});
