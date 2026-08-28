/**
 * flow-required-media.test.cjs — MPI-607.
 *
 * THE PAIR THAT MAKES A RUN VANISH. An `MpiLoad*` node with `block_if_empty: true`
 * returns an `ExecutionBlocker` when its path is empty: the graph produces zero output
 * and ComfyUI reports **success**. Nothing in the flow UI stops a user reaching that —
 * every media slot renders as optional, because `upto` is the only media mode there is.
 *
 * What stands in the way is `required` on the op's media slot. `_findMissingMediaSlot`
 * (js/services/generationService.js) reads it at enqueue AND again at dispatch, and
 * raises "Add an image/video/audio file before generating". A slot declaring
 * `required: false` opts OUT of that guard — and an ABSENT `required` already means
 * required, so `false` is never accidental, it is always a deliberate opt-out.
 *
 * Nine of the twelve shipped flows had opted out of a guard their graph depended on
 * (2026-08-28). This test is the sweep, frozen: every flow, every slot, every graph.
 *
 * IT IS DELIBERATELY NOT "every slot must be required". DramaBox is the counter-example
 * the law has to allow — its loader carries `block_if_empty: false`, which is exactly
 * how its prompt-only arm works, so its slot is legitimately optional. The law is the
 * PAIR: a slot the graph BLOCKS on must not opt out of the guard.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

/**
 * Does an empty `title` block this graph?
 *
 * The flag sits on the LOADER, which is not always the node carrying the title — a
 * role can arrive as an `MpiString` path that a loader one hop downstream consumes
 * (`Input_Audio_2` did exactly that until the VC arm was stripped). So: check the
 * titled node, then its consumers.
 */
function blocksWhenEmpty(graph, title) {
    const entry = Object.entries(graph).find(
        ([, n]) => (n._meta?.title || '').toLowerCase() === String(title).toLowerCase());
    if (!entry) return false;                       // no such node — nothing to block
    const [id, node] = entry;
    if (typeof node.inputs?.block_if_empty === 'boolean') return node.inputs.block_if_empty;

    for (const consumer of Object.values(graph)) {
        const feeds = Object.values(consumer.inputs || {})
            .some(v => Array.isArray(v) && String(v[0]) === id);
        if (feeds && typeof consumer.inputs?.block_if_empty === 'boolean') {
            return consumer.inputs.block_if_empty;
        }
    }
    return false;
}

test('no flow can dispatch a run its own graph will silently block', async () => {
    const flowsMod = await esm('js/data/flowsRegistry.js');
    const cmdMod = await esm('js/data/commandRegistry.js');
    const FLOWS = flowsMod.FLOWS || flowsMod.flows || flowsMod.default;
    const COMMANDS = cmdMod.COMMANDS || cmdMod.commands || cmdMod.default;

    const holes = [];
    let checked = 0;

    for (const flow of FLOWS) {
        if (!flow.workflow) continue;
        const file = repo(path.join('comfy_workflows', flow.workflow));
        if (!fs.existsSync(file)) continue;         // a flow whose graph is not baked yet
        const graph = JSON.parse(fs.readFileSync(file, 'utf8'));

        for (const slot of (COMMANDS[flow.operation]?.mediaInputs || [])) {
            if (!blocksWhenEmpty(graph, slot.title)) continue;
            checked++;
            if (slot.required === false) {
                holes.push(`${flow.id}.${slot.key} (${flow.operation}, ${slot.title})`);
            }
        }
    }

    // Guards the guard: if the walk ever stops finding blocking slots — a renamed
    // flag, a moved workflow directory — this test would pass by checking nothing.
    assert.ok(checked >= 10,
        `only ${checked} blocking slots found; the block_if_empty walk has drifted`);

    assert.deepStrictEqual(holes, [],
        'these slots block the graph when empty but declare `required: false`, which opts '
        + 'out of the missing-media toast — the run then reports success and produces '
        + 'nothing:\n  ' + holes.join('\n  '));
});

test('DramaBox stays optional — its prompt-only arm depends on it', async () => {
    // The counter-example that keeps the law honest. If someone "fixes" DramaBox by
    // marking its voice required, the flow's whole pitch — describe a speaker in words
    // and get a voice built from nothing — becomes unreachable.
    const flowsMod = await esm('js/data/flowsRegistry.js');
    const cmdMod = await esm('js/data/commandRegistry.js');
    const flow = (flowsMod.FLOWS || flowsMod.flows).find(f => f.id === 'drama-box');
    const COMMANDS = cmdMod.COMMANDS || cmdMod.commands || cmdMod.default;

    const graph = JSON.parse(fs.readFileSync(repo('comfy_workflows/' + flow.workflow), 'utf8'));
    const slot = COMMANDS[flow.operation].mediaInputs.find(m => m.key === 'audio1');

    assert.strictEqual(blocksWhenEmpty(graph, slot.title), false,
        'DramaBox\'s voice loader must NOT block when empty — the graph forks on the slot');
    assert.strictEqual(slot.required, false,
        'DramaBox\'s voice is genuinely optional and must stay declared that way');
});
