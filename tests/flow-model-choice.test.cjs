/**
 * flow-model-choice.test.cjs — MPI-590.
 *
 * A Flow declares its models as SLOTS — one role its graph plays a model in
 * (`requiredModels: [{ label: 'Base model', models: ['krea2','krea2-nsfw'] }, 'klein-4b']`) —
 * and the user picks a candidate per slot. The failure mode this guards is a picker that
 * RENDERS, SAVES, and CHANGES NOTHING: the badge flips, the dropdown remembers, and the
 * graph still loads the baked transformer — because injection matches node TITLES and
 * silently skips a param with no matching node. That is the same silent shape as the
 * MPI-504 LoRA rack (slots saved, image identical) and MPI-242's `Input_Batch` typo.
 *
 * MPI-599 widened it to N slots x N candidates and made the picker appear with NOTHING
 * installed, so the user chooses what downloads. Two of its assertions deliberately
 * REVERSE MPI-590 behaviour — an uninstalled candidate is offered, and a pick outlives its
 * candidate being uninstalled — so a failure there is a contract change, not a bug.
 *
 * So the assertions come in two halves:
 *   1. BEHAVIOUR — the real modules, imported bare (docs/testing-harnesses.md): does an
 *      any-of set actually satisfy the gate, and does the pick change the resolved params?
 *   2. ANCHORING — do those params name titles that EXIST in the flow's own workflow, and
 *      do their values match the dep filenames / the twin graph they were copied from?
 *      A behaviour test alone passes happily while injecting into thin air.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = p => JSON.parse(read(p));

const FLOW_ID = 'character-sheet';
const SFW = 'krea2';
const NSFW = 'krea2-nsfw';

// The browser modules import cleanly under bare Node; `state` is a plain Proxy there,
// so installed-model sets can be staged by assigning the top-level key.
async function load() {
    const { state } = await import('../js/state.js');
    const registry = await import('../js/data/flowsRegistry.js');
    return { state, registry };
}

// THE MULTI-SLOT MACHINERY HAS NO SHIPPED FLOW LEFT (MPI-628). The Character Sheet was
// the last two-slot flow and carried these tests as a real fixture; its head-removal phase
// is now a mask subtraction, not a Klein edit, so its second slot is gone. Every shipped
// flow declares exactly one.
//
// The machinery itself stays — `flowModelChoices` / per-slot picks / per-phase racks are
// live code, and MPI-586's Prop Sheet needs the same shape — so the coverage moves to a
// synthetic flow rather than being deleted with the slot that happened to exercise it.
// That also stops the next flow re-shape from breaking these tests again, which is what
// just happened. The push/splice pattern is the one 'picks are PER SLOT' already used.
//
// `loras: true` on both slots and a `modelParams` arm per candidate, because the rack and
// the params are two of the things under test.
const TWO_SLOT_FIXTURE = {
    id: 'two-slot-fixture',
    requiredModels: [
        { label: 'Render model', models: [SFW, NSFW], loras: true },
        { label: 'Blend model', models: ['klein-4b', 'klein-9b'], loras: true },
    ],
    modelParams: {
        [SFW]: { 'Input_Base_Model': 'krea2_raw_int8_convrot.safetensors' },
        [NSFW]: { 'Input_Base_Model': 'lustify-v10-krea-raw-int8_convrot.safetensors' },
        'klein-4b': { 'Input_Edit_Model': 'flux-2-klein-4b-int8-convrot.safetensors' },
        'klein-9b': { 'Input_Edit_Model': 'flux-2-klein-9b-int8-convrot.safetensors' },
    },
};

// Registered for the duration of the callback and removed in `finally` — a throw inside
// must not leave every later test running against a phantom flow.
async function withTwoSlotFlow(registry, fn) {
    assert.equal(registry.getFlowById(TWO_SLOT_FIXTURE.id), null,
        'fixture id must not collide with a real flow');
    registry.FLOWS.push(TWO_SLOT_FIXTURE);
    try {
        return await fn(TWO_SLOT_FIXTURE, TWO_SLOT_FIXTURE.id);
    } finally {
        registry.FLOWS.splice(registry.FLOWS.indexOf(TWO_SLOT_FIXTURE), 1);
    }
}

test('an any-of set is satisfied by EITHER member', async () => {
    const { state, registry } = await load();

    // The real Character Sheet still proves the one-slot half — that is the shipped shape.
    const sheet = registry.getFlowById(FLOW_ID);
    state.s_installedModelIds = [NSFW];
    assert.equal(registry.flowAvailability(sheet).available, true,
        'the NSFW bake alone must satisfy the sheet — the whole point is not asking for a second 12.25GB base');
    assert.deepEqual(registry.flowModelIds(sheet), [NSFW]);

    state.s_installedModelIds = [SFW];
    assert.equal(registry.flowAvailability(sheet).available, true);
    assert.deepEqual(registry.flowModelIds(sheet), [SFW]);

    await withTwoSlotFlow(registry, (flow) => {
        state.s_installedModelIds = [NSFW, 'klein-4b'];
        assert.equal(registry.flowAvailability(flow).available, true);
        assert.deepEqual(registry.flowModelIds(flow), [NSFW, 'klein-4b']);

        // A slot with no installed member still names ONE id to install, or the Install
        // button has nothing to start.
        state.s_installedModelIds = ['klein-4b'];
        const { available, missing } = registry.flowAvailability(flow);
        assert.equal(available, false);
        assert.equal(missing.length, 1, 'one unsatisfied slot must produce exactly one missing id');
    });
});

test('a single-id flow gates exactly as before', async () => {
    const { state, registry } = await load();
    state.s_installedModelIds = [];
    for (const flow of registry.listFlows()) {
        const plain = (flow.requiredModels || []).filter(e => typeof e === 'string');
        assert.deepEqual(
            registry.flowModelIds(flow).filter(id => plain.includes(id)),
            plain,
            `${flow.id}: plain string entries must resolve to themselves`,
        );
    }
});

test('every slot is labelled, and a one-candidate slot needs no picker', async () => {
    const { state, registry } = await load();
    state.s_installedModelIds = [];
    for (const flow of registry.listFlows()) {
        for (const slot of registry.flowModelSlots(flow)) {
            assert.ok(slot.label, `${flow.id}: a slot with no label renders a blank field label`);
            assert.ok(Array.isArray(slot.models) && slot.models.length,
                `${flow.id}: an empty slot resolves to undefined and gates on nothing`);
        }
        // A choosable slot is a slot with a real choice in it. Everything else is answered.
        assert.deepEqual(
            registry.flowModelChoices(flow).map(s => s.models.length > 1),
            registry.flowModelChoices(flow).map(() => true),
            `${flow.id}: a one-candidate slot must not produce a dropdown`,
        );
    }
});

test('the picker offers UNINSTALLED candidates too — that is how the user picks what downloads', async () => {
    // MPI-599. The old contract filtered to installed members, so the user with NOTHING
    // installed got no picker and silently downloaded models[0]. That user is the one the
    // picker is for: the choice only exists before the 12.25GB lands.
    const { state, registry } = await load();

    await withTwoSlotFlow(registry, (flow) => {
        state.s_installedModelIds = [];
        // `index` is the slot's ORIGINAL position in requiredModels, carried through the
        // single-candidate filter because the phase number is that index (MPI-608). `loras`
        // is the per-slot rack opt-in.
        assert.deepEqual(registry.flowModelChoices(flow), [
            { label: 'Render model', models: [SFW, NSFW], loras: true, index: 0, recommended: SFW },
            { label: 'Blend model', models: ['klein-4b', 'klein-9b'], loras: true, index: 1, recommended: 'klein-4b' },
        ], 'nothing installed must still offer both candidates of BOTH slots, each with its recommendation');

        state.s_installedModelIds = [SFW, 'klein-4b'];
        assert.deepEqual(registry.flowModelChoices(flow).map(s => s.models),
            [[SFW, NSFW], ['klein-4b', 'klein-9b']],
            'holding one candidate must not hide the other — that is how the second gets installed');

        // The recommendation is declaration order, not install state: it must not drift to
        // whatever the user happens to have.
        state.s_installedModelIds = [NSFW, 'klein-4b'];
        assert.equal(registry.flowModelChoices(flow)[0].recommended, SFW);
    });
});

test('a pick for an UNINSTALLED candidate drives the install, not just the label', async () => {
    // The pick has to reach flowModelIds, or the Required-models row, the install keys and
    // the Install button all keep describing the candidate the user just rejected.
    const { state, registry } = await load();

    await withTwoSlotFlow(registry, (flow, id) => {
        state.s_installedModelIds = ['klein-4b'];
        registry.setFlowModel(id, NSFW);
        assert.deepEqual(registry.flowModelIds(flow), [NSFW, 'klein-4b']);
        assert.deepEqual(registry.flowAvailability(flow).missing, [NSFW],
            'the Install button must fetch the PICKED candidate, not the default');

        // And picking one you do not have while holding the other is the deliberate trade
        // (MPI-599): the flow goes unavailable until it downloads. Session-only, one click back.
        state.s_installedModelIds = [SFW, 'klein-4b'];
        registry.setFlowModel(id, NSFW);
        assert.equal(registry.flowAvailability(flow).available, false);
        registry.setFlowModel(id, SFW);
        assert.equal(registry.flowAvailability(flow).available, true);
    });
});

test('the pick reaches the params and the LoRA rack', async () => {
    const { state, registry } = await load();

    await withTwoSlotFlow(registry, (flow, id) => {
        state.s_installedModelIds = [SFW, NSFW, 'klein-4b'];

        // The rack is keyed by PHASE now, not by a flow-level `settingsModel` (MPI-608), but
        // the property under test is unchanged: it must follow the PICKED member, or the user
        // on the NSFW arm edits the SFW card's rack and gets no LoRAs at all, silently.
        registry.setFlowModel(id, NSFW);
        assert.deepEqual(registry.flowLoraPhases(flow),
            [{ phase: 1, modelId: NSFW }, { phase: 2, modelId: 'klein-4b' }],
            'the phase-1 rack must follow the pick, or the NSFW arm edits the SFW rack');
        const nsfwParams = registry.flowModelParams(flow);

        registry.setFlowModel(id, SFW);
        const sfwParams = registry.flowModelParams(flow);
        assert.notDeepEqual(nsfwParams, sfwParams,
            'if both arms resolve to the same params the picker is a no-op');
        assert.deepEqual(registry.flowLoraPhases(flow),
            [{ phase: 1, modelId: SFW }, { phase: 2, modelId: 'klein-4b' }]);

        // An id that is not a candidate in any slot must not shadow the resolution order.
        registry.setFlowModel(id, 'qwen-edit');
        assert.deepEqual(registry.flowLoraPhases(flow),
            [{ phase: 1, modelId: SFW }, { phase: 2, modelId: 'klein-4b' }]);
    });
});

test('picks are PER SLOT — a second pick must not overwrite the first', async () => {
    // MPI-599. The store was one id per flow, which worked only while exactly one slot was
    // choosable. A flow that picks a render model AND an edit model needs both picks to
    // survive, and the failure is silent: the graph quietly runs the other phase on its
    // baked default. No shipped flow has two choosable slots yet — the scribble flow is the
    // first — so the fixture is registered for the duration of this test and removed in
    // `finally`, or a throw here leaves every later test running against a phantom flow.
    const { state, registry } = await load();
    const FIXTURE = {
        id: 'two-slot-fixture',
        requiredModels: [
            { label: 'Image model', models: [SFW, NSFW] },
            { label: 'Edit model', models: ['klein-4b', 'qwen-edit'] },
        ],
    };
    assert.equal(registry.getFlowById(FIXTURE.id), null, 'fixture id must not collide with a real flow');
    registry.FLOWS.push(FIXTURE);
    try {
        state.s_installedModelIds = [SFW, NSFW, 'klein-4b', 'qwen-edit'];
        assert.deepEqual(registry.flowModelIds(FIXTURE), [SFW, 'klein-4b'],
            'an untouched picker resolves every slot to its recommendation');
        assert.deepEqual(registry.flowModelChoices(FIXTURE).map(s => s.label), ['Image model', 'Edit model'],
            'each slot carries its own field label — two fields reading "Model" say nothing');

        registry.setFlowModel(FIXTURE.id, NSFW);
        registry.setFlowModel(FIXTURE.id, 'qwen-edit');
        assert.deepEqual(registry.flowModelIds(FIXTURE), [NSFW, 'qwen-edit'],
            'the second pick overwrote the first — the image-model phase silently reverted');

        // Re-picking within ONE slot replaces that slot's pick and leaves the other alone.
        registry.setFlowModel(FIXTURE.id, SFW);
        assert.deepEqual(registry.flowModelIds(FIXTURE), [SFW, 'qwen-edit']);
    } finally {
        registry.FLOWS.splice(registry.FLOWS.indexOf(FIXTURE), 1);
    }
});

test('a pick survives its candidate being uninstalled, per slot', async () => {
    const { state, registry } = await load();

    await withTwoSlotFlow(registry, (flow, id) => {
        state.s_installedModelIds = [SFW, NSFW, 'klein-4b'];

        registry.setFlowModel(id, NSFW);
        state.s_installedModelIds = [SFW, 'klein-4b'];
        // Deliberate reversal of the MPI-590 behaviour: the pick is a statement of intent, so
        // it holds and the flow asks for the model back. The user un-asks by picking the other.
        assert.deepEqual(registry.flowModelIds(flow), [NSFW, 'klein-4b']);
        registry.setFlowModel(id, SFW);
        assert.deepEqual(registry.flowModelIds(flow), [SFW, 'klein-4b']);
    });
});

test('every modelParams title EXISTS in the flow workflow', async () => {
    const { registry } = await load();
    for (const flow of registry.listFlows()) {
        if (!flow.modelParams) continue;
        const graph = readJson(`comfy_workflows/${flow.workflow}`);
        const titles = new Set(Object.values(graph)
            .map(n => (n?._meta?.title || '').toLowerCase())
            .filter(Boolean));
        const members = new Set(registry.flowModelSlots(flow).flatMap(s => s.models));

        for (const [modelId, params] of Object.entries(flow.modelParams)) {
            assert.ok(members.has(modelId),
                `${flow.id}: modelParams names "${modelId}", which is in no requiredModels slot`);
            for (const key of Object.keys(params)) {
                const title = key.split('.')[0].toLowerCase();
                assert.ok(titles.has(title),
                    `${flow.id}: "${key}" has no node titled "${title}" in ${flow.workflow} — ` +
                    'injection matches titles and skips a miss in SILENCE, so this would be a dead pick');
            }
        }
    }
});

test('the Character Sheet arms match the weights and the twin graph', async () => {
    const { state, registry } = await load();
    const flow = registry.getFlowById(FLOW_ID);
    const { DEPS } = await import('../js/data/modelConstants/dependencies.js');
    const basename = depId => path.basename(DEPS[depId].filename);

    const sheet = readJson('comfy_workflows/flow_character_sheet.json');
    const byTitle = t => Object.values(sheet).find(n => n?._meta?.title === t);
    const loader = byTitle('Input_Base_Model');
    assert.ok(loader && loader.class_type === 'UNETLoader',
        'the RENDER phase must carry its own injectable UNETLoader — hardcoded, it cannot follow a pick');

    state.s_installedModelIds = [SFW, NSFW, 'klein-4b', 'klein-9b'];

    registry.setFlowModel(FLOW_ID, SFW);
    assert.equal(registry.flowModelParams(flow).Input_Base_Model, basename('krea2-raw-transformer'));
    assert.equal(registry.flowModelParams(flow).Input_Base_Model, loader.inputs.unet_name,
        'the SFW arm must restate the graph\'s own baked weight, or the default silently changes');

    registry.setFlowModel(FLOW_ID, NSFW);
    const params = registry.flowModelParams(flow);
    assert.equal(params.Input_Base_Model, basename('krea2-raw-transformer-nsfw'));

    // The bypass LoRA is the second half of the bake. The shipped NSFW twin graph is the
    // reference: whatever strength it bakes is what the NSFW arm must inject here.
    const twin = readJson('comfy_workflows/krea2_t2i_nsfw.json');
    const twinBypass = Object.values(twin).find(n => n?._meta?.title === 'Input_Bypass_Filter_Lora');
    assert.equal(
        params['Input_Bypass_Filter_Lora.strength_model'],
        twinBypass.inputs.strength_model,
        'running lustify with the SFW bypass still applied is a half-switched model',
    );

    // THE BLEND SLOT IS GONE (MPI-628). The head removal was a Klein edit pass — a second
    // checkpoint with its own CLIP and VAE, loaded mid-run to paint studio grey. It is now
    // a BiRefNet subject matte minus the SAM3 head mask, composited onto a flat plate, so
    // there is no second model to choose and no second loader to inject into.
    //
    // Asserted as an ABSENCE because a leftover `Input_Edit_*` title is the silent kind of
    // wrong: injection matches titles and skips a miss without a word, so a descriptor that
    // still named these would read as wired and write nothing.
    for (const title of ['Input_Edit_Model', 'Input_Edit_Clip']) {
        assert.equal(byTitle(title), undefined,
            `${title} survives in the graph — the Klein blend pass was removed in MPI-628`);
    }
    for (const id of ['klein-4b', 'klein-9b']) {
        assert.ok(!(flow.modelParams || {})[id],
            `modelParams still carries an arm for ${id}, which is in no slot any more`);
    }
    assert.deepEqual(registry.flowModelSlots(flow).length, 1,
        'the sheet declares ONE slot now — the render model');

    // The render pick still stands after all of that.
    assert.equal(registry.flowModelParams(flow).Input_Base_Model,
        basename('krea2-raw-transformer-nsfw'));
});

test('the Character Sheet fills its ONE LoRA rack, and no flat or phase-2 rack survives (MPI-628)', async () => {
    const { state, registry } = await load();
    const flow = registry.getFlowById(FLOW_ID);
    state.s_installedModelIds = [SFW, NSFW];
    registry.setFlowModel(FLOW_ID, SFW);

    // One slot, one rack owner. A slot that loses `loras` fails silently — the run
    // succeeds carrying none of the user's LoRAs.
    assert.deepEqual(registry.flowLoraPhases(flow), [{ phase: 1, modelId: SFW }],
        'the render phase must resolve to its slot\'s running model');

    // The graph has to carry the nodes that phase injects into, and must NOT also carry
    // the flat pre-MPI-608 titles: commandExecutor still emits `Lora_N` alongside
    // `Lora_Phase1_N`, so a graph holding both forms would take the phase-1 rack twice.
    // Phase 2's titles are the same hazard from the other direction — the rack UI is gone
    // with the slot, so a surviving node would take injections nothing declares.
    const sheet = readJson('comfy_workflows/flow_character_sheet.json');
    const titles = Object.values(sheet).map(n => n?._meta?.title);
    for (let i = 1; i <= 6; i += 1) {
        assert.ok(titles.includes(`Input_Lora_Phase1_${i}`), `missing Input_Lora_Phase1_${i}`);
        assert.ok(!titles.includes(`Input_Lora_Phase2_${i}`),
            `Input_Lora_Phase2_${i} survived — the blend slot it belonged to is gone (MPI-628)`);
        assert.ok(!titles.includes(`Input_Lora_${i}`),
            `flat Input_Lora_${i} survived — phase 1 would be injected twice`);
    }

    // The rack must be ONE chain off the render loader and end at what the sampler runs,
    // or the later slots are silently never applied.
    const rackIds = Object.entries(sheet)
        .filter(([, n]) => /^Input_Lora_Phase1_\d$/.test(n?._meta?.title || ''))
        .map(([id]) => id);
    assert.equal(rackIds.length, 6);

    // The property is ONE CHAIN ORIGINATING AT THE RENDER LOADER, walked rather than
    // asserted edge by edge, for two reasons. The graph chains the six in an order that is
    // not their title order — harmless, LoRA application is a stack — so a positional
    // assertion tests the export's accidents. And the baked `Input_Bypass_Filter_Lora`
    // sits between the loader and the rack, with room for more bakes later. What actually
    // fails silently is a rack node falling OUT of the chain: the run succeeds and that
    // slot's LoRA is simply never applied.
    const tail = rackIds.filter(id => !rackIds.some(o => sheet[o].inputs?.model?.[0] === id));
    assert.equal(tail.length, 1, 'the rack must be one chain, not a fork — each slot feeds the next');

    const seen = new Set();
    let cursor = sheet[tail[0]], hops = 0;
    while (cursor && hops < 30) {
        if (rackIds.includes(String(cursor.inputs?.model?.[0]))) seen.add(String(cursor.inputs.model[0]));
        if (!cursor.inputs?.model) break;
        cursor = sheet[cursor.inputs.model[0]];
        hops += 1;
    }
    seen.add(tail[0]);
    assert.equal(seen.size, 6, 'a rack node fell out of the chain — its LoRA would never be applied');
    assert.equal(cursor?._meta?.title, 'Input_Base_Model',
        'the rack chain must originate at the render loader');

    // The head removal is a MASK SUBTRACTION now, not a sampler pass. Asserted here
    // because this is the test that used to prove the opposite.
    assert.ok(!Object.values(sheet).some(n => n.class_type === 'LanPaint_KSampler'),
        'the LanPaint head-removal pass should be gone — MPI-628 replaced it with a matte');
    assert.ok(Object.values(sheet).some(n => n.class_type === 'RemoveBackground'),
        'the head removal now subtracts the head mask from a BiRefNet subject matte');
});

test('the Outpaint arms match the weights and the twin graph (MPI-594)', async () => {
    // Second any-of flow, same pair, same two differences — and the same silent failure
    // if either half drifts. Its UNETLoader was UNTITLED in the authored export, so this
    // also pins the title that was added to the raw graph for the pick to land on:
    // without it the dropdown changes the badge and the graph still loads krea2 SFW.
    const { state, registry } = await load();
    const flow = registry.getFlowById('outpaint');
    const { DEPS } = await import('../js/data/modelConstants/dependencies.js');
    const basename = depId => path.basename(DEPS[depId].filename);

    const graph = readJson('comfy_workflows/flow_outpaint.json');
    const loader = Object.values(graph).find(n => n?._meta?.title === 'Input_Base_Model');
    assert.ok(loader && loader.class_type === 'UNETLoader',
        'outpaint must carry ONE injectable UNETLoader — hardcoded, it cannot follow a pick');
    assert.equal(typeof loader.inputs.unet_name, 'string', 'unet_name must be a widget, not a link');

    state.s_installedModelIds = [SFW, NSFW];

    registry.setFlowModel('outpaint', SFW);
    assert.equal(registry.flowModelParams(flow).Input_Base_Model, basename('krea2-raw-transformer'));
    assert.equal(registry.flowModelParams(flow).Input_Base_Model, loader.inputs.unet_name,
        'the SFW arm must restate the graph\'s own baked weight, or the default silently changes');

    registry.setFlowModel('outpaint', NSFW);
    const params = registry.flowModelParams(flow);
    assert.equal(params.Input_Base_Model, basename('krea2-raw-transformer-nsfw'));

    const twin = readJson('comfy_workflows/krea2_t2i_nsfw.json');
    const twinBypass = Object.values(twin).find(n => n?._meta?.title === 'Input_Bypass_Filter_Lora');
    assert.equal(
        params['Input_Bypass_Filter_Lora.strength_model'],
        twinBypass.inputs.strength_model,
        'running lustify with the SFW bypass still applied is a half-switched model',
    );

    // Both members must actually be able to run THIS graph: it is an edit, and it loads
    // the identity-edit LoRA. A member missing either would gate green and fail inside
    // ComfyUI.
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    for (const id of [SFW, NSFW]) {
        const model = MODELS.find(m => m.id === id);
        assert.ok(model.supportedOps.includes('krea2Edit'), `${id} cannot edit`);
        assert.ok(model.dependencies.includes('krea2-lora-identity-edit'),
            `${id} does not ship the identity-edit LoRA this graph loads`);
    }
});

test('the injector can actually WRITE both arms', () => {
    // A title that exists is only half of it: the spray walks a fixed list of widget
    // names and writes nothing when the node's widget is not on it, and the
    // `Title.widget` form needs the dot branch to exist at all. Either missing, and the
    // param is accepted, matched, and dropped — silently, which is the whole risk here.
    const src = read('js/services/comfyController.js');
    assert.match(src, /'ckpt_name', 'model_name', 'unet_name'/,
        "UNETLoader's widget is `unet_name`; off the spray list, Input_Base_Model writes nothing");
    assert.match(src, /const dot = key\.indexOf\('\.'\);/,
        'Input_Bypass_Filter_Lora.strength_model needs the Title.widget branch, or it matches no node');

    // …and the target widgets must be WIDGETS, not wired inputs — the injector skips a
    // link rather than clobbering it (MPI-466).
    const sheet = readJson('comfy_workflows/flow_character_sheet.json');
    const loader = Object.values(sheet).find(n => n?._meta?.title === 'Input_Base_Model');
    const bypass = Object.values(sheet).find(n => n?._meta?.title === 'Input_Bypass_Filter_Lora');
    assert.equal(typeof loader.inputs.unet_name, 'string');
    assert.equal(typeof bypass.inputs.strength_model, 'number');
});

test('the Flow Library renders the picker and reads RESOLVED ids', () => {
    // Source assertions, like flow-lora-rack: standing the drawer up in Node costs more
    // than it proves, and the render half was probed live instead. What must not rot is
    // the wiring — a drawer that stops mounting the picker silently pins every user to
    // the first candidate, and one that reads `flow.requiredModels` raw renders a slot
    // object as a model row.
    const src = read('js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
    assert.match(src, /_mountModelChoice\(flow\);/, 'the picker is declared but never mounted');
    assert.match(src, /setFlowModel\(flow\.id, value\)/, 'the pick must be recorded, not just displayed');
    assert.ok(!/flow\.requiredModels/.test(src),
        'the drawer must resolve through flowModelIds — a raw read renders a slot object as a model row');

    // MPI-599: each dropdown wears its slot's own label, and the recommended candidate is
    // flagged. Both are silent when they rot — two fields reading "Model", or four SDXL
    // checkpoints with nothing to choose between them.
    assert.match(src, /mpi-detail__field-label">\$\{slot\.label\}/,
        'a slot must label its own field, or a multi-slot flow shows two identical "Model" rows');
    assert.match(src, /id === slot\.recommended \? \{ icon: 'sparkle', meta: 'Recommended' \}/,
        'the recommendation must be visible in the list, not just be the default value');
    assert.ok(!/disabled: !installed/.test(src),
        'an uninstalled candidate is pickable ON PURPOSE — disabling it removes the whole point');
});

test('flowService carries the resolved model into the run', () => {
    const src = read('js/services/flowService.js');
    assert.match(
        src,
        /injectionParams:\s*\{ \.\.\.flowModelParams\(flow\), \.\.\.\(inputs\.injectionParams \|\| \{\}\) \}/,
        'without this merge the pick never leaves the registry and the graph keeps its baked loader',
    );
    assert.match(
        src,
        /loraPhases:\s*flowLoraPhases\(flow\)/,
        'each phase\'s rack must follow the picked member, not the id the descriptor names',
    );
});

test('the Draw It In arm matches the weights, and the encoder moves with it (MPI-567)', async () => {
    // WAS two independent slots — an SDXL checkpoint for a render phase and a Klein model
    // for a blend phase. MPI-621 deleted the render phase outright, so there is ONE slot
    // and it is Klein 9B only. That is a correctness call, not a trim: under style load 4B
    // left the user's own drawn ink in the output, which is the worst failure available.
    //
    // A drifted filename here is silent — the title matches, the value is a name no loader
    // has, and ComfyUI reports "not in list" only if it is lucky.
    const { state, registry } = await load();
    const flow = registry.getFlowById('scribble-object');
    const { DEPS } = await import('../js/data/modelConstants/dependencies.js');
    const basename = depId => path.basename(DEPS[depId].filename);
    const graph = readJson('comfy_workflows/flow_draw_it_in.json');
    const byTitle = t => Object.values(graph).find(n => n?._meta?.title === t);

    state.s_installedModelIds = ['klein-4b', 'klein-9b'];

    assert.deepEqual(flow.requiredModels.map(s => s.models), [['klein-9b']],
        'ONE slot, 9B only — a second candidate here would reintroduce the ink-survival arm');
    assert.ok(!byTitle('Input_Base_Model'),
        'the SDXL render phase is deleted; a checkpoint loader left behind would be dead weight '
        + 'that the model picker no longer feeds');

    // Klein 9B needs qwen_3_8b_int8_convrot and 4B needs qwen_3_4b; pairing 9B with 4B's
    // encoder dies with a shape error that reads as a sampler bug (MPI-600). So the CLIP
    // moves WITH the checkpoint — on the arm AND in the bake.
    const unet = byTitle('Input_Edit_Model');
    const clip = byTitle('Input_Edit_Clip');
    assert.ok(unet && unet.class_type === 'UNETLoader', 'the edit phase needs an injectable UNETLoader');
    assert.ok(clip && clip.class_type === 'CLIPLoader',
        'the CLIPLoader must be TITLED — untitled, the arm cannot move the encoder at all');
    assert.equal(typeof clip.inputs.clip_name, 'string', 'clip_name must be a widget, not a link');

    registry.setFlowModel('scribble-object', 'klein-9b');
    const params = registry.flowModelParams(flow);
    assert.equal(params.Input_Edit_Model, basename('klein-9b-transformer'), 'wrong transformer');
    assert.equal(params['Input_Edit_Clip.clip_name'], basename('qwen3-8b-clip'),
        'the encoder must move with the checkpoint, or the arm dies on a shape error');

    // The arm and the bake must agree, or the default silently moves on a re-export.
    assert.equal(params.Input_Edit_Model, unet.inputs.unet_name);
    assert.equal(params['Input_Edit_Clip.clip_name'], clip.inputs.clip_name);
});

test('the CLIP arm has to be DOTTED, and the box has to go through its injector (MPI-567)', () => {
    // Two asymmetries in this flow that look untidy and are load-bearing. Both fail
    // silently if "cleaned up", which is exactly why they are pinned here.
    const src = read('js/services/comfyController.js');
    const targets = src.slice(src.indexOf('const targets = ['), src.indexOf("'filename'"));
    assert.ok(!/'clip_name'/.test(targets),
        'if clip_name JOINS the spray list this test is stale — but until it does, a plain '
        + 'Input_Edit_Clip matches the node and writes nothing');
    assert.match(src, /const dot = key\.indexOf\('\.'\);/,
        'Input_Edit_Clip.clip_name needs the Title.widget branch, or it matches no node');
});

test('two candidates sharing a NAME are told apart in the picker (MPI-567)', async () => {
    // The picker appends a sizeTier letter when, and only when, its own slot holds two
    // candidates with the same name. Klein USED to be that fixture: both cards were named
    // "FLUX.2 Klein" and the letter was the only thing telling 4B from 9B. It is not any
    // more — MPI-619 put the size in the name, because 4B and 9B are two models the public
    // knows by name and their LoRAs do not interchange (a 9B style LoRA on a 4B run binds
    // nothing and finishes green: MPI-614).
    //
    // The mechanism still matters for siblings that really ARE one model at two qualities,
    // so this test now runs on one of those instead of deleting the coverage.
    const { registry } = { registry: await import('../js/data/flowsRegistry.js') };
    const { sizeTierLetter, tierLetterFor, getModelById, MODELS } =
        await import('../js/data/modelRegistry.js');
    // MOVED TWICE. Off Draw It In 2026-08-25 (MPI-621) — it is Klein 9B ONLY now, and a
    // slot with one candidate is not a choice, so it has no dropdown to disambiguate — and
    // then off the character sheet 2026-08-27 (MPI-628), whose head-removal phase stopped
    // being a Klein edit at all. Scribble is the flow that still picks between the two
    // Klein cards. Found rather than hardcoded would be better, but the assertions below
    // name the two ids anyway, so a named flow is the honest form.
    const flow = registry.getFlowById('scribble');
    // `flowModelChoices`, not `flowModelSlots`: only the choices rows carry `recommended`,
    // and only a slot with a real choice in it gets a dropdown to disambiguate at all.
    const blend = registry.flowModelChoices(flow).find(s => s.models.includes('klein-9b'));

    // Klein must NOT be a clash any more. If this fails, someone reverted the rename and
    // reintroduced the trap MPI-614 documents.
    assert.notEqual(getModelById('klein-9b').name, getModelById('klein-4b').name,
        'the Klein cards must carry their size in the name — see MPI-619');
    assert.match(getModelById('klein-4b').name, /\b4B\b/, 'klein-4b must say 4B');
    assert.match(getModelById('klein-9b').name, /\b9B\b/, 'klein-9b must say 9B');

    // A real remaining clash keeps the letter honest. Found rather than hardcoded, so
    // renaming Boogu or LTX later re-points this instead of silently testing nothing.
    const groups = new Map();
    for (const m of MODELS) {
        if (!m.name) continue;
        if (!groups.has(m.name)) groups.set(m.name, []);
        groups.get(m.name).push(m);
    }
    const clashing = [...groups.values()].find(
        g => g.length > 1 && new Set(g.map(m => m.sizeTier)).size > 1);
    assert.ok(clashing,
        'no name clash left anywhere — the picker letter is now dead code, delete it');

    // Every ambiguous candidate must yield a NON-EMPTY letter, or the rows stay identical.
    for (const m of clashing) {
        assert.ok(sizeTierLetter(m.id),
            `${m.id} shares the name "${m.name}" and must carry a tier letter`);
    }

    // The install gate is the trap `sizeTierLetter` exists for: `tierLetterFor` blanks the
    // letter for a model that is not usable yet, and this picker exists to choose BEFORE
    // anything is installed. That gate is NOT asserted here on purpose — it reads
    // `model.installed` and the dep-status cache, neither of which a bare-Node harness
    // stages, so `tierLetterFor` answers 'B' here and an assertion would be testing the
    // harness. The source check below is what actually holds the line.
    void tierLetterFor;

    const src = read('js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
    assert.match(src, /sizeTierLetter\(id\)/,
        'the picker must append the tier letter, or two Klein rows read identically');
    // A CALL, not a mention — the comment beside `_label` names `tierLetterFor` to explain
    // why it is the wrong one, and a bare substring test flags its own documentation.
    assert.ok(!/[^e]tierLetterFor\s*\(/.test(src),
        'the install-gated helper here would hide the letter for the uninstalled candidate');

    // Declaration order IS preference order. The character sheet recommends 4B — that is
    // what the graph bakes and what every sheet has ever been judged on — so this asserts
    // the mechanism carries the FIRST entry through, whichever it is, rather than
    // hardcoding a preference this test does not own.
    assert.equal(blend.recommended, blend.models[0],
        'the recommendation must be the slot\'s first candidate');
});

test('an unpainted run FAILS CLOSED, and the box reaches Input_Box (MPI-567)', async () => {
    // The one obligation the frame cannot carry: with nothing drawn, the paint step
    // reports null, STEP_MEDIA derives no file, and Input_Paint keeps whatever its
    // `string` is baked to. Baked to an authoring path that would be a confident wrong
    // result with no error anywhere — so both loaders must bake EMPTY and block.
    const graph = readJson('comfy_workflows/flow_draw_it_in.json');
    for (const title of ['Input_Image', 'Input_Paint']) {
        const node = Object.values(graph).find(n => n?._meta?.title === title);
        assert.ok(node && node.class_type === 'MpiLoadImageFromPath', `${title} missing`);
        assert.equal(node.inputs.string, '',
            `${title} bakes a path — an unsupplied run would silently use the author's fixture`);
        assert.equal(node.inputs.block_if_empty, true,
            `${title} must block on empty, or the graph runs on a blank 1x1 image`);
    }

    // The box: an MpiBox carries four widgets, none on the spray list, so the flow's
    // `param: 'box1'` only lands because the op names the injector that knows the map.
    const box = Object.values(graph).find(n => n?._meta?.title === 'Input_Box');
    assert.ok(box && box.class_type === 'MpiBox', 'Input_Box must be an MpiBox');
    const { COMMANDS } = await import('../js/data/commandRegistry.js');
    assert.equal(COMMANDS.flowScribObj.injector, 'headSwap',
        'without an injector the box param matches the node and writes nothing');
    const { registry } = { registry: await import('../js/data/flowsRegistry.js') };
    const step = registry.getFlowById('scribble-object').steps.find(s => s.kind === 'box');
    assert.equal(step.param, 'box1',
        'box1 is the key headSwapInjector maps to input_box; box2 would reach nothing here');

    // The box step ghosts the drawing under its rectangle, and there is NO frame
    // contract behind that: it works only because both steps declare the SAME role,
    // so the frame's per-role merge (MpiBaseFlow ~1254) hands MpiStepBox a value that
    // still carries `paint`. Give them separate roles and the ghost silently vanishes
    // with every other assertion here still green — the user is back to boxing a
    // region on a bare photo, which is the state Fabio reported (MPI-567).
    const paintStep = registry.getFlowById('scribble-object').steps.find(s => s.kind === 'paint');
    assert.equal(paintStep.role, step.role,
        'paint and box must share a role or MpiStepBox never receives props.value.paint');
});

test('every ControlNet workflow shares ONE strength mapping (MPI-567)', () => {
    // A ControlNet's strength reaches the graph through a fixed chain:
    //   MpiFloat "Input_Control_strength" -> MpiNormalizeValue -> ControlNetApplyAdvanced
    // and `promptControlDefaults.js` states the house rule outright - the remap to 0-0.5
    // exists "because past ~0.5 those ControlNets artefact". The scribble flow shipped
    // mapping 0-1 -> 0-1 at end_percent 1 instead, so its slider reached DOUBLE the app's
    // maximum and held the steer to the final denoise step. Nothing failed; the renders
    // just came back with the drawn strokes rendered as physical edges, and the user found
    // it by eye. One knob that means two different things at the same number is the bug
    // this pins, so the assertion is a SWEEP - a new flow that diverges fails here.
    const dir = path.join(ROOT, 'comfy_workflows');
    const checked = [];

    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        let graph;
        try { graph = readJson(path.join('comfy_workflows', file)); } catch { continue; }
        if (!graph || typeof graph !== 'object') continue;

        const nodes = Object.entries(graph).filter(([, n]) => n && typeof n === 'object');
        const applies = nodes.filter(([, n]) => n.class_type === 'ControlNetApplyAdvanced');
        if (!applies.length) continue;

        for (const [id, apply] of applies) {
            // ControlNet must RELEASE before the end. Steering through the final steps is
            // what turns a stroke into a ridge - the model never gets to resolve texture.
            assert.ok(apply.inputs.end_percent <= 0.6,
                `${file} node ${id}: end_percent ${apply.inputs.end_percent} steers too late; `
                + 'every other ControlNet workflow releases at ~0.569');

            // Follow strength back; only assert where the user actually drives it.
            const src = apply.inputs.strength;
            if (!Array.isArray(src)) continue;
            const norm = graph[src[0]];
            if (!norm || norm.class_type !== 'MpiNormalizeValue') continue;
            const from = norm.inputs.value;
            const float = Array.isArray(from) ? graph[from[0]] : null;
            if (float?._meta?.title !== 'Input_Control_strength') continue;

            // NO EXCEPTIONS LEFT — and read the history before adding one.
            //
            // `flow_draw_it_in.json` held the only one, at 0.6, until MPI-621 rebuilt it
            // on a single Klein edit with no ControlNet at all. The exception is gone
            // because the graph it described is gone, NOT because the rule was relaxed.
            // The paragraphs below are kept whole: they are the bar a future flow has to
            // clear to earn one, and the reasoning is what makes 0.5 defensible.
            //
            // WHY 0.5 IS THE HOUSE NUMBER (Fabio, 2026-08-23): it is the minimum safe
            // ceiling across EVERY control type an SDXL card offers — not just scribble
            // and canny, but OPENPOSE and DEPTH, and those two are what set the floor.
            // "Passing 50 starts giving a lot of issues on open pose and depth." A t2i
            // workflow lets the user pick any of them behind one slider, so its ceiling
            // has to satisfy the weakest.
            //
            // WHY THIS FLOW MAY EXCEED IT: its graph CANNOT drive openpose or depth. It
            // hard-wires exactly two banks — `hed/pidi/scribble/ted` (node 14) and
            // `canny/lineart/anime_lineart/mlsd` (node 15) — behind a two-option radio,
            // and carries no pose or depth preprocessor anywhere. So it is not exempt
            // from the rule; the constraint the rule encodes simply does not reach it.
            //
            // WHERE 0.6 CAME FROM, measured live 2026-08-23: at 0.5 the flow did not
            // follow the drawing and Fabio had to force the subject through the prompt
            // (runs 1c5dd5b6 / bbe85266). 0.65 overshot — the doodle itself came through
            // in one generation, which is the old ink-as-edges failure. 0.6 is his call
            // between the two. `end_percent` stays 0.569 and the slider stays 0-1.
            //
            // KEEP THIS A NAMED EXCEPTION. Deleting the assertion, or widening it to a
            // range, is what this test exists to prevent: the bug it was written for was a
            // flow diverging SILENTLY. A new flow that wants its own ceiling has to come
            // here and say why — and the bar is the one above: show that its graph cannot
            // reach the control types the 0.5 floor protects.
            const CEILING = {};
            const expected = CEILING[file] ?? 0.5;

            assert.equal(norm.inputs.output_max, expected,
                `${file} node ${src[0]}: a user-driven Input_Control_strength must remap to `
                + `0-${expected}, or the same slider number means a different strength per workflow`);
            assert.equal(norm.inputs.input_max, 1,
                `${file} node ${src[0]}: the slider is 0-1 everywhere`);
            checked.push(file);
        }
    }

    // The sweep is worthless if it silently matched nothing. It used to anchor on the
    // scribble flow by name, because that was the workflow that diverged; MPI-621 deleted
    // its ControlNet, so the anchor is the SDXL family it was measured against.
    assert.ok(checked.some(f => f.startsWith('t2i_sdxl')),
        'the sweep must still reach the SDXL t2i workflows - they are where 0.5 was set');
    assert.ok(checked.length >= 5,
        `expected the SDXL family plus chroma, found ${checked.length}`);
});
