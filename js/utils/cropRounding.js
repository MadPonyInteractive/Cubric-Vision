/**
 * cropRounding.js — round a selected crop dimension to a multiple of N.
 *
 * MPI-261: the crop tool's "Divisible by" input rounds each output dimension
 * (width and height, independently) UP to the next multiple of N. If rounding
 * up would exceed the available source span (origin → source edge), floor to the
 * previous multiple instead — we never invent pixels the source doesn't have.
 *
 * `max` is the available span, i.e. `sourceW - rect.x` for width. Passing that
 * bound keeps `rect.x + width <= sourceW`, which the image crop server (Sharp
 * `.extract`) requires — it throws on an out-of-bounds rect.
 */

/**
 * @param {number} value - the selected dimension in pixels
 * @param {number} n     - the divisor (>= 1)
 * @param {number} max   - the largest allowed result (available source span)
 * @returns {number} a multiple of n, clamped to [n .. max-floored], never > max
 */
export function roundToDivisible(value, n, max) {
    const div = Math.max(1, Math.round(n) || 1);
    const up = Math.ceil(value / div) * div;
    const down = Math.floor(value / div) * div;
    // Prefer rounding up, unless it overshoots the source span.
    const chosen = up <= max ? up : down;
    // Never return 0 (a 0px crop is invalid). If even one multiple doesn't fit
    // (max < n), fall back to the whole available span so the crop still runs.
    if (chosen >= div) return chosen;
    return Math.max(1, Math.min(Math.round(max), div));
}
