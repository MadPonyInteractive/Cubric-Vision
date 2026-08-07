// MPI-475: the `@` reference picker's matcher. The popup around it is DOM, but which
// tags match a half-typed `@pic` is string work, and that is where the edge cases are —
// an email address must not open a picker, a space must close one, and "Picture 1" has
// to be reachable by typing "pic" even though the tag carries a space.
//
// Also pins the tag data itself: ref2v_ms is the only op with tags, and its ordinals
// are per TYPE, which is exactly what a chip's strip position is NOT.

const assert = require('node:assert');
const test = require('node:test');

let matchRefTagQuery, commands;

test.before(async () => {
    ({ matchRefTagQuery, commands } = await import('../js/data/commandRegistry.js'));
});

const TAGS = [{ tag: 'Picture 1' }, { tag: 'Picture 2' }, { tag: 'Video 1' }, { tag: 'Audio 1' }];
/** Query at the end of `value`, which is where a user typing actually is. */
const at = (value, tags = TAGS) => matchRefTagQuery(value, value.length, tags);

test('a bare @ offers every staged reference', () => {
    const q = at('a shot of @');
    assert.ok(q, 'expected the picker to open');
    assert.strictEqual(q.at, 10, 'must point at the @, so the insertion replaces it');
    assert.deepStrictEqual(q.matches.map(m => m.tag), ['Picture 1', 'Picture 2', 'Video 1', 'Audio 1']);
});

test('typing narrows, and the space inside a tag does not have to be typed', () => {
    assert.deepStrictEqual(at('@pic').matches.map(m => m.tag), ['Picture 1', 'Picture 2']);
    assert.deepStrictEqual(at('@picture2').matches.map(m => m.tag), ['Picture 2']);
    assert.deepStrictEqual(at('@AUD').matches.map(m => m.tag), ['Audio 1'], 'case-insensitive');
});

test('no match closes rather than offering everything', () => {
    assert.strictEqual(at('@zzz'), null);
});

test('an email address does not open a picker', () => {
    // The regex demands a boundary before the @, which is the whole guard.
    assert.strictEqual(at('write to fabio@picture'), null);
    assert.strictEqual(at('fabio@'), null);
});

test('a space after the @ closes it', () => {
    assert.strictEqual(at('@ '), null);
    assert.strictEqual(at('@pic ture'), null);
});

test('a boundary that is not whitespace still opens it', () => {
    // Typing a tag straight after an opening bracket or quote is normal prose.
    for (const prefix of ['(', '[', '"', "'"]) {
        assert.ok(at(`${prefix}@pic`), `expected "${prefix}@pic" to open the picker`);
    }
});

test('no staged references means no picker, whatever is typed', () => {
    assert.strictEqual(matchRefTagQuery('@pic', 4, []), null);
    assert.strictEqual(matchRefTagQuery('@pic', 4, undefined), null);
});

test('the caret is what counts, not the end of the value', () => {
    const value = 'a @pic and then some trailing words';
    assert.deepStrictEqual(
        matchRefTagQuery(value, 6, TAGS).matches.map(m => m.tag), ['Picture 1', 'Picture 2']);
    // Caret parked in the trailing words: nothing under it, so no picker.
    assert.strictEqual(matchRefTagQuery(value, value.length, TAGS), null);
});

test('ref2v_ms is the only tagged op, and its tags count WITHIN a type', () => {
    const tagged = Object.entries(commands)
        .filter(([, cmd]) => (cmd.mediaInputs || []).some(s => s.tag))
        .map(([key]) => key);
    assert.deepStrictEqual(tagged, ['ref2v_ms'],
        'a second tagged op needs the chip badge + picker re-checked, not just a slot list');

    const slots = commands.ref2v_ms.mediaInputs;
    const tags = slots.map(s => s.tag);
    assert.strictEqual(tags.length, 15, 'nine images, three videos, three audio');
    assert.deepStrictEqual(tags.slice(0, 3), ['Picture 1', 'Picture 2', 'Picture 3']);
    // The ninth slot is Picture 9 and the TENTH is Video 1 — if these ever became strip
    // positions the tenth chip would badge "10" and address nothing.
    assert.strictEqual(tags[8], 'Picture 9');
    assert.strictEqual(tags[9], 'Video 1');
    assert.strictEqual(tags[12], 'Audio 1');
    // Every tag unique, or the picker offers two rows that insert the same handle.
    assert.strictEqual(new Set(tags).size, tags.length);
});
