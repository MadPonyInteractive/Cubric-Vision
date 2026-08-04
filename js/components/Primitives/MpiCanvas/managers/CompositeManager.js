/**
 * CompositeManager.js — the composite hole and its underlay (MPI-373).
 *
 * The last card of the MPI-424 taxonomy. Composite is ONE operation with two front
 * ends: the selected entry sits on TOP, a slot supplies the image UNDERNEATH, and a
 * hole through the top one is what reveals it. Paint Comp cuts that hole live with
 * the brush; Mask Comp takes it from a pasted mask. Same stack, same server blend.
 *
 * SCRATCH, NEVER PERSISTED (user, 2026-08-04). The hole could have been painted
 * straight into `MaskManager`'s layers — free brush, free undo, free export — and
 * that was rejected on purpose: the mask persists per entry, so a composite would
 * silently consume a mask the user brushed for an inpaint and leave its own behind.
 * A composite is a one-shot decision about two images, not an annotation on one.
 *
 * THE BRUSH MEANING IS INVERTED HERE, and that is the whole tool. The ERASER erases
 * the top image, which means it ADDS to the hole; the BRUSH paints the top image
 * back, which means it REMOVES hole. Every other destination in the app paints what
 * the brush touches — this one paints what it does NOT touch. The strip's labels say
 * so out loud (`MpiMaskStrip.DESTINATIONS.composite`).
 *
 * The dab geometry is `brushDab.js`, same as the mask and paint brushes — MPI-424's
 * thesis is that a new destination never means a new engine.
 *
 * UNDO: the shared `UndoStack`, injected by MpiCanvas, exactly as the other two
 * layers do it. `docs/masking-undo.md`'s enumerated mutation set is load-bearing —
 * an unlisted mutation is a silent hole in Ctrl+Z.
 */

import { stampDab, strokeDabs } from './brushDab.js';

/**
 * Same cap as MaskManager's, and for the same reason: this layer is CONSUMED as a
 * mask (it becomes `maskDataUrl` on `/project/composite-media`), so it is a shape
 * rather than picture detail. `getURL()` still exports at the source's own
 * resolution — the cap belongs on the paint loop, not on the contract with Sharp.
 */
const COMP_MAX_EDGE = 1536;

/** White, because the server reads the mask by LUMINANCE (white = take the overlay). */
const HOLE_FILL = '#ffffff';

export class CompositeManager {
    constructor() {
        this.holeCanvas = document.createElement('canvas');
        this.holeCtx = this.holeCanvas.getContext('2d', { willReadFrequently: true });

        /** @type {import('./UndoStack.js').UndoStack|null} injected by MpiCanvas */
        this.undo = null;

        /** @type {HTMLImageElement|null} image 2 — what the hole reveals. */
        this.underlay = null;

        this.isCompositeMode = false;
        this.isDrawing = false;
        /** Mask Comp armed the hole FROM the entry's mask, so a new entry must re-read
         *  it. Paint Comp never does — its cut is the brush, and inheriting the new
         *  entry's mask would replace strokes the user made. Set by
         *  `MpiCanvas.setCompositeHoleFromMask()`, dropped by `reset()`. */
        this.followMask = false;
        /** Mask Comp supplies the hole from a pasted mask, so it disarms the brush.
         *  Named to MATCH MaskManager and PaintManager: the wheel handler, the brush
         *  indicator and the B/E owner all duck-type on this one property, so every
         *  destination reusing the name is what keeps those three branch-free. */
        this.paintEnabled = true;

        this.brushSize = 40;
        this.brushType = 'eraser';

        this._scale = 1;
        this._srcWidth = 0;
        this._srcHeight = 0;

        this._strokeBox = null;
        this._lastDab = null;
    }

    /**
     * True when there is something to preview. The underlay is the gate, not the
     * hole: an empty hole over a filled slot is a legitimate state (nothing revealed
     * yet), while a hole with no underlay would reveal transparency.
     */
    get isActive() {
        return this.isCompositeMode && !!this.underlay && !!this.holeCanvas.width;
    }

    /**
     * Size the hole to a newly loaded image. Same contract as the other two layers:
     * a new image is a new layer and a new history.
     * @param {number} width - source image px
     * @param {number} height
     */
    init(width, height) {
        this._srcWidth = width;
        this._srcHeight = height;
        this._scale = Math.min(1, COMP_MAX_EDGE / Math.max(width, height));
        this.holeCanvas.width = Math.max(1, Math.round(width * this._scale));
        this.holeCanvas.height = Math.max(1, Math.round(height * this._scale));
        this.clear(false);
    }

    /** @returns {Array<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}>} */
    undoLayers() {
        if (!this.holeCtx) return [];
        return [{ canvas: this.holeCanvas, ctx: this.holeCtx }];
    }

    _recordUndo() {
        const layers = this.undoLayers();
        if (layers.length) this.undo?.record(layers);
    }

    /** @returns {{x:number,y:number,w:number,h:number}|null} */
    takeStrokeBox() {
        const b = this._strokeBox;
        this._strokeBox = null;
        this._lastDab = null;
        if (!b) return null;
        return { x: b.x0 - 1, y: b.y0 - 1, w: (b.x1 - b.x0) + 2, h: (b.y1 - b.y0) + 2 };
    }

    _growStrokeBox(x, y, r) {
        const b = this._strokeBox;
        if (!b) {
            this._strokeBox = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
            return;
        }
        b.x0 = Math.min(b.x0, x - r);
        b.y0 = Math.min(b.y0, y - r);
        b.x1 = Math.max(b.x1, x + r);
        b.y1 = Math.max(b.y1, y + r);
    }

    /**
     * One sample of a stroke, in image-px. INVERTED against every other brush in the
     * app: `eraser` cuts the top image away (grows the hole), `brush` paints it back
     * (shrinks the hole). See the file header — this is intentional, not a typo.
     * @param {number} imgX
     * @param {number} imgY
     */
    paint(imgX, imgY) {
        const s = this._scale;
        const to = { x: imgX * s, y: imgY * s };
        const r = (this.brushSize * s) / 2;
        const op = this.brushType === 'eraser' ? 'source-over' : 'destination-out';

        strokeDabs(this._lastDab, to, r, (x, y) => {
            this._growStrokeBox(x, y, r);
            stampDab(this.holeCtx, x, y, r, op, HOLE_FILL);
        });
        this._lastDab = to;
    }

    /**
     * Point the tool at image 2. Resolving here rather than in the panel keeps the
     * one `img.onload` race in the manager that owns the pixels.
     * @param {string|null} url
     * @returns {Promise<boolean>} false when the image could not be loaded
     */
    setUnderlay(url) {
        return new Promise((resolve) => {
            if (!url) { this.underlay = null; resolve(false); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { this.underlay = img; resolve(true); };
            img.onerror = () => { this.underlay = null; resolve(false); };
            img.src = url;
        });
    }

    /**
     * Fill the hole from a mask PNG (Mask Comp reads the entry's own mask). A LOAD
     * of a decision the user already made elsewhere, so it records no undo entry —
     * the same reasoning as `PaintManager.setFromDataURL`.
     *
     * WHITE-ON-TRANSPARENT ONLY. This layer is consumed by ALPHA on the canvas
     * (`destination-in` in `_renderOverlay`, and `isEmpty()` below) but by
     * LUMINANCE on the server, so an opaque black-and-white mask would cut the
     * whole frame here and only the white part there. `MpiCanvas` owns picking the
     * right export overload and documents why.
     *
     * @param {string} dataURL
     * @returns {Promise<boolean>}
     */
    setHoleFromDataURL(dataURL) {
        return new Promise((resolve) => {
            if (!dataURL || !this.holeCtx) { resolve(false); return; }
            const img = new Image();
            img.onload = () => {
                const { width: w, height: h } = this.holeCanvas;
                this.holeCtx.clearRect(0, 0, w, h);
                this.holeCtx.drawImage(img, 0, 0, w, h);
                this._strokeBox = null;
                this._lastDab = null;
                resolve(true);
            };
            img.onerror = () => resolve(false);
            img.src = dataURL;
        });
    }

    /**
     * Draw the underlay to fill `W`x`H`, centre-cropped (user, 2026-08-04).
     *
     * COVER, not fit: a revealed pixel must always be filled. Letterboxing would put
     * a transparent band inside the frame, and erasing into it would reveal nothing
     * — a preview that shows a hole where the result has image. `services/imageComposite.js`
     * resizes the overlay the same way, or the preview would lie on any mismatched pair.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} W
     * @param {number} H
     */
    drawUnderlayCover(ctx, W, H) {
        const img = this.underlay;
        if (!img?.width || !img.height) return;
        const scale = Math.max(W / img.width, H / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    /**
     * Wipe the hole. The underlay stays — clearing the cut is not the same gesture as
     * emptying the slot, and the strip's trash button means the former.
     * @param {boolean} [record] false skips the undo snapshot, for a LOAD.
     * @returns {boolean} true when there was something to clear
     */
    clear(record = true) {
        this._strokeBox = null;
        this._lastDab = null;
        if (!this.holeCtx) return false;
        if (record) {
            if (this.isEmpty()) return false;
            this._recordUndo();
        }
        this.holeCtx.clearRect(0, 0, this.holeCanvas.width, this.holeCanvas.height);
        return true;
    }

    /**
     * Drop the whole preview — hole AND underlay. This is what the preview contract
     * calls (`docs/masking-tools.md`); leaving the tool must leave nothing behind.
     * @returns {boolean} true when there was a preview to drop
     */
    reset() {
        const had = !!this.underlay || !this.isEmpty();
        this.underlay = null;
        this.followMask = false;
        this.clear(false);
        return had;
    }

    /** True when no pixel carries alpha. Scanned, not tracked — a flag goes stale on undo. */
    isEmpty() {
        const { width: w, height: h } = this.holeCanvas;
        if (!w || !h || !this.holeCtx) return true;
        const { data } = this.holeCtx.getImageData(0, 0, w, h);
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) return false;
        }
        return true;
    }

    /**
     * The hole as a PNG at the SOURCE image's resolution — white where the overlay
     * shows through. Same contract as `MaskManager.getURL()`: the working layer is
     * capped, the export is not, because the consumer asserts against the base image.
     * The route flattens onto black and greyscales, so shipping the alpha as-is is
     * exactly what a mask layer already does here.
     *
     * @returns {string|null} null when nothing is cut
     */
    getURL() {
        if (this.isEmpty()) return null;
        const w = this._srcWidth || this.holeCanvas.width;
        const h = this._srcHeight || this.holeCanvas.height;
        if (w === this.holeCanvas.width && h === this.holeCanvas.height) {
            return this.holeCanvas.toDataURL('image/png');
        }
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        out.getContext('2d').drawImage(this.holeCanvas, 0, 0, w, h);
        return out.toDataURL('image/png');
    }

    destroy() {
        this.undo = null;
        this.underlay = null;
        this._strokeBox = null;
    }
}
