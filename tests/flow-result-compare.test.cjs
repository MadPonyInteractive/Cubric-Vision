/**
 * flow-result-compare.test.cjs — MPI-585.
 *
 * `result: { compare: '<role>' }` is how a Flow asks for the shared before/after
 * surface instead of a plain result element. The role names which INPUT is the
 * "before", and MpiBaseFlow resolves it against the live media slots.
 *
 * The failure this pins is silent by construction: a role the flow does not
 * actually collect resolves to nothing, and the frame's own fallback then paints
 * the plain element — a working-looking result pane with no compare in it, and no
 * error anywhere. A typo'd or renamed role is exactly that bug, so the
 * declaration is checked against the flow's own inputSchema here.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

async function flows() {
    const mod = await esm('js/data/flowsRegistry.js');
    const list = mod.FLOWS || mod.flows || mod.default;
    assert.ok(Array.isArray(list), 'flowsRegistry must export an array of FlowDefs');
    return list;
}

test('every declared result.compare names a role the flow actually collects', async () => {
    for (const flow of await flows()) {
        const role = flow.result?.compare;
        if (!role) continue;
        const roles = (flow.inputSchema?.media || []).flatMap(g => g.roles || []);
        assert.ok(
            roles.includes(role),
            `flow "${flow.id}" declares result.compare "${role}" but collects only [${roles.join(', ')}] — ` +
            'the compare surface would silently fall back to a plain result',
        );
    }
});

test('result.compare is a string when present, and result carries nothing else', async () => {
    for (const flow of await flows()) {
        if (!flow.result) continue;
        assert.strictEqual(typeof flow.result, 'object', `flow "${flow.id}": result must be an object`);
        const keys = Object.keys(flow.result);
        assert.deepStrictEqual(
            keys, ['compare'],
            `flow "${flow.id}": result accepts only \`compare\` today — got [${keys.join(', ')}]`,
        );
        assert.strictEqual(
            typeof flow.result.compare, 'string',
            `flow "${flow.id}": result.compare must be a media role string`,
        );
    }
});

test('ltx-upscale compares against its source video', async () => {
    const upscale = (await flows()).find(f => f.id === 'ltx-upscale');
    assert.ok(upscale, 'ltx-upscale flow must exist');
    // The role bends to the shared op's mediaInputs key, not the `video1` its
    // sibling flows use — see the FlowDef comment.
    assert.strictEqual(upscale.result?.compare, 'inputVideo');
});

test('head-swap compares against the plate it KEEPS, not the head donor', async () => {
    const swap = (await flows()).find(f => f.id === 'head-swap');
    assert.ok(swap, 'head-swap flow must exist');
    // `image2` only donates a head and shares no framing with the output — comparing
    // against it would put two unrelated pictures either side of the bar.
    assert.strictEqual(swap.result?.compare, 'image1');
});

test('the flows that deliberately DECLINE a comparison still do', async () => {
    // Not bookkeeping: both are cases where a reveal bar actively misleads, so a
    // future "every flow should have one" sweep has to argue with this test first.
    // ltx-extend's output is LONGER than its source (the bar would compare two
    // different moments); ltx-foley returns the same pixels and only adds audio.
    for (const id of ['ltx-extend', 'ltx-foley']) {
        const flow = (await flows()).find(f => f.id === id);
        assert.ok(flow, `${id} flow must exist`);
        assert.strictEqual(
            flow.result?.compare, undefined,
            `${id} must NOT declare a comparison — see docs/playbooks/add-flow/04 § The result pane`,
        );
    }
});
