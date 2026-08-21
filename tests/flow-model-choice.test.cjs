/**
 * flow-model-choice.test.cjs — MPI-590.
 *
 * A Flow may declare an ANY-OF SET of models (`requiredModels: [['krea2','krea2-nsfw'], …]`)
 * and the user picks which installed member runs it. The failure mode this guards is a
 * picker that RENDERS, SAVES, and CHANGES NOTHING: the badge flips, the dropdown remembers,
 * and the graph still loads the baked transformer — because injection matches node TITLES
 * and silently skips a param with no matching node. That is the same silent shape as the
 * MPI-504 LoRA rack (slots saved, image identical) and MPI-242's `Input_Batch` typo.
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
        const plain = (flow.requiredModels || []).filter(e => !Array.isArray(e));
        assert.deepEqual(
            registry.flowModelIds(flow).filter(id => plain.includes(id)),
            plain,
            `${flow.id}: plain string entries must resolve to themselves`,
        );
    }
});

test('the picker only offers a choice when there IS one', async () => {
    const { state, registry } = await load();
    const flow = registry.getFlowById(FLOW_ID);

    state.s_installedModelIds = [SFW, 'klein-4b'];
    assert.deepEqual(registry.flowModelChoices(flow), [],
        'one installed member is not a decision — no dropdown');

    state.s_installedModelIds = [SFW, NSFW, 'klein-4b'];
    assert.deepEqual(registry.flowModelChoices(flow), [[SFW, NSFW]]);
});

test('the pick reaches the params, the LoRA rack, and self-heals on uninstall', async () => {
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

    // An id that is not a member of any slot must not shadow the fallback.
    registry.setFlowModel(FLOW_ID, 'qwen-edit');
    assert.equal(registry.flowSettingsModel(flow), SFW);

    // Picked, then uninstalled: fall back rather than demand it back forever.
    registry.setFlowModel(FLOW_ID, NSFW);
    state.s_installedModelIds = [SFW, 'klein-4b'];
    assert.deepEqual(registry.flowModelIds(flow), [SFW, 'klein-4b']);
    assert.equal(registry.flowAvailability(flow).available, true);
});

test('every modelParams title EXISTS in the flow workflow', async () => {
    const { registry } = await load();
    for (const flow of registry.listFlows()) {
        if (!flow.modelParams) continue;
        const graph = readJson(`comfy_workflows/${flow.workflow}`);
        const titles = new Set(Object.values(graph)
            .map(n => (n?._meta?.title || '').toLowerCase())
            .filter(Boolean));
        const members = new Set(registry.flowModelSlots(flow).flat());

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
    // the first member, and one that reads `flow.requiredModels` raw renders a nested
    // array as a model row.
    const src = read('js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
    assert.match(src, /_mountModelChoice\(flow\);/, 'the picker is declared but never mounted');
    assert.match(src, /setFlowModel\(flow\.id, value\)/, 'the pick must be recorded, not just displayed');
    assert.ok(!/flow\.requiredModels/.test(src),
        'the drawer must resolve through flowModelIds — a raw read renders an any-of set as a nested array');
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
