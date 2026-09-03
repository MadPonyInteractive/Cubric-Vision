/**
 * flow-enhance-ownership.test.cjs — MPI-664.
 *
 * Enhance may only overwrite a box that is empty or one it wrote itself, and the same
 * bookkeeping decides what a source edit invalidates. That provenance lived in a `Set`
 * rebuilt at mount, so it did not survive Reuse: the sidecar restored the enhancer's
 * three caption blocks as text with no owner, the "never destroy the user's writing"
 * rule then protected them from the enhancer, and the flow could never enhance again.
 * Fabio hit it live — changed the Song structure on a reused Music Maker card, pressed
 * Generate, and the run went straight to the music model on the previous run's caption.
 *
 * `MpiBaseFlow.setup`'s closure cannot be imported in bare Node (`/js/utils/icons.js`
 * is an absolute browser path) and has no DOM to mount into, so this is pinned as a
 * source contract in the same style as flow-frame.test.cjs. What matters is the ROUND
 * TRIP: the snapshot must carry ownership out, and the seed must read it back in. Each
 * half is useless alone, so both are asserted here rather than in two places.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const frame = () => fs.readFileSync(repo('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js'), 'utf8');

test('the snapshot carries enhancer ownership out', () => {
    const src = frame();

    // Beside `stepValues` in `_collectInputs`'s return: frame bookkeeping the op has no
    // mapping for, which is exactly what Reuse needs to restore.
    assert.match(
        src,
        /_enhanceWrote\.size\s*\?\s*\{\s*enhanceWrote:\s*\[\s*\.\.\._enhanceWrote\s*\]\s*\}/,
        '_collectInputs must emit `enhanceWrote` when the enhancer owns any text',
    );

    // An empty Set must not write the key — an older sidecar and a flow that has never
    // enhanced are the same shape, and neither should grow a key that means nothing.
    assert.ok(
        !/enhanceWrote:\s*\[\s*\.\.\._enhanceWrote\s*\]\s*,\s*\n\s*\.\.\.declared/.test(
            src.replace(/_enhanceWrote\.size\s*\?/, 'NEVER ?'),
        ),
        '`enhanceWrote` must be conditional on the Set being non-empty',
    );
});

test('the seed reads enhancer ownership back in', () => {
    const src = frame();

    assert.match(
        src,
        /const _enhanceWrote = new Set\(\s*Array\.isArray\(seeded\.enhanceWrote\)\s*\?\s*seeded\.enhanceWrote\s*:\s*\[\]/,
        '_enhanceWrote must seed from the restored snapshot, not start empty',
    );

    // `seeded` is session scratch OR the sidecar Reuse hands in, so one read covers
    // reopening a flow and reusing a gallery card alike.
    assert.match(
        src,
        /const seeded = state\.s_flowInputs\?\.\[flow\.id\] \|\| props\.initialInputs \|\| \{\}/,
        'the seed source must stay the union of session scratch and Reuse',
    );
});

test('invalidation still refuses to clear text the enhancer does not own', () => {
    const src = frame();

    // The bug was never this guard — it was the Set being empty underneath it. If the
    // guard goes, a source edit starts wiping the user's own mood and vocal lines, and
    // restoring ownership across Reuse would make that WORSE rather than better.
    assert.match(
        src,
        /if \(!_fieldValues\[t\] \|\| !_enhanceWrote\.has\(t\)\) return;/,
        '_setFlowField must only clear the enhancer\'s own output',
    );
});
