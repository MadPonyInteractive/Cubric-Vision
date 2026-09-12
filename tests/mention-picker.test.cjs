/**
 * mention-picker.test.cjs — MPI-664 checklist L30, the `@` picker in the Lyrics box.
 *
 * Typing `@` in the Song flow's Lyrics box lists the voice roster and inserts the
 * marker MiniMax reads — `<Singer A>` — because the spelling has to be exact for a
 * line to reach the voice the user meant.
 *
 * The popup is DOM and is checked in the app. The two pure halves are here:
 *
 *   - `mentionTagsFrom` — roster rows to picker entries. Its rules mirror
 *     `serialiseVoices` on purpose (blank rows dropped, `Any` emits the bare name), so
 *     the list the user picks from and the caption the graph reads cannot disagree.
 *   - `spliceMentionTag` — the insert. A voice marker MUST sit on its own line: every
 *     line outside a `[section]` tag is sung, so a marker sharing a line with words
 *     changes what the encoder is handed. That is the edge case with teeth.
 *
 * The FlowDef itself is pinned last, and that is the regression that matters most:
 * the picker is opt-in per field, so a renamed roster id or a stray `mentions` on
 * another flow's text box is silent — nothing throws, the feature simply is not there,
 * or it appears where Fabio said it must not (2026-09-10: *"only the lyrics box gets
 * it. Why would it leak into sound and music?"*).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const esm = p => import('file://' + path.join(__dirname, '..', p).replace(/\\/g, '/'));

// ── mentionTagsFrom ─────────────────────────────────────────────────────────

test('a roster becomes picker entries, typed label and bare tag', async () => {
    const { mentionTagsFrom } = await esm('js/utils/declaredFields.js');
    const rows = [
        { name: 'Singer A', type: 'Female' },
        { name: 'Ana', type: 'Any' },
    ];
    assert.deepStrictEqual(mentionTagsFrom(rows), [
        // The TAG is bare: it is what goes inside the angle brackets.
        { tag: 'Singer A', label: 'Singer A (Female)' },
        // `Any` is the catch-all — "Ana (Any)" would state a quality nobody chose,
        // the same reason serialiseVoices drops it.
        { tag: 'Ana', label: 'Ana' },
    ]);
});

test('a half-added row is not a voice, and two of one name is not a choice', async () => {
    const { mentionTagsFrom } = await esm('js/utils/declaredFields.js');
    // Blank and whitespace-only names are dropped, matching serialiseVoices.
    assert.deepStrictEqual(mentionTagsFrom([{ name: '', type: 'Male' }, { name: '   ' }]), []);
    // `nextVoiceName` enforces uniqueness on ADD only, so a RENAME can produce two.
    // Both would insert the same marker, so the second is unanswerable, not useful.
    const dupes = mentionTagsFrom([
        { name: 'Ana', type: 'Female' },
        { name: 'ana', type: 'Child' },
    ]);
    assert.deepStrictEqual(dupes.map(t => t.tag), ['Ana']);
});

test('a mentions pointing at a non-roster field closes quietly', async () => {
    const { mentionTagsFrom } = await esm('js/utils/declaredFields.js');
    // Not an array = no list = no picker. It must not throw: this runs on a keystroke.
    for (const bad of [undefined, null, '', 'Singer A', 42, {}]) {
        assert.deepStrictEqual(mentionTagsFrom(bad), [], `${JSON.stringify(bad)} must yield nothing`);
    }
});

// ── spliceMentionTag ────────────────────────────────────────────────────────

test('a marker at the start of a line takes no leading newline', async () => {
    const { spliceMentionTag } = await esm('js/utils/mentionPicker.js');
    const value = '[Verse]\n@sin';
    const out = spliceMentionTag(value, 8, value.length, 'Singer A');
    assert.strictEqual(out.value, '[Verse]\n<Singer A>\n');
    assert.strictEqual(out.caret, out.value.length, 'the caret lands ready for the lyric');
});

test('a marker typed mid-line is moved onto its own line', async () => {
    const { spliceMentionTag } = await esm('js/utils/mentionPicker.js');
    // The trailing space before the `@` goes with it — otherwise the line above keeps
    // a stranded space at its end.
    const value = 'hold me close @sin';
    const out = spliceMentionTag(value, 14, value.length, 'Singer A');
    assert.strictEqual(out.value, 'hold me close\n<Singer A>\n');
});

test('text already continuing on the next line does not get a second newline', async () => {
    const { spliceMentionTag } = await esm('js/utils/mentionPicker.js');
    const value = '@sin\nhold me close';
    const out = spliceMentionTag(value, 0, 4, 'Singer A');
    assert.strictEqual(out.value, '<Singer A>\nhold me close');
    assert.strictEqual(out.caret, 10, 'caret sits after the tag, before the existing newline');
});

test('the query and the insert compose: half a name in, a whole marker out', async () => {
    const { matchRefTagQuery } = await esm('js/data/commandRegistry.js');
    const { spliceMentionTag } = await esm('js/utils/mentionPicker.js');
    const { mentionTagsFrom } = await esm('js/utils/declaredFields.js');

    const tags = mentionTagsFrom([{ name: 'Singer A', type: 'Female' }, { name: 'Choirboy' }]);
    const value = '[Chorus]\n@sing';
    const q = matchRefTagQuery(value, value.length, tags);
    assert.ok(q, 'the picker must open');
    assert.deepStrictEqual(q.matches.map(m => m.tag), ['Singer A'], 'the space need not be typed');
    assert.strictEqual(
        spliceMentionTag(value, q.at, value.length, q.matches[0].tag).value,
        '[Chorus]\n<Singer A>\n',
    );
});

// ── the FlowDef ─────────────────────────────────────────────────────────────

test('the Lyrics box declares the picker, and its roster still exists', async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'minimax-music');
    assert.ok(flow, 'the minimax-music FlowDef must exist');

    const stepFields = (flow.steps || []).flatMap(s => s.fields || []);
    const lyrics = stepFields.find(f => f.id === 'Input_Lyrics');
    assert.ok(lyrics, 'Input_Lyrics must exist');
    assert.strictEqual(lyrics.mentions, 'Input_Voices', 'the Lyrics box must declare the picker');

    // A `mentions` naming a field that is gone is SILENT — readField returns undefined,
    // mentionTagsFrom yields nothing, and `@` does nothing with no error anywhere.
    const roster = stepFields.find(f => f.id === lyrics.mentions);
    assert.ok(roster, `${lyrics.mentions} must exist in the same step`);
    assert.strictEqual(roster.type, 'voices', 'the source must be a roster');
});

test('no other declared field anywhere carries a picker', async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const offenders = [];
    flows.forEach((flow) => {
        const all = [...(flow.fields || []), ...(flow.steps || []).flatMap(s => s.fields || [])];
        all.forEach((f) => {
            if (f?.mentions && !(flow.id === 'minimax-music' && f.id === 'Input_Lyrics')) {
                offenders.push(`${flow.id}.${f.id}`);
            }
        });
    });
    // Lyrics-only, by Fabio's decision. A new one is a product call, not a refactor.
    assert.deepStrictEqual(offenders, []);
});

// ── Tab belongs to an open picker, not to the shell (MPI-664, 2026-09-12) ────

test('an open picker takes Tab off the workspace flip', async () => {
    const { HOTKEY_REGISTRY, MENTION_PICKER_OPEN_SELECTOR } = await esm('js/managers/hotkeyRegistry.js');

    const flip = HOTKEY_REGISTRY.find(e => e.id === 'workspace.flip');
    assert.ok(flip, 'the Tab flip entry must exist');
    assert.strictEqual(flip.key, 'tab');

    // THE BUG: hotkeyManager binds keydown on `window` with { capture: true } and calls
    // stopPropagation(), so both pickers' own `if (e.key === 'Enter' || e.key === 'Tab')`
    // branches never ran. Fabio typed `@f`, pressed Tab to accept "female", and landed in
    // the gallery. The gate has to be HERE, in the shell's own `when`.
    assert.match(
        String(flip.when),
        /MENTION_PICKER_OPEN_SELECTOR/,
        'workspace.flip must stand down while an @ picker is open',
    );

    // And `allowWhileTyping: false` must not be mistaken for the fix - it does not cover
    // Tab. hotkeyManager's typing gate only blocks single letters, bare modifiers and
    // text-edit keys, so Tab passes it inside a textarea whatever this flag says.
    assert.strictEqual(flip.allowWhileTyping, false, 'unchanged, and deliberately not the gate');
});

test('the picker selector matches the popups and NOT their rows', async () => {
    const { MENTION_PICKER_OPEN_SELECTOR } = await esm('js/managers/hotkeyRegistry.js');

    // Both implementations, because there are two and they are separate on purpose.
    assert.match(MENTION_PICKER_OPEN_SELECTOR, /\.mpi-mention-picker:not\(\.hide\)/);
    assert.match(MENTION_PICKER_OPEN_SELECTOR, /\.mpi-prompt-box__ref-picker:not\(\.hide\)/);

    // 🔴 THE EDGE WITH TEETH. A substring selector would also match the `-item` rows, and
    // those OUTLIVE a close: the popup gets `hide`, its children never do. The gate would
    // then read "a picker is open" forever after the first use and Tab would be dead for
    // the rest of the session - a worse bug than the one being fixed, and a silent one.
    assert.ok(
        !MENTION_PICKER_OPEN_SELECTOR.includes('*='),
        'no substring match: it would catch the -item rows, which survive a close',
    );
    assert.ok(
        !/-item/.test(MENTION_PICKER_OPEN_SELECTOR),
        'the rows are never what "open" means',
    );
});

test('both pickers carry the class the selector looks for', () => {
    const fs = require('node:fs');
    const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

    // mentionPicker's BEM class carries the CALLER's block, so it is a different string
    // per host - the fixed marker class is what makes it selectable at all.
    assert.match(
        read('js/utils/mentionPicker.js'),
        /className:\s*`\$\{cls\(''\)\}\s+mpi-mention-picker\s+hide`/,
        'mentionPicker must mark its popup with the stable marker class',
    );

    // MpiPromptBox keeps its own older copy (MPI-475) and is deliberately NOT repointed
    // here - it had uncommitted work in it. If that class is ever renamed, this fails
    // rather than silently ungating Tab on the gallery's prompt box.
    assert.match(
        read('js/components/Organisms/MpiPromptBox/MpiPromptBox.js'),
        /_refPicker\.className\s*=\s*'mpi-prompt-box__ref-picker hide'/,
        'the PromptBox picker class the selector names must still exist',
    );
});
