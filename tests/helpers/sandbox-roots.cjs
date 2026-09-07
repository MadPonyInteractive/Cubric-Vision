/**
 * Pin the engine + models roots at throwaway temp dirs, so a unit test can never
 * read (or delete inside) the dev machine's real model library.
 *
 * The leak this closes (MPI-462 test, went red 2026-08-26): setting only
 * CUBRIC_MODELS_ROOT looks hermetic and is not. It moves the DEFAULT root, while
 * every on-disk answer routed through `comfy.localModelsCheck` prefers
 * `getCustomRoot()` — the `base_path:` inside <ENGINE_ROOT>/extra_model_paths.yaml,
 * i.e. the real G:\CubricModels. So the disk state of the DEVELOPER'S library
 * decided the result: the orphan-sweep test passed on CI forever and turned red
 * the day Boogu balanced was installed for real. Pinning ENGINE_ROOT too leaves no
 * yaml to read, `getCustomRoot()` returns null, and every answer comes from ROOT.
 *
 * Loaded two ways, and must stay correct under both:
 *   - `--require` from the `npm test` script → runs before any test file's own code
 *   - `require('./helpers/sandbox-roots.cjs')` as a test file's FIRST line → covers
 *     running that one file directly, which the npm-script preload does not.
 *
 * Both env vars are captured at module load by routes/shared.js and read at call
 * time by routes/platformEngine.js, so this must run before those are required.
 * Already-set values win: a test with its own root keeps it.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const set = (name, dir) => {
    if (!process.env[name]) process.env[name] = dir;
    return process.env[name];
};

const suffix = `mpi-test-${process.pid}`;
const ENGINE = set('CUBRIC_ENGINE_ROOT', path.join(os.tmpdir(), `${suffix}-engine`));
const ROOT = set('CUBRIC_MODELS_ROOT', path.join(os.tmpdir(), `${suffix}-models`));
// A portable root would out-rank CUBRIC_ENGINE_ROOT in getEngineRoot().
delete process.env.CUBRIC_PORTABLE_ROOT;

fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => {
    for (const dir of [ROOT, ENGINE]) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

module.exports = { ROOT, ENGINE };
