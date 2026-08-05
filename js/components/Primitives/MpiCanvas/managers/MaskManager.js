/**
 * MaskManager.js
 * Three-layer mask model:
 *   manualCanvas    — brush strokes (white where painted)
 *   subtractCanvas  — eraser strokes (white where erased)
 *   maskCanvas      — derived composite display layer = (manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]
 *   autoCanvas      — derived DISPLAY-ONLY subset = ⋃autoPickMasks[selected]
 *   adjustCanvas    — the Adjust PREVIEW (MPI-382), display-only and transient
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
 * ⚠ EVERY MUTATION OF manualCanvas / subtractCanvas MUST BE UNDOABLE (MPI-376).
 * These two layers are the only persistent mask state, and `MpiCanvas` owns a shared
 * UndoStack that restores them. If you add a method that writes either canvas:
 *   - layer-wide, one shot (a bake, a Clear, a grow) → call `this._recordUndo()` FIRST,
 *     after any early-return guard so a no-op cannot push an empty entry;
 *   - a gesture with a start and an end (a stroke, a drag) → `undo.begin(undoLayers())`
 *     at the start, accumulate the dirty box, `undo.commit(takeStrokeBox())` at the end;
 *   - a LOAD that replaces the layers (setManual/SubtractFromDataURL, init) → record
 *     NOTHING and clear the stack — a load is not an edit the user could have undone.
 * A mutation that skips this is a silent hole in Ctrl+Z: undo that works for some edits
 * and not others is worse than no undo at all. See docs/masking-undo.md.
 *
 * POINT PROMPTS (MPI-361) are a FOURTH, separate layer and deliberately not a
 * canvas: they are a list of dots the auto-mask graph turns into a mask, not
 * mask content themselves. Nothing composites them — `getPointsJSON()` serialises
 * them on demand for `Input_Points_Positive` / `Input_Points_Negative`.
 */

import { alphaStencil } from '../../../../utils/maskUtils.js';
import { stampDab, strokeDabs, dabExtent, DEFAULT_BRUSH_PRESET } from './brushDab.js';
import { signedSquaredDistanceField, rangeFor, writeRange } from './distanceField.js';

const MASK_MAX_EDGE = 1536;

/**
 * Hit radius in SOURCE-image px for picking a dot back off the canvas. Display
 * size lives in `MpiCanvas.MASK_POINT_DRAW_R`; this one only has to be generous
 * enough to click. Polarity no longer has a size (MPI-380): SAM3 takes it as two
 * separate coordinate lists, so there is nothing to encode in a radius.
 */
const POINT_HIT_R = 12;

/**
 * Alpha at or above this counts as MASK for `fillHoles()`, below it as background.
 * Half-open deliberately: mask edges are antialiased, so a strict `> 0` test would
 * treat the feathered rim as solid and wall the flood out of a hole it should enter.
 */
const FILL_HOLES_T = 128;

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

        /**
         * Adjust preview (MPI-382). A PREVIEW, not a layer: it is drawn in the
         * pending green instead of the mask and never exported, so leaving the
         * tool without pressing Apply loses it — the preview contract
         * (docs/masking-tools.md). Allocated on beginAdjust(), freed on
         * endAdjust(), so no other tool pays for it.
         * @type {HTMLCanvasElement|null}
         */
        this.adjustCanvas = null;
        this.adjustCtx = null;
        this.hasAdjustPreview = false;
        /** The composed mask as it was when Adjust was entered. EVERY frame is
         *  recomputed from this, never from the frame before it, or grow-3 three
         *  times eats detail exactly like the MPI-351 double-scale bug. */
        this._adjustPristine = null;
        /** Signed squared-distance field of the pristine mask (MPI-441). Built ONCE
         *  in beginAdjust() because it does not depend on the radius, so a slider
         *  drag costs one range test per frame instead of one transform.
         *  @type {Float32Array|null} */
        this._adjustField = null;

        /**
         * UndoStack, injected by MpiCanvas (MPI-376). Only manualCanvas and
         * subtractCanvas are undoable: maskCanvas and autoCanvas are derived, so
         * restoring the two source layers and re-running _recomposite() rebuilds
         * both — and keeps the MPI-371 auto-picks-union-LAST order intact for free.
         * @type {import('./UndoStack.js').UndoStack|null}
         */
        this.undo = null;
        /** Dirty box of the stroke in flight, in mask-px. Null between strokes. */
        this._strokeBox = null;
        /** Previous dab of the stroke in flight, in mask-px. Null between strokes —
         *  reset in takeStrokeBox(), which is the stroke boundary (MPI-375). */
        this._lastDab = null;

        // mask-px per image-px. Set in init(); paint() multiplies incoming
        // image-px coords + brush radius by this to hit the downscaled canvas.
        this._scale = 1;

        // Point prompts, in SOURCE-image px (NOT mask-px): SAM3 normalises the
        // coords against the image it loads, so they must be that image's pixels.
        /** @type {Array<{x:number,y:number,positive:boolean}>} */
        this.points = [];
        this.pointsMode = false;
        this._srcWidth = 0;
        this._srcHeight = 0;

        this.isMaskingMode = false;
        this.isDrawingMask = false;
        this.brushSize = 40;
        this.brushType = 'brush';
        /** A `BRUSH_PRESETS` id (MPI-435). The shared dab owns what it means. */
        this.brushPreset = DEFAULT_BRUSH_PRESET;
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
        // A new image means a new history. Undo must never reach across two
        // entries, and the wipe below is a load, not an edit the user can undo.
        this.undo?.clear();
        // A preview must not outlive the pixels it previewed either.
        this.endAdjust();
        this.clear(false);
    }

    // ── Undo (MPI-376) ───────────────────────────────────────────────────────

    /**
     * The two layers undo restores. Everything else is derived or transient:
     * autoPickMasks / selectedAutoPicks are the last detect run (re-runnable) and
     * points are individually removable by clicking a dot, so neither is stored.
     * @returns {Array<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}>}
     */
    undoLayers() {
        if (!this.manualCtx || !this.subtractCtx) return [];
        return [
            { canvas: this.manualCanvas,   ctx: this.manualCtx },
            { canvas: this.subtractCanvas, ctx: this.subtractCtx },
        ];
    }

    /** Snapshot both layers before a layer-wide mutation. */
    _recordUndo() {
        const layers = this.undoLayers();
        if (layers.length) this.undo?.record(layers);
    }

    /** Re-derive maskCanvas + autoCanvas after an undo/redo swapped the source layers. */
    refresh() { this._recomposite(); }

    /**
     * Take the dirty box the stroke in flight accumulated and reset it. Padded by
     * 1px because the brush arc is antialiased past its own radius.
     * @returns {{x:number,y:number,w:number,h:number}|null} null when nothing was painted
     */
    takeStrokeBox() {
        const b = this._strokeBox;
        this._strokeBox = null;
        // This is the stroke BOUNDARY — InputController calls it at mousedown and
        // again at mouseup/interrupt, and nowhere else. So it is also where the
        // interpolator's previous sample dies: carrying `_lastDab` across strokes
        // would draw a line from wherever the last one ended to wherever the next
        // one starts (MPI-375).
        this._lastDab = null;
        if (!b) return null;
        return { x: b.x0 - 1, y: b.y0 - 1, w: (b.x1 - b.x0) + 2, h: (b.y1 - b.y0) + 2 };
    }

    /** Grow the in-flight stroke box to cover a dab of radius r at (x, y), all mask-px. */
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
     * @param {boolean} [record] false skips the undo snapshot — for a LOAD (init),
     *   where wiping the layers is not an edit the user could have undone.
     */
    clear(record = true) {
        if (record) this._recordUndo();
        if (this.manualCtx) this.manualCtx.clearRect(0, 0, this.manualCanvas.width, this.manualCanvas.height);
        if (this.subtractCtx) this.subtractCtx.clearRect(0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
        this.autoPickMasks.clear();
        this.selectedAutoPicks.clear();
        this.points = [];
        this._recomposite();
    }

    // ── Point prompts (MPI-361, rebuilt onto SAM3 in MPI-380) ────────────────

    addPoint(imgX, imgY, positive = true) {
        this.points.push({ x: imgX, y: imgY, positive: !!positive });
    }

    /**
     * Remove the point under (imgX, imgY) — the "individually removable" half of
     * the contract.
     * @returns {boolean} true when a point was removed
     */
    removePointAt(imgX, imgY, hitR = POINT_HIT_R) {
        for (let i = this.points.length - 1; i >= 0; i--) {
            const p = this.points[i];
            if ((p.x - imgX) ** 2 + (p.y - imgY) ** 2 <= hitR * hitR) {
                this.points.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    clearPoints() { this.points = []; }
    hasPoints()   { return this.points.length > 0; }

    /**
     * The two coordinate lists `SAM3_Detect` takes, as JSON strings in
     * SOURCE-image px — the KJNodes `PointsEditor` shape the node documents.
     * SAM3 normalises them against the image it loads, so these must be the
     * source image's own pixels, NOT the MASK_MAX_EDGE-capped working size.
     *
     * Both keys are always present: clearing every negative point has to reach
     * the graph as an empty list, or the previous run's value would persist in
     * `Input_Points_Negative`.
     * @returns {{positive: string, negative: string}}
     */
    getPointsJSON() {
        const pack = (wanted) => JSON.stringify(
            this.points
                .filter(p => p.positive === wanted)
                .map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        );
        return { positive: pack(true), negative: pack(false) };
    }

    paint(imgX, imgY) {
        // Incoming coords + brush are in image-px; map to downscaled mask-px.
        const s = this._scale;
        const to = { x: imgX * s, y: imgY * s };
        const r = (this.brushSize * s) / 2;
        const erasing = this.brushType === 'eraser';
        const preset = this.brushPreset;
        // A scattered preset paints outside its nominal radius, so the undo box is
        // grown by the dab's real reach (MPI-435). Equal to r on the default brush.
        const reach = dabExtent(r, preset);

        // Every dab writes BOTH layers, and they are exact mirrors: paint lays down
        // in manual and un-erases in subtract, erase does the reverse. That symmetry
        // is what makes `manual AND NOT subtract` reconstructible after either — and
        // it is why the preset's jitter is a hash of (x, y) rather than random: two
        // calls, same dab, or the mirror breaks and leaves unerasable residue.
        const stamp = (x, y) => {
            this._growStrokeBox(x, y, reach);
            if (erasing) {
                stampDab(this.manualCtx,   x, y, r, 'destination-out', null, preset);
                stampDab(this.subtractCtx, x, y, r, 'source-over', 'rgba(255, 255, 255, 1)', preset);
            } else {
                stampDab(this.manualCtx,   x, y, r, 'source-over', this.maskColor, preset);
                stampDab(this.subtractCtx, x, y, r, 'destination-out', null, preset);
            }
        };

        // Interpolate from the previous sample (MPI-375). One dab per mousemove left
        // holes in any drag faster than the brush is wide; the shared spacing closes
        // them for the paint layer and the mask brush alike, and the preset owns it.
        strokeDabs(this._lastDab, to, r, stamp, preset);
        this._lastDab = to;
        this._recomposite();
    }

    /**
     * Rebuild the mask from the BAKED layers only.
     * mask = manual AND NOT subtract
     *
     * The selected auto picks are DELIBERATELY absent (MPI-426). They used to
     * union on top here, which made `maskCanvas` answer two different questions
     * at once — "what is on screen" and "what gets sent to the graph" — so a
     * detection the user had not Added still flowed through hasMask() / getURL()
     * into `Input_Mask`. A user dispatched a Qwen masked edit with an un-Added
     * pick and the pick went with it (found during MPI-365 verification).
     *
     * The green overlay is a PROPOSAL, and the user's answer may be Subtract as
     * easily as Add — so consuming it as mask content is wrong in both
     * directions. Picks reach the mask through `bakeAutoPicksInto()` and nowhere
     * else. This canvas is now the single meaning of "there is a mask to send",
     * which is also what gates the op strip (`MpiGroupHistoryBlock._opOptions()`
     * → `hasMask`): a bare detection leaves masked ops locked until Add, and
     * that is the intended behaviour, not the MPI-372 regression it looks like.
     *
     * DISPLAY IS UNAFFECTED: `_recompositeAuto()` below keeps the picks in
     * `autoCanvas`, which `MpiCanvas._renderOverlay()` draws recoloured on top.
     * That recolour is opaque, so it never mattered that white sat underneath.
     *
     * Layer ORDER still matters where the picks actually land — see
     * `bakeAutoPicksInto()`, which un-erases as it adds so a pick is not vetoed
     * by an erase that predates it.
     */
    _recomposite() {
        if (!this.maskCtx || !this.maskCanvas) return;
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        if (!w || !h) return;

        this.maskCtx.save();
        this.maskCtx.clearRect(0, 0, w, h);

        // manual AND NOT subtract — destination-out punches subtract holes
        this.maskCtx.globalCompositeOperation = 'source-over';
        this.maskCtx.drawImage(this.manualCanvas, 0, 0);
        this.maskCtx.globalCompositeOperation = 'destination-out';
        this.maskCtx.drawImage(this.subtractCanvas, 0, 0);

        this.maskCtx.restore();

        this._recompositeAuto(w, h);
    }

    /**
     * DISPLAY-ONLY layer (MPI-361, and since MPI-426 the picks' ONLY home until
     * they are baked). Lets MpiCanvas tint a DETECTED region differently from a
     * PAINTED one, which a single unioned canvas could not — a detection inside
     * an already-masked area was invisible.
     *   auto = ⋃autoPickMasks[selected]
     *
     * NEVER exported: getURL() and the viewer's `_buildCompositeFromTemp()` twin
     * both read the baked mask alone. A pick that has not been Added is not mask
     * content, so nothing downstream may see it.
     *
     * No subtract punch here — the green tint shows exactly what the run
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

        // After the guard: a bake that no-ops must not push an empty undo entry.
        this._recordUndo();

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

    /**
     * Rasterise a shape into the layers (MPI-368). The twin write is
     * `bakeAutoPicksInto()`'s, for the same reason: `manual AND NOT subtract` is
     * only reconstructible while the two stay exact mirrors of each other.
     *
     * The caller passes a PATH BUILDER rather than a path, so the shape is scaled
     * by THIS layer's `_scale` — the mask works at 1536 and the paint layer at
     * 4096, and a path built for one is silently wrong on the other.
     *
     * Layer-wide ONE SHOT, so it records a single full-rect undo entry after the
     * no-op guard (`docs/masking-undo.md`).
     *
     * @param {(scale: number) => Path2D|null} buildPath
     * @param {boolean} [toSubtract] Subtract instead of Add
     * @returns {boolean} false when there was nothing to rasterise
     */
    commitShape(buildPath, toSubtract = false) {
        if (!this.manualCtx || !this.subtractCtx) return false;
        const path = buildPath(this._scale);
        if (!path) return false;

        this._recordUndo();

        const dstCtx = toSubtract ? this.subtractCtx : this.manualCtx;
        const othCtx = toSubtract ? this.manualCtx   : this.subtractCtx;

        dstCtx.save();
        dstCtx.globalCompositeOperation = 'source-over';
        dstCtx.fillStyle = toSubtract ? 'rgba(255, 255, 255, 1)' : this.maskColor;
        dstCtx.fill(path);
        dstCtx.restore();

        othCtx.save();
        othCtx.globalCompositeOperation = 'destination-out';
        othCtx.fill(path);
        othCtx.restore();

        this._recomposite();
        return true;
    }

    /**
     * paint → mask (MPI-439): take the paint layer's SHAPE — alpha at ≥128, the cut
     * MPI-436 settled for this whole family — into the manual layer.
     *
     * A COPY, and a MERGE: the paint layer is left alone and an existing mask
     * survives. It writes `manualCanvas`, never the derived `maskCanvas`, because
     * only manual and subtract are stored (`docs/masking-undo.md`) — and it punches
     * the same region out of subtract, because the two are exact mirrors and a
     * region added to manual while subtract still holds it is erased right back by
     * the composite. `commitShape()` draws that same line.
     *
     * The paint layer runs at 4096 and this one at 1536, so it is downscaled FIRST
     * and cut after: the threshold pass then runs over 2.4M px instead of 16.7M, and
     * the browser's own filtering supplies the coverage average.
     *
     * @param {HTMLCanvasElement} paintCanvas
     * @returns {boolean} false when the paint layer had no shape to convert
     */
    fillFromPaint(paintCanvas) {
        if (!this.manualCtx || !this.subtractCtx || !paintCanvas?.width) return false;
        const w = this.manualCanvas.width;
        const h = this.manualCanvas.height;

        const small = document.createElement('canvas');
        small.width = w;
        small.height = h;
        small.getContext('2d').drawImage(paintCanvas, 0, 0, w, h);
        const stencil = alphaStencil(small, this.maskColor);
        if (!stencil) return false;

        this._recordUndo();

        this.manualCtx.drawImage(stencil, 0, 0);
        this.subtractCtx.save();
        this.subtractCtx.globalCompositeOperation = 'destination-out';
        this.subtractCtx.drawImage(stencil, 0, 0);
        this.subtractCtx.restore();

        this._recomposite();
        return true;
    }

    // ── Adjust — grow / shrink / edge band (MPI-382) ─────────────────────────

    /**
     * Enter the Adjust tool: snapshot the composed mask so every preview frame
     * derives from drag-start state.
     *
     * ONE snapshot is enough, and it is the DERIVED maskCanvas rather than the two
     * source layers: the preview contract guarantees no auto picks survive into
     * this tool, so `maskCanvas === manual AND NOT subtract` here and Apply writes
     * the result straight back as the new manual layer.
     *
     * The distance field is INVALIDATED here, not built (MPI-441). It costs 125 ms at
     * the working size and describes this snapshot, so building it eagerly would
     * charge that to entering the tool AND to every Apply — including the user who
     * only came in to press Fill, or who never moves a slider at all. The first
     * `previewAdjust()` that actually needs it builds it; see `_ensureAdjustField()`.
     */
    beginAdjust() {
        if (!this.maskCanvas) return;
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        if (!w || !h) return;

        if (!this._adjustPristine) this._adjustPristine = document.createElement('canvas');
        this._adjustPristine.width = w;
        this._adjustPristine.height = h;
        this._adjustPristine.getContext('2d', { willReadFrequently: true })
            .drawImage(this.maskCanvas, 0, 0);
        this._adjustField = null;
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
     * Build the distance field and the preview buffer from the pristine snapshot, once
     * per snapshot. Both are dropped by `beginAdjust()`, so this is what re-derives
     * them — and it reads `_adjustPristine`, never `adjustCanvas`, or the adjustment
     * would compound frame over frame like the MPI-351 double-scale bug.
     *
     * The `ImageData` is cached alongside it because a fresh one per slider tick is a
     * 9 MB allocation at the working size — GC churn during a drag for nothing.
     * @returns {boolean} false when there is nothing to build from
     */
    _ensureAdjustField() {
        if (this._adjustField && this._adjustImg) return true;
        const src = this._adjustPristine;
        if (!src?.width || !src?.height || !this.adjustCtx) return false;
        const w = src.width;
        const h = src.height;
        const data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        this._adjustField = signedSquaredDistanceField(data, w, h);
        this._adjustImg = this.adjustCtx.createImageData(w, h);
        return true;
    }

    /**
     * Recompute the preview from the pristine copy — never from the last frame.
     * Zero on every slider tears the preview down, so the centre position is the
     * untouched mask rather than a green copy of it.
     *
     * Grow, shrink and both halves of an edge band are ONE range test over the
     * distance field (MPI-441). The band in particular is no longer
     * dilate-then-`destination-out`-erode: the complement of an erode is just the
     * field's other bound, so it is a single pass.
     *
     * The no-op guard runs BEFORE `_ensureAdjustField()` on purpose: a zero slider
     * must cost nothing, and entering the tool to press Fill never builds a field.
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

        const range = rangeFor(opts);
        if (!range) {
            this.adjustCtx.clearRect(0, 0, w, h);
            this.hasAdjustPreview = false;
            return false;
        }
        if (!this._ensureAdjustField()) return false;

        // putImageData replaces the buffer outright, so there is nothing to clear.
        writeRange(this._adjustField, new Uint32Array(this._adjustImg.data.buffer), range.lo, range.hi);
        this.adjustCtx.putImageData(this._adjustImg, 0, 0);

        this.hasAdjustPreview = true;
        return true;
    }

    /**
     * Bake the preview into the permanent layers. Layer-wide ONE SHOT, so it takes
     * a single `_recordUndo()` after the no-op guard — not a begin()/commit()
     * gesture. The result replaces manual outright and clears subtract, because the
     * preview was computed from `manual AND NOT subtract` and already has the
     * erases in it; leaving subtract behind would punch them a second time.
     * @returns {boolean} false when there was nothing to apply
     */
    applyAdjust() {
        if (!this.hasAdjustPreview || !this.adjustCanvas || !this.manualCtx || !this.subtractCtx) return false;

        this._recordUndo();

        this.manualCtx.clearRect(0, 0, this.manualCanvas.width, this.manualCanvas.height);
        this.manualCtx.drawImage(this.adjustCanvas, 0, 0, this.manualCanvas.width, this.manualCanvas.height);
        this.subtractCtx.clearRect(0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
        this._recomposite();

        // Still inside the tool: re-snapshot so the next adjustment starts from
        // what was just baked instead of from the pre-Apply mask.
        this.beginAdjust();
        return true;
    }

    /**
     * Close every ENCLOSED hole in the mask. Layer-wide one shot, same shape as
     * `applyAdjust()` — `_recordUndo()` after the no-op guard, result replaces manual,
     * subtract cleared, pristine re-snapshotted.
     *
     * This exists because MPI-431 turned `mask_fill_holes` OFF in the graphs: the app
     * is now the ONLY place a hole gets closed, and the only place the user can see
     * what is being closed before committing it.
     *
     * Fills what is ON SCREEN — the live preview when one is up, the composite
     * otherwise — so pressing Fill mid-adjustment bakes both as ONE undo entry. The
     * alternative was silently dropping the user's preview, which is worse.
     *
     * NOT a dilate by r then an erode by r. That morphological close would reuse the
     * primitive above for free, but it only closes holes smaller than r and it rounds
     * the outline; "fill holes" means every enclosed hole, outline untouched.
     *
     * @returns {boolean} false when there was no hole to fill
     */
    fillHoles() {
        if (!this.manualCtx || !this.subtractCtx) return false;
        const src = (this.hasAdjustPreview && this.adjustCanvas) ? this.adjustCanvas : this.maskCanvas;
        if (!src?.width || !src?.height) return false;

        const w = src.width;
        const h = src.height;
        const ctx = src.getContext('2d', { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;

        // Flood the BACKGROUND inward from the border. Whatever the flood never
        // reaches is enclosed — that is the definition of a hole, and it needs no
        // contour tracing. Iterative on an explicit stack: 1536² would blow recursion.
        const n = w * h;
        const outside = new Uint8Array(n);
        const stack = new Int32Array(n);
        let sp = 0;
        const push = (i) => {
            if (outside[i] || d[i * 4 + 3] >= FILL_HOLES_T) return;
            outside[i] = 1;
            stack[sp++] = i;
        };
        for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
        while (sp > 0) {
            const i = stack[--sp];
            const x = i % w;
            if (x > 0)     push(i - 1);
            if (x < w - 1) push(i + 1);
            if (i >= w)    push(i - w);
            if (i < n - w) push(i + w);
        }

        // Pass 2 — the hole and ITS ANTIALIASED RIM. Punching a hole leaves alpha
        // ramping 255→0 across a pixel or two; pass 1 classified the ramp's inner half
        // as mask, so writing only the interior leaves a semi-transparent ring exactly
        // where the hole used to be. At 70% overlay opacity that ring is plainly
        // visible — it is the same seam ComfyUI's mask editor leaves, and the reason
        // the fill has to be defined over the ramp rather than over a threshold.
        //
        // Seed from the hole interiors, then expand into any neighbour that is neither
        // `outside` nor already fully opaque. Solid mask (alpha 255) is the wall, so
        // the flood cannot escape a hole and reach the mask's OUTER rim — that edge
        // keeps its antialiasing, which is why Fill does not harden the outline.
        const fill = new Uint8Array(n);
        sp = 0;
        for (let i = 0; i < n; i++) {
            if (!outside[i] && d[i * 4 + 3] < FILL_HOLES_T) { fill[i] = 1; stack[sp++] = i; }
        }
        const spread = (i) => {
            if (fill[i] || outside[i] || d[i * 4 + 3] === 255) return;
            fill[i] = 1;
            stack[sp++] = i;
        };
        while (sp > 0) {
            const i = stack[--sp];
            const x = i % w;
            if (x > 0)     spread(i - 1);
            if (x < w - 1) spread(i + 1);
            if (i >= w)    spread(i - w);
            if (i < n - w) spread(i + w);
        }

        let filled = 0;
        for (let i = 0; i < n; i++) {
            if (!fill[i]) continue;
            const p = i * 4;
            if (d[p + 3] === 255) continue;
            d[p] = 255; d[p + 1] = 255; d[p + 2] = 255; d[p + 3] = 255;
            filled++;
        }
        if (!filled) return false;   // no-op must not push an empty undo entry

        this._recordUndo();

        // Write through a scratch canvas: `src` may be maskCanvas, which _recomposite()
        // is about to rebuild from the source layers.
        const buf = document.createElement('canvas');
        buf.width = w;
        buf.height = h;
        buf.getContext('2d').putImageData(img, 0, 0);

        this.manualCtx.clearRect(0, 0, this.manualCanvas.width, this.manualCanvas.height);
        this.manualCtx.drawImage(buf, 0, 0, this.manualCanvas.width, this.manualCanvas.height);
        this.subtractCtx.clearRect(0, 0, this.subtractCanvas.width, this.subtractCanvas.height);
        this._recomposite();

        // The preview (if any) is now baked, so drop it and re-snapshot — otherwise the
        // next slider move would recompute from a pristine copy that predates the fill.
        this.hasAdjustPreview = false;
        if (this._adjustPristine) this.beginAdjust();
        return true;
    }

    /**
     * Drop the preview and its buffers. Called by Reset, by leaving the tool
     * (through the shared discardPreview seam) and by a new image load.
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
        this._adjustImg = null;
        return had;
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
        this.endAdjust();
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
        // The stack itself is owned and torn down by MpiCanvas; drop the ref so a
        // late callback cannot record against dead contexts.
        this.undo = null;
        this._strokeBox = null;
    }

    /**
     * Flatten composite display to B/W PNG, AT THE SOURCE IMAGE'S RESOLUTION.
     *
     * The working layers are MASK_MAX_EDGE-capped, but the export is not allowed to
     * be: `InpaintCropImproved` (every master template's masked-edit branch —
     * klein/krea2/qwen) ASSERTS `mask.shape == image.shape` and dies on a mismatch,
     * so a >1536px source produced a 2/3-size mask and a hard AssertionError. The
     * older mask consumers (SetLatentNoiseMask & co) resized silently, which is why
     * the cap went unnoticed until MPI-365 wired masks into the crop branch.
     * Upscaling here keeps the cap where it belongs — on the paint loop, not on the
     * contract with the graph.
     */
    getURL(bg = null, fg = null) {
        if (!this.maskCanvas) return null;
        if (!bg && !fg) {
            return this._toSourceScale(this.maskCanvas);
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
        return this._toSourceScale(tempCanvas);
    }

    /**
     * PNG data URL of `canvas` at the SOURCE image's pixel size. No-op (and no
     * extra canvas) when the working layers were never capped.
     * @param {HTMLCanvasElement} canvas
     * @returns {string}
     */
    _toSourceScale(canvas) {
        const w = this._srcWidth  || canvas.width;
        const h = this._srcHeight || canvas.height;
        if (w === canvas.width && h === canvas.height) return canvas.toDataURL('image/png');
        const scaled = document.createElement('canvas');
        scaled.width = w;
        scaled.height = h;
        scaled.getContext('2d').drawImage(canvas, 0, 0, w, h);
        return scaled.toDataURL('image/png');
    }
}
