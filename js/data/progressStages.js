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
    'LTX_t2v.json': Object.freeze({ single: 3, preview: 2, stage2: 1 }),
    'LTX_i2v.json': Object.freeze({ single: 3, preview: 2, stage2: 1 }),
    // WAN — verified single=2 (one bar per sampler; no separate model-load bar).
    'Wan22_t2v.json': Object.freeze({ single: 2, preview: 1, stage2: 1 }),
    'Wan22_i2v.json': Object.freeze({ single: 2, preview: 1, stage2: 1 }),
    // WAN 2.2 5B — single-stage, ONE sampler pass = 1 bar (verified). Shows "1/1".
    'Wan5B_t2v.json': Object.freeze({ single: 1 }),
    'Wan5B_i2v.json': Object.freeze({ single: 1 }),
    // Text-to-image (SDXL family) — single-stage, verified 2 bars (load + sampler).
    // Upscalers/detailers NOT yet counted (UltimateSDUpscale has its own passes).
    't2i_ill_anime.json':        Object.freeze({ single: 2 }),
    't2i_ill_anime_beauty.json': Object.freeze({ single: 2 }),
    't2i_pony_mix.json':         Object.freeze({ single: 2 }),
    't2i_sdxl_nsfw.json':        Object.freeze({ single: 2 }),
    't2i_sdxl_realistic.json':   Object.freeze({ single: 2 }),
    // NVIDIA PiD upscaler — one 4-step distilled sampler pass = a single tqdm bar
    // (no separate model-load bar surfaces). Live-confirmed 2026-07-03.
    'NVIDIA_PID.json':           Object.freeze({ single: 1 }),
});

/**
 * Recorded bar count for a workflow file in a given run mode, or 0 if unrecorded.
 * @param {string} workflowFile  e.g. 'LTX_t2v.json' or 'LTX_t2v_stage2.json'
 * @param {'single'|'preview'|'stage2'} mode
 * @returns {number}
 */
export function stagesFor(workflowFile, mode = 'single') {
    if (!workflowFile) return 0;
    const base = workflowFile.replace(/_stage2\.json$/i, '.json');
    const entry = PROGRESS_STAGES[base];
    return entry ? (entry[mode] || 0) : 0;
}
