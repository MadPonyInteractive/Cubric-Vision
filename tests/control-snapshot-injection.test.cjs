// MPI-556 — a generation's sidecar must describe the RUN, not the open project.
//
// `_snapshotControlState` built its buckets from the project's saved settings and
// reconciled exactly two things against the run's real `injectionParams`: ratio and
// batch. Raw `injectionParams` is the documented escape hatch and always wins over
// resolved values, so an agent dispatch could differ from the project on every other
// control — and the sidecar recorded the project's value, which Reuse then restored.
//
// Both halves were proven live on 2026-08-13 and are the fixtures below:
//   t2i_007  klein-4b, dispatched with raw Input_Style_Selector.selector=7 /
//            .strength_model=0.65. Visibly styled image, sidecar said Style=None.
//   t2i_006  krea2, ran at 1k (1024x1024) in a project holding a 2k tier. The sidecar
//            recorded that 2k, so the QUALITY toggle read 2K against a 1K card.
//
// This exercises the real control registry, the real ModelDefs and the real ratio tables.

const assert = require('node:assert');
const test = require('node:test');

const CONTROLS = () => import('../js/components/Organisms/MpiPromptBox/PromptBoxControls.js');
const REUSE = () => import('../js/utils/promptReuse.js');

/** The real ModelDef — the visibility gates read more than a hand-built stub carries. */
async function modelDef(id) {
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    const model = MODELS.find(m => m.id === id);
    assert.ok(model, `fixture guard: ${id} is still a shipped model`);
    return model;
}

/** The buckets the project would have produced, defaults included. */
async function projectBuckets(model, operation) {
    const { resolveControlDefaults } = await CONTROLS();
    return resolveControlDefaults(model, operation, {});
}

const bucketOf = (ctrl) => (ctrl.scope === 'perOp' ? 'op' : ctrl.scope === 'perModel' ? 'model' : 'shared');

test('a raw-injected style reaches the snapshot instead of the project value', async () => {
    const { reconcileControlsFromInjection } = await CONTROLS();
    const klein = await modelDef('klein-4b');

    const buckets = await projectBuckets(klein, 't2i');
    // The project sat at Style=None / Stylization=1.0 — the values the sidecar recorded.
    assert.strictEqual(buckets.model.styleSelect, 0, 'fixture guard: project style is None');

    reconcileControlsFromInjection(buckets, {
        'Input_Style_Selector.selector': 7,
        'Input_Style_Selector.strength_model': 0.65,
        Width: 1024, Height: 1024, Ratio_Label: '1:1',
    }, klein, 't2i', {});

    assert.strictEqual(buckets.model.styleSelect, 7, 'the style the run actually injected');
    assert.ok(Math.abs(buckets.model.stylization - 0.65) < 1e-6,
        `stylization must come from the run, got ${buckets.model.stylization}`);
});

test('a PromptBox dispatch reconciles to a no-op', async () => {
    const { reconcileControlsFromInjection, PROMPT_BOX_CONTROLS, visibleControlIds } = await CONTROLS();
    const krea2 = await modelDef('krea2');

    const buckets = await projectBuckets(krea2, 't2i');
    const before = structuredClone(buckets);

    // Exactly what the mounted controls would have injected for those same values —
    // the normal path, where the project IS the run.
    const injectionParams = { Width: 1024, Height: 1024, Ratio_Label: '1:1' };
    for (const id of visibleControlIds(krea2, 't2i', {})) {
        const ctrl = PROMPT_BOX_CONTROLS[id];
        const value = buckets[bucketOf(ctrl)][id];
        if (value === undefined || !ctrl.getInjectionParams) continue;
        Object.assign(injectionParams, ctrl.getInjectionParams.call({ ...ctrl, value, _instance: null }));
    }
    assert.ok('Input_Style_Selector.selector' in injectionParams,
        'fixture guard: the probe produced a real injection record');

    reconcileControlsFromInjection(buckets, injectionParams, krea2, 't2i', {});
    assert.deepStrictEqual(buckets, before, 'a run that matches the project must change nothing');
});

test('a contradicted control that cannot be inverted is dropped, never recorded wrong', async () => {
    const { reconcileControlsFromInjection } = await CONTROLS();
    // SDXL is the model that offers more than one control type, so the picker mounts.
    const sdxl = await modelDef('sdxl-realistic');

    const buckets = await projectBuckets(sdxl, 'control');
    assert.strictEqual(buckets.op.controlType, 'depth', 'fixture guard: project sits on depth');

    // controlType maps an id to an index, so an injected index does not round-trip back
    // to a control value. Absent leaves Reuse on the current value; wrong would invent a
    // generation that never ran.
    reconcileControlsFromInjection(buckets, { Input_Control_Net: 1 /* pose */ }, sdxl, 'control', {});

    assert.ok(!('controlType' in buckets.op), 'an unrecoverable control must be dropped');
});

test('the quality tier comes from the size that shipped, not the project', async () => {
    const { ratioSettingsFromParams } = await REUSE();
    const krea2 = await modelDef('krea2');

    // t2i_006: ran at 1k in a project whose per-model bucket held 2k.
    assert.strictEqual(
        ratioSettingsFromParams({ Width: 1024, Height: 1024, Ratio_Label: '1:1' }, {}, krea2).qualityTier,
        '1k', 'a 1024x1024 krea2 run is 1k, whatever the project holds');

    // ...and 2k pixels still read 2k, so the fix is not a blanket downgrade.
    assert.strictEqual(
        ratioSettingsFromParams({ Width: 1472, Height: 1472, Ratio_Label: '1:1' }, {}, krea2).qualityTier,
        '2k', 'a real 2k run must still record 2k');
});

// ── The wired snapshot: the two live-proven cases, end to end ────────────────────────

/** Point the module-level state at a project holding the settings a run contradicts. */
async function withProject(project, fn) {
    const { state } = await import('../js/state.js');
    const previous = state.currentProject;
    state.currentProject = project;
    try { return await fn(); } finally { state.currentProject = previous; }
}

test('t2i_007: the sidecar records the style the run injected, not the project', async () => {
    const { _snapshotControlState } = await import('../js/services/generationService.js');
    const klein = await modelDef('klein-4b');

    const controlState = await withProject(
        { shared: { image: {} }, modelSettings: { 'klein-4b': { styleSelect: 0, stylization: 1, operations: {} } } },
        () => _snapshotControlState(klein, 't2i', {
            'Input_Style_Selector.selector': 7,
            'Input_Style_Selector.strength_model': 0.65,
            Width: 1024, Height: 1024, Ratio_Label: '1:1',
        }));

    assert.strictEqual(controlState.model.styleSelect, 7, 'Reuse used to restore Style=None here');
    assert.ok(Math.abs(controlState.model.stylization - 0.65) < 1e-6,
        `Reuse used to restore Stylization=1.00, got ${controlState.model.stylization}`);
});

test('t2i_006: a 1k run in a 2k project records 1k in both places', async () => {
    const { _snapshotControlState } = await import('../js/services/generationService.js');
    const krea2 = await modelDef('krea2');

    const controlState = await withProject(
        {
            shared: { image: { ratioSelector: { selectedRatio: '1:1', qualityTier: '2k' } } },
            modelSettings: { krea2: { qualityTier: '2k', operations: {} } },
        },
        () => _snapshotControlState(krea2, 't2i', { Width: 1024, Height: 1024, Ratio_Label: '1:1' }));

    assert.strictEqual(controlState.model.qualityTier, '1k',
        'the per-model bucket is what Reuse and the tier radio read — it carried the project 2k');
    assert.strictEqual(controlState.shared.ratioSelector.qualityTier, '1k',
        'the legacy shared copy must agree, or reuse reads 2K against a 1K card');
});

test('no injection record leaves the snapshot alone', async () => {
    const { reconcileControlsFromInjection } = await CONTROLS();
    const klein = await modelDef('klein-4b');
    const buckets = await projectBuckets(klein, 't2i');
    const before = structuredClone(buckets);
    reconcileControlsFromInjection(buckets, {}, klein, 't2i', {});
    assert.deepStrictEqual(buckets, before);
});
