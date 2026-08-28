/**
 * flow-voice-emotion.test.cjs — MPI-607.
 *
 * Text to Speech's Emotion select does not name a file. It names an EMOTION, and the
 * register comes from whichever voice the user picked, so the clip that actually reaches
 * `Input_Audio_2` is resolved at run time as `perf_<register>_<emotion>.opus`. Nothing in
 * the UI can show that a combination has no clip behind it: the run would simply fetch a
 * 404, log it, and the user would get an un-performed line with no visible failure.
 *
 * So the contract worth pinning is the CROSS PRODUCT — every emotion the select offers
 * against every register the radio offers — resolving to a clip that exists in the
 * manifest AND on disk. It fails the moment someone adds a sixth emotion option, renames
 * a clip, or ships a register the library has no performances for.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

const manifest = () => JSON.parse(fs.readFileSync(repo('voices/manifest.json'), 'utf8'));

async function chatterBox() {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'chatter-box');
    assert.ok(flow, 'chatter-box FlowDef must exist');
    return flow;
}

const fieldById = (flow, id) => (flow.fields || []).find(f => f.id === id);

test('every Emotion x Voice-range pair resolves to a clip that exists', async () => {
    const flow = await chatterBox();
    const ve = flow.voiceEmotion;
    assert.ok(ve && ve.clip && ve.role, 'chatter-box must declare voiceEmotion');

    const emotions = fieldById(flow, ve.emotionField).options
        .map(o => o.v)
        .filter(v => v !== 'none');          // `none` inserts nothing by design

    // The registers come from the SHIPPED VOICES, not from a control — there is no
    // register picker any more (Fabio, 2026-08-28: a hand-picked register crosses the
    // voice). Every register a library voice can carry must therefore have a clip for
    // every emotion, or picking that voice + that emotion silently 404s at run time.
    const registers = [...new Set(manifest().voices.map(v => v.register))].sort();

    assert.ok(emotions.length > 0, 'at least one real emotion must ship');
    assert.ok(registers.length > 0, 'the library must carry at least one register');

    const clipIds = new Set(manifest().performanceClips.map(c => c.id));
    const missingFromManifest = [];
    const missingOnDisk = [];

    for (const register of registers) {
        for (const emotion of emotions) {
            const rel = ve.clip.replace('{register}', register).replace('{emotion}', emotion);
            // The manifest id is the filename without its directory or extension — the
            // same shape `_deriveVoiceEmotion` builds its URL from.
            const id = path.basename(rel, path.extname(rel));
            if (!clipIds.has(id)) missingFromManifest.push(id);
            if (!fs.existsSync(repo(path.join('voices', rel)))) missingOnDisk.push(rel);
        }
    }

    assert.deepStrictEqual(missingFromManifest, [],
        'every emotion/register pair the UI offers must exist in voices/manifest.json');
    assert.deepStrictEqual(missingOnDisk, [],
        'every emotion/register pair the UI offers must exist on disk');
});

test('the emotion pair drives a role the op maps, and no visible slot owns it', async () => {
    const flow = await chatterBox();
    const ve = flow.voiceEmotion;

    // The derived item is delivered on a role no media group declares. If a slot ever
    // reclaims `audio2`, two writers land on one role and the last one silently wins.
    const declaredRoles = (flow.inputSchema?.media || []).flatMap(g => g.roles || []);
    assert.ok(!declaredRoles.includes(ve.role),
        `no visible slot may declare "${ve.role}" — the emotion deriver owns it`);

    // ...but the OP must still map it, or the derived clip reaches nothing.
    const cmd = await esm('js/data/commandRegistry.js');
    const reg = cmd.COMMANDS || cmd.commands || cmd.default;
    const inputs = reg.flowChatterBox.mediaInputs.map(m => m.key);
    assert.ok(inputs.includes(ve.role),
        `flowChatterBox.mediaInputs must still carry "${ve.role}"`);
});

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
