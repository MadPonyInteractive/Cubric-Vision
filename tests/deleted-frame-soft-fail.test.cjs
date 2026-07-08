'use strict';

// MPI-225 — deleting a preview card whose start-frame a queued/running gen
// sources from strands the frame: the lazy dispatch-time upload fetches the
// now-deleted /project-file source → HTTP 404 → the raw "Failed to prepare blob"
// crash + GitHub-report dialog. The upload loop catches that ONE case and
// re-throws a friendly, actionable message; commandExecutor then surfaces the
// ui:error dialog and settles the job cleanly. Any OTHER upload failure keeps
// the raw error.
//
// This pins the detection predicate (source is a /project-file URL AND the
// error is a 404) mirrored from js/services/comfyController.js ~L1048.

const assert = require('node:assert/strict');
const test = require('node:test');

const FRIENDLY = 'The input image for this generation was deleted. Re-add it and try again.';

// Replica of the source's catch-branch decision.
function mapUploadError(val, err) {
    if (typeof val === 'string' && val.includes('project-file') && /HTTP 404/.test(err.message || '')) {
        return new Error(FRIENDLY);
    }
    return err;
}

test('deleted /project-file source (404) → friendly message', () => {
    const raw = new Error('[ComfyUIController] Failed to prepare blob for mpi_input_start_frame.png: source returned HTTP 404');
    const out = mapUploadError('/project-file?path=%2Fp%2Fx.png&v=123', raw);
    assert.equal(out.message, FRIENDLY);
});

test('non-404 upload failure on /project-file → raw error kept', () => {
    const raw = new Error('[ComfyUIController] Comfy upload failed: HTTP 500');
    const out = mapUploadError('/project-file?path=%2Fp%2Fx.png', raw);
    assert.equal(out, raw); // untouched
});

test('404 on a non-/project-file source (e.g. remote http) → raw error kept', () => {
    const raw = new Error('source returned HTTP 404');
    const out = mapUploadError('http://pod/input/x.png', raw);
    assert.equal(out, raw);
});
