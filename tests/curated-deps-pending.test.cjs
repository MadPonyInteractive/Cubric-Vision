'use strict';
// MPI-525 — `curatedDepsPending()` is what the startup modal believes.
//
// The curated pip pass runs INSIDE `/comfy/start` with the engine down (MPI-459), so
// the frontend cannot observe it mid-request; it asks `/comfy/deps-pending` BEFORE
// starting and renames the blocking modal on the answer. If this predicate drifts from
// the skip/install branches of `ensureCuratedPythonDeps`, the failure is silent in both
// directions: a false `false` puts the generic "Starting ComfyUI Engine…" back over
// minutes of pip (the bug), and a false `true` promises an install that never happens.
//
// The engine root is redirected to a temp dir BEFORE requiring shared.js — `ENGINE_ROOT`
// is captured at module load, and the marker lives next to the interpreter it describes.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ENGINE = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi525-'));
process.env.CUBRIC_ENGINE_ROOT = ENGINE;

const { curatedDepsPending, curatedDepsMarkerPath } = require('../routes/shared');

const marker = curatedDepsMarkerPath();
fs.mkdirSync(path.dirname(marker), { recursive: true });

const depsFile = path.join(__dirname, '..', 'dev_configs', 'python_deps.txt');
const hash = crypto.createHash('sha256').update(fs.readFileSync(depsFile)).digest('hex').slice(0, 16);

(async () => {
    try {
        assert.strictEqual(await curatedDepsPending(), true,
            'no marker — the same branch that installs, so the modal must name the phase');

        fs.writeFileSync(marker, `${hash}\n`);
        assert.strictEqual(await curatedDepsPending(), false,
            'marker matches the shipped lock — the start skips in milliseconds, no phase label');

        fs.writeFileSync(marker, 'deadbeefdeadbeef\n');
        assert.strictEqual(await curatedDepsPending(), true,
            'a moved pin leaves a stale marker — that start pays the pass and must say so');

        console.log('curated-deps-pending: 3/3 OK');
    } finally {
        fs.rmSync(ENGINE, { recursive: true, force: true });
    }
})();
