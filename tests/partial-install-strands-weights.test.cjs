// MPI-655 — a model missing ONE shared common dep strands its own exclusive weight.
//
// Model Y has an exclusive transformer T and a common encoder V that a sibling tier also
// declares. Delete V by hand (a repointed models root, a manual tidy-up, a failed install)
// and Y lands in a state no code path can drain:
//
//   * `_localSharedDepsMap` asks for EXCLUSIVE evidence (the MPI-310 rule that stopped
//     5.24GB being destroyed). T is present and exclusive → Y counts as installed → Y's
//     WHOLE universe, T included, goes into the protected map.
//   * `_orphanedDepIds` asks that same map — deliberately, so the sweep can never invent a
//     second notion of "orphan" (MPI-462). T is protected, so the sweep walks past it.
//   * The card computes `anyInstalled` from `deriveInstalledOps`, which requires
//     commonComplete. V is missing → no installed ops → `anyInstalled` false → the detail
//     footer takes its `else` branch and offers Install and nothing else.
//
// So T is defended by the collector and invisible to the remover. Neither half is wrong on
// its own: the GC is right that T belongs to Y, and the chip is right that Y is unusable.
// The gap is that "unusable" was allowed to mean "cannot reclaim". The fix is in the UI
// only — the footer offers a removal affordance whenever bytes are on disk — so this test
// pins the STRANDING SHAPE the fix has to keep true: the GC must go on protecting T
// (touching the evidence rule is the MPI-310 regression), and the model must go on reading
// not-installed. Anything that makes either assert flip has moved the fix into the decision
// layer, which is exactly the trap.
const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

// Throwaway roots, set BEFORE requiring the routes — the modules capture ENGINE_ROOT at
// require time (docs/testing-harnesses.md § 2). The user's real engine is never touched.
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi655-strand-'));
const ENGINE = path.join(SCRATCH, 'engine');
const MODELS_ROOT = path.join(SCRATCH, 'models');
process.env.CUBRIC_ENGINE_ROOT = ENGINE;
process.env.CUBRIC_MODELS_ROOT = MODELS_ROOT;

const { getComfyPath } = require('../routes/platformEngine');
const { localModelsCheck } = require('../routes/comfy');
const dm = require('../routes/downloadManager.js');

const imp = p => import(pathToFileURL(path.resolve(__dirname, '..', p)).href);

// Y and the common dep to delete. Boogu is the real shape: two tiers sharing one 10.59GB
// Qwen3-VL encoder, each with its own exclusive transformer — and the family that stranded
// 15.91GB in MPI-462.
const MODEL_ID = 'boogu-edit-high';
const MISSING_DEP = 'boogu-qwen3vl-8b-clip';

(async () => {
    try {
        const { MODELS } = await imp('js/data/modelConstants/models.js');
        const { DEPS } = await imp('js/data/modelConstants/dependencies.js');
        const { resolveFullUniverse, deriveInstalledOps } = await imp('js/data/modelConstants/resolveModelDeps.js');

        const model = MODELS.find(m => m.id === MODEL_ID);
        assert.ok(model, `${MODEL_ID} must still exist in the registry`);
        const universe = resolveFullUniverse(model);
        assert.ok(universe.includes(MISSING_DEP), `${MODEL_ID} must still declare ${MISSING_DEP}`);

        // The premise of the whole card: the dep we delete is SHARED, and the model keeps
        // an exclusive weight after it goes. Assert both — if the registry ever changes so
        // that either is false, this test would pass while testing nothing.
        const declaredBy = id => MODELS.filter(m => (resolveFullUniverse(m) || []).includes(id)).length;
        assert.ok(declaredBy(MISSING_DEP) > 1, `${MISSING_DEP} must be shared with another model`);
        const exclusive = universe.filter(id => declaredBy(id) === 1);
        assert.ok(exclusive.length > 0, `${MODEL_ID} must keep at least one exclusive weight`);

        // ── 0. Negative control, on an EMPTY tree. ───────────────────────────────────
        // Without this the protection assert below could pass for the wrong reason — a
        // flow, a plugin or the universal-workflow set protecting the same id
        // unconditionally. Nothing on disk ⇒ no evidence ⇒ nobody defends the weight and
        // the sweep would happily take it. So the protection seen later is EARNED by the
        // exclusive weight being present, which is exactly the mechanism under test.
        const emptyMap = await dm._localSharedDepsMap(null);
        const emptyOrphans = new Set(dm._orphanedDepIds(emptyMap));
        for (const id of exclusive) {
            if (DEPS[id] && DEPS[id].type === 'custom_nodes') continue; // never swept, by design
            assert.ok(!emptyMap.has(id), `${id} must be undefended when nothing is on disk`);
            assert.ok(emptyOrphans.has(id), `${id} must read as an orphan when nothing is on disk`);
        }

        // Install Y fully, then hand-delete V: place every dep EXCEPT the shared encoder.
        for (const id of universe) {
            if (id === MISSING_DEP) continue;
            const d = DEPS[id];
            if (!d || !d.filename) continue;
            if (d.type === 'custom_nodes') {
                // A node folder counts as installed when it exists with content in it.
                const dir = getComfyPath(ENGINE, 'custom_nodes', d.filename);
                fs.ensureDirSync(dir);
                fs.writeFileSync(path.join(dir, '__init__.py'), '');
                continue;
            }
            const p = d.targetPath
                ? getComfyPath(ENGINE, d.targetPath, d.filename)
                : path.join(MODELS_ROOT, d.filename);
            fs.ensureDirSync(path.dirname(p));
            fs.writeFileSync(p, 'weight');
        }

        // ── 1. Disk truth: one dep missing, the exclusive weight present. ─────────────
        const check = await localModelsCheck([{
            id: MODEL_ID,
            deps: universe.map(id => {
                const d = DEPS[id] || {};
                return { id, type: d.type, filename: d.filename, targetPath: d.targetPath };
            }),
        }]);
        const entry = check[MODEL_ID];
        const onDisk = new Map(entry.deps.map(d => [d.id, d.installed === true]));
        assert.strictEqual(onDisk.get(MISSING_DEP), false, 'the deleted encoder must read absent');
        for (const id of exclusive) {
            assert.strictEqual(onDisk.get(id), true, `exclusive weight ${id} must read present`);
        }
        assert.strictEqual(entry.installed, false, 'one missing dep must make the model not-installed');

        // ── 2. The card cannot offer Uninstall. ──────────────────────────────────────
        // `anyInstalled` = model.installed || installedOps.length || (arch && commonOnDisk).
        // Boogu has no arch axis, so the third clause never fires and the first is `false`
        // from step 1 — deriveInstalledOps is the only remaining term.
        const { installedOps, fullyInstalled } = deriveInstalledOps(
            model, id => onDisk.get(id) === true, 'local');
        assert.deepStrictEqual(installedOps, [], 'a missing common dep must yield no installed ops');
        assert.strictEqual(fullyInstalled, false);

        // ── 3. …while the GC protects the very bytes the card will not remove. ───────
        // This is the stranding. It must STAY true after the fix: the evidence rule is
        // what keeps a sibling's shared weight alive (MPI-310).
        const protectedMap = await dm._localSharedDepsMap(null);
        for (const id of exclusive) {
            assert.ok(protectedMap.has(id),
                `${id} must stay protected — dropping it is the MPI-310 regression`);
        }

        // ── 4. …so the orphan sweep walks past them. ─────────────────────────────────
        const orphans = new Set(dm._orphanedDepIds(protectedMap));
        for (const id of exclusive) {
            assert.ok(!orphans.has(id), `${id} is protected, so the sweep can never reclaim it`);
        }

        // ── 5. The state the fix keys off: SOME bytes down, not all. ─────────────────
        // `_computePartial` in MpiModelManager reduces to exactly this over the model's
        // resolved deps, and `hasPartialProgress` is what now puts a removal affordance in
        // the detail footer. Without it the user has no way to reclaim the weights above.
        const weights = universe.filter(id => DEPS[id] && DEPS[id].type !== 'custom_nodes');
        assert.ok(weights.some(id => onDisk.get(id) === true), 'some weights must be on disk');
        assert.ok(weights.some(id => onDisk.get(id) !== true), 'and not all of them');

        console.log('MPI-655: stranding reproduced — protected by the GC, not offered by the card.');
    } finally {
        await fs.remove(SCRATCH).catch(() => {});
    }
})().catch(err => { console.error(err); process.exit(1); });
