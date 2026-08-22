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

test('an any-of set is satisfied by EITHER member', async () => {
    const { state, registry } = await load();
    const flow = registry.getFlowById(FLOW_ID);

    state.s_installedModelIds = [NSFW, 'klein-4b'];
    assert.equal(registry.flowAvailability(flow).available, true,
        'the NSFW bake alone must satisfy the sheet — the whole point is not asking for a second 12.25GB base');
    assert.deepEqual(registry.flowModelIds(flow), [NSFW, 'klein-4b']);

    state.s_installedModelIds = [SFW, 'klein-4b'];
    assert.equal(registry.flowAvailability(flow).available, true);
    assert.deepEqual(registry.flowModelIds(flow), [SFW, 'klein-4b']);

    // A slot with no installed member still names ONE id to install, or the Install
    // button has nothing to start.
    state.s_installedModelIds = ['klein-4b'];
    const { available, missing } = registry.flowAvailability(flow);
    assert.equal(available, false);
    assert.equal(missing.length, 1, 'one unsatisfied slot must produce exactly one missing id');
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
    const flow = registry.getFlowById(FLOW_ID);

    state.s_installedModelIds = [];
    assert.deepEqual(registry.flowModelChoices(flow),
        [{ label: 'Base model', models: [SFW, NSFW], recommended: SFW }],
        'nothing installed must still offer both, with the recommendation named');

    state.s_installedModelIds = [SFW, 'klein-4b'];
    assert.deepEqual(registry.flowModelChoices(flow).map(s => s.models), [[SFW, NSFW]],
        'holding one candidate must not hide the other — that is how the second gets installed');

    // The recommendation is declaration order, not install state: it must not drift to
    // whatever the user happens to have.
    state.s_installedModelIds = [NSFW, 'klein-4b'];
    assert.equal(registry.flowModelChoices(flow)[0].recommended, SFW);
});

test('a pick for an UNINSTALLED candidate drives the install, not just the label', async () => {
    // The pick has to reach flowModelIds, or the Required-models row, the install keys and
    // the Install button all keep describing the candidate the user just rejected.
    const { state, registry } = await load();
    const flow = registry.getFlowById(FLOW_ID);

    state.s_installedModelIds = ['klein-4b'];
    registry.setFlowModel(FLOW_ID, NSFW);
    assert.deepEqual(registry.flowModelIds(flow), [NSFW, 'klein-4b']);
    assert.deepEqual(registry.flowAvailability(flow).missing, [NSFW],
        'the Install button must fetch the PICKED candidate, not the default');

    // And picking one you do not have while holding the other is the deliberate trade
    // (MPI-599): the flow goes unavailable until it downloads. Session-only, one click back.
    state.s_installedModelIds = [SFW, 'klein-4b'];
    registry.setFlowModel(FLOW_ID, NSFW);
    assert.equal(registry.flowAvailability(flow).available, false);
    registry.setFlowModel(FLOW_ID, SFW);
    assert.equal(registry.flowAvailability(flow).available, true);
});

test('the pick reaches the params and the LoRA rack', async () => {
    const { state, registry } = await load();
    const flow = registry.getFlowById(FLOW_ID);
    state.s_installedModelIds = [SFW, NSFW, 'klein-4b'];

    registry.setFlowModel(FLOW_ID, NSFW);
    assert.equal(registry.flowSettingsModel(flow), NSFW,
        'settingsModel must follow the pick, or the NSFW arm edits the SFW rack and gets no LoRAs');
    const nsfwParams = registry.flowModelParams(flow);

    registry.setFlowModel(FLOW_ID, SFW);
    const sfwParams = registry.flowModelParams(flow);
    assert.notDeepEqual(nsfwParams, sfwParams,
        'if both arms resolve to the same params the picker is a no-op');
    assert.equal(registry.flowSettingsModel(flow), SFW);

    // An id that is not a candidate in any slot must not shadow the resolution order.
    registry.setFlowModel(FLOW_ID, 'qwen-edit');
    assert.equal(registry.flowSettingsModel(flow), SFW);
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
    const flow = registry.getFlowById(FLOW_ID);
    state.s_installedModelIds = [SFW, NSFW, 'klein-4b'];

    registry.setFlowModel(FLOW_ID, NSFW);
    state.s_installedModelIds = [SFW, 'klein-4b'];
    // Deliberate reversal of the MPI-590 behaviour: the pick is a statement of intent, so
    // it holds and the flow asks for the model back. The user un-asks by picking the other.
    assert.deepEqual(registry.flowModelIds(flow), [NSFW, 'klein-4b']);
    registry.setFlowModel(FLOW_ID, SFW);
    assert.deepEqual(registry.flowModelIds(flow), [SFW, 'klein-4b']);
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
    const loader = Object.values(sheet).find(n => n?._meta?.title === 'Input_Base_Model');
    assert.ok(loader && loader.class_type === 'UNETLoader',
        'the sheet must carry ONE injectable UNETLoader — hardcoded, it cannot follow a pick');

    state.s_installedModelIds = [SFW, NSFW, 'klein-4b'];

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
        /loraModelId:\s*flowSettingsModel\(flow\)/,
        'the rack must follow the picked member, not the id the descriptor names',
    );
});
