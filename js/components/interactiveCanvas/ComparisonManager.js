/**
 * ComparisonManager.js
 * Manages image comparison state and split-slider logic.
 */
export class ComparisonManager {
    constructor() {
        this.imgAfter = new Image();
        this.imgAfter.crossOrigin = "anonymous";
        this.isComparisonMode = false;
        this.sliderPos = 0.5; // 0 to 1
        this.isDraggingSlider = false;
    }

    /**
     * Loads a second image for comparison.
     * @param {string} url 
     * @returns {Promise<void>}
     */
    async load(url) {
        return new Promise((resolve, reject) => {
            this.imgAfter.onload = () => {
                this.isComparisonMode = true;
                resolve();
            };
            this.imgAfter.onerror = (err) => reject(err);
            this.imgAfter.src = url;
        });
    }

    /**
     * Checks if a horizontal position is over the slider handle.
     * @param {number} x - Horizontal position relative to canvas.
     * @param {number} canvasW 
     * @returns {boolean}
     */
    isOverSlider(x, canvasW) {
        if (!this.isComparisonMode) return false;
        const barX = this.sliderPos * canvasW;
        return Math.abs(x - barX) < 20;
    }

    /**
     * Updates the slider position based on mouse position.
     * @param {number} x - Horizontal position.
     * @param {number} canvasW 
     */
    updateSlider(x, canvasW) {
        if (this.isDraggingSlider) {
            this.sliderPos = Math.max(0, Math.min(1, x / canvasW));
            return true;
        }
        return false;
    }
}
