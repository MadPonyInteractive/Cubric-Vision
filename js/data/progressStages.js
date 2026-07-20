/**
 * progressStages.js — recorded 0-100% bar count per workflow + run mode (MPI-147).
 *
 * The status bar runs the progress fill 0-100% PER tqdm bar and shows "Stage N/M".
 * `M` (the bar count) can't be derived from the workflow JSON, AND it depends on the
 * RUN MODE — the SAME file produces a different number of bars depending on whether
 * it runs single-stage, as a multi-stage preview, or as a stage-2 finish:
 *
 *   single  — not a multi-stage op, OR a multi-stage op run straight to finish.
 *   preview — multi-stage op, `previewOnly` (runs only the first sampler).
 *   stage2  — multi-stage op, `isStage2` (the stage-2 file: second sampler only).
 *
 * Example (LTX, see commandRegistry t2v_ms note):
 *   single  = 3  (model-load + sampler A [2 steps] + sampler B)
 *   preview = 2  (model-load + sampler A only)
 *   stage2  = 1  (second sampler only)
 *
 * Counting a workflow: run it in each mode, watch the ComfyUI terminal, count how
 * many times a tqdm bar restarts at 0 (INCLUDING the `0/1` model-load bar). No entry
 * → the stage counter still ticks up, just without a total ("· 2" not "· 2/3").
 *
 * Key = workflow filename WITHOUT the `_stage2` suffix (stripped by the lookup).
 *
 * See commandRegistry.js (run modes), comfy_workflows/scripts/workflow_generation/
 * README.md, and docs/builder/05-author-and-test.md.
 */

'use strict';

export const PROGRESS_STAGES = Object.freeze({
    // LTX — measured single=3 (load + 7-step + 3-step). preview/stage2 per the
    // registry's two-stage split (first sampler = 2 steps, second = 1).
    'ltx_t2v.json': Object.freeze({ single: 3, preview: 2, stage2: 1 }),
    'ltx_i2v.json': Object.freeze({ single: 3, preview: 2, stage2: 1 }),
    // WAN — verified single=2 (one bar per sampler; no separate model-load bar).
    'wan22_t2v.json': Object.freeze({ single: 2, preview: 1, stage2: 1 }),
    'wan22_i2v.json': Object.freeze({ single: 2, preview: 1, stage2: 1 }),
    // WAN 2.2 5B — single-stage, ONE sampler pass = 1 bar (verified). Shows "1/1".
    'wan5b_t2v.json': Object.freeze({ single: 1 }),
    'wan5b_i2v.json': Object.freeze({ single: 1 }),
    // Text-to-image (SDXL family) — single-stage, verified 2 bars (load + sampler).
    // Upscalers/detailers NOT yet counted (UltimateSDUpscale has its own passes).
    't2i_ill_anime.json':        Object.freeze({ single: 2 }),
    't2i_ill_anime_beauty.json': Object.freeze({ single: 2 }),
    't2i_pony_mix.json':         Object.freeze({ single: 2 }),
    't2i_sdxl_nsfw.json':        Object.freeze({ single: 2 }),
    't2i_sdxl_realistic.json':   Object.freeze({ single: 2 }),
    // NVIDIA PiD upscaler — one 4-step distilled sampler pass = a single tqdm bar
    // (no separate model-load bar surfaces). Live-confirmed 2026-07-03.
    'nvidia_pid.json':           Object.freeze({ single: 1 }),
    // Krea2 (MPI-242, re-counted MPI-316) — single-stage: BOTH ClownsharK sampler
    // passes live in one file with a direct latent hand-off, so there is no
    // `preview`/`stage2` mode. One file serves t2i, i2i AND poseReference
    // (Input_Is_i2i / Input_depth_reference select the branch), and this table is
    // keyed by FILE, so one key covers all three. stagesFor() strips the _sfw/_nsfw
    // suffix, so this one key also covers both content variants.
    //
    // 1 bar = the sampler, with the quality tier (Input_Tier 1). The FAST tier emits a
    // SECOND bar — user-counted 2026-07-20, turbo vs non-turbo on the same graph. Tier
    // is a runtime toggle, not a file (MPI-316), so that +1 CANNOT live in this table:
    // it is supplied per run as `extraBars` from commandExecutor, exactly like the
    // enhancer delta. Recording 2 here would show `1/2` on every quality run.
    //
    // The prompt enhancer also runs before sampling, but it only fills ~10-20% of a
    // bar rather than emitting its own, so it is NOT counted (user-confirmed
    // 2026-07-20, superseding the MPI-242 note in stagesFor's docblock).
    // Its detailer/upscaler get NO entry, per the convention above.
    'krea2_t2i.json':            Object.freeze({ single: 1 }),
    // Boogu-Image-Edit (MPI-257) — one graph per tier, ONE SamplerCustom pass (the
    // MpiAnySwitch selects the tier's chain; only that chain runs). Live-confirmed 1 bar
    // (sampler only; no separate model-load bar surfaces, same as PiD) — MPI-266 fixed the
    // provisional 2. Keyed per-file. fp8 Balanced dropped (dark on Blackwell); Balanced is
    // now the int8_convrot turbo weight.
    'boogu_edit_high.json':      Object.freeze({ single: 1 }),
    'boogu_edit_balanced.json':  Object.freeze({ single: 1 }),
    // Qwen-Image-Edit 2511 (MPI-300) — ONE graph serves all three tiers (the qwenTier
    // radio drives Input_Tier → an MpiAnySwitch picking the model path + step count), and
    // this table is keyed by FILE, so one entry covers Quality/Turbo/Hyper. A single
    // KSampler runs on every tier — only its step count changes (20/8/4) — and no separate
    // model-load bar surfaces, same as Boogu/PiD. Confirmed 1 bar on Hyper (two completed
    // runs, 2026-07-18); Quality swaps the accelerator LoRA for the raw UNET but keeps the
    // same single sampler, so the count is structural rather than per-tier.
    'qwen_edit.json':            Object.freeze({ single: 1 }),
});

/**
 * Recorded bar count for a workflow file in a given run mode, or 0 if unrecorded.
 *
 * `extraBars` adds run-time bars the static table cannot know about, because
 * they depend on a toggle rather than on the file+mode. Today's only case is the
 * prompt enhancer (MPI-242): a `TextGenerate` node runs the text encoder's LM
 * head for up to `max_length` autoregressive steps, which surfaces as its OWN
 * tqdm bar — but only when `Input_Enhance_Prompt` is true. Folding it into the
 * table would show `3/2` with the toggle on and `2/3` with it off; both are
 * worse than no total. An unrecorded workflow (0) stays unrecorded — a delta on
 * top of "unknown" is still unknown.
 *
 * @param {string} workflowFile  e.g. 'ltx_t2v.json' or 'ltx_t2v_stage2.json'
 * @param {'single'|'preview'|'stage2'} mode
 * @param {number} [extraBars=0]  additional tqdm bars this specific run will emit
 * @returns {number}
 */
export function stagesFor(workflowFile, mode = 'single', extraBars = 0) {
    if (!workflowFile) return 0;
    // Strip _stage2, then any arch-variant suffix (MPI-200: _fp8/_mxfp8/…). A
    // variant swaps only the loader node, not the sampler graph, so the bar
    // count is identical to the base file — normalize back to it instead of
    // duplicating a row per variant.
    const base = workflowFile
        .replace(/_stage2\.json$/i, '.json')
        .replace(/_(?:fp8|mxfp8)\.json$/i, '.json')
        .replace(/_(?:sfw|nsfw)\.json$/i, '.json');
    const entry = PROGRESS_STAGES[base];
    const recorded = entry ? (entry[mode] || 0) : 0;
    return recorded === 0 ? 0 : recorded + Math.max(0, extraBars | 0);
}
