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
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

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

// ── the sources the enhancer reads (MPI-664, 2026-09-11) ────────────────────

test('an enhance source is serialised by its own declaration, never String(v)', () => {
    const src = frame();

    // THE BUG THIS PINS: a `voices` roster's UI value is ROWS, and `String(rows)` is
    // "[object Object],[object Object]". The moment the cast became a source, a blind
    // `String()` stopped being a cosmetic shortcut and started feeding the rewriter
    // noise where the singers are. `mapDeclaredValue` is the same call the graph
    // payload makes, so both read one string built once.
    assert.match(
        src,
        /function _enhanceSourceLine\([^)]*\)\s*\{\s*\n\s*const v = mapDeclaredValue\(f, _fieldValues\[id\]\);/,
        '_enhanceSourceLine must serialise through mapDeclaredValue',
    );

    // And the old shortcut must not survive anywhere on the source path — the single-
    // source branch had its own copy, which is exactly how one of two branches rots.
    assert.ok(
        !/_enhanceSources\(d\)[\s\S]{0,400}?String\(_fieldValues\[/.test(src),
        'no enhance source may be read with a bare String(_fieldValues[...])',
    );
});

test('the Song enhancer is given the cast, and still not the lyrics', async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'minimax-music');
    assert.ok(flow, 'the minimax-music FlowDef must exist');

    const from = flow.enhance?.from || [];
    assert.ok(Array.isArray(from), 'the Song enhance decl must keep a LIST of sources');

    // Fabio cast a man and a woman and heard one woman: without these two the enhancer
    // wrote "[VOCAL] Female lead ... no harmonies" having never seen the roster, and
    // `Cat_Vocal_Body` puts that prose AFTER the roster, so it negated it.
    assert.ok(from.includes('Input_Voices'), 'the roster must feed the enhancer');
    assert.ok(from.includes('Input_Voice_Notes'), 'the voice notes must feed the enhancer');

    // `from` is also the CACHE KEY. The lyrics box is 16 rows and the field the user
    // types in most; as a source it would restage the enhancer on every keystroke.
    assert.ok(!from.includes('Input_Lyrics'), 'the lyrics must NOT be an enhance source');

    // A source naming a field that does not exist is silent — it is simply dropped,
    // and the enhancer goes back to writing that block blind.
    const declared = new Set([
        ...(flow.fields || []),
        ...(flow.steps || []).flatMap(s => s.fields || []),
    ].map(f => f.id));
    from.filter(id => id !== 'positive').forEach((id) => {
        assert.ok(declared.has(id), `enhance source ${id} must be a declared field`);
    });
});
