'use strict';
// MPI-242 — every OPTIONAL media input must bake a filename that staging provides.
//
// Two independent mechanisms, and both must line up:
//   1. STAGING — routes/comfy.js copies WORKFLOW_INPUT_DEFAULTS into the engine `input/`.
//   2. BAKING  — the workflow JSON names the file its Load* node asks for.
//
// Nothing is injected into an optional media node (by definition: the op can run with
// no image), so ComfyUI validates the BAKED name. Bake a name staging doesn't provide
// and the graph fails validation at prompt time.
//
// A REQUIRED media input (requiresImages >= 1) is exempt: the injector overwrites the
// widget before submit, so its baked value is dead data. Chroma's detailer/upscaler have
// shipped for months baking local scratch filenames. Do NOT "fix" those.
//
// This is the guard that makes the placeholder survive a re-export. LTX/Wan get it for
// free because their generators stamp it (generate_ltx.py, generate_wan5b.py); a
// hand-exported workflow has no such stamp, so the mistake is caught here instead.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {

const ROOT = path.join(__dirname, '..');
const WF_DIR = path.join(ROOT, 'comfy_workflows');

// The files routes/comfy.js stages into the engine `input/` before submit.
// Kept in sync by the assertion below, so a drift here fails loudly.
const STAGED = ['ComfyUI_00001_.latent', 'ltx_video_latent_00001_.latent',
                'ltx_audio_latent_00001_.latent', 'placeholder.png', 'ltx_silence.wav'];

// Guard the guard: if WORKFLOW_INPUT_DEFAULTS changes, this list must too.
const comfyRoutes = fs.readFileSync(path.join(ROOT, 'routes', 'comfy.js'), 'utf8');
const declared = comfyRoutes
    .match(/WORKFLOW_INPUT_DEFAULTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)[1]
    .match(/'([^']+)'/g).map(s => s.slice(1, -1));
assert.deepStrictEqual(declared.sort(), [...STAGED].sort(),
    'WORKFLOW_INPUT_DEFAULTS drifted — update STAGED in this test');

const MEDIA_CLASSES = ['LoadImage', 'LoadImageMask', 'LoadAudio', 'LoadLatent'];
const bakedName = (n) => n.inputs?.image ?? n.inputs?.audio ?? n.inputs?.latent ?? null;

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

// A model's `workflows` map names the BASE file; resolveWorkflowFile appends _stage2 and
// arch-variant suffixes at runtime. Those variants exist on disk and carry the same
// Load* nodes, so hold them to the same rule.
const variantsOf = (base) => {
    const stem = base.replace(/\.json$/, '');
    return fs.readdirSync(WF_DIR).filter(f =>
        f === base || new RegExp(`^${stem}(_stage2|_fp8|_mxfp8|_fp8_stage2|_mxfp8_stage2)\\.json$`).test(f));
};

const violations = [];
let checkedFiles = 0;
let checkedNodes = 0;

for (const base of optionalFiles) {
    for (const file of variantsOf(base)) {
        const full = path.join(WF_DIR, file);
        if (!fs.existsSync(full)) continue;
        checkedFiles++;
        const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
        for (const [id, node] of Object.entries(wf)) {
            if (!MEDIA_CLASSES.includes(node.class_type)) continue;
            checkedNodes++;
            const baked = bakedName(node);
            const title = node._meta?.title || '(untitled)';
            if (!STAGED.includes(baked)) {
                violations.push(`${file} node ${id} (${node.class_type} "${title}") bakes ` +
                    `"${baked}" — not staged. Set it to a WORKFLOW_INPUT_DEFAULTS name ` +
                    `(usually placeholder.png) in ComfyUI and re-export.`);
            }
        }
    }
}

assert.ok(checkedFiles >= 5, `expected several optional-media workflows, checked ${checkedFiles}`);
assert.ok(checkedNodes > 0, 'no media nodes inspected — class list or derivation broke');

assert.deepStrictEqual(violations, [],
    'optional media inputs must bake a staged filename:\n  ' + violations.join('\n  '));

// Positive control: the rule really is satisfied by the workflows that shipped correctly.
const ltx = JSON.parse(fs.readFileSync(path.join(WF_DIR, 'LTX_t2v.json'), 'utf8'));
const startFrame = Object.values(ltx).find(n => n._meta?.title === 'Input_Start_Frame');
assert.strictEqual(bakedName(startFrame), 'placeholder.png',
    'LTX_t2v Input_Start_Frame is the reference case — its generator stamps this');

console.log(`optional-media-placeholder: ${checkedFiles} workflows, ${checkedNodes} media nodes, 0 violations`);

})().catch(err => { console.error(err.message || err); process.exit(1); });
