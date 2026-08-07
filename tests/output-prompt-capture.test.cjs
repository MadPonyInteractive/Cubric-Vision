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

// Keyed on an SDXL t2i file: it still records a `single` total, which is what these
// three assertions are actually about (the enhancer delta arithmetic, not the model).
// This used to key on krea2_t2i.json — see the Krea2 assertion below for why it moved.
assert.strictEqual(stagesFor('t2i_sdxl_realistic.json', 'single'), 2,
    'baseline: one bar per sampler pass');
assert.strictEqual(stagesFor('t2i_sdxl_realistic.json', 'single', 0), 2,
    'enhance OFF must not change the recorded count');
assert.strictEqual(stagesFor('t2i_sdxl_realistic.json', 'single', 1), 3,
    'a +1 delta adds exactly one bar — else the counter shows 3/2 and reads as a hang');

// MPI-365: Krea2 deliberately has NO recorded total any more. All six of its ops run the
// one master template, and this table is keyed by FILE — detail (MaskDetailerPipe) and
// upscale (UltimateSDUpscale, one bar per tile) emit more bars than t2i's two, so a
// single recorded number would render "Stage 3/2" on those ops. Unknown beats wrong.
// Pinned so a future "helpful" re-add is caught here rather than in the status bar.
assert.strictEqual(stagesFor('krea2_t2i_sfw.json', 'single'), 0,
    'Krea2 records no total: one file, six ops, different bar counts');
assert.strictEqual(stagesFor('krea2_t2i_sfw.json', 'single', 1), 0,
    'a delta on top of "unknown" stays unknown — never invent a total of 1');

// An unrecorded workflow stays unrecorded. A delta on top of "unknown" is still
// unknown; returning 1 here would invent a total of 1 and show "2/1".
assert.strictEqual(stagesFor('not-a-real-workflow.json', 'single', 1), 0,
    'unrecorded + extraBars must stay 0, never fabricate a total');
assert.strictEqual(stagesFor('', 'single', 1), 0, 'empty filename => 0');

// Existing callers pass no third arg — their behaviour must be byte-identical.
// NOTE: filenames must be LOWERCASE here. stagesFor() looks the key up verbatim (it
// only strips _stage2/_fp8/_sfw suffixes, it does not lowercase), and models.js stores
// these filenames lowercase, so 'LTX_t2v.json' silently missed the table and returned
// 0 — this assertion was failing before MPI-316 touched anything. Real callers pass the
// models.js value, which is already lowercase.
assert.strictEqual(stagesFor('ltx_i2v_t2v.json', 'single'), 3, 'LTX single unchanged');
// MPI-466: the balanced tier's `_int8` file normalizes back to the base row, the same way
// `_fp8`/`_mxfp8` did — a tier variant swaps the loader, never the sampler graph.
assert.strictEqual(stagesFor('ltx_i2v_t2v_int8.json', 'single'), 3, 'int8 tier normalizes to the base row');
// The `_stage2` strip is still live code, so it is still pinned — but no model produces
// such a filename any more: every multi-stage graph resolves stage 2 in-file now.
assert.strictEqual(stagesFor('ltx_i2v_t2v_stage2.json', 'stage2'), 1, '_stage2 suffix still stripped');
assert.strictEqual(stagesFor('wan5b_t2v.json', 'single'), 1, 'Wan5B unchanged');

// Negative/garbage deltas must not corrupt a real count. (Moved off krea2_t2i.json with
// the rest — Krea2 records no total since MPI-365, so it could no longer prove "a REAL
// count survives a garbage delta"; that needs a file that actually has one.)
assert.strictEqual(stagesFor('t2i_sdxl_realistic.json', 'single', -5), 2, 'negative delta clamps to 0');

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
//
// The allowlist is by model TYPE and holds only LLM-class text encoders, which are the
// ones whose CLIP implements `.generate()`:
//   krea2 — Qwen3-VL (abliterated)
//   klein — Qwen3-4B text-only (MPI-354); an LLM, not a T5 derivative
// Adding a type here is a claim about its ENCODER, not about the graph having an
// enhancer node. Check the encoder family before widening it.
const ENHANCER_CAPABLE_TYPES = ['krea2', 'klein'];
const { MODELS } = await import('../js/data/modelConstants/models.js');
for (const m of MODELS) {
    if (m.capabilities?.promptEnhance === true) {
        assert.ok(ENHANCER_CAPABLE_TYPES.includes(m.type),
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

// ── op scoping: a control must never be offered for a graph that lacks its node ──
//
// Until MPI-354 this was enforced by the op's `components` list alone — `upscale` and
// `detail` simply omitted the style controls, because the only style-rack model (Krea2)
// ships rack-less detailer/upscaler files. That stopped being expressible when a model
// arrived whose ops are all branches of ONE graph: Klein's detail and upscale DO carry
// the rack. So `components` now says "this control can exist for this op" and
// modelShowsStyleRack decides per MODEL.
//
// The invariant that actually matters is unchanged and is asserted directly below, per
// model x op, against the real workflow JSON: if the picker is shown, the graph it runs
// must contain the node it injects into. That is strictly stronger than the old check.
const { COMMANDS, modelShowsStyleRack } = await import('../js/data/commandRegistry.js');
const fs = require('fs');
const path = require('path');
const WF_DIR = path.join(__dirname, '..', 'comfy_workflows');

for (const op of ['t2i', 'i2i']) {
    for (const c of ['styleSelect', 'stylization', 'enhancePrompt']) {
        assert.ok(COMMANDS[op].components.includes(c), `${op} must offer ${c}`);
    }
}
// The enhancer is still base-graph-only: no detailer/upscaler carries TextGenerate, and
// Klein's enhancer sits on the shared text path, not on those branches.
for (const op of ['upscale', 'detail']) {
    assert.ok(!COMMANDS[op].components.includes('enhancePrompt'),
        `${op} must NOT offer enhancePrompt — no graph has TextGenerate on that path`);
}

const titlesOfWorkflow = (file) => new Set(
    Object.values(JSON.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8')))
        .map(n => (n?._meta?.title || '').toLowerCase()).filter(Boolean));

for (const m of MODELS) {
    for (const op of m.supportedOps || []) {
        const offered = (COMMANDS[op]?.components || []).includes('styleSelect')
            && modelShowsStyleRack(m, op);
        const file = m.workflows?.[op];
        if (!offered || !file || !fs.existsSync(path.join(WF_DIR, file))) continue;
        assert.ok(titlesOfWorkflow(file).has('input_style_selector'),
            `${m.id}: the style picker is shown on "${op}" but ${file} has no `
            + 'Input_Style_Selector node — the control would silently do nothing');
    }
}

// Krea2's label list must stay index-aligned with its style-card images (+ index 0 =
// the no-style entry). Asserting the two arrays against EACH OTHER rather than against
// a hardcoded count: the count grew 10 -> 11 when MidJourney was added and this test
// kept asserting the old number, which is the rot a literal invites. What actually
// matters is alignment — a label without its image (or vice versa) is the silent
// half-application this guards. The gate/trigger-line count is enforced at BUILD time
// by generate_krea2.py's _assert_style_rack.
const krea2 = MODELS.find(m => m.id === 'krea2');
assert.ok(krea2, 'krea2 must exist');
assert.ok(krea2.styleLoraLabels.length >= 2, 'krea2 must ship a style rack');
assert.strictEqual(krea2.styleLoraLabels.length, krea2.styleLoraImages.length,
    'every style label needs its card image and vice versa — a mismatch shifts the picker');
assert.strictEqual(krea2.styleLoraLabels[0], 'None', 'index 0 must be the no-style entry');

console.log('output-prompt-capture: all assertions passed');

})().catch(err => { console.error(err); process.exit(1); });
