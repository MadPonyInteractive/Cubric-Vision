/**
 * flow-derived-fields.test.cjs — MPI-607.
 *
 * A FlowDef's `derived[]` computes a graph input the user never sees. Text to Speech's
 * `Input_Is_Multilingual` is the case it was built for: it used to be an "Other
 * languages" toggle sitting beside the language select, and the pair had exactly one
 * state a user could get wrong — toggle OFF with a non-English language picked, which
 * silently produced English. Deriving the boolean makes that state unreachable.
 *
 * Nothing in the UI can show the derivation is wrong: a mis-derived boolean simply
 * routes the run down the other arm and returns audio, in the wrong language, with no
 * error. So the contract worth pinning is the whole option list evaluating to the right
 * arm — it fails the moment someone re-adds a control for the boolean, renames the
 * select, or adds a language to the wrong side.
 *
 * (This file was `flow-voice-emotion.test.cjs` until the Emotion/VC feature was stripped
 * — see the FlowDef comment for why it went.)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

async function chatterBox() {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'chatter-box');
    assert.ok(flow, 'chatter-box FlowDef must exist');
    return flow;
}

const fieldById = (flow, id) => (flow.fields || []).find(f => f.id === id);

async function commands() {
    const cmd = await esm('js/data/commandRegistry.js');
    return cmd.COMMANDS || cmd.commands || cmd.default;
}

test('the multilingual arm is derived from the language, never from a control', async () => {
    const flow = await chatterBox();

    // The toggle is GONE on purpose: with it, "English" plus a non-English language was
    // reachable and silently produced English. If someone re-adds a control for the
    // boolean, the broken state comes back.
    const ids = (flow.fields || []).map(f => f.id);
    assert.ok(!ids.includes('Input_Is_Multilingual'),
        'Input_Is_Multilingual must not be a user control — it is derived');

    const d = (flow.derived || []).find(x => x.id === 'Input_Is_Multilingual');
    assert.ok(d, 'chatter-box must derive Input_Is_Multilingual');
    assert.strictEqual(d.from, 'Input_Language.language');

    // English is the ONLY value that may take the English-only arm.
    const langs = fieldById(flow, 'Input_Language.language').options.map(o => o.v);
    const evaluate = v => (String(v) === String(d.equals) ? d.then : d.else);
    assert.strictEqual(evaluate('English (en)'), false, 'English must take the English arm');
    for (const v of langs.filter(v => v !== 'English (en)')) {
        assert.strictEqual(evaluate(v), true, `${v} must take the multilingual arm`);
    }
});

test('Text to Speech is TTS only — no second audio role reaches the graph', async () => {
    const flow = await chatterBox();

    // `Input_Audio_2` is the ONLY thing MpiAnyChecker#57 reads to switch the graph onto
    // FL_ChatterboxVC. Mapping an `audio2` role — from a slot, or from a run-time
    // deriver like the Emotion clip this file used to test — puts the VC arm back, and
    // that arm was killed on measurement: VC takes timbre from its target, so the
    // output is the reference clip's speaker rather than the voice the user chose.
    const roles = (flow.inputSchema?.media || []).flatMap(g => g.roles || []);
    assert.deepStrictEqual(roles, ['audio1'], 'Text to Speech declares exactly one media role');

    const reg = await commands();
    const keys = reg.flowChatterBox.mediaInputs.map(m => m.key);
    assert.deepStrictEqual(keys, ['audio1'],
        'flowChatterBox must map only audio1 — an audio2 mapping re-enables the VC arm');
});

test('a voiceless run is refused, not silently blocked (MPI-607)', async () => {
    // THE PAIR THAT MAKES A RUN VANISH. `MpiLoadAudio#54` carries `block_if_empty:
    // true`, so with no voice it returns an ExecutionBlocker: zero output, and
    // ComfyUI reports SUCCESS. Nothing in the UI stops the user getting there — the
    // media slot renders as optional because `upto` is the only media mode there is.
    //
    // What stands in the way is `required` on the op's media slot, which
    // `_findMissingMediaSlot` (generationService) reads at enqueue AND at dispatch to
    // raise the toast. `required: false` opts OUT of that guard — which is what this
    // flow shipped with, and why an empty run went quiet instead of complaining.
    //
    // The law is asserted as the PAIR, not as a literal `true`: a slot the graph
    // blocks on must not opt out. Stated that way it still means something if the
    // flag is ever turned off deliberately — DramaBox does exactly that, and its
    // prompt-only arm depends on it.
    const graph = JSON.parse(fs.readFileSync(
        repo('comfy_workflows/flow_chatter_box.json'), 'utf8'));
    const reg = await commands();

    const slot = reg.flowChatterBox.mediaInputs.find(m => m.key === 'audio1');
    const node = Object.values(graph).find(
        n => (n._meta?.title || '').toLowerCase() === slot.title.toLowerCase());
    assert.ok(node, `the graph must carry a node titled "${slot.title}"`);

    if (node.inputs?.block_if_empty === true) {
        assert.notStrictEqual(slot.required, false,
            `${slot.title} blocks the graph when empty, so the slot must not declare `
            + '`required: false` — that opts out of the missing-media toast, and the '
            + 'run then reports success while producing nothing');
    }
});
