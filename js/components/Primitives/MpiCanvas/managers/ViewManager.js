/**
 * ViewManager.js
 * Manages viewport state (scale, offsets) and 'contain' logic for MpiCanvas.
 */
export class ViewManager {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
        this.minScale = 0.1;
        this.maxScale = 10;
        this.isManagedView = true; // Auto-centering toggle
    }

    /**
     * Resets the view to 'contain' the image within the container.
     * @param {HTMLElement} container
     * @param {HTMLImageElement} img
     * @returns {Promise<void>}
     */
    async reset(container, img) {
        if (!img || !img.width) return;

        return new Promise((resolve) => {
            const attempt = () => {
                const rect = container.getBoundingClientRect();
                const cw = rect.width;
                const ch = rect.height;

                if (cw === 0 || ch === 0) {
                    requestAnimationFrame(attempt);
                    return;
                }

                const iw = img.width;
                const ih = img.height;

                this.scale = Math.min(cw / iw, ch / ih);
                this.minScale = this.scale;

                this.offsetX = (cw - iw * this.scale) / 2;
                this.offsetY = (ch - ih * this.scale) / 2;
                this.isManagedView = true;

                resolve();
            };
            attempt();
        });
    }

    /**
     * Adjusts offsets during container resize to maintain visual center.
     * @param {number} oldW
     * @param {number} oldH
     * @param {number} newW
     * @param {number} newH
     */
    handleResize(oldW, oldH, newW, newH) {
        if (oldW > 0 && oldH > 0) {
            this.offsetX += (newW - oldW) / 2;
            this.offsetY += (newH - oldH) / 2;
        }
    }

    /**
     * Returns the current transformation state, potentially calculating auto-center.
     * @param {number} canvasW
     * @param {number} canvasH
     * @param {number} imgW
     * @param {number} imgH
     * @returns {{scale: number, offsetX: number, offsetY: number}}
     */
    getViewState(canvasW, canvasH, imgW, imgH) {
        if (this.isManagedView) {
            const drawScale = Math.min(canvasW / imgW, canvasH / imgH);
            this.minScale = drawScale;
            this.scale = drawScale;
            this.offsetX = (canvasW - imgW * drawScale) / 2;
            this.offsetY = (canvasH - imgH * drawScale) / 2;
        }

        return {
            scale: this.scale,
            offsetX: this.offsetX,
            offsetY: this.offsetY
        };
    }

    /**
     * Re-fits the view if managed (called after container resize).
     * @param {number} containerW
     * @param {number} containerH
     * @param {number} imgW
     * @param {number} imgH
     */
    refit(containerW, containerH, imgW, imgH) {
        if (!this.isManagedView) return;
        if (!imgW || !imgH || !containerW || !containerH) return;
        this.scale = Math.min(containerW / imgW, containerH / imgH);
        this.minScale = this.scale;
        this.offsetX = (containerW - imgW * this.scale) / 2;
        this.offsetY = (containerH - imgH * this.scale) / 2;
    }

    /**
     * CSS transform string for the stack element.
     * @returns {string}
     */
    getCSSTransform() {
        return `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    }
}
