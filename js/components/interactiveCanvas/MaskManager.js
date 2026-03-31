/**
 * MaskManager.js
 * Manages the mask canvas and brush drawing logic.
 */
export class MaskManager {
    constructor() {
        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d');
        
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
    getURL(bg = null, fg = null) {
        if (!bg && !fg) {
            return this.maskCanvas.toDataURL('image/png');
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.maskCanvas.width;
        tempCanvas.height = this.maskCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        if (bg) {
            tempCtx.fillStyle = bg;
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        }

        if (fg) {
            const alphaCanvas = document.createElement('canvas');
            alphaCanvas.width = this.maskCanvas.width;
            alphaCanvas.height = this.maskCanvas.height;
            const alphaCtx = alphaCanvas.getContext('2d');
            alphaCtx.drawImage(this.maskCanvas, 0, 0);
            
            alphaCtx.globalCompositeOperation = 'source-in';
            alphaCtx.fillStyle = fg;
            alphaCtx.fillRect(0, 0, alphaCanvas.width, alphaCanvas.height);
            tempCtx.drawImage(alphaCanvas, 0, 0);
        } else {
            tempCtx.drawImage(this.maskCanvas, 0, 0);
        }

        return tempCanvas.toDataURL('image/png');
    }
}
