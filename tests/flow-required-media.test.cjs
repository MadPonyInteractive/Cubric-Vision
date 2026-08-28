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
 * the law has to allow: its voice slot is legitimately optional, so the law is the PAIR —
 * a slot the graph BLOCKS on must not opt out of the guard.
 *
 * 🔴 WHY DramaBox IS EXEMPT, stated correctly (a claim audit caught this stated wrong
 * on 2026-08-28, in this file and in commit b39ebe06's message). It is NOT that its
 * loader carries `block_if_empty: false` — `MpiLoadAudio#11` carries **true**, same as
 * everyone else. It is exempt because of LAZINESS: `Input_Audio` is an `MpiString`
 * (#13) whose only consumer is `MpiAnyChecker#14`, and #14's boolean drives
 * `MpiIfElse#15` between two samplers — #9 takes a `voice_ref`, #10 does not. Empty
 * slot -> false arm -> #10, which never requests the loader, so the blocker never
 * fires. The flag is real and simply unreachable.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

/**
 * Is the node the app INJECTS INTO itself a blocking loader, or does it feed one
 * directly?
 *
 * The flag sits on the LOADER, which is not always the node carrying the title — a
 * role can arrive as an `MpiString` path that a loader one hop downstream consumes
 * (`Input_Audio_2` did exactly that until the VC arm was stripped). So: check the
 * titled node, then its direct consumers.
 *
 * 🔴 IT DOES NOT MODEL LAZINESS, and must not be read as "the run will block".
 * `MpiIfElse` declares its arms lazy, so a loader on an untaken branch never executes
 * and its `block_if_empty` never fires however it is set. DramaBox is exactly that
 * shape and the case below pins it by its real mechanism rather than by this walk.
 * One hop is deliberate: it is the distance between an injected path and the loader
 * that reads it. Going deeper would start crossing forks and answering a different,
 * much harder question.
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

test('DramaBox stays optional, and the FORK is what makes it so', async () => {
    // The counter-example that keeps the law honest. If someone "fixes" DramaBox by
    // marking its voice required, the flow's whole pitch — describe a speaker in words
    // and get a voice built from nothing — becomes unreachable.
    //
    // Asserted on the WIRING, not on a flag. The exemption is the lazy fork, so that is
    // what has to still be there; `MpiLoadAudio#11` carries `block_if_empty: true` like
    // every other loader and would block if the branch were ever taken with an empty
    // path. Rewire the fork away and this flow starts failing silently.
    const flowsMod = await esm('js/data/flowsRegistry.js');
    const cmdMod = await esm('js/data/commandRegistry.js');
    const flow = (flowsMod.FLOWS || flowsMod.flows).find(f => f.id === 'drama-box');
    const COMMANDS = cmdMod.COMMANDS || cmdMod.commands || cmdMod.default;

    const graph = JSON.parse(fs.readFileSync(repo('comfy_workflows/' + flow.workflow), 'utf8'));
    const slot = COMMANDS[flow.operation].mediaInputs.find(m => m.key === 'audio1');

    assert.strictEqual(slot.required, false,
        'DramaBox\'s voice is genuinely optional and must stay declared that way');

    const entry = Object.entries(graph).find(
        ([, n]) => (n._meta?.title || '').toLowerCase() === slot.title.toLowerCase());
    assert.ok(entry, `drama-box must carry a node titled "${slot.title}"`);
    const [stringId] = entry;

    // The injected path reaches a presence CHECK, never a loader directly.
    const consumers = Object.entries(graph).filter(([, n]) =>
        Object.values(n.inputs || {}).some(v => Array.isArray(v) && String(v[0]) === stringId));
    assert.deepStrictEqual(consumers.map(([, n]) => n.class_type), ['MpiAnyChecker'],
        'the voice path must feed ONLY an MpiAnyChecker — a loader here would block the run');
    const [checkerId] = consumers[0];

    // ...whose boolean picks between two samplers, exactly one of which wants a voice.
    const ifElse = Object.values(graph).find(n => n.class_type === 'MpiIfElse'
        && Array.isArray(n.inputs?.boolean) && String(n.inputs.boolean[0]) === checkerId);
    assert.ok(ifElse, 'an MpiIfElse must fork on the checker — that fork IS the exemption');

    const arms = ['true', 'false'].map(k => graph[String(ifElse.inputs[k][0])]);
    assert.deepStrictEqual(arms.map(n => n.class_type), ['DramaBoxSampler', 'DramaBoxSampler']);
    assert.deepStrictEqual(arms.map(n => 'voice_ref' in n.inputs), [true, false],
        'the true arm takes a voice_ref and the false arm must not — the false arm is the '
        + 'prompt-only route, and it is what runs when the slot is left empty');
});
