/**
 * MaskManager.js
 * Manages the mask canvas and brush drawing logic.
 */
export class MaskManager {
    constructor() {
        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
        
        this.isMaskingMode = false;
        this.isDrawingMask = false;
        this.brushSize = 40;
        this.brushType = 'brush'; // 'brush' or 'eraser'
        this.maskOpacity = 0.7;
        this.maskColor = 'rgba(255, 255, 255, 1)';
    }

    /**
     * Resizes the mask canvas to match the base image dimensions.
     * @param {number} width 
     * @param {number} height 
     */
    init(width, height) {
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;
        this.clear();
    }

    /**
     * Clears the mask buffer.
     */
    clear() {
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }

    /**
     * Paints on the mask using image-space coordinates.
     * @param {number} imgX 
     * @param {number} imgY 
     */
    paint(imgX, imgY) {
        this.maskCtx.save();
        if (this.brushType === 'eraser') {
            this.maskCtx.globalCompositeOperation = 'destination-out';
        } else {
            this.maskCtx.globalCompositeOperation = 'source-over';
            this.maskCtx.fillStyle = this.maskColor;
        }

        this.maskCtx.beginPath();
        this.maskCtx.arc(imgX, imgY, this.brushSize / 2, 0, Math.PI * 2);
        this.maskCtx.fill();
        this.maskCtx.restore();
    }

    /**
     * Inverts the mask colors.
     * @returns {string} - The new primary color name.
     */
    flipColor() {
        this.maskColor = this.maskColor === 'rgba(255, 255, 255, 1)' 
            ? 'rgba(0, 0, 0, 1)' 
            : 'rgba(255, 255, 255, 1)';
        
        const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
        }
        
        this.maskCtx.putImageData(imageData, 0, 0);
        return this.maskColor === 'rgba(255, 255, 255, 1)' ? 'white' : 'black';
    }

    /**
     * Loads a mask image from a data URL.
     * @param {string} dataUrl 
     * @returns {Promise<void>}
     */
    async setFromURL(dataUrl) {
        if (!dataUrl) return;
        return new Promise((resolve, reject) => {
            const maskImg = new Image();
            maskImg.onload = () => {
                this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
                this.maskCtx.drawImage(maskImg, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
                resolve();
            };
            maskImg.onerror = (err) => reject(err);
            maskImg.src = dataUrl;
        });
    }

    /**
     * Exports the mask as a data URL.
     * @param {string} bg 
     * @param {string} fg 
     * @returns {string}
     */
    destroy() {
        if (!this.maskCanvas) return;
        this.maskCanvas.width = 0;
        this.maskCanvas.height = 0;
        this.maskCanvas = null;
        this.maskCtx = null;
    }

    getURL(bg = null, fg = null) {
        if (!bg && !fg) {
            return this.maskCanvas.toDataURL('image/png');
        }

        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');

        // Simple black/white mapping — the only callers use 'white'/'black'
        const bgIsWhite = bg === 'white';
        const fgIsBlack = fg === 'black';
        const [bgR, bgG, bgB] = bgIsWhite ? [255, 255, 255] : [0, 0, 0];
        const [fgR, fgG, fgB] = fgIsBlack ? [0, 0, 0] : [255, 255, 255];

        const src = this.maskCtx.getImageData(0, 0, w, h);
        const out = tempCtx.createImageData(w, h);

        for (let i = 0; i < src.data.length; i += 4) {
            const a = src.data[i + 3]; // alpha of painted pixel
            if (a > 0) {
                // Painted area → fg color, fully opaque
                out.data[i]     = fgR;
                out.data[i + 1] = fgG;
                out.data[i + 2] = fgB;
                out.data[i + 3] = 255;
            } else {
                // Unpainted area → bg color, fully opaque
                out.data[i]     = bgR;
                out.data[i + 1] = bgG;
                out.data[i + 2] = bgB;
                out.data[i + 3] = 255;
            }
        }

        tempCtx.putImageData(out, 0, 0);
        return tempCanvas.toDataURL('image/png');
    }
}
