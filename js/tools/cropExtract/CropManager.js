/**
 * CropManager.js — Calculation logic for crop bounds and aspect ratios
 */
import { toolState } from './State.js';
import { UIManager } from './UIManager.js';
import { saveToolState } from '../../toolState.js';
import { getVideoBounds } from '../../videoUtils.js';
import { state } from '../../state.js';

export class CropManager {
    /**
     * Sets the active ratio and reflows the crop box.
     * @param {Object} ratioObj 
     */
    static setRatio(ratioObj) {
        toolState.selectedRatio = ratioObj.ratio;
        state.cropExtractRatio = ratioObj.ratio;
        UIManager.updateRatioUI(ratioObj);
        saveToolState('cropExtract', { selectedRatio: ratioObj.ratio });
        this.resetCropBox();
    }

    /**
     * Fits the crop box within the video bounds, honoring the selected ratio.
     */
    static resetCropBox() {
        const { video, videoContainer, selectedRatio, cropBox } = toolState;
        if (!video.videoWidth) return;

        const containerRect = videoContainer.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0) return;

        const bounds = getVideoBounds(video, videoContainer);
        if (!bounds || isNaN(bounds.width) || isNaN(bounds.left)) return;

        if (!selectedRatio) {
            // No ratio selected: fill the video content area exactly
            cropBox.style.width  = `${bounds.width}%`;
            cropBox.style.height = `${bounds.height}%`;
            cropBox.style.left   = `${bounds.left}%`;
            cropBox.style.top    = `${bounds.top}%`;
            return;
        }

        // Fit the selected ratio inside the video bounds, centered
        const containerAspect = containerRect.width / containerRect.height;
        const targetRatio = selectedRatio / containerAspect;

        let w = bounds.width;
        let h = w / targetRatio;

        if (h > bounds.height) {
            h = bounds.height;
            w = h * targetRatio;
        }

        cropBox.style.width  = `${w}%`;
        cropBox.style.height = `${h}%`;
        cropBox.style.left   = `${bounds.left + (bounds.width - w) / 2}%`;
        cropBox.style.top    = `${bounds.top + (bounds.height - h) / 2}%`;
    }
}
