/**
 * MaskManager.js
 * Three-layer mask model:
 *   manualCanvas    — brush strokes (white where painted)
 *   subtractCanvas  — eraser strokes (white where erased)
 *   maskCanvas      — derived composite display layer = (manual ∪ ⋃autoPickMasks[selected]) AND NOT subtract
 *
 * autoPickMasks is RAM-only Map<pickIndex, ImageBitmap|HTMLCanvasElement>.
 * selectedAutoPicks is Set<number>.
 *
 * Brush at P → manualCanvas[P]=white, subtractCanvas[P]=black (clears erased).
 * Eraser at P → manualCanvas[P]=black (clears painted), subtractCanvas[P]=white.
 *
 * Working resolution is capped at MASK_MAX_EDGE (masks don't need high precision —
 * a 4K image recomposited full-frame per brush dab is unusably laggy). Paint
 * coords arrive in image-px and are scaled by `_scale` into mask-px. Display/export
 * upscale back automatically (overlay drawImage + ComfyUI's own mask resize).
 */
const MASK_MAX_EDGE = 1536;

export class MaskManager {
    constructor() {
        this.manualCanvas = document.createElement('canvas');
        this.manualCtx = this.manualCanvas.getContext('2d', { willReadFrequently: true });

        this.subtractCanvas = document.createElement('canvas');
        this.subtractCtx = this.subtractCanvas.getContext('2d', { willReadFrequently: true });

        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });

        this.autoPickMasks = new Map();
        this.selectedAutoPicks = new Set();

        // mask-px per image-px. Set in init(); paint() multiplies incoming
        // image-px coords + brush radius by this to hit the downscaled canvas.
        this._scale = 1;

        this.isMaskingMode = false;
        this.isDrawingMask = false;
        this.brushSize = 40;
        this.brushType = 'brush';
        this.maskOpacity = 0.7;
        this.maskColor = 'rgba(255, 255, 255, 1)';
        // Display-only inversion: swaps the visible overlay color without
        // touching the underlying mask data. Used by viewer.draw() / getURL().
        this.displayInverted = false;
    }

    init(width, height) {
        this._scale = Math.min(1, MASK_MAX_EDGE / Math.max(width, height));
        const w = Math.max(1, Math.round(width * this._scale));
        const h = Math.max(1, Math.round(height * this._scale));
        this.manualCanvas.width = w;
        this.manualCanvas.height = h;
        this.subtractCanvas.width = w;
        this.subtractCanvas.height = h;
        this.maskCanvas.width = w;
        this.maskCanvas.height = h;
        this.clear();
    }

    clear() {
        if (this.manualCtx) this.manualCtx.clearRect(0, 0, this.manualCanvas.width, this.manualCanvas.height);
        if (this.subtractCtx) this.subtractCtx.clearRect(0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
        this.autoPickMasks.clear();
        this.selectedAutoPicks.clear();
        this._recomposite();
    }

    paint(imgX, imgY) {
        // Incoming coords + brush are in image-px; map to downscaled mask-px.
        const s = this._scale;
        imgX *= s;
        imgY *= s;
        const r = (this.brushSize * s) / 2;
        if (this.brushType === 'eraser') {
            // Manual: clear painted pixels at P
            this.manualCtx.save();
            this.manualCtx.globalCompositeOperation = 'destination-out';
            this.manualCtx.beginPath();
            this.manualCtx.arc(imgX, imgY, r, 0, Math.PI * 2);
            this.manualCtx.fill();
            this.manualCtx.restore();

            // Subtract: paint white at P
            this.subtractCtx.save();
            this.subtractCtx.globalCompositeOperation = 'source-over';
            this.subtractCtx.fillStyle = 'rgba(255, 255, 255, 1)';
            this.subtractCtx.beginPath();
            this.subtractCtx.arc(imgX, imgY, r, 0, Math.PI * 2);
            this.subtractCtx.fill();
            this.subtractCtx.restore();
        } else {
            // Manual: paint at P
            this.manualCtx.save();
            this.manualCtx.globalCompositeOperation = 'source-over';
            this.manualCtx.fillStyle = this.maskColor;
            this.manualCtx.beginPath();
            this.manualCtx.arc(imgX, imgY, r, 0, Math.PI * 2);
            this.manualCtx.fill();
            this.manualCtx.restore();

            // Subtract: clear at P (un-erase)
            this.subtractCtx.save();
            this.subtractCtx.globalCompositeOperation = 'destination-out';
            this.subtractCtx.beginPath();
            this.subtractCtx.arc(imgX, imgY, r, 0, Math.PI * 2);
            this.subtractCtx.fill();
            this.subtractCtx.restore();
        }
        this._recomposite();
    }

    /**
     * Rebuild display composite from layers.
     * display = (manual ∪ ⋃autoPickMasks[selected]) AND NOT subtract
     */
    _recomposite() {
        if (!this.maskCtx || !this.maskCanvas) return;
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        if (!w || !h) return;

        this.maskCtx.save();
        this.maskCtx.clearRect(0, 0, w, h);

        // Step 1: union manual + selected auto picks
        this.maskCtx.globalCompositeOperation = 'source-over';
        this.maskCtx.drawImage(this.manualCanvas, 0, 0);
        for (const idx of this.selectedAutoPicks) {
            const layer = this.autoPickMasks.get(idx);
            if (layer) this.maskCtx.drawImage(layer, 0, 0, w, h);
        }

        // Step 2: AND NOT subtract — destination-out punches subtract holes
        this.maskCtx.globalCompositeOperation = 'destination-out';
        this.maskCtx.drawImage(this.subtractCanvas, 0, 0);

        this.maskCtx.restore();
    }

    /**
     * Display-only invert toggle. Does NOT touch underlying mask data.
     * Render layer (MpiCanvas._drawOverlay) reads `displayInverted` to flip
     * the overlay between white-on-masked and black-on-masked.
     * Returns the new display state for callers that need a label.
     */
    flipColor() {
        this.displayInverted = !this.displayInverted;
        return this.displayInverted ? 'black' : 'white';
    }

    /**
     * Loads a mask image into the manual layer (additive — replaces manual content).
     */
    async setFromURL(dataUrl) {
        return this.setManualFromDataURL(dataUrl);
    }

    async setManualFromDataURL(dataUrl) {
        if (!dataUrl) return;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Canvas may be destroyed while this decodes (tool swap / remount
                // in the History workspace) — ctx goes null in destroy(). Bail
                // instead of throwing on clearRect of null.
                if (!this.manualCtx) return resolve();
                this.manualCtx.clearRect(0, 0, this.manualCanvas.width, this.manualCanvas.height);
                this.manualCtx.drawImage(img, 0, 0, this.manualCanvas.width, this.manualCanvas.height);
                this._recomposite();
                resolve();
            };
            img.onerror = (err) => reject(err);
            img.src = dataUrl;
        });
    }

    async setSubtractFromDataURL(dataUrl) {
        if (!dataUrl) return;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (!this.subtractCtx) return resolve();
                this.subtractCtx.clearRect(0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
                this.subtractCtx.drawImage(img, 0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
                this._recomposite();
                resolve();
            };
            img.onerror = (err) => reject(err);
            img.src = dataUrl;
        });
    }

    setAutoPickMasks(map) {
        this.autoPickMasks = map instanceof Map ? map : new Map();
        this._recomposite();
    }

    setSelectedAutoPicks(set) {
        this.selectedAutoPicks = set instanceof Set ? set : new Set();
        this._recomposite();
    }

    clearAutoPicks() {
        this.autoPickMasks.clear();
        this.selectedAutoPicks.clear();
        this._recomposite();
    }

    getManualURL() {
        return this._layerToURL(this.manualCanvas, this.manualCtx);
    }

    getSubtractURL() {
        return this._layerToURL(this.subtractCanvas, this.subtractCtx);
    }

    /**
     * Serialize a layer canvas as alpha PNG (preserves white-on-transparent shape so
     * setManualFromDataURL / setSubtractFromDataURL can round-trip without flattening).
     * Returns null when the canvas has no painted pixels.
     */
    _layerToURL(srcCanvas, srcCtx) {
        if (!srcCanvas?.width || !srcCanvas?.height || !srcCtx) return null;
        const data = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) return srcCanvas.toDataURL('image/png');
        }
        return null;
    }

    destroy() {
        for (const c of [this.manualCanvas, this.subtractCanvas, this.maskCanvas]) {
            if (c) {
                c.width = 0;
                c.height = 0;
            }
        }
        this.manualCanvas = null;
        this.manualCtx = null;
        this.subtractCanvas = null;
        this.subtractCtx = null;
        this.maskCanvas = null;
        this.maskCtx = null;
        this.autoPickMasks?.clear?.();
        this.selectedAutoPicks?.clear?.();
    }

    /**
     * Flatten composite display to B/W PNG.
     */
    getURL(bg = null, fg = null) {
        if (!this.maskCanvas) return null;
        if (!bg && !fg) {
            return this.maskCanvas.toDataURL('image/png');
        }

        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');

        const bgIsWhite = bg === 'white';
        const fgIsBlack = fg === 'black';
        const [bgR, bgG, bgB] = bgIsWhite ? [255, 255, 255] : [0, 0, 0];
        const [fgR, fgG, fgB] = fgIsBlack ? [0, 0, 0] : [255, 255, 255];

        const src = this.maskCtx.getImageData(0, 0, w, h);
        const out = tempCtx.createImageData(w, h);

        for (let i = 0; i < src.data.length; i += 4) {
            const a = src.data[i + 3];
            if (a > 0) {
                out.data[i]     = fgR;
                out.data[i + 1] = fgG;
                out.data[i + 2] = fgB;
                out.data[i + 3] = 255;
            } else {
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
