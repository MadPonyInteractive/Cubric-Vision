'use strict';
// MPI-328 — the remote model check must fail CLOSED on an incomplete wrapper answer.
//
// remoteModelsCheck asks the Pod wrapper about a model's VOLUME deps, then folds the
// image-resident (baked) deps back in and recomputes the model-level `installed`.
// That fold-back used to default a model the wrapper never mentioned to
// `{ installed: true, deps: [] }`, and the recompute was then vacuously true on the
// empty dep list. Observed live on 1.1.1: a booting CPU Pod 404'd twice, then FIVE
// untouched models flipped to green with zero files on the volume (+4.9GB disk growth
// against a 30GB+ real download). Only one consumer reads the model-level flag
// (modelRegistry.syncModelInstalled → `model.installed = results[id].installed`), and
// every consumer tolerates a MISSING entry — so a short answer now drops the model
// from the response and each caller keeps its last known state.
const assert = require('assert');
const { foldBackWrapperStatus } = require('../routes/remoteModels');

const fold = (results, { resident = {}, asked = {}, drifted = [] } = {}) =>
    foldBackWrapperStatus(results, {
        imageResidentByModel: resident,
        volumeDepCount: asked,
        volumeNodeDrifted: new Set(drifted),
    });

// 1. THE BUG: wrapper omits a model we asked about → UNKNOWN, never installed.
{
    const out = fold({}, { resident: { sdxl: [] }, asked: { sdxl: 2 } });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(out, 'sdxl'), false,
        'a model the wrapper never mentioned must be absent from results, not defaulted to installed');
}

// 2. Under-reported: asked about 2 volume deps, wrapper answered about 1 → UNKNOWN.
{
    const out = fold(
        { sdxl: { installed: true, deps: [{ id: 'a', installed: true }] } },
        { resident: { sdxl: [] }, asked: { sdxl: 2 } },
    );
    assert.strictEqual(Object.prototype.hasOwnProperty.call(out, 'sdxl'), false,
        'a short dep list is a partial answer — drop it rather than report installed');
}

// 3. Honest complete answer still reports installed.
{
    const out = fold(
        { sdxl: { installed: true, deps: [{ id: 'a', installed: true }, { id: 'b', installed: true }] } },
        { resident: { sdxl: [] }, asked: { sdxl: 2 } },
    );
    assert.strictEqual(out.sdxl.installed, true, 'all deps present on the volume → installed');
}

// 4. One dep missing → not installed (the AND still holds).
{
    const out = fold(
        { sdxl: { installed: true, deps: [{ id: 'a', installed: true }, { id: 'b', installed: false }] } },
        { resident: { sdxl: [] }, asked: { sdxl: 2 } },
    );
    assert.strictEqual(out.sdxl.installed, false, 'a missing volume dep must drag the model to not-installed');
}

// 5. REGRESSION GUARD (MPI-276): an all-baked model is asked about NOTHING, so its
//    absence from the wrapper response is legitimate — the fold-back still owns it.
{
    const out = fold({}, { resident: { krea2: ['comfyui_controlnet_aux'] }, asked: { krea2: 0 } });
    assert.strictEqual(out.krea2.installed, true,
        'a model whose deps are all image-resident is complete without the wrapper ever answering');
    assert.deepStrictEqual(out.krea2.deps, [{ id: 'comfyui_controlnet_aux', installed: true, partialBytes: 0 }]);
}

// 6. The vacuous [].every() === true guard: an empty dep set is never "complete".
{
    const out = fold({ sdxl: { installed: true, deps: [] } }, { resident: { sdxl: [] }, asked: { sdxl: 0 } });
    assert.strictEqual(out.sdxl.installed, false, 'no deps reported and none folded in → not installed');
}

// 7. REGRESSION GUARD (MPI-222): drifted volume nodes still force installed:false +
//    drifted:true so the installer sends force:true instead of looping on
//    already_installed.
{
    const out = fold(
        { sdxl: { installed: true, deps: [{ id: 'ComfyUI-MpiNodes', installed: true }] } },
        { resident: { sdxl: [] }, asked: { sdxl: 1 }, drifted: ['ComfyUI-MpiNodes'] },
    );
    assert.strictEqual(out.sdxl.deps[0].installed, false, 'a drifted volume node must read not-installed');
    assert.strictEqual(out.sdxl.deps[0].drifted, true, 'a drifted volume node must be tagged for force-reinstall');
    assert.strictEqual(out.sdxl.installed, false, 'drift drags the owning model to not-installed');
}

// 8. Mixed: volume deps answered in full + baked deps folded in → installed.
{
    const out = fold(
        { krea2: { installed: true, deps: [{ id: 'weight', installed: true }] } },
        { resident: { krea2: ['comfyui_controlnet_aux'] }, asked: { krea2: 1 } },
    );
    assert.strictEqual(out.krea2.installed, true, 'volume-complete + baked deps → installed');
    assert.strictEqual(out.krea2.deps.length, 2, 'baked dep must be folded back into the dep list');
}

console.log('remote-status-fail-closed: 8 checks passed');
