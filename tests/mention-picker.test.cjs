/**
 * mention-picker.test.cjs — `spliceMentionTag`, and WHICH `@` list the Lyrics box offers.
 *
 * 🔴 THE BOX HAS HAD TWO PICKERS AND ONLY THE SECOND ONE EXECUTES (MPI-664, 2026-09-12).
 * The first listed the voice roster and inserted `<Singer A>`: `Strip_Voice_Markers` cuts
 * every `<…>` run before the encoder, and the lyrics are not in the enhancer's `from`
 * list, so the marker reached no model at all. Fabio followed the hint on two live runs
 * for nothing. The replacement offers MiniMax's nine SECTION tags in SQUARE brackets —
 * `normalize_lyrics` splits on those and the graph honours them.
 *
 * So the tests below are mostly about telling the two apart, because the mechanism is
 * identical and only the source and the brackets differ:
 *
 *   - `spliceMentionTag` — the shared insert, which MpiPromptBox also uses. A tag MUST
 *     land on its own line; every line outside a `[section]` tag is sung, so a tag
 *     sharing a line with words changes what the encoder is handed. `wrap` defaults to
 *     angle for MpiPromptBox's references and is square for a section tag.
 *   - The FlowDef: the nine tags are pinned AGAINST THE GRAPH'S OWN REGEX, so the list
 *     the user is offered cannot drift from the list the model accepts. A tenth word
 *     here would not be a tag — it would be a lyric line, and it would be sung.
 *   - No field anywhere declares `mentions`. `buildField` does not honour it, so one
 *     left behind is a dead key and a quiet route back to the no-op picker.
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

test('a section tag is written in SQUARE brackets, and angle is what the graph strips', async () => {
    const { matchRefTagQuery } = await esm('js/data/commandRegistry.js');
    const { spliceMentionTag } = await esm('js/utils/mentionPicker.js');

    const tags = [{ tag: 'Pre-Chorus' }, { tag: 'Post-Chorus' }, { tag: 'Chorus' }];
    const value = 'hold me close @pre';
    const q = matchRefTagQuery(value, value.length, tags);
    assert.ok(q, 'the picker must open');
    assert.deepStrictEqual(q.matches.map(m => m.tag), ['Pre-Chorus'], 'the hyphen need not be typed');

    // 🔴 THE BRACKET IS THE FEATURE. `<Pre-Chorus>` reaches the encoder as nothing at
    // all — `Strip_Voice_Markers` cuts it — so a default `wrap` here would rebuild the
    // exact no-op this picker replaced.
    const out = spliceMentionTag(value, q.at, value.length, q.matches[0].tag, ['[', ']']);
    assert.strictEqual(out.value, 'hold me close\n[Pre-Chorus]\n');
    assert.strictEqual(out.caret, out.value.length);
});

// ── the FlowDef ─────────────────────────────────────────────────────────────

const lyricsField = async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'minimax-music');
    assert.ok(flow, 'the minimax-music FlowDef must exist');

    const step = (flow.steps || []).find(s => (s.fields || []).some(f => f.id === 'Input_Lyrics'));
    const lyrics = (step.fields || []).find(f => f.id === 'Input_Lyrics');
    assert.ok(lyrics, 'Input_Lyrics must exist');
    return { step, lyrics };
};

test('the Lyrics box offers the section tags, and still no voice marker', async () => {
    const { step, lyrics } = await lyricsField();

    // 🔴 THE FIRST PICKER INSERTED A NO-OP. `Strip_Voice_Markers` cuts every `<…>` run
    // before the encoder and the lyrics never reach the enhancer, so a marker changed
    // NOTHING about the audio. Fabio followed the hint on two live runs before we
    // measured it. The key that pointed at the roster must not come back.
    assert.strictEqual(lyrics.mentions, undefined, 'the roster pointer must stay gone');
    assert.ok(
        !/angle bracket|<Singer/i.test(step.hint || ''),
        'the hint must not tell the user to write a voice marker',
    );

    // What replaced it.
    assert.ok(Array.isArray(lyrics.tags) && lyrics.tags.length, 'the Lyrics box must offer tags');
    assert.match(step.hint || '', /type @/i, 'the hint must say the picker is there');
});

test('the nine tags offered are exactly the nine the GRAPH accepts', async () => {
    const fs = require('node:fs');
    const { lyrics } = await lyricsField();

    // 🔴 THE ONE CHECK WITH TEETH. The tag channel is MiniMax's closed nine words or
    // nothing: `normalize_lyrics` keeps a bracketed run whatever is inside it, so a
    // tenth word offered here would be accepted by the box, pass the split, and be
    // SUNG as a lyric line. The list is therefore pinned against the converted graph's
    // own `regex_pattern` rather than against a copy of itself.
    const graph = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'comfy_workflows', 'flow_minimax_music.json'), 'utf8',
    ));
    const pattern = Object.values(graph)
        .map(n => n?.inputs?.regex_pattern)
        .find(p => typeof p === 'string' && p.includes('pre-chorus'));
    assert.ok(pattern, 'the lyric-tag regex must still be in the graph');

    const fromGraph = pattern.match(/\(\?:([^)]+)\)/)[1].split('|');
    const offered = lyrics.tags.map(t => t.tag.toLowerCase());

    // Lower-cased on the way in: `normalize_lyrics` lowercases before matching, which is
    // what lets the picker spell them the way the hint does.
    assert.deepStrictEqual(offered, fromGraph);
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
    // silent dead key — and a route back to the picker that inserted nothing. The `@`
    // list that works is a closed `tags` array on the field, not a sibling pointer.
    assert.deepStrictEqual(offenders, []);
});

test('the picker stays opt-in: only the Lyrics box declares tags', async () => {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const declaring = [];
    flows.forEach((flow) => {
        const all = [...(flow.fields || []), ...(flow.steps || []).flatMap(s => s.fields || [])];
        all.forEach((f) => {
            if (f?.tags) declaring.push(`${flow.id}.${f.id}`);
        });
    });
    // The gate is per FIELD, not per Primitive: `buildField`'s text branch mounts every
    // declared box in every flow, so a picker on the Primitive would land on Sound &
    // Music's "Describe it", the song brief and Voice notes as well (Fabio, 2026-09-10:
    // *"only the lyrics box gets it. Why would it leak into sound and music?"*).
    assert.deepStrictEqual(declaring, ['minimax-music.Input_Lyrics']);
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
