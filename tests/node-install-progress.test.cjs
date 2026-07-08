'use strict';

// MPI-231 — install progress bar overshoots (203 MB / 15 MB) during a custom-node
// dep install. A GitHub /archive/ zip has no Content-Length (denominator falls back
// to a tiny registry seed) while the numerator counts real streamed bytes, and the
// requirements pip phase pulls ~200MB of wheels with no honest total. custom_nodes
// must be EXCLUDED from both sides of the byte ratio (work-not-bytes) so the bar
// never reads > 100%.

const assert = require('node:assert/strict');
const test = require('node:test');

const { _byteRatioExcludingNodes } = require('../routes/downloadManager.js');

const MB = 1024 * 1024;

test('node zip download does not overshoot its seed denominator', () => {
    // RES4LYF: seed 15MB, real streamed 203MB, no Content-Length (totalBytes 0).
    const deps = [
        { type: 'custom_nodes', downloadedBytes: 203 * MB, totalBytes: 0, seedBytes: 15 * MB },
    ];
    const { downloaded, total } = _byteRatioExcludingNodes(deps, 'local');
    assert.equal(total, 0, 'node bytes excluded from denominator');
    assert.equal(downloaded, 0, 'node bytes excluded from numerator');
    // Consumer flips indeterminate when total <= 0 → no lying ratio rendered.
});

test('weights stay in the ratio; nodes alongside them do not inflate it', () => {
    const deps = [
        { type: 'diffusion_models', downloadedBytes: 5 * MB, totalBytes: 10 * MB, seedBytes: 12 * MB },
        { type: 'custom_nodes', downloadedBytes: 203 * MB, totalBytes: 0, seedBytes: 15 * MB },
    ];
    const { downloaded, total } = _byteRatioExcludingNodes(deps, 'local');
    assert.equal(downloaded, 5 * MB, 'only weight bytes counted');
    assert.equal(total, 10 * MB, 'only weight real-total counted (seed excluded once real known)');
    assert.ok(downloaded <= total, 'ratio never exceeds 100%');
});

test('local falls back to seed while weight real total unknown; remote uses _depDenominator', () => {
    const deps = [
        { type: 'diffusion_models', downloadedBytes: 3 * MB, totalBytes: 0, seedBytes: 10 * MB },
    ];
    // local: totalBytes 0 → seed floor keeps the bar from snapping to 100% early.
    assert.equal(_byteRatioExcludingNodes(deps, 'local').total, 10 * MB);
    // remote: _depDenominator is real-or-seed → same floor here.
    assert.equal(_byteRatioExcludingNodes(deps, 'remote').total, 10 * MB);
});
