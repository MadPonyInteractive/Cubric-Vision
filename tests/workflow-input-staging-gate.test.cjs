'use strict';
// MPI-242 — _prepareWorkflowInputs staging gate.
// The gate used to be an op-type proxy (`commandIsMultiStage`, then
// `mediaType === 'video'`). Both failed when a NEW workflow shape appeared.
// The real rule: stage iff the workflow carries a media-input node.
const assert = require('assert');

const MEDIA_INPUT_CLASSES = new Set(['LoadImage', 'LoadImageMask', 'LoadAudio', 'LoadLatent']);

/** Mirrors the `hasMediaInput` predicate in commandExecutor._prepareWorkflowInputs. */
const shouldStage = (workflow) => {
    if (!workflow || typeof workflow !== 'object') return false;
    return Object.values(workflow).some(n => MEDIA_INPUT_CLASSES.has(n?.class_type));
};

const wf = (...classes) => Object.fromEntries(
    classes.map((c, i) => [String(i + 1), { class_type: c, inputs: {} }])
);

// ── the shapes that must stage ────────────────────────────────────────────────
assert.strictEqual(shouldStage(wf('LoadImage', 'KSampler')), true,
    'LTX/Wan5B t2v: optional Input_Start_Frame');
assert.strictEqual(shouldStage(wf('CLIPTextEncode', 'LoadLatent')), true,
    'multi-stage _stage2: LoadLatent');
assert.strictEqual(shouldStage(wf('LoadAudio')), true, 'LTX audio slot');
assert.strictEqual(shouldStage(wf('LoadImageMask')), true, 'detailer mask');

// Krea2 t2i — the case the old `mediaType === 'video'` gate silently skipped.
// One graph serves t2i + i2i + pose-reference, so plain t2i carries an OPTIONAL
// LoadImage whose baked filename must resolve or ComfyUI rejects the graph.
assert.strictEqual(shouldStage(wf('UNETLoader', 'LoadImage', 'PreviewImage')), true,
    'Krea2 t2i: IMAGE op with an optional LoadImage MUST stage');

// ── the shapes that must NOT stage ────────────────────────────────────────────
// Staging uploads every default to the Pod on the remote engine, so a graph with
// no media node must skip it.
assert.strictEqual(shouldStage(wf('CheckpointLoaderSimple', 'KSampler', 'PreviewImage')), false,
    'Chroma/SDXL t2i: no Load* node ⇒ no staging, no Pod upload');
assert.strictEqual(shouldStage({}), false, 'empty workflow');
assert.strictEqual(shouldStage(null), false, 'null workflow must not throw');
assert.strictEqual(shouldStage(undefined), false, 'undefined workflow must not throw');

// A node with no class_type must not crash the scan.
assert.strictEqual(shouldStage({ 1: {}, 2: { class_type: 'LoadImage' } }), true,
    'malformed node is skipped, real one still found');
assert.strictEqual(shouldStage({ 1: null }), false, 'null node must not throw');

// A LoadImage anywhere in the graph counts, regardless of node id ordering.
assert.strictEqual(shouldStage({ 99: { class_type: 'LoadImage' }, 1: { class_type: 'KSampler' } }), true,
    'order-independent');

// Near-miss class names must NOT trigger staging.
assert.strictEqual(shouldStage(wf('LoadImageFromUrl')), false, 'unknown Load* class is not a media input');
assert.strictEqual(shouldStage(wf('ImageLoad')), false, 'not a media-input class');

console.log('workflow-input-staging-gate: all assertions passed');
