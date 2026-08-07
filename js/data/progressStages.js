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
    // LTX — COUNTED live on the re-exported 126-node graph, int8 balanced tier,
    // 768x448 / 2s (MPI-466, 2026-08-07). Bars are keyed off each run's own
    // /history execution window, so the modes cannot be confused for one another:
    //   single  90s / 57s = 3 bars (1-step, 7-step, 3-step)
    //   preview 42s       = 2 bars (1-step, 7-step) — the 3-step tail never runs
    //   stage2  45s       = 3 bars (1-step, 7-step, 3-step)
    // stage2 was `1`, inherited from the old 119-node build, and is the one value the
    // re-export moved. A Continue re-runs the stage-1 sampler (node 70
    // `LTXVNormalizingSampler`, titled "Stage1_Bypass", is NOT in `execution_cached`)
    // and only the latent SAVE is gated — the stage-2 run emits no `568:latents`.
    // That is accepted behaviour, not a bug to fix here: the count matches the graph.
    // MPI-466: the four LTX keys (t2v/i2v x arch) collapsed to ONE file per tier, and
    // `_int8` normalizes back to this row the same way `_fp8`/`_mxfp8` used to — the
    // variant swaps the loader, not the sampler graph.
    'ltx_i2v_t2v.json': Object.freeze({ single: 3, preview: 2, stage2: 3 }),
    // WAN — verified single=2 (one bar per sampler; no separate model-load bar).
    // MPI-470 deprecated t2v_ms, so the `wan22_t2v.json` row went with its graph.
    'wan22_i2v.json': Object.freeze({ single: 2, preview: 1, stage2: 1 }),
    // WAN 2.2 5B — single-stage, ONE sampler pass = 1 bar (verified). Shows "1/1".
    'wan5b_t2v.json': Object.freeze({ single: 1 }),
    'wan5b_i2v.json': Object.freeze({ single: 1 }),
    // MiniMax H3 — COUNTED live on 0.30.0, 864x480 / 56 frames, all three modes run
    // (MPI-452, 2026-08-06): single 145s = 2 bars (5-step then 15-step), preview 54s =
    // 1 bar (5), stage2 98s = 1 bar (15). ONE file serves both ops and both stages —
    // there is no _stage2 twin, because the lazy MpiSaveLatent `enabled` gate genuinely
    // skips the stage-1 sampler on a continue rather than running and discarding it
    // (proved here: the stage2 run emitted NO latent and only the 15-step bar).
    // Beware when re-counting: tqdm prints each finished bar TWICE, so a raw grep of
    // "100%" lines reads 4 for the single run. Count distinct bars, not lines.
    'minimax_h3_fl2va.json': Object.freeze({ single: 2, preview: 1, stage2: 1 }),
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
    // Krea2 — NO ENTRY as of MPI-365, deliberately. Same reason FLUX.2 Klein has never
    // had one: this table is keyed by FILE, and Krea2 now runs ALL SIX ops out of the
    // single krea2_t2i_<sfw|nsfw>.json master template. The bar count stopped being a
    // property of the file — t2i/i2i/depth/edit emit 2 (one per ClownsharK pass) while
    // detail (MaskDetailerPipe) and upscale (UltimateSDUpscale, one bar per tile) emit
    // more. Keeping `{ single: 2 }` would have rendered "Stage 3/2" on those two, which
    // reads as broken; no total merely reads as unknown.
    //
    // Consequence, accepted: Krea2 now shows "· 2" instead of "· 2/2" on every op,
    // exactly as Klein does. Restoring the total needs this table to become per-model +
    // per-op — that is on MPI-365's GC list, not worth a bespoke branch here.
    //
    // `postTile` DOES survive the move, and must: phaseProgress only reads it from
    // inside tile() (once UltimateSDUpscale emits tile events), so it is inert on
    // t2i/i2i/depth/edit and still counts MPI-350's post-tile refiner on the upscale
    // branch. That is why this key carries postTile but deliberately no `single`.
    //
    // (Measurement kept for whoever does the per-op work: both speeds are two-pass —
    // quality 25 steps @ cfg 3.5 then a 3-step accelerator-LoRA pass at denoise 0.19,
    // turbo 8 steps then the same 3-step pass. The prompt enhancer does NOT emit its own
    // bar, it fills ~10-20% of one; user-confirmed 2026-07-20.)
    'krea2_t2i.json':            Object.freeze({ postTile: 1 }),
    // Chroma — NO ENTRY, deliberately, and unlike Krea2 there is not even a `postTile`
    // to justify a key. Same one-master-template problem: t2i/i2i/depth each emit ONE
    // bar (a single ClownsharKSampler pass — Chroma has no accelerator second pass, so
    // it is 1 where Krea2 is 2), while detail (MaskDetailerPipe) varies with how many
    // separate masks were painted and upscale (UltimateSDUpscale) varies with the tile
    // grid. `{ single: 1 }` would therefore render "Stage 3/1" on those two, which reads
    // as broken; no total merely reads as unknown. Counts are the user's, 2026-08-02.
    //
    // No `postTile`: Chroma's UltimateSDUpscale output goes straight to the upscale
    // reroute with no refiner pass after it, so MPI-350's post-tile counter has nothing
    // to count here. An empty object would be identical to no entry at all (see the
    // header: "No entry → the stage counter still ticks up, just without a total"), so
    // this comment IS the record. Restoring real totals needs the per-model + per-op
    // table on MPI-365's GC list.
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
    // (MPI-350's krea2_upscaler.json entry moved onto krea2_t2i.json above — MPI-365
    // folded the upscaler into the master template, so that filename no longer exists.
    // The reasoning it carried still applies: no `single`, because UltimateSDUpscale's
    // tile count is the stage total and is only known at runtime, while the ONE post-tile
    // refiner pass IS static and is what `postTile` records.)
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
// Strip _stage2, then any arch-variant suffix (MPI-200: _fp8/_mxfp8/…). A
// variant swaps only the loader node, not the sampler graph, so the bar
// count is identical to the base file — normalize back to it instead of
// duplicating a row per variant.
const _baseKey = (workflowFile) => workflowFile
    .replace(/_stage2\.json$/i, '.json')
    .replace(/_(?:fp8|mxfp8|int8)\.json$/i, '.json')
    .replace(/_(?:sfw|nsfw)\.json$/i, '.json');

export function stagesFor(workflowFile, mode = 'single', extraBars = 0) {
    if (!workflowFile) return 0;
    const entry = PROGRESS_STAGES[_baseKey(workflowFile)];
    const recorded = entry ? (entry[mode] || 0) : 0;
    return recorded === 0 ? 0 : recorded + Math.max(0, extraBars | 0);
}

/**
 * Bars a workflow runs AFTER UltimateSDUpscale's tiles finish (MPI-350), or 0.
 *
 * Separate from `stagesFor` because it is not a total — it is a delta the tile
 * counter adds to the tile count it discovers at runtime. Only graphs with a
 * post-tile pass record it; every other USDU card gets 0 and is unaffected.
 *
 * @param {string} workflowFile
 * @returns {number}
 */
export function postTileBarsFor(workflowFile) {
    if (!workflowFile) return 0;
    const entry = PROGRESS_STAGES[_baseKey(workflowFile)];
    return entry ? (entry.postTile || 0) : 0;
}
