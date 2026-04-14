/**
 * maskUtils.js — Utility functions for mask operations.
 *
 * Provides reusable functions for checking mask content and state
 * across mask-related components and tools.
 */

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
