/**
 * ltxSigmasInjector.js — turn the LTX Video upscaler's ONE denoise value into
 * `ManualSigmas`' whole schedule string.
 *
 * The user sees a 0–1 slider. `mapTo` (js/utils/declaredFields.js) has already
 * turned that into a start sigma in 0.50–0.85 by the time this runs. What the
 * graph needs is not that number but a four-value schedule, and MPI-568 measured
 * that every rung Fabio judged is the shipped 0.85 schedule SCALED:
 *
 *   0.600 -> 0.6000, 0.5118, 0.2978, 0
 *   0.675 -> 0.6750, 0.5757, 0.3350, 0   (the default)
 *   0.750 -> 0.7500, 0.6397, 0.3723, 0
 *   0.850 -> 0.8500, 0.7250, 0.4219, 0   (LTX's own shipped schedule)
 *
 * So the shape is fixed and the slider only moves the start. The alternative —
 * building the string inside the graph with MpiMath -> MpiConvert — is not an
 * option: `MpiConvert.round` defaults to true/"up", which would flatten
 * `0.675, 0.5757, 0.3350, 0` to `1, 1, 1, 0` with no error and produce a
 * plausible, wrong video.
 */

'use strict';

const SIGMAS_TITLE = 'input_sigmas';
const DENOISE_KEY = 'Input_Denoise';

/** Ratios of the shipped LTX 2.3 refine schedule to its own first step. */
const SHAPE = Object.freeze([1, 0.7250 / 0.85, 0.4219 / 0.85, 0]);

/** Fabio's default, 2026-08-19 — UI 0.5, exactly mid-range of 0.50–0.85. */
const DEFAULT_START = 0.675;

/**
 * `Input_Denoise` is the only key this injector owns, so it is the only one
 * commandExecutor deletes from the generic param map (MPI-306). `Input_Positive`,
 * `Input_Seed` and `Input_Prompt_Strength` still reach their nodes by title.
 */
export const LTX_SIGMAS_CONSUMES = Object.freeze([DENOISE_KEY]);

/**
 * @param {Object} workflow  the loaded graph, mutated in place
 * @param {Object} params    injectionParams for this run
 */
export function injectLtxSigmas(workflow, params = {}) {
    const raw = Number(params[DENOISE_KEY]);
    // A missing or nonsensical value falls back to the default rather than
    // producing a degenerate schedule: sigma 0 is a no-op pass that would decode
    // straight off the latent upsampler, which MPI-568's no-sample control proved
    // looks like mush and is worse than plain lanczos.
    const start = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_START;
    const schedule = SHAPE.map(r => (start * r).toFixed(4)).join(', ');

    const node = Object.values(workflow || {}).find(
        n => n?._meta?.title?.toLowerCase() === SIGMAS_TITLE
    );
    if (!node) {
        throw new Error(`LTX upscale workflow is missing node titled "${SIGMAS_TITLE}"`);
    }
    node.inputs.sigmas = schedule;
}
