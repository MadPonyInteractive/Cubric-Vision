'use strict';
// MPI-242 / MPI-466 — an OPTIONAL media input may not depend on a staged file.
//
// HISTORY, because the rule INVERTED and the old form reads plausible. ComfyUI
// validates every Load* node in a workflow even when its output is unreached (e.g.
// behind a stage gate), so a graph carrying `LoadLatent` had a baked filename that
// had to really exist in the engine `input/`. The app therefore shipped three dummy
// `.latent` files and copied them in before every multi-stage submit.
//
// Both halves of that are now GONE:
//   - MPI-272 moved image/audio onto self-gating MpiLoadImageFromPath / MpiLoadAudio
//     path nodes (empty `string` = no media), leaving latents the sole survivor.
//   - MPI-466 moved LTX — the last holdout — onto MpiStageLatents, which reads its
//     stage-1 file from a `load_path` widget the app writes per run. With no
//     `LoadLatent` anywhere, `WORKFLOW_INPUT_DEFAULTS`, the three dummy latents and
//     the `/comfy/prepare-workflow-inputs` route were all deleted.
//
// So the rule is no longer "bake a name that staging provides" — nothing is staged.
// It is: an optional-media graph must carry NO bare Load* node at all, because there
// is nothing left to make one validate. That is a stronger check than the old one,
// and it fails loudly if the staging path is ever reintroduced by accident.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {

const ROOT = path.join(__dirname, '..');
const WF_DIR = path.join(ROOT, 'comfy_workflows');

// Guard the guard: if staging comes back, this test's premise is wrong and it must be
// rewritten rather than silently passing against a mechanism it no longer models.
const comfyRoutes = fs.readFileSync(path.join(ROOT, 'routes', 'comfy.js'), 'utf8');
assert.ok(!comfyRoutes.includes('WORKFLOW_INPUT_DEFAULTS'),
    'routes/comfy.js declares WORKFLOW_INPUT_DEFAULTS again — input staging is back, so ' +
    'the baked-name rule this test replaced applies once more. Rewrite this test.');

const MEDIA_CLASSES = ['LoadImage', 'LoadImageMask', 'LoadAudio', 'LoadLatent'];

// Which runtime workflows are reachable from an op that can run with NO media?
// Derived from the registry, never hardcoded — a new model is covered automatically.
const { MODELS } = await import('../js/data/modelConstants/models.js');
const { COMMANDS } = await import('../js/data/commandRegistry.js');

const optionalFiles = new Set();
for (const m of MODELS) {
    for (const [op, file] of Object.entries(m.workflows || {})) {
        if ((COMMANDS[op]?.requiresImages || 0) === 0) optionalFiles.add(file);
    }
}
assert.ok(optionalFiles.size > 0, 'no optional-media workflows found — derivation broke');

const violations = [];
let checkedFiles = 0;

for (const file of optionalFiles) {
    const full = path.join(WF_DIR, file);
    if (!fs.existsSync(full)) continue;
    checkedFiles++;
    const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
    for (const [id, node] of Object.entries(wf)) {
        if (!MEDIA_CLASSES.includes(node.class_type)) continue;
        const title = node._meta?.title || '(untitled)';
        violations.push(`${file} node ${id} (${node.class_type} "${title}") — bare Load* ` +
            `node in an optional-media graph. Nothing is staged into the engine input/ ` +
            `any more, so its baked filename will not resolve and ComfyUI rejects the ` +
            `whole graph at prompt time. Use MpiLoadImageFromPath / MpiLoadAudio (image, ` +
            `audio) or MpiStageLatents (latents).`);
    }
}

assert.ok(checkedFiles >= 5, `expected several optional-media workflows, checked ${checkedFiles}`);
assert.deepStrictEqual(violations, [], violations.join('\n  '));

// Positive control: the replacement really is in place on the graph that used to be the
// reference case. Without this, an empty violations list could just mean the derivation
// stopped finding files.
const ltx = JSON.parse(fs.readFileSync(path.join(WF_DIR, 'ltx_i2v_t2v.json'), 'utf8'));
const stageNode = Object.values(ltx).find(n => n._meta?.title === 'Input_Video_Latent');
assert.strictEqual(stageNode?.class_type, 'MpiStageLatents',
    'LTX Input_Video_Latent must be the MpiStageLatents node');
assert.ok(Array.isArray(stageNode.inputs?.latent),
    'MpiStageLatents.latent must be a WIRE — a string there is a filename widget, which ' +
    'would need the staging that no longer exists');
assert.strictEqual(typeof stageNode.inputs.load_path, 'string',
    'MpiStageLatents reads its stage-1 file from load_path, which the app writes per run');

// And the dummy files themselves are gone — a leftover would rot silently in the build.
for (const stale of ['ComfyUI_00001_.latent', 'ltx_video_latent_00001_.latent',
                     'ltx_audio_latent_00001_.latent']) {
    assert.ok(!fs.existsSync(path.join(WF_DIR, 'input', stale)),
        `comfy_workflows/input/${stale} is back — MPI-466 deleted the staged dummies`);
}

console.log(`optional-media-placeholder: ${checkedFiles} workflows, 0 bare Load* nodes`);

})().catch(err => { console.error(err.message || err); process.exit(1); });
