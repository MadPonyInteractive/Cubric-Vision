/**
 * context.js — Shared mutable state for the Detailer tool
 */
import { state } from '../../state.js';
import { saveToolState } from '../../toolState.js';

export const ctx = {
    resultCanvas: null,
    promptBox: null,
    currentResultUrl: null,
    currentSeed: null,
    currentMaskRaw: null,

    // DOM refs
    sourceImg: null,
    maskOverlay: null,
    maskOverlayCtx: null,
    emptyState: null,
    sourcePreview: null,
    maskModeSelect: null,
    autoMaskControls: null,
    detectedResults: null,
    detectedThumbnails: null,
    detectBtn: null,
    detBoxRadio: null,
    detSegmentRadio: null,
    denoiseSlider: null,
    denoiseValue: null,
    newSeedBtn: null,
    enhanceBtn: null,
    transferBtn: null,
    addAssetBtn: null,
    progressBar: null,
    progressWrapper: null,
};

/**
 * Persists the current session state.
 */
export function saveState() {
    saveToolState('detailer', {
        inputImage: state.detailerInputImage || null,
        resultUrl: ctx.currentResultUrl || null,
        maskMode: state.detailerMaskMode || 'manual',
        selectedMasks: state.detailerSelectedMasks || '',
        seed: ctx.currentSeed,
        denoise: ctx.denoiseSliderComponent?.getValue() || '0.6',
    });
}
