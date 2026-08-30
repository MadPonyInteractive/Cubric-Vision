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
