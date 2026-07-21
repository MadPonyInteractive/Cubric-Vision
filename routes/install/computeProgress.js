'use strict';

/**
 * routes/install/computeProgress.js — the ONE progress calculator (MPI-276, G12).
 *
 * Five historical progress bugs collapse into this single function; their fixes
 * are the rules below and become named unit tests (install-progress.test.cjs):
 *
 *  MPI-95  real-total-wins: denominator is `totalBytes || seedBytes` per dep, so a
 *          dep whose real size hasn't arrived still counts (seed), and once the real
 *          total arrives it REPLACES the seed (no Math.max — MPI-164 — an inflated
 *          registry seed must not keep the bar short).
 *  MPI-140 seed only pre-first-tick: same rule; the gate/pre-flight also uses
 *          `totalBytes || seedBytes` so neededBytes is never spuriously 0.
 *  MPI-164 verifying phase only when allBytesDone across non-custom_nodes deps.
 *  MPI-231 custom_nodes EXCLUDED from BOTH sides of the byte ratio (work-not-bytes:
 *          a GitHub zip has no Content-Length; pip pulls untotalled wheels).
 *  MPI-258 B3 partial-reinstall: already-installed deps credited at full size on both
 *          numerator and denominator, so a partial reinstall's denominator is whole.
 *
 * Plus: model totalBytes is SET from the ratio, never `+=` accumulated.
 *
 * Pure. No I/O. Shared `parseSizeToBytes` export (dedupes the backend copies, G16).
 */

// ── parseSizeToBytes (verbatim from downloadManager._parseSizeToBytes) ───────────

function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const match = String(sizeStr).match(/^([\d.]+)\s*(GB|MB|KB|B)$/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 };
    return val * (multipliers[unit] || 0);
}

// ── Per-dep denominator (MPI-164 real-total-wins) ────────────────────────────────

function depDenominator(d) {
    return d.totalBytes || d.seedBytes || 0;
}

const isNodeDep = (d) => d.type === 'custom_nodes';

/**
 * computeProgress(modelJob) → { totalBytes, downloadedBytes, progress, phase,
 *                               indeterminate }
 *
 * @param {object} modelJob - has `deps[]` (each { type, status, seedBytes,
 *                            totalBytes, downloadedBytes }).
 * @param {object} [opts]
 * @param {Set<string>} [opts.terminalDepStates] - dep statuses that count as
 *        "settled" for the allBytesDone verifying gate. Defaults to complete-ish.
 */
function computeProgress(modelJob, opts = {}) {
    const deps = modelJob.deps || [];
    const nonNode = deps.filter(d => !isNodeDep(d));

    // Byte ratio EXCLUDES custom_nodes on both sides (MPI-231).
    let downloadedBytes = 0;
    let totalBytes = 0; // SET, never accumulated
    for (const d of nonNode) {
        downloadedBytes += d.downloadedBytes || 0;
        totalBytes += depDenominator(d); // real-total-wins (MPI-95/164)
    }

    const hasNodeDeps = deps.some(isNodeDep);
    // Indeterminate when we can't form an honest ratio: nothing but nodes, or the
    // total hasn't materialised yet.
    const indeterminate = totalBytes <= 0;

    // Verifying sweep ONLY when every non-node dep has all its bytes in (MPI-164).
    // "all bytes in" = downloadedBytes >= denominator > 0, OR the dep already reached
    // a settled/complete status. custom_nodes are never gated on bytes.
    const allBytesDone = nonNode.length > 0 && nonNode.every(d => {
        const denom = depDenominator(d);
        const settled = d.status === 'complete' || d.status === 'verifying';
        return settled || (denom > 0 && (d.downloadedBytes || 0) >= denom);
    });

    let phase;
    let progress;
    if (indeterminate) {
        progress = 0;
        phase = hasNodeDeps && nonNode.length === 0 ? 'preparing' : undefined;
    } else if (allBytesDone) {
        // Snap to 100% + verifying sweep. downloadedBytes reported as full total so
        // the bar doesn't visually retreat during sha256 / install.
        downloadedBytes = totalBytes;
        progress = 1;
        phase = 'verifying';
    } else {
        progress = downloadedBytes / totalBytes;
        phase = undefined;
    }

    return {
        totalBytes,
        downloadedBytes,
        progress,
        phase,
        indeterminate: indeterminate || (phase === undefined && progress < 1 && isNodeTickPending(deps)),
    };
}

// A determinate bar should still show indeterminate while a custom_nodes dep is the
// only thing actively moving (its bytes aren't in the ratio — MPI-231). Callers that
// know the emitting tick was a node tick pass it directly; this is the store-side
// heuristic: any node dep still non-terminal while weight deps are all done.
function isNodeTickPending(deps) {
    const nodeActive = deps.some(d => isNodeDep(d) && d.status !== 'complete' && d.status !== 'failed' && d.status !== 'cancelled');
    if (!nodeActive) return false;
    const nonNode = deps.filter(d => !isNodeDep(d));
    return nonNode.length > 0 && nonNode.every(d => {
        const denom = depDenominator(d);
        return d.status === 'complete' || (denom > 0 && (d.downloadedBytes || 0) >= denom);
    });
}

module.exports = {
    computeProgress,
    parseSizeToBytes,
    depDenominator,
};
