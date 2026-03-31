/**
 * renderer.js — Handles DOM view logic, tool visibility layouts, and thumbnails.
 */
import { state } from '../../state.js';
import { getLoadableUrl } from '../../toolUtils.js';
import { ComfyUIController } from '../../comfyController.js';
import { ctx, saveState } from './context.js';
import { applyMaskDataUrlToOverlay, clearMaskOverlay } from './maskCanvas.js';

export async function renderDetailer() {
    const hasInput = !!(state.detailerInputImage && state.detailerInputImage !== 'null');

    if (hasInput) {
        ctx.emptyState.classList.add('hide');
        const loadUrl = getLoadableUrl(state.detailerInputImage);
        ctx.sourceImg.src = loadUrl;
        ctx.sourceImg.classList.remove('hide');

        if (state.detailerInputMask) {
            ctx.currentMaskRaw = state.detailerInputMask;
            state.detailerInputMask = null;
            state.detailerMaskMode = 'manual';
            applyMaskDataUrlToOverlay(ctx.currentMaskRaw);
        }
    } else {
        ctx.emptyState.classList.remove('hide');
        ctx.sourceImg.src = '';
        ctx.sourceImg.classList.add('hide');
        clearMaskOverlay();
        if (ctx.transferBtn) ctx.transferBtn.classList.add('hide');
        if (ctx.resultCanvas) ctx.resultCanvas.clearImage?.();
    }

    if (ctx.currentResultUrl && hasInput && ctx.resultCanvas) {
        try {
            const sourceUrl = getLoadableUrl(state.detailerInputImage);
            await ctx.resultCanvas.loadImage(sourceUrl);
            await ctx.resultCanvas.loadComparisonImage(ctx.currentResultUrl);
            if (ctx.resultCanvas.draw) ctx.resultCanvas.draw();
            if (ctx.transferBtn) ctx.transferBtn.classList.remove('hide');
        } catch (e) {
            console.warn('[detailer] Could not restore comparison view:', e);
        }
    }

    updateMaskModeUI();
}

/**
 * Renders selectable thumbnails resulting from "detect" execution.
 * @param {Array} images 
 * @param {Function} onSelectionChangedCallback - Callback hook for `runDetect()`
 */
export function renderDetectedThumbnails(images, onSelectionChangedCallback) {
    if (!ctx.detectedThumbnails || !ctx.detectedResults) return;

    ctx.detectedThumbnails.innerHTML = '';
    ctx.detectedResults.classList.remove('hide');

    const previousSelection = (state.detailerSelectedMasks || '')
        .split(',').map(s => s.trim()).filter(Boolean);

    images.forEach((img, index) => {
        const url = `http://${ComfyUIController.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`;
        const maskIndex = index + 1; 
        const isSelected = previousSelection.includes(String(maskIndex));

        const thumb = document.createElement('div');
        thumb.className = 'det-thumb' + (isSelected ? ' selected' : '');
        thumb.dataset.index = maskIndex;
        thumb.innerHTML = `<img src="${url}" alt="Detection ${maskIndex}" draggable="false">`;

        thumb.addEventListener('click', () => {
            thumb.classList.toggle('selected');
            const allThumbs = ctx.detectedThumbnails.querySelectorAll('.det-thumb');
            const selected = [];
            allThumbs.forEach((t) => {
                if (t.classList.contains('selected')) selected.push(t.dataset.index);
            });
            state.detailerSelectedMasks = selected.join(',');
            saveState();
            
            if (onSelectionChangedCallback) onSelectionChangedCallback();
        });

        ctx.detectedThumbnails.appendChild(thumb);
    });
}

export function updateMaskModeUI() {
    const isManual = state.detailerMaskMode === 'manual';
    if (ctx.autoMaskControls) ctx.autoMaskControls.classList.toggle('hide', isManual);
    if (ctx.maskModeSelect) ctx.maskModeSelect.value = state.detailerMaskMode;
}
