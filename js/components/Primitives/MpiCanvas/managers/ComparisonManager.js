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
     * Checks if a horizontal position (image-px) is over the slider handle.
     * @param {number} imgX - Horizontal position in image-native px.
     * @param {number} imgW - Image width in native px.
     * @param {number} screenThreshold - Hit threshold in screen px, divided by scale before passing.
     * @returns {boolean}
     */
    isOverSlider(imgX, imgW) {
        if (!this.isComparisonMode) return false;
        const barImgX = this.sliderPos * imgW;
        return Math.abs(imgX - barImgX) < 20;
    }

    /**
     * Updates the slider position based on image-px mouse position.
     * @param {number} imgX - Horizontal position in image-native px.
     * @param {number} imgW - Image width in native px.
     */
    updateSlider(imgX, imgW) {
        if (this.isDraggingSlider) {
            this.sliderPos = Math.max(0, Math.min(1, imgX / imgW));
            return true;
        }
        return false;
    }

    destroy() {
        if (!this.imgAfter) return;
        if (this.imgAfter instanceof ImageBitmap) this.imgAfter.close();
        this.imgAfter = null;
    }
}
