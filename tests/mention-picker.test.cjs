/**
 * mention-picker.test.cjs — `spliceMentionTag`, and the Song flow NOT offering a picker.
 *
 * 🔴 THE VOICE PICKER IS GONE (MPI-664, 2026-09-12). Typing `@` in the Lyrics box used
 * to list the roster and insert `<Singer A>`. It inserted a no-op: `Strip_Voice_Markers`
 * cuts every `<…>` run before the encoder, and the lyrics are not in the enhancer's
 * `from` list, so the marker reached no model at all. The picker, the roster names it
 * listed and the hint advertising it were one closed loop with no effect on a single
 * generated note. Fabio followed that hint on two live runs.
 *
 * What is still tested:
 *
 *   - `spliceMentionTag` — the shared insert, which MpiPromptBox still uses. A tag MUST
 *     land on its own line; in the Lyrics box every line outside a `[section]` tag is
 *     sung, so a tag sharing a line with words changes what the encoder is handed.
 *   - The FlowDef, pinned so the removal cannot quietly come back: no field anywhere
 *     declares `mentions` (`buildField` no longer honours it, so one left behind is a
 *     dead key), and the Song hint no longer tells anyone to write a marker.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const esm = p => import('file://' + path.join(__dirname, '..', p).replace(/\\/g, '/'));

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

    // A literal list, which is what MpiPromptBox hands in — the roster-to-tags helper
    // went with the voice picker, and this pair is the shared path that outlived it.
    const tags = [{ tag: 'Singer A', label: 'Singer A (Female)' }, { tag: 'Choirboy', label: 'Choirboy' }];
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

test('the Lyrics box no longer offers, or advertises, a voice marker', async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'minimax-music');
    assert.ok(flow, 'the minimax-music FlowDef must exist');

    const step = (flow.steps || []).find(s => (s.fields || []).some(f => f.id === 'Input_Lyrics'));
    const lyrics = (step.fields || []).find(f => f.id === 'Input_Lyrics');
    assert.ok(lyrics, 'Input_Lyrics must exist');

    // 🔴 THE PICKER INSERTED A NO-OP. `Strip_Voice_Markers` cuts every `<…>` run before
    // the encoder and the lyrics never reach the enhancer, so a marker changed NOTHING
    // about the audio. Fabio followed the hint on two live runs before we measured it.
    assert.strictEqual(lyrics.mentions, undefined, 'the Lyrics box must not declare a picker');
    assert.ok(
        !/angle bracket|<Singer/i.test(step.hint || ''),
        'the hint must not tell the user to write a voice marker',
    );
});

test('no declared field anywhere carries a picker', async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const offenders = [];
    flows.forEach((flow) => {
        const all = [...(flow.fields || []), ...(flow.steps || []).flatMap(s => s.fields || [])];
        all.forEach((f) => {
            if (f?.mentions) offenders.push(`${flow.id}.${f.id}`);
        });
    });
    // `buildField` no longer honours `mentions` at all, so one left behind would be a
    // silent dead key. The `@` list Fabio wants — MiniMax's nine section tags — is its
    // own card and its own source, not a pointer at a sibling field.
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
