'use strict';

// MPI-450 — a download job's bar must never exceed 100%.
//
// Live 2026-08-10: bumping node_lock's MpiNodes pin drifted the Pod volume, and the
// remote node-drift heal POSTed an install for `ltx-23` carrying ONE 1.76MB node dep.
// The job's denominator was SET from that request while its numerator summed
// modelJob.deps — which accumulates, and already held a 2.3GB weight attached by the
// MPI-97 shared-dep path. 2312149072 / 1845493.76 = 125,286%, clamped to a full bar
// on a model with no transformer, VAE or CLIP on the volume.
//
// The fix computes BOTH sides from modelJob.deps through _byteRatioExcludingNodes —
// the same helper the progress ticks use — so start and tick agree by construction.
// These tests pin the invariant, not the arithmetic of one call site.

const { test } = require('node:test');
const assert = require('assert');
const { _byteRatioExcludingNodes } = require('../routes/downloadManager');

// The exact dep set that produced 125,286%: one completed shared weight (attached
// from another model's install) plus the single node the drift heal sent.
const DRIFT_HEAL_JOB = [
    { id: 'ltx23-text-projection', type: 'text_encoders', downloadedBytes: 2312149072, totalBytes: 2312149072 },
    { id: 'ComfyUI-MpiNodes', type: 'custom_nodes', downloadedBytes: 0, totalBytes: 1845493.76 },
];

test('a subset-POST job cannot report more than 100%', () => {
    const { downloaded, total } = _byteRatioExcludingNodes(DRIFT_HEAL_JOB, 'remote');
    const progress = total > 0 ? downloaded / total : 0;
    assert.ok(progress <= 1, `progress ${progress} exceeds 1 — the denominator is not the numerator's dep set`);
    // Pin the specific regression: the node's 1.76MB must never become the denominator.
    assert.notStrictEqual(total, 1845493.76, 'custom_nodes leaked into the denominator (MPI-231)');
});

test('numerator and denominator come from the SAME dep set', () => {
    // Whatever the caller passes, both sides are summed over that one list. If a future
    // edit reintroduces a request-scoped denominator, this diverges.
    for (const active of ['local', 'remote']) {
        const { downloaded, total } = _byteRatioExcludingNodes(DRIFT_HEAL_JOB, active);
        assert.strictEqual(downloaded, 2312149072, `${active}: numerator dropped a weight dep`);
        assert.strictEqual(total, 2312149072, `${active}: denominator disagrees with the numerator's set`);
    }
});

test('a node-only job has no honest denominator, so it sweeps rather than lying', () => {
    // MPI-231/MPI-410: total 0 is the signal for the indeterminate sweep. A node-only
    // heal must land here instead of inventing a byte bar from a registry seed.
    const { downloaded, total } = _byteRatioExcludingNodes(
        [{ id: 'ComfyUI-MpiNodes', type: 'custom_nodes', downloadedBytes: 900000, totalBytes: 1845493.76 }],
        'remote',
    );
    assert.strictEqual(total, 0, 'a node-only job must have a 0 denominator (indeterminate)');
    assert.strictEqual(downloaded, 0, 'node bytes must not reach the numerator either');
});

test('a genuinely partial install reports a real fraction, not a clamped one', () => {
    // Guard the other direction: the fix must not flatten every job to 0% or 100%.
    const { downloaded, total } = _byteRatioExcludingNodes([
        { id: 'w1', type: 'diffusion_models', downloadedBytes: 500, totalBytes: 1000 },
        { id: 'w2', type: 'vae', downloadedBytes: 250, totalBytes: 1000 },
    ], 'remote');
    assert.strictEqual(downloaded / total, 0.375);
});
