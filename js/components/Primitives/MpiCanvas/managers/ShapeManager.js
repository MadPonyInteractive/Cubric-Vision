/**
 * ShapeManager.js — the shape gizmo (MPI-368).
 *
 * ONE geometry with TWO destinations: the same rectangle / triangle / ellipse is
 * rasterised into the binary mask layers (`MaskManager`) or into the RGBA paint
 * layer (`PaintManager`). That split is the whole point of the MPI-424 taxonomy —
 * groups are by ARTIFACT, engines are shared across them — and it is why this file
 * knows nothing about either layer. It owns geometry and hit-testing; `MpiCanvas`
 * owns the commit.
 *
 * ARMED LIKE `mask.pointsMode`, NOT as an `activeMode`. The canvas stays in its
 * 'mask' or 'paint' mode while a shape tool is open, so brush ownership, the undo
 * gate, the opacity slider and the paint layer's own render pass all keep working
 * untouched. `shapeMode` only says "the pointer belongs to the gizmo, and this is
 * where a commit lands".
 *
 * COORDINATES ARE IMAGE-SPACE PIXELS, like `CropManager`. The destination layers
 * are capped at different working sizes (1536 for the mask, 4096 for paint), so
 * image-px → layer-px is done at commit time with the owning manager's `_scale`.
 * Storing layer-px here would make the same shape mean two different things.
 *
 * HIT-TESTING HAPPENS IN SHAPE-LOCAL SPACE — inverse-rotate the cursor about the
 * centre, then run CropManager's axis-aligned handle test verbatim. One test then
 * serves all three kinds AND rotation, instead of three kind-shaped tests that each
 * have to re-derive the rotation. The handle system, the hit radius, the fixed
 * screen-size drawing and the cursor map are all CropManager's, imported rather
 * than forked (the card's own criterion).
 *
 * THE GIZMO IS A PREVIEW: an uncommitted shape must not outlive its tool, so
 * `MpiCanvasViewer.el.discardPreview()` disarms it. See
 * `docs/masking-tools.md` § The preview contract.
 */

import { CropManager } from './CropManager.js';

/* Stage canvas color constants — JS canvas draws cannot use CSS vars directly. */
const SHAPE_OUTLINE      = 'oklch(0.95 0.005 80 / 0.9)';   /* --ink-1 */
const SHAPE_HANDLE_FILL  = 'oklch(0.76 0.17 355)';         /* --accent-heat */
const SHAPE_HANDLE_EDGE  = 'oklch(0.95 0.005 80)';         /* --ink-1 */

/** Half-extent floor in image px — below this the shape has no grabbable handles. */
const MIN_HALF = 6;

/** Seed the shape at a third of the image's short edge, centred. */
const SEED_FRACTION = 1 / 6;

/**
 * Rotation snaps to 7.5° (user, 2026-08-04). Before this it was free, which is why
 * squaring a shape back up by hand was impossible. 48 stops around the circle is
 * fine enough for masking work and puts 45° and 90° exactly on the grid.
 *
 * The ABSOLUTE angle is snapped, not the delta: snapping the delta would preserve
 * whatever offset the shape started with, so an off-grid shape could never be pulled
 * back square. Identical while every shape seeds at 0 — which is exactly why it is
 * worth pinning down before something else starts setting `rot`.
 */
const ROT_SNAP = Math.PI / 24;

/** Local (unrotated) handle offsets as multiples of the half-extents. */
const HANDLE_UNITS = {
    tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1],
    t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0],
};

export class ShapeManager {
    constructor() {
        /** @type {null|'mask'|'paint'|'place'} which destination a commit lands in — null = disarmed.
         *  `place` (MPI-454) is the odd one: it owns no layer and never commits pixels, it only
         *  says "this rectangle is where the placed image goes". Reusing this manager for it is
         *  the point — a placed image IS a rotated rectangle with a texture, so the handles, the
         *  shape-local hit testing, SHIFT's aspect lock and ALT-rotate all come for free, and the
         *  two gizmos in the app can never drift apart. */
        this.shapeMode = null;

        /** @type {'rect'|'triangle'|'ellipse'} */
        this.kind = 'rect';

        /** The shape, in IMAGE px. `rot` is radians, clockwise on screen. */
        this.cx = 0;
        this.cy = 0;
        this.halfW = 0;
        this.halfH = 0;
        this.rot = 0;
        /** False until the first arm seeds it — a fresh image has no shape. */
        this.hasShape = false;

        this._imgW = 0;
        this._imgH = 0;

        // Drag state — driven by InputController, same contract as CropManager.
        this.isDragging = false;
        this._handle = null;
        this._rotating = false;
        this._start = null;
    }

    /** True while a shape tool owns the pointer. */
    get isActive() { return this.shapeMode !== null; }

    /**
     * A new image means a new shape. Not undoable and not a preview to discard —
     * there is nothing committed here, this manager holds no pixels.
     * @param {number} imgW
     * @param {number} imgH
     */
    init(imgW, imgH) {
        this._imgW = imgW;
        this._imgH = imgH;
        this.hasShape = false;
        this.endDrag();
    }

    /**
     * Arm or disarm the gizmo.
     * @param {null|'mask'|'paint'|'place'} dest
     */
    setMode(dest) {
        this.shapeMode = dest || null;
        // A placed image is always a rectangle, and `kind` is SHARED with the shape tools —
        // arm Place after drawing an ellipse and the outline round the image would be an
        // ellipse. Forced here rather than at the call site because every caller would have
        // to remember; the shape tools re-set their own kind from project settings on mount,
        // so nothing of theirs is lost.
        if (this.shapeMode === 'place') this.kind = 'rect';
        if (!this.shapeMode) this.endDrag();
        else if (!this.hasShape) this.seed();
    }

    /**
     * Centre the shape at a third of the image's short edge.
     * @param {number} [aspect] width/height the seeded shape should have. 1 (square) for the
     *   shape tools, whose kind decides its own proportions; Place (MPI-454) passes the placed
     *   image's own aspect so it opens undistorted, and the area stays the same either way so
     *   a wide image and a tall one seed at the same visual size.
     */
    seed(aspect = 1) {
        if (!this._imgW || !this._imgH) return;
        const half = Math.max(MIN_HALF, Math.min(this._imgW, this._imgH) * SEED_FRACTION);
        const a = Number.isFinite(aspect) && aspect > 0 ? Math.sqrt(aspect) : 1;
        this.cx = this._imgW / 2;
        this.cy = this._imgH / 2;
        this.halfW = Math.max(MIN_HALF, half * a);
        this.halfH = Math.max(MIN_HALF, half / a);
        this.rot = 0;
        this.hasShape = true;
    }

    /**
     * Drop the shape entirely — the discard half of the preview contract.
     * @returns {boolean} true when there was a shape to drop
     */
    clear() {
        const had = this.hasShape;
        this.hasShape = false;
        this.endDrag();
        return had;
    }

    /** @param {'rect'|'triangle'|'ellipse'} kind */
    setKind(kind) {
        if (kind !== 'rect' && kind !== 'triangle' && kind !== 'ellipse') return;
        this.kind = kind;
        if (!this.hasShape) this.seed();
    }

    // ── Geometry helpers ──────────────────────────────────────────────────────

    /** Rotate a shape-local offset into image space and add the centre. */
    _toImage(lx, ly) {
        const c = Math.cos(this.rot);
        const s = Math.sin(this.rot);
        return { x: this.cx + lx * c - ly * s, y: this.cy + lx * s + ly * c };
    }

    /** Inverse of `_toImage`: an image-space point into shape-local space. */
    _toLocal(ix, iy) {
        const c = Math.cos(-this.rot);
        const s = Math.sin(-this.rot);
        const dx = ix - this.cx;
        const dy = iy - this.cy;
        return { x: dx * c - dy * s, y: dx * s + dy * c };
    }

    /** Image-space position of a handle key (`'body'`/centre included). */
    handlePoint(key) {
        const u = HANDLE_UNITS[key];
        if (!u) return this._toImage(0, 0);
        return this._toImage(u[0] * this.halfW, u[1] * this.halfH);
    }

    // ── Hit-testing ───────────────────────────────────────────────────────────

    /**
     * Handle under an image-space point, or null. Runs in SHAPE-LOCAL space so the
     * rotated case costs nothing extra.
     * @param {number} imgX
     * @param {number} imgY
     * @param {number} scale - view scale, so the hit radius stays constant on screen
     * @returns {string|null} 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r'|'body'|null
     */
    hitTest(imgX, imgY, scale = 1) {
        if (!this.isActive || !this.hasShape) return null;

        const p = this._toLocal(imgX, imgY);
        const r = CropManager.HANDLE_HIT_RADIUS / (scale || 1);
        const near = (ax, ay) => Math.abs(p.x - ax) <= r && Math.abs(p.y - ay) <= r;

        for (const [key, [ux, uy]] of Object.entries(HANDLE_UNITS)) {
            if (near(ux * this.halfW, uy * this.halfH)) return key;
        }
        // Body is the local BOUNDING BOX for all three kinds, deliberately: the
        // corner gap on a triangle is not worth a per-kind interior test, and a
        // grab that "should" have missed still does the obvious thing.
        if (Math.abs(p.x) <= this.halfW && Math.abs(p.y) <= this.halfH) return 'body';
        return null;
    }

    // ── Drag ──────────────────────────────────────────────────────────────────

    /**
     * @param {string} handle - from `hitTest`
     * @param {number} imgX
     * @param {number} imgY
     * @param {boolean} [rotating] ALT held: rotate about the grabbed handle
     *   (it stays put and the shape swings around it), or about the centre when
     *   the grab was on the body.
     */
    startDrag(handle, imgX, imgY, rotating = false) {
        if (!handle || !this.hasShape) return;
        this.isDragging = true;
        this._handle = handle;
        this._rotating = !!rotating;

        const pivot = this._rotating
            ? (handle === 'body' ? { x: this.cx, y: this.cy } : this.handlePoint(handle))
            : null;

        this._start = {
            cx: this.cx, cy: this.cy,
            halfW: this.halfW, halfH: this.halfH,
            rot: this.rot,
            mouse: { x: imgX, y: imgY },
            pivot,
            angle: pivot ? Math.atan2(imgY - pivot.y, imgX - pivot.x) : 0,
        };
    }

    /**
     * @param {number} imgX
     * @param {number} imgY
     * @param {boolean} [shiftHeld] lock the shape's proportions — resize without
     *   deforming (user, 2026-08-04). The ratio is the one the shape HAS, not 1:1:
     *   stretch it first and Shift then scales that stretched shape as it is.
     */
    drag(imgX, imgY, shiftHeld = false) {
        if (!this.isDragging || !this._start) return;
        const st = this._start;

        if (this._rotating) {
            const raw = Math.atan2(imgY - st.pivot.y, imgX - st.pivot.x) - st.angle;
            // Snap the RESULT onto the grid, then rotate by whatever delta that
            // implies — the orbit below must use the SAME delta, or the pivot handle
            // would stop being anchored.
            const d = Math.round((st.rot + raw) / ROT_SNAP) * ROT_SNAP - st.rot;
            const c = Math.cos(d);
            const s = Math.sin(d);
            // The pivot is anchored, so the CENTRE orbits it — that is what makes
            // "the handle stays put and the shape swings around it" true.
            const rx = st.cx - st.pivot.x;
            const ry = st.cy - st.pivot.y;
            this.cx = st.pivot.x + rx * c - ry * s;
            this.cy = st.pivot.y + rx * s + ry * c;
            this.rot = st.rot + d;
            return;
        }

        if (this._handle === 'body') {
            this.cx = st.cx + (imgX - st.mouse.x);
            this.cy = st.cy + (imgY - st.mouse.y);
            return;
        }

        // Resize in SHAPE-LOCAL space, so a handle on a rotated shape moves along
        // that shape's own axis rather than the screen's.
        const cos = Math.cos(-st.rot);
        const sin = Math.sin(-st.rot);
        const mdx = imgX - st.mouse.x;
        const mdy = imgY - st.mouse.y;
        const dx = mdx * cos - mdy * sin;
        const dy = mdx * sin + mdy * cos;

        const u = HANDLE_UNITS[this._handle];
        if (!u) return;

        // Local box about the ORIGIN, one edge moved by the local delta.
        let x0 = -st.halfW, x1 = st.halfW, y0 = -st.halfH, y1 = st.halfH;
        if (u[0] < 0) x0 += dx; else if (u[0] > 0) x1 += dx;
        if (u[1] < 0) y0 += dy; else if (u[1] > 0) y1 += dy;

        if (shiftHeld) {
            // From the DRAG START, like every other value in this branch: the whole
            // gesture is recomputed from `st` each call, so the lock cannot depend on
            // how many mousemoves the browser happened to deliver. (Reading the live
            // shape gives the same number today — the lock is idempotent, measured
            // over 40 calls — but only by coincidence of nothing else touching it.)
            const ratio = st.halfW / st.halfH;
            // The grabbed handle drives its own axis and the other one follows —
            // which is what makes a `t` drag on a ratio-locked shape widen it too.
            let w, h;
            if (u[0]) { w = Math.max(MIN_HALF * 2, x1 - x0); h = w / ratio; }
            else      { h = Math.max(MIN_HALF * 2, y1 - y0); w = h * ratio; }
            // Floor BOTH axes together: clamping one alone would break the very lock
            // Shift exists to hold. Two passes cover an extreme ratio either way.
            if (h < MIN_HALF * 2) { h = MIN_HALF * 2; w = h * ratio; }
            if (w < MIN_HALF * 2) { w = MIN_HALF * 2; h = w / ratio; }

            // Re-place against the anchored edge. An axis the handle does not touch
            // stays CENTRED on the shape, so a top-edge drag grows it both ways
            // rather than sliding it sideways.
            if (u[0] > 0)      x1 = x0 + w;
            else if (u[0] < 0) x0 = x1 - w;
            else               { x0 = -w / 2; x1 = w / 2; }
            if (u[1] > 0)      y1 = y0 + h;
            else if (u[1] < 0) y0 = y1 - h;
            else               { y0 = -h / 2; y1 = h / 2; }
        } else {
            // Min-size floor, applied by pushing the MOVED edge back — the opposite
            // edge is the anchor and must not creep.
            if (x1 - x0 < MIN_HALF * 2) { if (u[0] < 0) x0 = x1 - MIN_HALF * 2; else x1 = x0 + MIN_HALF * 2; }
            if (y1 - y0 < MIN_HALF * 2) { if (u[1] < 0) y0 = y1 - MIN_HALF * 2; else y1 = y0 + MIN_HALF * 2; }
        }

        this.halfW = (x1 - x0) / 2;
        this.halfH = (y1 - y0) / 2;
        // The local box moved off the origin, so the centre follows it — rotated
        // back into image space.
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const c = Math.cos(st.rot);
        const s = Math.sin(st.rot);
        this.cx = st.cx + mx * c - my * s;
        this.cy = st.cy + mx * s + my * c;
    }

    endDrag() {
        this.isDragging = false;
        this._handle = null;
        this._rotating = false;
        this._start = null;
    }

    // ── Rasterise ─────────────────────────────────────────────────────────────

    /**
     * The shape as a path in a DESTINATION layer's own pixels. The caller passes
     * that layer's image-px→layer-px scale (`MaskManager._scale` or
     * `PaintManager._scale`); baking it here rather than transforming the context
     * keeps the commit a plain `fill()` on an untransformed ctx.
     * @param {number} scale
     * @returns {Path2D|null} null when there is nothing to rasterise
     */
    buildPath(scale = 1) {
        if (!this.hasShape) return null;
        if (this.halfW <= 0 || this.halfH <= 0) return null;

        const p = new Path2D();
        if (this.kind === 'ellipse') {
            p.ellipse(this.cx * scale, this.cy * scale,
                this.halfW * scale, this.halfH * scale, this.rot, 0, Math.PI * 2);
            return p;
        }

        const pts = this.outlinePoints().map(pt => ({ x: pt.x * scale, y: pt.y * scale }));
        p.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
        p.closePath();
        return p;
    }

    /**
     * Corner points in IMAGE px, already rotated. Ellipse has none — it is drawn
     * parametrically by both `buildPath` and `drawScreen`.
     * @returns {Array<{x:number,y:number}>}
     */
    outlinePoints() {
        if (this.kind === 'triangle') {
            return [
                this._toImage(0, -this.halfH),
                this._toImage(this.halfW, this.halfH),
                this._toImage(-this.halfW, this.halfH),
            ];
        }
        return [
            this._toImage(-this.halfW, -this.halfH),
            this._toImage(this.halfW, -this.halfH),
            this._toImage(this.halfW, this.halfH),
            this._toImage(-this.halfW, this.halfH),
        ];
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    /**
     * Draw the gizmo in SCREEN space on `screenUICanvas`, next to the crop overlay
     * and for the same two reasons (MPI-383): the shape may hang off the image,
     * which the image-sized overlay canvas cannot show, and this canvas carries no
     * `image-rendering: pixelated`, so the handles and hairlines stay crisp.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{offsetX:number, offsetY:number, scale:number}} view
     */
    drawScreen(ctx, view) {
        if (!this.isActive || !this.hasShape) return;

        const scale = view.scale || 1;
        const sx = (x) => view.offsetX + x * scale;
        const sy = (y) => view.offsetY + y * scale;

        ctx.save();
        ctx.strokeStyle = SHAPE_OUTLINE;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        if (this.kind === 'ellipse') {
            ctx.ellipse(sx(this.cx), sy(this.cy),
                this.halfW * scale, this.halfH * scale, this.rot, 0, Math.PI * 2);
        } else {
            const pts = this.outlinePoints();
            ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].x), sy(pts[i].y));
            ctx.closePath();
        }
        ctx.stroke();

        // Handles — fixed screen size at any zoom, exactly like the crop rect's.
        const hr = CropManager.HANDLE_DIAMETER / 2;
        ctx.fillStyle = SHAPE_HANDLE_FILL;
        ctx.strokeStyle = SHAPE_HANDLE_EDGE;
        ctx.lineWidth = 2;

        const keys = [...Object.keys(HANDLE_UNITS), 'body'];
        for (const key of keys) {
            const pt = this.handlePoint(key);
            const active = this._handle === key;
            ctx.beginPath();
            ctx.arc(sx(pt.x), sy(pt.y), active ? hr * 1.15 : hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Cursor for a handle. Resize cursors come from `CropManager` so the two
     * gizmos never disagree; rotation gets `grab`, the closest thing CSS has.
     * @param {string|null} handle
     * @param {boolean} [rotating]
     * @returns {string}
     */
    static getCursor(handle, rotating = false) {
        if (!handle) return 'default';
        if (rotating) return 'grab';
        return CropManager.getCursor(handle);
    }
}
