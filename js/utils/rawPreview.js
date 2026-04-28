/**
 * rawPreview.js — Pure CSS filter builder for instant raw-adjustment preview.
 * Maps adjustment param values → composited CSS filter string.
 * No side effects. Used by MpiToolOptionsRaw on every slider drag.
 *
 * Exposure stored as -300..+300 (÷100 = EV stops). 0 EV = brightness(1.0).
 * Shadows: positive lifts shadows via extra brightness fraction (rough approx).
 * Curve: maps -100..+100 → brightness + contrast shift.
 * Saturation: -100..+100 → saturate(0..2).
 * NoiseReduction: 0..100 → blur(0..2px).
 * WhiteBalance: Sharp preview only (CSS hue-rotate is wrong — needs R/G/B tint).
 */

/**
 * @param {Object} values - Flat param map from MpiToolOptionsRaw internal state.
 * @returns {string} CSS filter string, e.g. "brightness(1.2) saturate(1.5) blur(0px)"
 */
export function buildCSSFilter(values) {
    const filters = [];

    // Exposure: EV stops via internal -300..+300 scale
    const ev = (values.exposure ?? 0) / 100;
    const brightness = Math.pow(2, ev);
    filters.push(`brightness(${brightness.toFixed(3)})`);

    // Shadows: rough lift — add small brightness offset for positive values only
    const shadows = values.shadows ?? 0;
    if (shadows !== 0) {
        const lift = 1 + Math.max(0, shadows) / 100 * 0.25;
        filters.push(`brightness(${lift.toFixed(3)})`);
    }

    // Saturation: -100..+100 → saturate(0..2)
    const sat = values.saturation ?? 0;
    filters.push(`saturate(${(1 + sat / 100).toFixed(3)})`);

    // White balance: handled by Sharp preview only (CSS hue-rotate is wrong for tint)

    // Point curve: asymmetric gamma — brighten /50, darken /35 (steeper down)
    const curve = values.curve ?? 0;
    if (curve !== 0) {
        const divisor = curve > 0 ? 50 : 35;
        const gamma = Math.pow(2, curve / divisor);
        filters.push(`brightness(${gamma.toFixed(3)})`);
    }

    // Noise reduction: 0..100 → blur(0..2px)
    const nr = values.noiseReduction ?? 0;
    if (nr > 0) {
        filters.push(`blur(${(nr / 100 * 2).toFixed(2)}px)`);
    }

    return filters.join(' ');
}
