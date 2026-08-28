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

    const cmd = await esm('js/data/commandRegistry.js');
    const reg = cmd.COMMANDS || cmd.commands || cmd.default;
    const keys = reg.flowChatterBox.mediaInputs.map(m => m.key);
    assert.deepStrictEqual(keys, ['audio1'],
        'flowChatterBox must map only audio1 — an audio2 mapping re-enables the VC arm');
});
