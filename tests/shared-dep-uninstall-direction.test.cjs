// MPI-310 — model deps protected during a PLUGIN uninstall.
//
// This is the OPPOSITE direction from plugin-dep-gc.test.cjs (plugin deps during a
// MODEL uninstall) and it had never run before the incident: uninstalling the
// image-describer plugin DELETED qwen3vl_4b_abliterated_fp8_scaled.safetensors
// (5.24GB) while four Krea2 cards declared it and one was fully installed.
//
// The bug was a CIRCULAR gate in _localSharedDepsMap: a model only protected its
// deps when deriveInstalledOps reported fullyInstalled, but a shared COMMON dep is
// itself an input to fullyInstalled. Delete the weight (or have it go missing for any
// reason) and every model needing it stopped defending it — so the damage could never
// be undone by the guard, and it cascaded across the whole family.
//
// If this fails, "Files shared with other installed models will be kept" is a lie.
const assert = require('assert');

const dm = require('../routes/downloadManager.js');
const comfyRoutes = require('../routes/comfy.js');

const SHARED = 'qwen3vl-abliterated-clip';
const PLUGIN_ID = 'plugin:image-describer';

// Stub the ONLY I/O in _localSharedDepsMap: the disk stat. `installedIds` is what we
// pretend is on disk; every other declared dep reads absent.
function stubDisk(installedIds) {
    const real = comfyRoutes.localModelsCheck;
    comfyRoutes.localModelsCheck = async (models) => {
        const results = {};
        for (const m of models) {
            results[m.id] = {
                deps: m.deps.map(d => ({ id: d.id, installed: installedIds.has(d.id) })),
            };
        }
        return results;
    };
    return () => { comfyRoutes.localModelsCheck = real; };
}

(async () => {
    const { MODELS } = require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse } = require('../js/data/modelConstants/resolveModelDeps.js');

    const krea2 = MODELS.filter(m => (resolveFullUniverse(m) || []).includes(SHARED));
    assert.ok(krea2.length > 0, `no model declares ${SHARED} — test is guarding a ghost`);

    // (1) THE INCIDENT. A fully-installed model declares the shared weight; the plugin
    //     that also owns it is being uninstalled. The weight must survive.
    {
        const restore = stubDisk(new Set(resolveFullUniverse(krea2[0])));
        try {
            const map = await dm._localSharedDepsMap(PLUGIN_ID);
            assert.ok(map.has(SHARED),
                'a fully-installed model must protect the shared weight from a plugin uninstall');
        } finally { restore(); }
    }

    // (2) THE REGRESSION THAT MADE IT UNRECOVERABLE. Same model, but the shared weight
    //     is already missing (partial damage). Under the old circular fullyInstalled
    //     gate this protected NOTHING, so the next uninstall deleted it permanently.
    //     A model still declares — and still needs — a dep it is currently missing.
    {
        const universe = resolveFullUniverse(krea2[0]);
        const damaged = new Set(universe.filter(id => id !== SHARED));
        assert.ok(damaged.size > 0, 'model needs a second dep for this case to be meaningful');
        const restore = stubDisk(damaged);
        try {
            const map = await dm._localSharedDepsMap(PLUGIN_ID);
            assert.ok(map.has(SHARED),
                'a partially-damaged model must STILL protect the shared weight it declares');
        } finally { restore(); }
    }

    // (3) The guard must not over-protect: a model with NO footprint on disk defends
    //     nothing, so uninstalling the plugin can still reclaim a weight nobody uses.
    {
        const restore = stubDisk(new Set());
        try {
            const map = await dm._localSharedDepsMap(PLUGIN_ID);
            assert.ok(!map.has(SHARED),
                'with no model installed, the plugin uninstall must reclaim its own weight');
        } finally { restore(); }
    }

    console.log('ok — model deps survive a plugin uninstall (MPI-310)');
})();
