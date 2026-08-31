/**
 * flow-field-constraints.test.cjs — MPI-663.
 *
 * Stems is the first flow whose toggles constrain each other, and both rules fail
 * INVISIBLY if the evaluation is wrong:
 *
 *   - Every stem off is a run that blocks every branch, reports SUCCESS and lands no
 *     card at all — no error, no toast, nothing in the log (02-media-io.md § Self-gating
 *     is not the same as HANDLED). The frame locking the last active toggle is the only
 *     thing standing between a user and that.
 *   - "Combine into one file" with one stem selected means nothing; it must be greyed
 *     rather than silently doing nothing when pressed.
 *
 * `disabledFieldIds` is the pure half — the frame only paints what it returns — so this
 * pins the rule rather than the pixels. The FlowDef is checked against it so a renamed
 * group or a dropped `minActive` fails here rather than in front of a user.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const esm = p => import('file://' + path.join(__dirname, '..', p).replace(/\\/g, '/'));

const STEMS = ['Input_Get_Bass', 'Input_Get_Drums', 'Input_Get_Other', 'Input_Get_Vocals'];
const allOn = () => Object.fromEntries(STEMS.map(id => [id, true]));

async function stemsFlow() {
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const flow = flows.find(f => f.id === 'stems');
    assert.ok(flow, 'the stems FlowDef must exist');
    return flow;
}

test('the last selected stem cannot be turned off', async () => {
    const { disabledFieldIds } = await esm('js/utils/declaredFields.js');
    const flow = await stemsFlow();

    // All four on: every one can still be turned off.
    assert.deepEqual([...disabledFieldIds(flow.fields, { ...allOn(), combine: false })].sort(),
        [], 'nothing is locked while more than one stem is on');

    // Two on: still free — going to one is allowed, going to zero is what is not.
    const two = { Input_Get_Bass: true, Input_Get_Vocals: true };
    assert.equal(disabledFieldIds(flow.fields, two).has('Input_Get_Bass'), false);

    // One on: THAT one locks, and only that one. The three that are off stay live —
    // turning a stem ON can never break the floor.
    const one = { Input_Get_Vocals: true };
    const locked = disabledFieldIds(flow.fields, one);
    assert.equal(locked.has('Input_Get_Vocals'), true, 'the sole remaining stem must lock');
    for (const id of STEMS.filter(i => i !== 'Input_Get_Vocals')) {
        assert.equal(locked.has(id), false, `${id} is off — turning it on must stay possible`);
    }
});

test('combine is dead until there are two stems to combine', async () => {
    const { disabledFieldIds } = await esm('js/utils/declaredFields.js');
    const flow = await stemsFlow();

    assert.equal(disabledFieldIds(flow.fields, { Input_Get_Vocals: true }).has('combine'), true,
        'one stem: there is nothing to combine');
    assert.equal(
        disabledFieldIds(flow.fields, { Input_Get_Vocals: true, Input_Get_Drums: true }).has('combine'),
        false, 'two stems: combine is a real choice');
    assert.equal(disabledFieldIds(flow.fields, allOn()).has('combine'), false);
});

test('every icon a flow names actually exists', async () => {
    // `renderIcon` falls back to the `info` glyph for an unknown name and `buildField`
    // falls back to a tick — no error, no log. So a typo'd icon is a control wearing the
    // wrong picture forever, which nobody reports because it looks deliberate. This is
    // the same silent-skip family as an injection title with no node.
    const { ICONS } = await esm('js/utils/icons.js');
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;

    const declared = flows.flatMap(f => [
        ...(f.fields || []),
        ...(f.steps || []).flatMap(s => s.fields || []),
    ]).filter(x => x?.icon);

    assert.ok(declared.length, 'no flow declares an icon — the registry has drifted');
    for (const f of declared) {
        assert.ok(f.icon in ICONS,
            `field "${f.id}" names icon "${f.icon}", which is not in icons.js`);
    }
});

test('every preview asset a flow declares is actually on disk', async () => {
    // A declared-but-missing preview is a 404 in the Flow Library the moment it opens.
    // It cost a red CI run on this very card: `preview: 'flow-stems.webp'` was declared
    // before the art existed, and `tests/desktop/flows-tab-ring.spec.js` (which asserts
    // zero console errors) is what found it — four minutes into CI, not here.
    //
    // Omitting the key is the supported state, not a defect: MpiTileSheet renders a
    // placeholder gradient for a flow with no art yet. Naming a file that is not there
    // is the defect, so that is what this asserts.
    const fs = require('node:fs');
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    const dir = path.join(__dirname, '..', 'comfy_workflows', 'display');

    for (const flow of flows) {
        for (const key of ['preview', 'video']) {
            if (!flow[key]) continue;
            assert.ok(fs.existsSync(path.join(dir, flow[key])),
                `flow "${flow.id}" declares ${key} "${flow[key]}", which is not in comfy_workflows/display/`);
        }
    }
});

test('the stems FlowDef declares the constraints the frame paints', async () => {
    const flow = await stemsFlow();
    const byId = new Map(flow.fields.map(f => [f.id, f]));

    for (const id of STEMS) {
        const f = byId.get(id);
        assert.ok(f, `${id} must be declared`);
        assert.equal(f.group, 'stems', `${id} must be in the stems group or the floor does not apply to it`);
        assert.equal(f.minActive, 1, `${id} must carry the floor`);
        assert.equal(f.default, true, `${id} defaults on — a flow that returns nothing by default is not a flow`);
    }

    // `combine` must NOT be Input_-prefixed. A prefixed id routes into injectionParams and
    // names a graph node; there is no combine node — the mixing is done app-side with
    // ffmpeg — so a prefixed id would be silently skipped and the toggle would do nothing.
    const combine = byId.get('combine');
    assert.ok(combine, 'the combine toggle must be declared');
    assert.equal(/^input_/i.test(combine.id), false,
        'combine is an APP value, not a graph node — an Input_ prefix would silently do nothing');
    assert.deepEqual(combine.enabledWhen, { group: 'stems', atLeast: 2 });
    assert.equal(combine.default, false);
});

// ── MPI-664 — hiding, and a slider that reads as time ───────────────────────────

test('hiddenWhen takes a field off screen, and only when the rule says so', async () => {
    // MiniMax Music's Instrumental toggle. Hiding rather than greying, because a greyed
    // lyrics box still reads as a box the user failed to fill in — and because greying
    // reaches `setDisabled`, which a declared `text` field does not have.
    const { hiddenFieldIds } = await esm('js/utils/declaredFields.js');
    const fields = [
        { id: 'Input_Instrumental', type: 'toggle' },
        { id: 'Input_Lyrics', type: 'text', hiddenWhen: { field: 'Input_Instrumental', is: true } },
        { id: 'Input_Voice', type: 'select', hiddenWhen: { field: 'Input_Instrumental', is: true } },
        { id: 'positive', type: 'text' },
    ];

    assert.deepEqual([...hiddenFieldIds(fields, { Input_Instrumental: true })].sort(),
        ['Input_Lyrics', 'Input_Voice'], 'instrumental hides the lyrics and the voice');
    assert.deepEqual([...hiddenFieldIds(fields, { Input_Instrumental: false })], [],
        'vocals back on: everything returns');

    // A field with no rule is never hidden, and the TOGGLE never hides itself.
    assert.equal(hiddenFieldIds(fields, { Input_Instrumental: true }).has('positive'), false);
    assert.equal(hiddenFieldIds(fields, { Input_Instrumental: true }).has('Input_Instrumental'), false);

    // Exact equality, not truthiness: an unset value is not `false`, so a rule keyed on
    // `is: false` must not fire before the user has touched the control.
    const onFalse = [{ id: 'x', hiddenWhen: { field: 'flag', is: false } }];
    assert.equal(hiddenFieldIds(onFalse, {}).has('x'), false, 'undefined is not false');
    assert.equal(hiddenFieldIds(onFalse, { flag: false }).has('x'), true);
});

test('format: duration spells a slider out instead of showing bare seconds', async () => {
    const { formatDeclaredValue } = await esm('js/utils/declaredFields.js');
    const f = { format: 'duration' };

    assert.equal(formatDeclaredValue(f, 45), '45 seconds');
    assert.equal(formatDeclaredValue(f, 62), '1 minute 2 seconds');
    assert.equal(formatDeclaredValue(f, 180), '3 minutes');
    assert.equal(formatDeclaredValue(f, 60), '1 minute');
    assert.equal(formatDeclaredValue(f, 1), '1 second', 'singular, or it reads as broken');
    assert.equal(formatDeclaredValue(f, 0), '0 seconds');
    assert.equal(formatDeclaredValue(f, 300), '5 minutes');

    // No `format` is the untouched path — every existing slider still shows its number.
    assert.equal(formatDeclaredValue({}, 90), '90');
});

test('a voice roster serialises to the caption lines the graph reads', async () => {
    const { serialiseVoices, mapDeclaredValue } = await esm('js/utils/declaredFields.js');

    // MiniMax's own convention in the reference captions: `Singer A (Male)`.
    assert.equal(
        serialiseVoices([{ name: 'Singer A', type: 'Male' }, { name: 'The Choir', type: 'Choir' }]),
        'Singer A (Male)\nThe Choir (Choir)',
    );

    // The catch-all emits a BARE name. "Ana (Any)" in a caption states a vocal quality
    // the user never chose, and the model reads it as one.
    assert.equal(serialiseVoices([{ name: 'Ana', type: 'Any' }]), 'Ana');
    assert.equal(serialiseVoices([{ name: 'Ana', type: 'any' }]), 'Ana', 'case-insensitive');
    assert.equal(serialiseVoices([{ name: 'Ana', type: '' }]), 'Ana');

    // A half-added row must not reach the caption as an anonymous voice.
    assert.equal(
        serialiseVoices([{ name: '  ', type: 'Male' }, { name: 'Joe', type: 'Male' }]),
        'Joe (Male)',
    );

    // Nothing declared, nothing sent — never the string "undefined".
    assert.equal(serialiseVoices([]), '');
    assert.equal(serialiseVoices(undefined), '');
    assert.equal(serialiseVoices(null), '');

    // The serialisation must happen on the SHARED path, so the agent connector and the
    // widget cannot disagree about what the graph receives.
    assert.equal(
        mapDeclaredValue({ type: 'voices' }, [{ name: 'Singer A', type: 'Male' }]),
        'Singer A (Male)',
    );
    // Every other type is untouched by the new branch.
    assert.equal(mapDeclaredValue({ type: 'text' }, 'hello'), 'hello');
});

test('a new roster row is named uniquely, so a lyric reference stays unambiguous', async () => {
    const { nextVoiceName } = await esm('js/utils/declaredFields.js');

    assert.equal(nextVoiceName([]), 'Singer A');
    assert.equal(nextVoiceName([{ name: 'Singer A' }]), 'Singer B');
    // A gap is filled rather than skipped past.
    assert.equal(nextVoiceName([{ name: 'Singer B' }]), 'Singer A');
    // A user's own name for a voice still blocks the auto one that collides with it.
    assert.equal(nextVoiceName([{ name: 'singer a' }]), 'Singer B', 'case-insensitive');
    assert.equal(nextVoiceName([{ name: '  Singer A  ' }]), 'Singer B', 'trimmed');
    assert.equal(nextVoiceName(undefined), 'Singer A');
});
