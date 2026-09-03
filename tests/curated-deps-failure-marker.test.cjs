'use strict';
// MPI-685 — a failed curated pip pass has to survive the process that failed it.
//
// `/comfy/status` reports `depsWarning` from `processState.lastDepsWarning` and from the
// import scan, and BOTH are process memory — the scan does not even answer without a live
// child. So the Engine health row and its Repair button were unreachable on a cold app: a
// user whose install broke on a previous run opened Settings, was shown nothing to repair,
// and reported the button missing (GitHub issue #2 against 1.4.3). The disk marker this
// file guards is the third, last-resort source, and its whole value is that it outlives
// the run — and stops the moment the packages are actually installed.
//
// Engine root redirected to a temp dir BEFORE requiring shared.js: `ENGINE_ROOT` is
// captured at module load, and both markers live next to the interpreter they describe.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ENGINE = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi685-'));
process.env.CUBRIC_ENGINE_ROOT = ENGINE;

const {
    ensureCuratedPythonDeps,
    curatedDepsFailure,
    curatedDepsFailurePath,
    curatedDepsMarkerPath,
} = require('../routes/shared');

const marker = curatedDepsMarkerPath();
fs.mkdirSync(path.dirname(marker), { recursive: true });

const depsFile = path.join(__dirname, '..', 'dev_configs', 'python_deps.txt');
const hash = crypto.createHash('sha256').update(fs.readFileSync(depsFile)).digest('hex').slice(0, 16);

(async () => {
    try {
        assert.strictEqual(await curatedDepsFailure(), null,
            'no marker — a healthy engine must not put an Engine health row in front of anyone');

        // There is no interpreter under the temp root, so the pass fails inside
        // `runPipCommand` exactly as a real pip failure does: rejected, and recorded.
        await assert.rejects(ensureCuratedPythonDeps(),
            /Embedded Python not found/,
            'the pass still throws — the caller has to be able to report it');

        const recorded = await curatedDepsFailure();
        assert.match(recorded || '', /Embedded Python not found/,
            'the reason is on disk, so the NEXT launch can offer the repair');
        assert.ok(fs.existsSync(curatedDepsFailurePath()), 'marker written next to the interpreter');

        // A matching success marker means the packages are present, whatever failed under
        // an earlier lock. The skip branch has to clear the record or the row never leaves.
        fs.writeFileSync(marker, `${hash}\n`);
        await ensureCuratedPythonDeps();
        assert.strictEqual(await curatedDepsFailure(), null,
            'an installed engine clears the record — the warning cannot outlive the breakage');

        console.log('curated-deps-failure-marker: 5/5 OK');
    } finally {
        fs.rmSync(ENGINE, { recursive: true, force: true });
    }
})();
