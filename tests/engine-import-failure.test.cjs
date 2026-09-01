'use strict';

/**
 * MPI-674 / issue #2 — a present-but-broken node pack must not read as healthy.
 *
 * `checkUniversalWorkflowDepsStatus()` answers from the folder and its commit marker,
 * and both are correct for a pack that is on disk at the right commit and fails to
 * import. So `/engine/deps-status` calls the engine healthy, the boot repair never
 * fires, and the state survives every restart — while every graph touching those packs
 * is rejected with a raw missing-class name.
 *
 * The signal the disk check cannot reach is the engine's own stdout: ComfyUI names each
 * pack it could not import, twice. These tests pin that scan, its fold into the
 * `depsWarning` channel MPI-673 built, and the repair that clears the marker standing
 * between the user and a real pip retry.
 *
 * The sample lines below are copied verbatim from the reproduction harness
 * (`D:\tmp\cu126-repro\comfy-nodeps.log`, ComfyUI v0.31.0 with three curated packages
 * removed) — colour escapes included, because that is what arrives on the pipe.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Same redirect as tests/curated-deps-warning.test.cjs, and for the same reason: the
// logger and the engine root are resolved once at module load, so without this the run
// appends to the developer's real app.log and reads their real engine.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi674-'));
process.env.APP_USER_DATA = TMP;
process.env.CUBRIC_ENGINE_ROOT = TMP;

const comfyRouter = require('../routes/comfy');
const { processState } = require('../routes/shared');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scan = comfyRouter.scanForImportFailures;

const NODES = 'D:\\tmp\\cu126-repro\\v0.31.0\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes';

/** The `Cannot import ...` warning, printed where the failure happens. */
const CANNOT_IMPORT = `\x1b[33m[WARNING]\x1b[0m Cannot import ${NODES}\\RES4LYF module for custom nodes: No module named 'pywt'\n`;
/** The `(IMPORT FAILED)` row, printed in the import-times summary that closes loading. */
const IMPORT_FAILED = `\x1b[32m[INFO]\x1b[0m    0.1 seconds (IMPORT FAILED): ${NODES}\\comfyui-videohelpersuite\n`;
/** A healthy pack's row from the same summary — the shape that must NOT match. */
const IMPORT_OK = `\x1b[32m[INFO]\x1b[0m    0.4 seconds: ${NODES}\\ComfyUI-KJNodes\n`;

/** Fresh scanner state, exactly as a spawn in /comfy/start leaves it. */
function resetScan() {
    processState.comfyImportFailures = [];
    // Flush any carry left by the previous test: a newline-terminated chunk that
    // matches nothing empties it without recording a failure.
    scan('\n');
    processState.comfyImportFailures = [];
}

/** GET /comfy/status off a throwaway server. */
async function getStatus() {
    const app = express();
    app.use(express.json());
    app.use(comfyRouter);
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/comfy/status`);
        return await res.json();
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('both forms of the engine import-failure line are recognised, by folder name', () => {
    resetScan();
    scan(CANNOT_IMPORT);
    assert.deepEqual(processState.comfyImportFailures, ['RES4LYF'],
        'the `Cannot import` warning names the pack by absolute path — record the folder');

    scan(IMPORT_FAILED);
    assert.deepEqual(processState.comfyImportFailures, ['RES4LYF', 'comfyui-videohelpersuite'],
        'the import-times `(IMPORT FAILED)` row is the second, independent statement');
});

test('a healthy boot records nothing', () => {
    resetScan();
    scan(IMPORT_OK);
    scan('Total VRAM 8192 MB, total RAM 32502 MB\nStarting server\n');
    assert.deepEqual(processState.comfyImportFailures, [],
        'an engine that imported everything must not be reported degraded');
});

test('the same pack reported twice is recorded once', () => {
    resetScan();
    scan(CANNOT_IMPORT);
    scan(`\x1b[32m[INFO]\x1b[0m    0.0 seconds (IMPORT FAILED): ${NODES}\\RES4LYF\n`);
    assert.deepEqual(processState.comfyImportFailures, ['RES4LYF'],
        'ComfyUI prints both lines for every failed pack — the warning must not say it twice');
});

test('a line split across chunk boundaries is still caught', () => {
    // The failure this guards is silent: stdout chunking is not line-aligned, so a
    // scanner without a carry drops whichever pack happens to straddle a read.
    resetScan();
    const cut = CANNOT_IMPORT.indexOf('module for custom nodes');
    scan(CANNOT_IMPORT.slice(0, cut));
    assert.deepEqual(processState.comfyImportFailures, [],
        'half a line is not yet a match — nothing may be recorded from it');
    scan(CANNOT_IMPORT.slice(cut));
    assert.deepEqual(processState.comfyImportFailures, ['RES4LYF'],
        'the carried partial must complete against the next chunk');
});

test('an unterminated line is not matched until its newline arrives', () => {
    resetScan();
    scan(CANNOT_IMPORT.replace(/\n$/, ''));
    assert.deepEqual(processState.comfyImportFailures, [],
        'without a newline the line may still be growing — matching it early can truncate the name');
    scan('\n');
    assert.deepEqual(processState.comfyImportFailures, ['RES4LYF']);
});

test('/comfy/status reports import failures through depsWarning', async () => {
    resetScan();
    processState.lastDepsWarning = null;
    // Only an engine WE spawned has been scanned, so the report is gated on owning it.
    processState.activeComfyProcess = { fake: true };
    try {
        const clean = await getStatus();
        assert.equal(clean.depsWarning, null, 'a clean scan is not a warning');

        processState.comfyImportFailures = ['RES4LYF', 'comfyui-impact-pack'];
        const degraded = await getStatus();
        assert.match(degraded.depsWarning, /RES4LYF/,
            'the packs that failed to import must reach the frontend — this is the whole detector');
        assert.match(degraded.depsWarning, /comfyui-impact-pack/);

        // The pip failure is the CAUSE; the import failures are its symptom. Telling a
        // user "the install failed" beats listing what fell over downstream of it.
        processState.lastDepsWarning = 'curated python deps FAILED: pip could not reach the index';
        const both = await getStatus();
        assert.equal(both.depsWarning, 'curated python deps FAILED: pip could not reach the index',
            'when the install itself failed, that reason wins');
    } finally {
        processState.activeComfyProcess = null;
        processState.lastDepsWarning = null;
        processState.comfyImportFailures = [];
    }
});

test('an attached engine answers unknown, never healthy', async () => {
    // MPI-484: another app instance may own the engine on the shared port. We saw none
    // of its stdout, so a stale list from OUR last engine must not be reported against it.
    resetScan();
    processState.lastDepsWarning = null;
    processState.activeComfyProcess = null;
    processState.comfyImportFailures = ['RES4LYF'];
    try {
        const status = await getStatus();
        assert.equal(status.depsWarning, null,
            'not our child, not our scan — silence, not a verdict on someone else’s engine');
    } finally {
        processState.comfyImportFailures = [];
    }
});

test('a fresh start clears the previous engine\'s failures and the carry', () => {
    const src = read('routes/comfy.js');
    const start = src.indexOf('processState.activeComfyProcess = spawn(');
    assert.ok(start > 0, 'the spawn moved — repoint this test');
    const preamble = src.slice(src.indexOf("router.post('/comfy/start'"), start);
    assert.ok(preamble.includes('processState.comfyImportFailures = [];'),
        'a repaired engine must not inherit the verdict on the one it replaced');
    assert.ok(preamble.includes("_importScanCarry = '';"),
        'a partial line from a dead process can only mis-match against the next one');
});

test('the repair clears the marker BEFORE stopping the engine', () => {
    const src = read('routes/engine.js');
    const start = src.indexOf("router.post('/engine/repair-python-deps'");
    assert.ok(start > 0, 'the repair route is missing — a release build has no reachable repair without it');
    const handler = src.slice(start, src.indexOf('router.', start + 10));

    const removedAt = handler.indexOf('fs.remove(marker)');
    const stoppedAt = handler.indexOf('stopComfyUI()');
    assert.ok(removedAt > 0, 'without removing the marker, ensureCuratedPythonDeps skips and the repair is a no-op');
    assert.ok(stoppedAt > 0, 'the curated pass runs inside a start with the engine down (MPI-459)');
    assert.ok(removedAt < stoppedAt,
        'the marker must be gone before the engine is, or a fast restart can re-skip the pass');
    assert.ok(!handler.includes('/comfy/start'),
        'the caller owns the start — it is what polls readiness and re-reads depsWarning');
});

test('the degraded-engine dialog points at the repair that now exists', () => {
    const controller = read('js/services/comfyController.js');
    assert.match(controller, /Repair engine/,
        'MPI-673 named no button because none existed; this card built one, so the copy must name it');
    assert.ok(controller.includes('async repairPythonDeps()'),
        'the repair sequence belongs to the engine service, not to the Settings component');
    assert.ok(controller.includes("fetch('/engine/repair-python-deps'"),
        'the repair must clear the marker server-side — a restart alone cannot get past it');

    // No internal vocabulary in the copy. `state.comfyDepsWarning` holds a developer
    // string and the message used to describe the machinery behind the failure; this is
    // an artist's app, and what actually broke belongs in app.log (user call,
    // 2026-09-01). The unit guard is on the constant, the desktop spec guards the
    // rendered row — the same rule at both ends.
    const message = controller.slice(controller.indexOf('export const DEPS_BROKEN_MESSAGE'));
    const copy = message.slice(0, message.indexOf(';'));
    for (const jargon of ['Python', 'custom node', 'package', 'pip', 'import']) {
        assert.ok(!copy.includes(jargon), `the degraded-engine copy names internal machinery: "${jargon}"`);
    }

    const settings = read('js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js');
    assert.ok(settings.includes('mpiSettingsEngineHealthSection'),
        'the reachable surface is a Settings section');
    assert.ok(!settings.includes('mpiSettingsEngineHealthReason'),
        'the raw warning value must not be rendered onto the Settings row');
    assert.ok(settings.includes('localEngine.repairPythonDeps()'),
        'the button calls the service, and does not re-implement the sequence');
    // Scoped to the function, and asserted by ORDER rather than by a character window:
    // hidden first, then the guard, then the reveal. A char window breaks the moment
    // someone writes a comment, which is not a defect worth a red test.
    const fn = settings.slice(settings.indexOf('function _initEngineHealth'));
    const body = fn.slice(0, fn.indexOf('\n        function '));
    const hiddenTrue = body.indexOf('section.hidden = true;');
    const guard = body.indexOf('state.comfyDepsWarning');
    const hiddenFalse = body.indexOf('section.hidden = false;');
    assert.ok(hiddenTrue >= 0 && guard > hiddenTrue && hiddenFalse > guard,
        'the section must start hidden, and be revealed only past the degraded-engine guard');
});

// No `rmSync(TMP)` teardown, unlike tests/curated-deps-warning.test.cjs. The code
// under test here LOGS — `_scanForImportFailures` reports each failed pack — and
// `routes/logger` appends through a serialized fire-and-forget queue with no drain to
// await. Deleting the directory it is still writing into is the exact race that turned
// master's CI red on MPI-675 (54f03caf); there it flipped an assert, here it would only
// spray `[logger] write failed` over the run, which is worse than leaving a few KB in
// the OS temp dir. Nothing outside this file reads TMP, and the OS sweeps it.

