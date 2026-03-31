/**
 * detailer.js — Facade Orchestrator 
 * Routes initialization and API to the detailer sub-modules.
 */

import { state } from '../state.js';
import { InteractiveCanvas } from '../components/interactiveCanvas.js';
import { PromptBox } from '../components/PromptBox.js';
import { loadToolState } from '../toolState.js';
import { uploadMediaToProject } from '../toolUtils.js';
import { Slider } from '../components/Slider.js';

import { ctx, saveState } from './detailer/context.js';
import { renderDetailer } from './detailer/renderer.js';
import { bindEvents } from './detailer/events.js';
import { triggerEnhance, cancelGeneration } from './detailer/comfyClient.js';

export async function initDetailer() {
    if (ctx.resultCanvas) {
        try { ctx.resultCanvas.destroy(); } catch (_) { }
        ctx.resultCanvas = null;
    }

    const container = document.getElementById('tool-detailer');
    if (!container) {
        console.warn('[detailer] #tool-detailer not found — aborting init');
        return;
    }

    Object.assign(ctx, {
        sourceImg: container.querySelector('#detailer-sourceImg'),
        maskOverlay: container.querySelector('#detailer-maskOverlay'),
        emptyState: container.querySelector('#detailer-emptyState'),
        sourcePreview: container.querySelector('#detailer-sourcePreview'),
        maskModeSelect: container.querySelector('#detailer-maskMode'),
        autoMaskControls: container.querySelector('#detailer-autoMaskControls'),
        detectedResults: container.querySelector('#detailer-detectedResults'),
        detectedThumbnails: container.querySelector('#detailer-detectedThumbnails'),
        detectBtn: container.querySelector('#detailer-detectBtn'),
        detBoxRadio: container.querySelector('#detailer-detBox'),
        detSegmentRadio: container.querySelector('#detailer-detSegment'),
        transferBtn: container.querySelector('#detailer-transferBtn'),
        // denoiseSlider: document.getElementById('detailer-denoise'), // Removed in favor of component
        // denoiseValue: document.getElementById('detailer-denoiseValue'), // Removed in favor of component
        newSeedBtn: document.getElementById('detailer-newSeedBtn'),
        enhanceBtn: document.getElementById('detailer-enhanceBtn'),
        addAssetBtn: document.getElementById('detailer-addAssetBtn'),
        progressBar: document.getElementById('detailer-progressBar'),
        progressWrapper: document.getElementById('detailer-progressWrapper'),
    });

    if (ctx.maskOverlay) {
        ctx.maskOverlayCtx = ctx.maskOverlay.getContext('2d');
    }

    const canvasContainer = container.querySelector('#detailer-canvasContainer');
    if (canvasContainer) {
        ctx.resultCanvas = new InteractiveCanvas(canvasContainer);
    }

    const promptWrapper = document.getElementById('detailer-prompt-wrapper');
    const promptToggleContainer = document.getElementById('detailer-prompt-toggle-container');
    ctx.promptBox = new PromptBox({
        toolId: 'detailer',
        container: promptWrapper,
        toggleContainer: promptToggleContainer,
        onImageDrop: async (file) => {
            if (typeof file === 'string') {
                state.detailerInputImage = file;
                ctx.currentResultUrl = null;
                await renderDetailer();
                saveState();
            } else {
                const result = await uploadMediaToProject(file, 'detailer');
                if (result?.filePath) {
                    state.detailerInputImage = result.filePath;
                    ctx.currentResultUrl = null;
                    await renderDetailer();
                    saveState();
                }
            }
        }
    });

    const saved = loadToolState('detailer');

    // Initialize Slider Component
    const denoiseContainer = document.getElementById('detailer-denoise-container') || document.getElementById('detailer-denoise')?.parentElement;
    if (denoiseContainer) {
        denoiseContainer.innerHTML = '';
        ctx.denoiseSliderComponent = new Slider(denoiseContainer, {
            title: 'DENOISE',
            min: 0,
            max: 1,
            step: 0.01,
            value: saved?.denoise ?? 0.6,
            showValue: true,
            minimal: true,
            onChange: () => saveState()
        });
    }

    if (saved) {
        if (saved.inputImage) state.detailerInputImage = saved.inputImage;
        if (saved.resultUrl) ctx.currentResultUrl = saved.resultUrl;
        if (saved.maskMode) state.detailerMaskMode = saved.maskMode;
        if (saved.selectedMasks !== undefined) state.detailerSelectedMasks = saved.selectedMasks;
        if (saved.seed !== undefined) ctx.currentSeed = saved.seed;
    }

    if (state.pendingImageUrl) {
        state.detailerInputImage = state.pendingImageUrl;
        state.pendingImageUrl = null;
        ctx.currentResultUrl = null;
    }

    if (!state.detailerMaskMode) state.detailerMaskMode = 'manual';

    await renderDetailer();
    bindEvents();
}

export { triggerEnhance };

export async function cancelEnhance() {
    await cancelGeneration();
}
