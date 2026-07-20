'use strict';
// MPI-242 — the `Output_prompt` capture contract + the enhancer's progress bar.
//
// GENERAL contract, not a Krea2 special case (docs/add-model-playbook.md §10):
// a workflow carrying a PreviewAny node titled `Output_prompt` declares that the
// string IT encoded — not the prompt-box text — is the prompt of record.
//
// These import the REAL modules rather than mirroring their logic, so the test
// fails when the source changes. The gate predicates below are mirrors (they
// live inside DOM-bound files that cannot be imported under Node).
const assert = require('assert');

(async () => {

// ── readComfyOutputText: the PreviewAny payload reader ────────────────────────
// PreviewAny.main returns {"ui": {"text": (value,)}} and is an OUTPUT_NODE, so the
// string arrives on `executed` as `text: [str]` (comfy_extras/nodes_preview_any.py).
const { readComfyOutputText, collectComfyOutputUrls } = await import('../js/utils/comfyOutputUrls.js');

assert.strictEqual(readComfyOutputText({ text: ['a photo of a cat'] }), 'a photo of a cat',
    'must read the first element of the text tuple');
assert.strictEqual(readComfyOutputText({ text: ['  padded  '] }), 'padded',
    'must trim — ComfyUI templates leave trailing newlines');

// Absence must be null, never '' — generationService branches on falsy to fall
// back to the prompt box, and '' would silently blank the saved prompt.
assert.strictEqual(readComfyOutputText({ text: [] }), null, 'empty tuple => null');
assert.strictEqual(readComfyOutputText({ text: [''] }), null, 'empty string => null');
assert.strictEqual(readComfyOutputText({ text: ['   '] }), null, 'whitespace-only => null');
assert.strictEqual(readComfyOutputText({}), null, 'no text key => null');
assert.strictEqual(readComfyOutputText(null), null, 'null payload => null');
assert.strictEqual(readComfyOutputText({ text: 'not-an-array' }), null, 'non-array => null');
assert.strictEqual(readComfyOutputText({ images: [{ filename: 'a.png' }] }), null,
    'an IMAGE payload must yield no text');

// The inverse guard: a text payload must never enter the media URL array. If it
// did, every downstream media consumer (gallery, sidecar, preview) would choke on
// a bare string where it expects a /view URL.
const urls = [];
collectComfyOutputUrls(() => 'URL', { text: ['some prompt'] }, urls);
assert.deepStrictEqual(urls, [], 'a text-only payload must contribute no URLs');

// ── stagesFor: the enhancer adds a tqdm bar, but only when toggled on ─────────
// TextGenerate runs the text encoder's LM head autoregressively before sampling.
// A static table cannot know that (it depends on a toggle, not the file+mode).
const { stagesFor } = await import('../js/data/progressStages.js');

assert.strictEqual(stagesFor('krea2_turbo_t2i.json', 'single'), 2,
    'baseline: model-load + sampler');
assert.strictEqual(stagesFor('krea2_turbo_t2i.json', 'single', 0), 2,
    'enhance OFF must not change the recorded count');
assert.strictEqual(stagesFor('krea2_turbo_t2i.json', 'single', 1), 3,
    'enhance ON adds exactly one bar — else the counter shows 3/2 and reads as a hang');

// An unrecorded workflow stays unrecorded. A delta on top of "unknown" is still
// unknown; returning 1 here would invent a total of 1 and show "2/1".
assert.strictEqual(stagesFor('not-a-real-workflow.json', 'single', 1), 0,
    'unrecorded + extraBars must stay 0, never fabricate a total');
assert.strictEqual(stagesFor('', 'single', 1), 0, 'empty filename => 0');

// Existing callers pass no third arg — their behaviour must be byte-identical.
assert.strictEqual(stagesFor('LTX_t2v.json', 'single'), 3, 'LTX single unchanged');
assert.strictEqual(stagesFor('LTX_t2v_stage2.json', 'stage2'), 1, '_stage2 suffix still stripped');
assert.strictEqual(stagesFor('Wan5B_t2v.json', 'single'), 1, 'Wan5B unchanged');

// Negative/garbage deltas must not corrupt a real count.
assert.strictEqual(stagesFor('krea2_turbo_t2i.json', 'single', -5), 2, 'negative delta clamps to 0');

// ── the sidecar preference rule (mirrors generationService.exec.onComplete) ────
// `positive = outputInfo.promptText || _positiveFromBox`
const resolvePrompt = (promptText, boxText) => promptText || boxText;

assert.strictEqual(resolvePrompt('expanded prompt', 'short'), 'expanded prompt',
    'Output_prompt wins over the prompt box');
assert.strictEqual(resolvePrompt(null, 'short'), 'short',
    'no Output_prompt node => the prompt box, unchanged (every existing workflow)');
assert.strictEqual(resolvePrompt(undefined, 'short'), 'short',
    'a workflow that never fired the node falls back');
assert.strictEqual(resolvePrompt('', 'short'), 'short',
    'an empty capture must not blank the saved prompt');

// ── the two capability gates (mirror MpiPromptBox._refreshOpSlot) ─────────────
// Both default FALSE — unlike negativePrompt, a model must opt in.
const showStyle   = (m) => m?.capabilities?.styleLoras === true;
const showEnhance = (m) => m?.capabilities?.promptEnhance === true;

assert.strictEqual(showStyle({ capabilities: {} }), false, 'styleLoras absent => hidden');
assert.strictEqual(showStyle({}), false, 'no capabilities bag => hidden');
assert.strictEqual(showStyle(null), false, 'null model => hidden (boot order)');
assert.strictEqual(showStyle({ capabilities: { styleLoras: true } }), true, 'opt-in shows it');

assert.strictEqual(showEnhance({ capabilities: {} }), false, 'promptEnhance absent => hidden');
assert.strictEqual(showEnhance(null), false, 'null model => hidden');
assert.strictEqual(showEnhance({ capabilities: { promptEnhance: true } }), true, 'opt-in shows it');

// T5/umT5 encoders CRASH on TextGenerate (AttributeError, no graceful degrade).
// Chroma + Wan must never carry the capability.
const { MODELS } = await import('../js/data/modelConstants/models.js');
for (const m of MODELS) {
    if (m.capabilities?.promptEnhance === true) {
        assert.ok(['krea2'].includes(m.type),
            `${m.id}: promptEnhance requires a CLIP with .generate() — T5/umT5 models crash`);
    }
    if (m.capabilities?.styleLoras === true) {
        assert.ok(Array.isArray(m.styleLoraLabels) && m.styleLoraLabels.length > 1,
            `${m.id}: styleLoras:true requires styleLoraLabels`);
        // Index 0 is the no-style entry (it zeroes every MpiMath gate). The CONTRACT is
        // positional — the label is free text, so a future style-rack model can name it
        // whatever it likes. Only assert that a label exists there.
        assert.ok(typeof m.styleLoraLabels[0] === 'string' && m.styleLoraLabels[0].length > 0,
            `${m.id}: index 0 must carry a no-style label (it zeroes every MpiMath gate)`);
    }
}

// ── op scoping: the style rack + enhancer exist only on the base graph ────────
// Krea2's detailer/upscaler graphs carry no style nodes and no TextGenerate.
const { COMMANDS } = await import('../js/data/commandRegistry.js');
const STYLE_CTRLS = ['styleSelect', 'stylization', 'enhancePrompt'];

for (const op of ['t2i', 'i2i']) {
    for (const c of STYLE_CTRLS) {
        assert.ok(COMMANDS[op].components.includes(c), `${op} must offer ${c}`);
    }
}
for (const op of ['upscale', 'detail']) {
    for (const c of STYLE_CTRLS) {
        assert.ok(!COMMANDS[op].components.includes(c),
            `${op} must NOT offer ${c} — its graph has no such node`);
    }
}

// Krea2's own label list must be index-aligned with its nine LoRA slots (+ index 0).
const krea2 = MODELS.find(m => m.id === 'krea2');
assert.ok(krea2, 'krea2 must exist');
assert.strictEqual(krea2.styleLoraLabels.length, 10,
    '9 style LoRAs + the no-style entry at index 0 — a missing label silently half-applies a style');

console.log('output-prompt-capture: all assertions passed');

})().catch(err => { console.error(err); process.exit(1); });
