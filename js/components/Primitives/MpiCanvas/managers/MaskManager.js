/**
 * MaskManager.js
 * Three-layer mask model:
 *   manualCanvas    — brush strokes (white where painted)
 *   subtractCanvas  — eraser strokes (white where erased)
 *   maskCanvas      — derived composite display layer = (manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]
 *   autoCanvas      — derived DISPLAY-ONLY subset = ⋃autoPickMasks[selected]
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
 *
 * POINT PROMPTS (MPI-361) are a FOURTH, separate layer and deliberately not a
 * canvas: they are a list of dots the auto-mask graph turns into a mask, not
 * mask content themselves. Nothing composites them — `getPointsMaskDataURL()`
 * renders them on demand for `Input_Points_Mask`.
 */
const MASK_MAX_EDGE = 1536;

/**
 * `SAMDetectorCombined(mask_hint_use_negative='Small')` reads a dot whose bbox
 * width is < 10 px as a NEGATIVE point — brush size IS the polarity switch, with
 * an exact 10px cliff. Our UI carries explicit polarity (left/right click), so we
 * synthesize radii that land safely either side of it. These are SOURCE-image px
 * and deliberately fixed: the `mask-points` branch only uses each blob's CENTRE,
 * so dot size means polarity and nothing else.
 */
const POINT_R_POSITIVE = 8; // bbox 17px -> positive
const POINT_R_NEGATIVE = 4; // bbox  9px -> negative

export class MaskManager {
    constructor() {
        this.manualCanvas = document.createElement('canvas');
        this.manualCtx = this.manualCanvas.getContext('2d', { willReadFrequently: true });

        this.subtractCanvas = document.createElement('canvas');
        this.subtractCtx = this.subtractCanvas.getContext('2d', { willReadFrequently: true });

        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });

        // Display-only twin of maskCanvas holding the DETECTED pixels alone —
        // see _recompositeAuto(). `hasAutoLayer` lets the renderer skip the pass.
        this.autoCanvas = document.createElement('canvas');
        this.autoCtx = this.autoCanvas.getContext('2d');
        this.hasAutoLayer = false;

        this.autoPickMasks = new Map();
        this.selectedAutoPicks = new Set();

        // mask-px per image-px. Set in init(); paint() multiplies incoming
        // image-px coords + brush radius by this to hit the downscaled canvas.
        this._scale = 1;

        // Point prompts, in SOURCE-image px (NOT mask-px — see POINT_R_* above:
        // the graph measures each dot's bbox in real pixels of the image it loads).
        /** @type {Array<{x:number,y:number,positive:boolean}>} */
        this.points = [];
        this.pointsMode = false;
        this._srcWidth = 0;
        this._srcHeight = 0;

        this.isMaskingMode = false;
        this.isDrawingMask = false;
        this.brushSize = 40;
        this.brushType = 'brush';
        // MPI-381: mask mode is shared by the whole tool family, but only the
        // Brush tool paints. A tool that mounts MpiMaskStrip without its brush
        // pair disarms this, so a drag on the canvas pans instead of painting
        // and the wheel zooms instead of resizing an invisible brush.
        this.paintEnabled = true;
        this.maskOpacity = 0.7;
        this.maskColor = 'rgba(255, 255, 255, 1)';
        // Display-only inversion: swaps the visible overlay color without
        // touching the underlying mask data. Used by viewer.draw() / getURL().
        this.displayInverted = false;
        // Display-only black-and-white view (MPI-381): the mask alone, opaque,
        // on a flat background instead of a translucent tint over the image —
        // how a user finds the stray specks a detection leaves behind.
        this.bwView = false;
    }

    init(width, height) {
        this._srcWidth = width;
        this._srcHeight = height;
        this._scale = Math.min(1, MASK_MAX_EDGE / Math.max(width, height));
        const w = Math.max(1, Math.round(width * this._scale));
        const h = Math.max(1, Math.round(height * this._scale));
        this.manualCanvas.width = w;
        this.manualCanvas.height = h;
        this.subtractCanvas.width = w;
        this.subtractCanvas.height = h;
        this.maskCanvas.width = w;
        this.maskCanvas.height = h;
        this.autoCanvas.width = w;
        this.autoCanvas.height = h;
        this.clear();
    }

    clear() {
        if (this.manualCtx) this.manualCtx.clearRect(0, 0, this.manualCanvas.width, this.manualCanvas.height);
        if (this.subtractCtx) this.subtractCtx.clearRect(0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
        this.autoPickMasks.clear();
        this.selectedAutoPicks.clear();
        this.points = [];
        this._recomposite();
    }

    // ── Point prompts (MPI-361) ──────────────────────────────────────────────

    pointRadius(positive) {
        return positive ? POINT_R_POSITIVE : POINT_R_NEGATIVE;
    }

    addPoint(imgX, imgY, positive = true) {
        this.points.push({ x: imgX, y: imgY, positive: !!positive });
    }

    /**
     * Remove the point under (imgX, imgY) — the "individually removable" half of
     * the contract. `slack` widens the hit target beyond the dot's own radius so a
     * 4px negative dot is still clickable.
     * @returns {boolean} true when a point was removed
     */
    removePointAt(imgX, imgY, slack = 8) {
        for (let i = this.points.length - 1; i >= 0; i--) {
            const p = this.points[i];
            const r = this.pointRadius(p.positive) + slack;
            if ((p.x - imgX) ** 2 + (p.y - imgY) ** 2 <= r * r) {
                this.points.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    clearPoints() { this.points = []; }
    hasPoints()   { return this.points.length > 0; }

    /**
     * White dots on black at SOURCE resolution — the shape `Input_Points_Mask`
     * expects in `comfy_workflows/img_auto_mask.json` (its `ImageToMask` reads the
     * RED channel, so this is deliberately not an alpha mask). Full size, not the
     * MASK_MAX_EDGE-capped working size: SEG coords must line up with the source
     * image `SAMDetectorCombined` receives, and the negative-point cliff is
     * measured in that image's own pixels.
     * @returns {string|null} data URL, or null when there are no points
     */
    getPointsMaskDataURL() {
        if (!this.points.length || !this._srcWidth || !this._srcHeight) return null;
        const c = document.createElement('canvas');
        c.width = this._srcWidth;
        c.height = this._srcHeight;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = 'rgb(255, 255, 255)';
        for (const p of this.points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.pointRadius(p.positive), 0, Math.PI * 2);
            ctx.fill();
        }
        return c.toDataURL('image/png');
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
     * display = (manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]
     *
     * ORDER IS LOAD-BEARING: the auto picks go on LAST, so a detection wins over
     * an older erase. Punching subtract over them instead made a region the user
     * had erased invisible when a later run detected it — while `Add` (which
     * un-erases, mirroring paint()) filled it in. Preview and commit disagreed;
     * the auto layer is a deferred positive assertion, not something the erase
     * that predates it gets to veto.
     */
    _recomposite() {
        if (!this.maskCtx || !this.maskCanvas) return;
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        if (!w || !h) return;

        this.maskCtx.save();
        this.maskCtx.clearRect(0, 0, w, h);

        // Step 1: manual AND NOT subtract — destination-out punches subtract holes
        this.maskCtx.globalCompositeOperation = 'source-over';
        this.maskCtx.drawImage(this.manualCanvas, 0, 0);
        this.maskCtx.globalCompositeOperation = 'destination-out';
        this.maskCtx.drawImage(this.subtractCanvas, 0, 0);

        // Step 2: union the selected auto picks on top — exactly what Add bakes
        this.maskCtx.globalCompositeOperation = 'source-over';
        for (const idx of this.selectedAutoPicks) {
            const layer = this.autoPickMasks.get(idx);
            if (layer) this.maskCtx.drawImage(layer, 0, 0, w, h);
        }

        this.maskCtx.restore();

        this._recompositeAuto(w, h);
    }

    /**
     * DISPLAY-ONLY split (MPI-361). Same math as _recomposite() minus the manual
     * layer, so MpiCanvas can tint a DETECTED region differently from a PAINTED
     * one — the two are the same white pixels in maskCanvas, which makes a
     * detection inside an already-masked area invisible.
     *
     * NEVER exported: getURL() / the viewer's composite still flatten the single
     * unioned maskCanvas that every downstream mask consumer reads.
     *   auto = ⋃autoPickMasks[selected]
     *
     * No subtract punch here either — the green tint shows exactly what the run
     * returned and exactly what `Add` would bake, which is the whole point of it
     * being a preview.
     */
    _recompositeAuto(w, h) {
        if (!this.autoCtx) return;
        this.autoCtx.clearRect(0, 0, w, h);
        this.hasAutoLayer = false;

        const layers = [...this.selectedAutoPicks]
            .map(i => this.autoPickMasks.get(i))
            .filter(Boolean);
        // Brush-only work (the per-dab hot path) pays nothing for this pass.
        if (!layers.length) return;

        this.autoCtx.save();
        this.autoCtx.globalCompositeOperation = 'source-over';
        for (const l of layers) this.autoCtx.drawImage(l, 0, 0, w, h);
        this.autoCtx.restore();

        this.hasAutoLayer = true;
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

    /**
     * Bake the selected auto-pick masks into a permanent layer, then drop the auto
     * layer — the app-side Add / Subtract from MPI-361. `manual` unions the result
     * into the painted layer, `subtract` punches it out of the composite. No
     * AddMask/SubtractMask nodes and no extra round trip, and it composes with the
     * brush because it lands in the same two canvases the brush writes. Both sides
     * are written, mirroring paint(): adding un-erases, subtracting un-paints.
     * @param {'manual'|'subtract'} target
     * @returns {boolean} false when nothing was selected to bake
     */
    bakeAutoPicksInto(target) {
        const layers = [...this.selectedAutoPicks]
            .map(i => this.autoPickMasks.get(i))
            .filter(Boolean);
        if (!layers.length || !this.manualCtx || !this.subtractCtx) return false;

        const toSubtract = target === 'subtract';
        const dstCtx    = toSubtract ? this.subtractCtx    : this.manualCtx;
        const dstCanvas = toSubtract ? this.subtractCanvas : this.manualCanvas;
        const othCtx    = toSubtract ? this.manualCtx      : this.subtractCtx;
        const othCanvas = toSubtract ? this.manualCanvas   : this.subtractCanvas;

        dstCtx.save();
        dstCtx.globalCompositeOperation = 'source-over';
        for (const l of layers) dstCtx.drawImage(l, 0, 0, dstCanvas.width, dstCanvas.height);
        dstCtx.restore();

        othCtx.save();
        othCtx.globalCompositeOperation = 'destination-out';
        for (const l of layers) othCtx.drawImage(l, 0, 0, othCanvas.width, othCanvas.height);
        othCtx.restore();

        this.autoPickMasks.clear();
        this.selectedAutoPicks.clear();
        this._recomposite();
        return true;
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
        for (const c of [this.manualCanvas, this.subtractCanvas, this.maskCanvas, this.autoCanvas]) {
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
        this.autoCanvas = null;
        this.autoCtx = null;
        this.hasAutoLayer = false;
        this.autoPickMasks?.clear?.();
        this.selectedAutoPicks?.clear?.();
        this.points = [];
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
