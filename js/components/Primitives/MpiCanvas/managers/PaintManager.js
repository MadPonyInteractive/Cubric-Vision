/**
 * PaintManager.js — the RGBA paint layer (MPI-375).
 *
 * ONE layer, and deliberately nothing else: no sub-layers, no blend modes, no
 * pressure curves. Paint is an INPUT to the models, not decoration — the user
 * roughs in a shape with colour, masks it, and runs detail over it, so the prompt
 * says *what* while the paint says *where, what size, what colour*. That is the
 * whole feature, and it is why this file is a fraction of MaskManager's size.
 *
 * STRICTLY INDEPENDENT OF THE MASK LAYERS. `MaskManager`'s canvases are binary
 * alpha and are consumed as a mask; this one is real colour that gets flattened
 * into a new history entry. The headline flow is painting first and MASKING the
 * paint afterwards, so a shared layer would defeat the feature outright.
 *
 * The brush geometry is NOT here — `brushDab.js` owns the dab and the spacing, and
 * `MaskManager` stamps the same ones into its two binary layers. Textures (MPI-435)
 * land there once and both brushes get them.
 *
 * UNDO: the same `UndoStack` the mask uses, injected by MpiCanvas. The stack is
 * layer-agnostic on purpose (an entry is rect patches over arbitrary 2D contexts)
 * and was built before paint precisely so this layer would not need a second one.
 * Every mutation here records an entry — see `docs/masking-undo.md`, whose
 * enumerated set is load-bearing: an unlisted mutation is a silent hole in Ctrl+Z.
 */

import { alphaStencil } from '../../../../utils/maskUtils.js';
import { stampDab, strokeDabs, dabExtent, DEFAULT_BRUSH_PRESET } from './brushDab.js';
import { fieldOverContent, rangeFor, writeRange } from './distanceField.js';
import { holeFlood, regionCanvas } from './holeFlood.js';

/**
 * Paint is capped far higher than the mask's 1536 because it becomes REAL PIXELS
 * in a new history entry rather than being consumed as a mask — downscaling and
 * then upscaling on flatten would visibly soften every stroke. 4096 bounds the
 * worst case at ~64MB for a square layer; a source larger than that is resampled
 * up by Sharp on Apply, which is a soft edge on a vanishingly rare input rather
 * than a quarter of a gigabyte on a common one.
 */
const PAINT_MAX_EDGE = 4096;

/**
 * Layer-px margin the Adjust field is built with around the painted content
 * (MPI-445). The panel's sliders cap at 50 IMAGE px and `_scale` is never above 1, so
 * 52 already covers every radius they can ask for; `_ensureAdjustField()` still
 * rebuilds with a bigger pad if a caller asks for more, so this is a starting guess
 * and not a contract with the panel.
 */
const ADJUST_PAD = 52;

/** Accent-adjacent, so a fresh stroke never reads as the white mask overlay. */
// eslint-disable-next-line mpi/no-hardcoded-hex-color -- color picker default value
const DEFAULT_COLOR = '#e0446b';

export class PaintManager {
    constructor() {
        this.paintCanvas = document.createElement('canvas');
        this.paintCtx = this.paintCanvas.getContext('2d', { willReadFrequently: true });

        /** @type {import('./UndoStack.js').UndoStack|null} injected by MpiCanvas */
        this.undo = null;

        this.isPaintingMode = false;
        this.isDrawing = false;
        /** Mirrors MaskManager.paintEnabled — a paint-family tool that offers no
         *  brush (Shapes, MPI-368) disarms this so a drag pans instead of painting. */
        this.paintEnabled = true;

        // Brush settings are in IMAGE px, exactly like the mask brush, so the two
        // read the same at the same slider value.
        this.brushSize = 40;
        this.brushType = 'brush';
        /** A `BRUSH_PRESETS` id (MPI-435) — the same ten the mask brush has. */
        this.brushPreset = DEFAULT_BRUSH_PRESET;
        this.color = DEFAULT_COLOR;

        /**
         * DISPLAY opacity, not paint alpha — the same meaning the slider already has
         * for the mask, so the shared strip does not change behaviour between tools.
         * Apply DOES honour it: the server scales the flattened layer's alpha by this
         * once, which is the same maths as drawing the layer at globalAlpha, so the
         * new entry matches the screen.
         * ponytail: strokes are still laid down fully opaque in the layer itself.
         * True PER-STROKE alpha needs a scratch buffer composited on mouseup, because
         * dabs overlap 75% and would otherwise build to solid within one stroke,
         * making a slow drag darker than a fast one. The layer-wide scale above has
         * no such build-up. Add the scratch buffer only if someone wants two strokes
         * at different strengths in one layer.
         */
        this.opacity = 0.7;

        /** paint-px per image-px. Set in init(). */
        this._scale = 1;
        this._srcWidth = 0;
        this._srcHeight = 0;

        /** Dirty box of the stroke in flight, in paint-px. Null between strokes. */
        this._strokeBox = null;
        /** Previous dab of the stroke in flight, in paint-px. Reset in takeStrokeBox(). */
        this._lastDab = null;

        // Adjust (MPI-436) — allocated on tool entry, dropped by endAdjust(). The
        // preview lives here rather than in the layer, so nothing is committed until
        // Apply and leaving the tool costs a discard rather than an undo.
        /** @type {HTMLCanvasElement|null} */
        this.adjustCanvas = null;
        /** @type {CanvasRenderingContext2D|null} */
        this.adjustCtx = null;
        this.hasAdjustPreview = false;
        /** @type {HTMLCanvasElement|null} the layer as it was on tool entry */
        this._adjustPristine = null;
        /** @type {Float32Array|null} covers `_adjustBox`, not the whole layer */
        this._adjustField = null;
        /** @type {{x:number,y:number,w:number,h:number}|null} the field's footprint */
        this._adjustBox = null;
        /** Layer px of margin the current field was built with. */
        this._adjustPad = 0;
        /** @type {ImageData|null} */
        this._adjustImg = null;
    }

    /**
     * Size the layer to a newly loaded image. A new image means a new layer AND a
     * new history — the same contract MaskManager.init() follows, and for the same
     * reason: undo must never reach across two entries.
     * @param {number} width - source image px
     * @param {number} height
     */
    init(width, height) {
        this._srcWidth = width;
        this._srcHeight = height;
        this._scale = Math.min(1, PAINT_MAX_EDGE / Math.max(width, height));
        this.paintCanvas.width = Math.max(1, Math.round(width * this._scale));
        this.paintCanvas.height = Math.max(1, Math.round(height * this._scale));
        // A preview must not outlive the pixels it previewed (MPI-436).
        this.endAdjust();
        // Setting width/height already blanks the canvas; clear(false) is about the
        // stroke state, and records nothing because a load is not an undoable edit.
        this.clear(false);
    }

    /** @returns {Array<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}>} */
    undoLayers() {
        if (!this.paintCtx) return [];
        return [{ canvas: this.paintCanvas, ctx: this.paintCtx }];
    }

    /** Snapshot the layer before a layer-wide mutation. */
    _recordUndo() {
        const layers = this.undoLayers();
        if (layers.length) this.undo?.record(layers);
    }

    /**
     * Take the dirty box the stroke in flight accumulated and reset it. Padded by
     * 1px because the dab arc is antialiased past its own radius.
     * @returns {{x:number,y:number,w:number,h:number}|null} null when nothing was painted
     */
    takeStrokeBox() {
        const b = this._strokeBox;
        this._strokeBox = null;
        // Stroke boundary, so the interpolator's previous sample dies here too —
        // carrying it across strokes would draw a line from the end of one to the
        // start of the next.
        this._lastDab = null;
        if (!b) return null;
        return { x: b.x0 - 1, y: b.y0 - 1, w: (b.x1 - b.x0) + 2, h: (b.y1 - b.y0) + 2 };
    }

    /** Grow the in-flight stroke box to cover a dab of radius r at (x, y), all paint-px. */
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
     * Lay down (or erase) one sample of a stroke. Coords arrive in image-px and are
     * mapped to the layer's own px here, exactly as MaskManager.paint() does.
     * @param {number} imgX
     * @param {number} imgY
     */
    paint(imgX, imgY) {
        const s = this._scale;
        const to = { x: imgX * s, y: imgY * s };
        const r = (this.brushSize * s) / 2;
        // One layer, so an eraser is a straight destination-out — there is no
        // subtract twin to keep in step the way the binary mask needs.
        const op = this.brushType === 'eraser' ? 'destination-out' : 'source-over';
        const preset = this.brushPreset;
        // The dab's real reach, not its nominal radius — a scattered preset paints
        // outside r and an undo box grown for r would leave those pixels behind.
        const reach = dabExtent(r, preset);

        strokeDabs(this._lastDab, to, r, (x, y) => {
            this._growStrokeBox(x, y, reach);
            stampDab(this.paintCtx, x, y, r, op, this.color, preset);
        }, preset);
        this._lastDab = to;
    }

    /**
     * Rasterise a shape into the layer (MPI-368) — the paint half of "one gizmo,
     * two destinations". Fill lays the shape down in the current colour, Erase
     * punches it out, exactly as the brush and its eraser do here.
     *
     * The caller passes a PATH BUILDER rather than a path, so the geometry is
     * scaled by THIS layer's `_scale`: the mask works at 1536 and this layer at
     * 4096, and a path built for one is silently wrong on the other.
     *
     * Layer-wide ONE SHOT, so a single full-rect undo entry after the no-op guard
     * (`docs/masking-undo.md`).
     *
     * @param {(scale: number) => Path2D|null} buildPath
     * @param {boolean} [erase]
     * @returns {boolean} false when there was nothing to rasterise
     */
    commitShape(buildPath, erase = false) {
        if (!this.paintCtx) return false;
        const path = buildPath(this._scale);
        if (!path) return false;

        this._recordUndo();

        this.paintCtx.save();
        this.paintCtx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
        this.paintCtx.fillStyle = this.color;
        this.paintCtx.fill(path);
        this.paintCtx.restore();
        return true;
    }

    // ── Adjust — grow / shrink / edge band over RGBA (MPI-436) ───────────────
    //
    // THE SAME PRIMITIVE AS THE MASK, not a second copy: `distanceField.js` is one
    // module and both layers call it (`MaskManager` § Adjust is the twin). Only the
    // FILL differs, because a mask is coverage and this layer is colour.
    //
    // THE ALPHA DECISION (MPI-440, answered here for MPI-439 to inherit): the shape
    // of the paint layer IS its ALPHA channel, binarised at >= 128 — the same cut
    // `fillHoles()` uses, and the one the field already applies. NOT luminance: a
    // dark scribble and a light one are equally painted, and reading luminance would
    // make a black stroke read as background. The consequence is that the boundary an
    // operation CREATES is hard, so a soft edge does not survive where the operation
    // cuts. Pixels the boundary does not touch keep their own colour AND their own
    // alpha — which is what makes shrink lossless in the interior and grow's ring the
    // only flat part.

    /**
     * Enter Adjust: snapshot the layer so every preview frame derives from tool-entry
     * state rather than from the frame before it (the MPI-351 double-scale bug).
     *
     * The distance field is INVALIDATED here, not built. It describes this snapshot,
     * so an eager build would charge its cost to entering the tool and to every Apply
     * even for a user who never moves a slider; the first `previewAdjust()` that needs
     * one builds it.
     */
    beginAdjust() {
        const w = this.paintCanvas.width;
        const h = this.paintCanvas.height;
        if (!w || !h) return;

        if (!this._adjustPristine) this._adjustPristine = document.createElement('canvas');
        this._adjustPristine.width = w;
        this._adjustPristine.height = h;
        this._adjustPristine.getContext('2d', { willReadFrequently: true })
            .drawImage(this.paintCanvas, 0, 0);
        this._adjustField = null;
        this._adjustBox = null;
        this._adjustPad = 0;
        this._adjustImg = null;

        if (!this.adjustCanvas) {
            this.adjustCanvas = document.createElement('canvas');
            this.adjustCtx = this.adjustCanvas.getContext('2d', { willReadFrequently: true });
        }
        this.adjustCanvas.width = w;
        this.adjustCanvas.height = h;
        this.hasAdjustPreview = false;
    }

    /**
     * Derive the field and the reused preview buffer from the pristine snapshot, once
     * per snapshot. Reads `_adjustPristine`, NEVER `adjustCanvas` — sourcing it from
     * its own output is how the adjustment starts compounding frame over frame.
     *
     * Built over the PAINTED CONTENT's bounding box, not the whole layer (MPI-445).
     * The field's cost is quadratic in the pixel count and this layer runs at up to
     * PAINT_MAX_EDGE: a full-layer field at 4096² measured 1563 ms on the first slider
     * move and 64 ms per frame after it, i.e. a visible freeze and then a ~15fps drag.
     * A scribble covers a fraction of the layer, so bounding the field to it cuts BOTH
     * numbers by the same factor — and unlike capping the field's resolution (the
     * upgrade path this comment used to name) it is exact, so MPI-441's radius
     * precision survives intact. The box is padded, never clamped to the content: the
     * primitive reads outside-the-box as background, so an unpadded box would erode
     * the layer from a border that is not there.
     *
     * ponytail: what is left is the box's own worst case — paint covering the WHOLE
     * 4096 layer is still 1.6 s to enter and 65 ms a frame, because that field really
     * is 16.7M px. The remaining lever is capping the field's resolution at the mask's
     * 1536 and upscaling the region, which costs the radius precision MPI-441 bought
     * (~2.7 layer px of quantisation) — a deliberate trade, not a tidy-up. A scribble,
     * which is what the report was, now costs 70 ms then 0.4 ms.
     *
     * @param {number} maxR the largest radius this preview will ask for, in LAYER px —
     *   the field is rebuilt if the current one was not padded that far
     * @returns {boolean} false when there is nothing to build from
     */
    _ensureAdjustField(maxR = 0) {
        const pad = Math.max(ADJUST_PAD, Math.ceil(maxR) + 2);
        if (this._adjustField && this._adjustImg && this._adjustPad >= pad) return true;
        const src = this._adjustPristine;
        if (!src?.width || !src?.height || !this.adjustCtx) return false;
        const w = src.width;
        const h = src.height;
        const data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        const built = fieldOverContent(data, w, h, pad);
        if (!built) return false; // nothing painted — no shape to grow or shrink
        this._adjustField = built.field;
        this._adjustBox = built.box;
        this._adjustPad = pad;
        this._adjustImg = this.adjustCtx.createImageData(built.box.w, built.box.h);
        return true;
    }

    /**
     * Recompute the preview from the pristine copy. Radii arrive in IMAGE px, like
     * every other coordinate here, and are scaled to layer px — the mask works at
     * 1536 and this layer at 4096, so a radius meant for one is wrong in the other.
     *
     * The region is one range test over the field (identical to the mask's); the
     * three fills are where the layers diverge:
     * - **shrink** — the region clips the ORIGINAL, so every surviving pixel keeps
     *   its own colour and the edge eats inward.
     * - **grow** — the region is filled flat in the current colour and the original
     *   is drawn back on top, so the new ring is the only flat part.
     * - **edge band** — the band alone, in the current colour. That is the outline
     *   tool, and like the mask's Edge it REPLACES the layer rather than adding to
     *   it: Adjust is a method over the layer, not another way of painting.
     *
     * The no-op guard runs BEFORE `_ensureAdjustField()` on purpose — a zero slider
     * must cost nothing.
     *
     * @param {{grow?:number, outward?:number, inward?:number, edge?:boolean}} opts
     *   grow: >0 dilates, <0 erodes. edge: an outward/inward band instead.
     * @returns {boolean} true when a preview is up
     */
    previewAdjust(opts = {}) {
        const src = this._adjustPristine;
        if (!src || !this.adjustCtx) return false;
        const w = src.width;
        const h = src.height;

        const s = this._scale;
        const edge = !!opts.edge;
        const grow = opts.grow || 0;
        const range = rangeFor({
            edge,
            grow: grow * s,
            outward: (opts.outward || 0) * s,
            inward: (opts.inward || 0) * s,
        });
        const maxR = Math.max(
            Math.abs(grow),
            Math.abs(opts.outward || 0),
            Math.abs(opts.inward || 0),
        ) * s;
        if (!range || !this._ensureAdjustField(maxR)) {
            this.adjustCtx.clearRect(0, 0, w, h);
            this.hasAdjustPreview = false;
            return false;
        }

        // EVERY op is clipped to the field's box (MPI-445). Not an optimisation of the
        // fills alone: a full-canvas `fillRect` + `drawImage` measured 46 ms a frame at
        // 4096 — seven times the range test they were composited with — and a clip is
        // what stops the preview canvas being touched outside the box at all. Which is
        // sound because the box holds every non-transparent pixel of the layer: nothing
        // outside it can be part of any of the three results.
        const box = this._adjustBox;
        writeRange(this._adjustField, new Uint32Array(this._adjustImg.data.buffer), range.lo, range.hi);

        const ctx = this.adjustCtx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.clearRect(box.x, box.y, box.w, box.h);
        // putImageData ignores both the clip and globalCompositeOperation — it writes
        // exactly the box, which IS the clip, so the region lands as plain white and
        // the fills below read it as their own clip.
        ctx.putImageData(this._adjustImg, box.x, box.y);
        if (!edge && grow < 0) {
            // `source-in` = the source drawn only where the destination is opaque, so
            // the region acts as the clip and the pixels come through unchanged.
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(src, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
        } else {
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = this.color;
            ctx.fillRect(box.x, box.y, box.w, box.h);
            if (!edge) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(src, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
            }
        }
        ctx.restore();

        this.hasAdjustPreview = true;
        return true;
    }

    /**
     * Bake the preview into the layer. Layer-wide ONE SHOT, so a single
     * `_recordUndo()` after the no-op guard — not a `begin()`/`commit()` gesture
     * (`docs/masking-undo.md`).
     * @returns {boolean} false when there was nothing to apply
     */
    applyAdjust() {
        if (!this.hasAdjustPreview || !this.adjustCanvas || !this.paintCtx) return false;

        this._recordUndo();

        this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
        this.paintCtx.drawImage(this.adjustCanvas, 0, 0);

        // Still inside the tool: re-snapshot so the next adjustment starts from what
        // was just baked instead of from the pre-Apply layer.
        this.hasAdjustPreview = false;
        this.beginAdjust();
        return true;
    }

    /**
     * Fill every ENCLOSED hole in the paint layer, in the CURRENT colour (MPI-566).
     *
     * This is the payoff of the outline tool: Edge reduces a scribble to a band, and a
     * closed outline the user cannot fill is a tool stopped one press short. The flood is
     * `holeFlood.js` — the SAME function the mask calls, not a paint-side copy — and it
     * reads alpha at >= 128, which is the layer's shape by the MPI-440 ruling.
     *
     * The composite is Adjust's GROW row byte for byte: the region flat in the colour,
     * the original drawn back ON TOP. So the fill is the only flat part, every existing
     * stroke keeps its own colour AND its own alpha, and the hole's antialiased rim
     * composites over the fill instead of leaving the semi-transparent seam a
     * threshold-and-write would.
     *
     * Fills what is ON SCREEN — the live preview when one is up, the layer otherwise — so
     * pressing Fill mid-adjustment bakes both as ONE undo entry, the mask's rule and for
     * the mask's reason: silently dropping the user's preview is worse.
     *
     * Layer-wide one shot, so `_recordUndo()` after the no-op guard, never a
     * `begin()`/`commit()` gesture (`docs/masking-undo.md`).
     *
     * @returns {boolean} false when there was no hole to fill
     */
    fillHoles() {
        if (!this.paintCtx) return false;
        const src = (this.hasAdjustPreview && this.adjustCanvas) ? this.adjustCanvas : this.paintCanvas;
        if (!src?.width || !src?.height) return false;

        const w = src.width;
        const h = src.height;
        const ctx = src.getContext('2d', { willReadFrequently: true });
        const region = holeFlood(ctx.getImageData(0, 0, w, h).data, w, h);
        if (!region) return false;   // no-op must not push an empty undo entry

        this._recordUndo();

        // Through a scratch canvas rather than in place: the region has to be UNDER the
        // original, and `src` may be the layer we are about to clear.
        const box = region.box;
        const buf = document.createElement('canvas');
        buf.width = w;
        buf.height = h;
        const bctx = buf.getContext('2d');
        bctx.drawImage(regionCanvas(region), box.x, box.y);
        // `source-in` = drawn only where the destination is opaque, so the region is the
        // clip and the rect lands as the region in the paint colour.
        bctx.globalCompositeOperation = 'source-in';
        bctx.fillStyle = this.color;
        bctx.fillRect(box.x, box.y, box.w, box.h);
        bctx.globalCompositeOperation = 'source-over';
        bctx.drawImage(src, 0, 0);

        this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
        this.paintCtx.drawImage(buf, 0, 0);

        // The preview (if any) is now baked, so drop it and re-snapshot — otherwise the
        // next slider move would recompute from a pristine copy that predates the fill.
        this.hasAdjustPreview = false;
        if (this._adjustPristine) this.beginAdjust();
        return true;
    }

    /**
     * Drop the preview and its buffers. Called by Reset and by leaving the tool
     * through the shared `discardPreview()` seam. Idempotent.
     * @returns {boolean} true when a preview was discarded
     */
    endAdjust() {
        const had = this.hasAdjustPreview;
        this.hasAdjustPreview = false;
        for (const c of [this.adjustCanvas, this._adjustPristine]) {
            if (c) { c.width = 0; c.height = 0; }
        }
        this.adjustCanvas = null;
        this.adjustCtx = null;
        this._adjustPristine = null;
        this._adjustField = null;
        this._adjustBox = null;
        this._adjustPad = 0;
        this._adjustImg = null;
        return had;
    }

    /**
     * mask → paint (MPI-439): lay the mask's coverage down as paint, in the CURRENT
     * colour, flat (user, 2026-08-04 — carrying the mask's own alpha through so a
     * soft mask edge became a soft paint edge was offered and declined).
     *
     * A COPY, and a MERGE: the mask is left alone and existing paint survives, so the
     * worst a mis-click costs is one Ctrl+Z. The stencil is cut at the mask's own
     * resolution and scaled up here, which is what gives the result a resampled edge
     * rather than 2.7px stair-steps.
     *
     * Layer-wide one shot: `_recordUndo()` AFTER the empty-source guard, or an
     * unconvertible mask pushes a dead undo entry (`docs/masking-undo.md`).
     *
     * @param {HTMLCanvasElement} maskCanvas the DERIVED mask — what `hasMask()` reads,
     *   so an unbaked detection preview is not convertible (MPI-426)
     * @returns {boolean} false when the mask had nothing to convert
     */
    fillFromMask(maskCanvas) {
        if (!this.paintCtx) return false;
        const stencil = alphaStencil(maskCanvas, this.color);
        if (!stencil) return false;

        this._recordUndo();
        this.paintCtx.drawImage(stencil, 0, 0, this.paintCanvas.width, this.paintCanvas.height);
        return true;
    }

    /**
     * Wipe the layer.
     * @param {boolean} [record] false skips the undo snapshot — for a LOAD (init),
     *   where blanking the layer is not an edit the user could have undone.
     * @returns {boolean} true when there was something to clear
     */
    clear(record = true) {
        this._strokeBox = null;
        this._lastDab = null;
        if (!this.paintCtx) return false;
        if (record) {
            if (this.isEmpty()) return false;
            this._recordUndo();
        }
        this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
        return true;
    }

    /**
     * True when no pixel carries alpha. Scanned rather than tracked with a flag: a
     * flag goes stale the moment an undo restores the layer to empty, and the two
     * callers that care — Apply and the per-entry save — are the two places where
     * being wrong actually costs something. Rare enough that a full pass is cheaper
     * than the bug.
     */
    isEmpty() {
        const { width: w, height: h } = this.paintCanvas;
        if (!w || !h || !this.paintCtx) return true;
        const { data } = this.paintCtx.getImageData(0, 0, w, h);
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) return false;
        }
        return true;
    }

    /** @returns {string|null} PNG data URL of the layer, or null when nothing is painted */
    getURL() {
        if (this.isEmpty()) return null;
        return this.paintCanvas.toDataURL('image/png');
    }

    /**
     * Restore a layer from a saved PNG (per-entry reload). A LOAD, so it records no
     * undo entry and drops any in-flight stroke state.
     * @param {string} dataURL
     * @returns {Promise<void>}
     */
    setFromDataURL(dataURL) {
        return new Promise((resolve) => {
            if (!dataURL || !this.paintCtx) { resolve(); return; }
            const img = new Image();
            img.onload = () => {
                this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
                this.paintCtx.drawImage(img, 0, 0, this.paintCanvas.width, this.paintCanvas.height);
                this._strokeBox = null;
                this._lastDab = null;
                resolve();
            };
            img.onerror = () => resolve();
            img.src = dataURL;
        });
    }
}
