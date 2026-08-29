// MPI-654 — the models library and the installer must resolve a dep to the SAME path.
//
// Two readers answer "is this dep on disk?": `_localModelsCheck` (routes/comfy.js) behind
// the library badge, and `resolveComfyPath` (routes/shared.js) which the download manager
// calls before deciding whether to download. They carried SEPARATE copies of the same
// ladder (targetPath → custom_nodes → custom root → default root), and the copies drifted:
//
//   MPI-607  the library copy was missing the `targetPath` branch entirely.
//   MPI-654  the search scopes diverged. `resolveComfyPath` searched the WHOLE custom root
//            by basename, the library copy searched the dep's own bucket. A same-named
//            weight in another bucket (a different quant, or a file ComfyUI's folder-type
//            mapping can never reach) read installed to the installer and not-installed to
//            the library: the badge never flipped, and Install downloaded nothing because
//            every dep already looked complete.
//
// The fix is one ladder — the library delegates to `resolveComfyPath` — and a bucket-scoped
// search inside it. This test pins BOTH halves: the two readers must agree, and they must
// agree on the ANSWER, not merely with each other.
const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

// Throwaway roots, set BEFORE requiring the routes — the modules capture ENGINE_ROOT at
// require time (docs/testing-harnesses.md § 2).
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi654-dep-path-'));
const ENGINE = path.join(SCRATCH, 'engine');
const DEFAULT_ROOT = path.join(SCRATCH, 'default_models');
const CUSTOM_ROOT = path.join(SCRATCH, 'custom_models');
process.env.CUBRIC_ENGINE_ROOT = ENGINE;
process.env.CUBRIC_MODELS_ROOT = DEFAULT_ROOT;

const { getComfyPath } = require('../routes/platformEngine');
const { resolveComfyPath, getCustomRoot } = require('../routes/shared');
const { isDepInstalledOnDisk } = require('../routes/downloadCompletion');
const { localModelsCheck } = require('../routes/comfy');

const DEP = { id: 'probe', type: 'diffusion_models', filename: 'diffusion_models/foo.safetensors' };

function place(rel) {
    const p = path.join(SCRATCH, rel);
    fs.ensureDirSync(path.dirname(p));
    fs.writeFileSync(p, 'weight');
}

// What the download manager does per dep (routes/downloadManager.js).
async function installerSaysInstalled(customRoot) {
    const { localPath } = await resolveComfyPath({ type: DEP.type, filename: DEP.filename }, customRoot, {});
    return isDepInstalledOnDisk(DEP, localPath);
}

async function librarySaysInstalled() {
    const res = await localModelsCheck([{ id: 'm', deps: [DEP] }]);
    return res.m.deps[0].installed;
}

const CASES = [
    ['the weight in its own bucket under the custom root', 'custom_models/diffusion_models/foo.safetensors', true],
    // The custom root is ADDITIVE — the yaml keeps the default root searchable, so a weight
    // installed there before the user repointed the folder still counts as present.
    ['a weight left in the DEFAULT root while a custom root is set', 'default_models/diffusion_models/foo.safetensors', true],
    // Users nest inside a bucket; both readers must still find it.
    ['the weight nested inside the right bucket', 'custom_models/diffusion_models/vendor/foo.safetensors', true],
    // THE REGRESSION. The first segment of `filename` IS the ComfyUI folder-type key, so a
    // same-named file in another bucket is a different weight the consuming node can never
    // load. Before the fix the installer adopted it and skipped the download.
    ['a same-named weight in the WRONG bucket', 'custom_models/loras/foo.safetensors', false],
    ['nothing on disk anywhere', null, false],
];

(async () => {
    try {
        fs.ensureDirSync(getComfyPath(ENGINE));
        fs.writeFileSync(getComfyPath(ENGINE, 'extra_model_paths.yaml'),
            `comfyui:\n    base_path: ${CUSTOM_ROOT.replace(/\\/g, '/')}\n`);

        const customRoot = await getCustomRoot();
        // getCustomRoot hands back the yaml's raw value, which yamlHelper writes with
        // forward slashes — compare resolved, not literally.
        assert.strictEqual(path.resolve(customRoot), path.resolve(CUSTOM_ROOT),
            'the sandbox yaml is not in effect — this test would be measuring the real engine');

        for (const [name, file, expected] of CASES) {
            fs.emptyDirSync(CUSTOM_ROOT);
            fs.emptyDirSync(DEFAULT_ROOT);
            if (file) place(file);

            const library = await librarySaysInstalled();
            const installer = await installerSaysInstalled(customRoot);

            assert.strictEqual(library, installer,
                `the library and the installer disagree about ${name}: `
                + `library=${library}, installer=${installer}. One of them will re-download a `
                + 'weight that is already there, or leave a badge that never flips.');
            assert.strictEqual(library, expected,
                `both readers agree about ${name} and both are WRONG — expected ${expected}`);
            console.log(`  ✔ ${name} → ${expected}`);
        }

        console.log('MPI-654: library and installer agree on every dep-location case');
    } catch (err) {
        console.error(err);
        process.exitCode = 1;
    } finally {
        await fs.remove(SCRATCH);
    }
})();
