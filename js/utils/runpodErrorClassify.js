/**
 * runpodErrorClassify.js — shared classification of RunPod create-Pod refusals.
 *
 * MPI-173: this regex was copy-pasted byte-identical into js/shell.js (boot
 * create loop) and MpiSettings.js (Settings connect path). Diverging the two
 * silently broke GPU-wait retry — a wording matched in one place but not the
 * other dead-ended to a toast instead of re-entering the auto-retry wait.
 * Single source now; import in both.
 *
 * MPI-110/64: does a create refusal mean "out of stock / no host could place
 * it" (retryable → hand off to the auto-retry wait) vs. a real, persistent
 * failure? RunPod returns several wordings for the same stock condition,
 * notably "does not have the resources to deploy your pod" on a scarce card
 * (RTX 5090), plus a GENERIC "Something went wrong. Please try again later..."
 * (HTTP 500, no Pod) for a transient capacity failure. Real failures (Invalid
 * API key / Volume not found / offline) have distinct strings handled before
 * this, so matching the generic transient here does not swallow them.
 */
export function isStockRefusal(msg) {
    return /not enough|unavailable|no .*available|out of stock|insufficient|does not have the resources|no longer any instances|try a different machine|no instances? available|something went wrong|try again later/i
        .test(msg || '');
}
