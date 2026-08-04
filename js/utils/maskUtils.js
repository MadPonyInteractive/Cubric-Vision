/**
 * maskUtils.js — Utility functions for mask operations.
 *
 * Provides reusable functions for checking mask content and state
 * across mask-related components and tools.
 */

/**
 * Flatten a layer to a flat-coloured STENCIL of its shape: alpha at or above
 * `alphaT` becomes `color` at full alpha, everything else transparent (MPI-439).
 *
 * The cut is the ≥128 one the whole canvas-tool family reads a shape by
 * (`docs/masking-adjust.md` § The paint layer) — alpha, never luminance, so a dark
 * scribble converts as readily as a light one. The result is deliberately BINARY:
 * the caller scales it into the destination afterwards, so the resampling supplies
 * a smooth edge without a soft mask feather surviving as soft paint.
 *
 * @param {HTMLCanvasElement} src
 * @param {string} color CSS colour for the stencil
 * @param {number} [alphaT]
 * @returns {HTMLCanvasElement|null} src-sized stencil, or null when nothing reaches `alphaT`
 */
export function alphaStencil(src, color, alphaT = 128) {
    if (!src?.width || !src?.height) return null;
    const w = src.width;
    const h = src.height;

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    let any = false;
    for (let i = 3; i < d.length; i += 4) {
        if (d[i] >= alphaT) { d[i] = 255; any = true; } else d[i] = 0;
    }
    if (!any) return null;

    ctx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    return out;
}

/**
 * Checks if a mask canvas contains any painted content (non-transparent pixels).
 *
 * @param {HTMLCanvasElement} maskCanvas - The mask canvas element to check
 * @returns {boolean} - True if mask has painted content, false if empty
 */
export function hasMaskContent(maskCanvas) {
    if (!maskCanvas || !maskCanvas.width || !maskCanvas.height) {
        return false;
    }

    try {
        const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const data = imageData.data;

        // Check for any non-transparent pixels (alpha > 0)
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) {
                return true;
            }
        }

        return false;
    } catch (err) {
        console.warn('[maskUtils] hasMaskContent check failed:', err);
        return false;
    }
}
