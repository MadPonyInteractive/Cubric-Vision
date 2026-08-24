// MPI-607 — `/comfy/models/check` must honour `dep.targetPath`.
//
// `resolveComfyPath` (routes/shared.js) resolves a `targetPath` weight against the
// ENGINE root — that is the whole point of the field: the consuming node hard-codes an
// in-engine scan path, so the weight cannot live under the models root (MPI-222).
// `_localModelsCheck` (routes/comfy.js) duplicated that resolution and OMITTED the
// targetPath branch, so it looked for the file under the models root, never found it,
// and reported the dep not-installed forever.
//
// The symptom is not a crash. The download manager writes the file correctly, the
// install completes, the toast fires — and then the Flow Library's badge never flips
// because `flowAvailability().missingDeps` stays non-empty, so its install bar sticks
// at 100% with Cancel still showing. Deterministic, so restarting the app never helps.
//
// It hid for months because RIFE — the only `targetPath` dep that existed — carries
// `engineAsset: true`, so its install state comes from the engine boot gate
// (checkUniversalWorkflowDepsStatus, which DOES use resolveComfyPath) and never reaches
// this function. The chatterbox weights are the first `targetPath` deps owned by a FLOW,
// and flow deps are resolved here.
const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

// A throwaway engine root, set BEFORE requiring the routes — both modules capture
// ENGINE_ROOT at require time (docs/testing-harnesses.md § 2).
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi607-targetpath-'));
process.env.CUBRIC_ENGINE_ROOT = SCRATCH;

const { getComfyPath } = require('../routes/platformEngine');
const { localModelsCheck } = require('../routes/comfy');

const TARGET_PATH = 'models/chatterbox/chatterbox_vc';
const PRESENT = { id: 'probe-present', filename: 's3gen.pt', targetPath: TARGET_PATH, bytes: 11 };
const ABSENT = { id: 'probe-absent', filename: 'nope.pt', targetPath: TARGET_PATH, bytes: 11 };

(async () => {
    try {
        // Lay the weight down exactly where resolveComfyPath says it belongs.
        const dir = getComfyPath(SCRATCH, ...TARGET_PATH.split('/'));
        await fs.ensureDir(dir);
        await fs.writeFile(path.join(dir, PRESENT.filename), 'hello world');

        const res = await localModelsCheck([
            { id: 'probe:present', deps: [PRESENT] },
            { id: 'probe:absent', deps: [ABSENT] },
        ]);

        // THE REGRESSION. Before the fix this was `false` — the file was on disk, in the
        // directory the download manager had just written it to, and the check said no.
        assert.strictEqual(res['probe:present'].installed, true,
            'a targetPath weight present under the ENGINE root must read installed — '
            + 'this is the MPI-607 stuck-at-100% bug');
        assert.strictEqual(res['probe:present'].deps[0].installed, true,
            'the per-dep result must agree with the model-level result');

        // ...and the fix must not be "say yes to everything": a targetPath weight that is
        // genuinely missing still reports missing, or the Run guard stops protecting the
        // user from a graph that dies inside ComfyUI.
        assert.strictEqual(res['probe:absent'].installed, false,
            'an ABSENT targetPath weight must still read not-installed');

        // ── The OTHER half, and the one that actually bit ────────────────────────
        // The server branch above is useless if the field never arrives. syncModelInstalled
        // projects each dep down to a few fields before POSTing, and that projection
        // dropped `targetPath` — so the fix above fired for nobody. Measured against the
        // live server: the stripped payload returned installed=false for two weights that
        // were on disk; the same payload carrying targetPath returned true.
        //
        // All THREE projections (models, flows, plugins) must carry it — a targetPath dep
        // can be owned by any of the three entities.
        const src = fs.readFileSync(path.join(__dirname, '../js/data/modelRegistry.js'), 'utf8');
        const projections = src.match(/map\(dep => \(\{ id: dep\.id,[^)]*\}\)\)/g) || [];
        assert.strictEqual(projections.length, 3,
            `expected 3 dep projections in syncModelInstalled, found ${projections.length} — `
            + 'the regex has drifted, so this guard is no longer checking anything');
        for (const p of projections) {
            assert.ok(/targetPath:\s*dep\.targetPath/.test(p),
                'a syncModelInstalled dep projection dropped `targetPath`. The server cannot '
                + 'resolve a targetPath weight without it, so every one of them reads '
                + 'not-installed forever:\n  ' + p);
        }

        // ── The REMOTE twin of the same confusion ────────────────────────────────
        // `_isImageResident` used to return true for EVERY `targetPath` dep, so a remote
        // session reported such a weight present without checking anything. That was true
        // for RIFE by coincidence — the Pod Dockerfile really does bake rife47.pth — and
        // reading `targetPath` as if it meant "the Pod has it" was luck, not logic.
        // `targetPath` says WHERE ON DISK; `bakedOnPod` says WHETHER THE POD HAS IT.
        //
        // The chatterbox weights are targetPath and appear NOWHERE in the Pod image, so
        // the blanket rule made remote claim 1.0GB it does not have and then die inside
        // ComfyUI on a missing class. Honest-missing fails CLOSED and is the right answer
        // until either the image bakes them or the wrapper learns a targetPath destination.
        const remote = require('../routes/remoteModels');
        const isResident = remote._isImageResident || remote.isImageResident;
        // Assert, never skip: a `if (typeof fn === 'function')` guard around the block
        // below would turn a rename into a silently-passing test that checks nothing.
        assert.strictEqual(typeof isResident, 'function',
            'routes/remoteModels no longer exports _isImageResident — this guard is blind');
        {
            const { DEPS: D } = await import('../js/data/modelConstants/dependencies.js');
            assert.strictEqual(isResident(D.rife47), true,
                'rife47 IS baked (cubric-vision-pod/Dockerfile `dl "$RIFE_DIR" rife47.pth`) '
                + 'and carries bakedOnPod — it must stay image-resident');
            for (const dep of Object.values(D)) {
                if (!dep?.targetPath || dep.bakedOnPod) continue;
                assert.strictEqual(isResident(dep), false,
                    `${dep.id} is a targetPath weight the Pod image does NOT bake, so remote `
                    + 'must report it MISSING rather than claim it is present');
            }
            // ...and narrowing the targetPath rule must not have disturbed the plain
            // `bakedOnPod` weights that never had targetPath (MPI-380, ~950MB).
            for (const dep of Object.values(D)) {
                if (!dep?.bakedOnPod || dep.targetPath) continue;
                assert.strictEqual(isResident(dep), true,
                    `${dep.id} carries bakedOnPod and must remain image-resident`);
            }
        }

        console.log('ok — targetPath deps resolve against the engine root in models/check (MPI-607)');
    } finally {
        await fs.remove(SCRATCH).catch(() => {});
    }
})().catch((e) => { console.error(e); process.exit(1); });
