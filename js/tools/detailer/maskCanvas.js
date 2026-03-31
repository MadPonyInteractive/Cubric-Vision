/**
 * maskCanvas.js — Pixel manipulation for the spotlight mask drawing.
 */
import { ComfyUIController } from '../../comfyController.js';
import { ctx } from './context.js';

/**
 * Fetches the Output_Mask image from ComfyUI and draws it as a
 * semi-transparent spotlight overlay onto the maskOverlay canvas.
 * White pixels in the mask = selected/focused area (stays bright).
 * Black pixels = unselected area (darkened). 
 * 
 * @param {Object} imgData - ComfyUI image output metadata
 */
export async function applyMaskOverlay(imgData) {
    if (!ctx.maskOverlay || !ctx.maskOverlayCtx || !ctx.sourceImg) return;

    const url = `http://${ComfyUIController.serverAddress}/view?filename=${imgData.filename}&type=${imgData.type}&subfolder=${imgData.subfolder || ''}`;

    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });

        const w = ctx.sourceImg.offsetWidth || img.naturalWidth;
        const h = ctx.sourceImg.offsetHeight || img.naturalHeight;
        ctx.maskOverlay.width = w;
        ctx.maskOverlay.height = h;

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = img.naturalWidth;
        tmpCanvas.height = img.naturalHeight;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(img, 0, 0);
        const maskPixels = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);

        const overlayData = ctx.maskOverlayCtx.createImageData(w, h);
        const scaleX = img.naturalWidth / w;
        const scaleY = img.naturalHeight / h;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcX = Math.floor(x * scaleX);
                const srcY = Math.floor(y * scaleY);
                const srcIdx = (srcY * img.naturalWidth + srcX) * 4;
                const isMasked = maskPixels.data[srcIdx] > 128; // white = selected
                const dstIdx = (y * w + x) * 4;
                if (!isMasked) {
                    overlayData.data[dstIdx] = 0;
                    overlayData.data[dstIdx + 1] = 0;
                    overlayData.data[dstIdx + 2] = 0;
                    overlayData.data[dstIdx + 3] = 140; // ~55% opacity
                } else {
                    overlayData.data[dstIdx + 3] = 0; // Fully transparent
                }
            }
        }

        ctx.maskOverlayCtx.putImageData(overlayData, 0, 0);
    } catch (e) {
        console.error('[detailer] Failed to apply mask overlay:', e);
    }
}

/**
 * Applies a data URL (mask from the brush) as the overlay canvas content.
 * 
 * @param {string} dataUrl - Base64 PNG
 */
export async function applyMaskDataUrlToOverlay(dataUrl) {
    if (!ctx.maskOverlay || !ctx.maskOverlayCtx || !ctx.sourceImg) return;
    ctx.currentMaskRaw = dataUrl;
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = img.naturalWidth;
        tmpCanvas.height = img.naturalHeight;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(img, 0, 0);
        const maskPixels = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);

        const w = ctx.sourceImg.offsetWidth || img.naturalWidth;
        const h = ctx.sourceImg.offsetHeight || img.naturalHeight;
        ctx.maskOverlay.width = w;
        ctx.maskOverlay.height = h;

        const overlayData = ctx.maskOverlayCtx.createImageData(w, h);
        const scaleX = img.naturalWidth / w;
        const scaleY = img.naturalHeight / h;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcX = Math.floor(x * scaleX);
                const srcY = Math.floor(y * scaleY);
                const srcIdx = (srcY * img.naturalWidth + srcX) * 4;
                const alpha = maskPixels.data[srcIdx + 3];
                const brightness = maskPixels.data[srcIdx]; 
                const isMasked = alpha > 32 || brightness > 128;
                const dstIdx = (y * w + x) * 4;
                if (!isMasked) {
                    overlayData.data[dstIdx] = 0;
                    overlayData.data[dstIdx + 1] = 0;
                    overlayData.data[dstIdx + 2] = 0;
                    overlayData.data[dstIdx + 3] = 140;
                } else {
                    overlayData.data[dstIdx + 3] = 0;
                }
            }
        }

        ctx.maskOverlayCtx.putImageData(overlayData, 0, 0);
    } catch (e) {
        console.warn('[detailer] Failed to apply mask data URL to overlay:', e);
    }
}

/**
 * Returns the current overlay canvas content as a data URL (PNG).
 * @returns {string|null}
 */
export function getMaskDataUrl() {
    if (!ctx.maskOverlay || ctx.maskOverlay.width === 0 || ctx.maskOverlay.height === 0) return null;
    try {
        return ctx.maskOverlay.toDataURL('image/png');
    } catch (e) {
        return null;
    }
}

export function clearMaskOverlay() {
    if (!ctx.maskOverlay || !ctx.maskOverlayCtx) return;
    ctx.maskOverlayCtx.clearRect(0, 0, ctx.maskOverlay.width, ctx.maskOverlay.height);
    ctx.currentMaskRaw = null;
}
