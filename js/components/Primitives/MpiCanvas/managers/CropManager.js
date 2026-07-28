/**
 * CropManager.js
 * Manages crop-rect state, ratio locking, handle hit-testing, and draw logic.
 *
 * Coordinates are always in image-space pixels unless noted.
 *
 * The rect is NOT confined to the image (MPI-383): it may hang off any edge,
 * and the pixels it selects beyond the source are filled with the crop tool's
 * fill colour on apply. That is the outpaint setup — the flat colour is what
 * the user asks an edit model to replace. Because the rect can leave the
 * image, all crop drawing happens on the SCREEN canvas: the overlay canvas is
 * sized to image-native pixels, so anything outside it is unpaintable there.
 *
 * Handles:
 *   'tl','tr','bl','br'   — corner handles
 *   't','b','l','r'       — edge midpoint handles
 *   'body'                — drag the whole rect
 *   null                  — no hit / not in crop mode
 */

import { Hotkeys } from '../../../../managers/hotkeyManager.js';
import { snapBodyRect, snapFreeRect, snapRatioWidth } from '../../../../utils/cropSnap.js';

/* Stage canvas color constants — JS canvas draws cannot use CSS vars directly. */
const CROP_SCRIM         = 'oklch(0.20 0.020 350 / 0.55)'; /* --surface-canvas */
const CROP_BORDER        = 'oklch(0.95 0.005 80 / 0.85)';  /* --ink-1 */
const CROP_THIRDS        = 'oklch(0.95 0.005 80 / 0.22)';  /* --ink-1 */
const CROP_BOUNDS        = 'oklch(0.95 0.005 80 / 0.45)';  /* --ink-1 */
const CROP_HANDLE_FILL   = 'oklch(0.76 0.17 355)';           /* --accent-heat */
const CROP_HANDLE_STROKE = 'oklch(0.95 0.005 80)';         /* --ink-1 */

/** Snap radius in SCREEN px — converted to image px with the view scale. */
const SNAP_PX = 8;

export class CropManager {
    constructor() {
        this.isCroppingMode = false;

        /** Current crop rect in image-space pixels */
        this.cropRect = { x: 0, y: 0, w: 0, h: 0 };

        /** Locked aspect ratio as a float (w/h). e.g. 16/9. */
        this.lockedRatio = 1;

        /** Image dimensions — set by init() */
        this._imgW = 0;
        this._imgH = 0;

        // Drag state — managed by InputController
        this.isDragging      = false;
        this._activeHandle   = null; // 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r'|'body'|null
        this._dragStartRect  = null;
        this._dragStartMouse = null; // { x, y } in image coords at drag start

        // Shift-from-center modifier
        this._shiftHeld = false;
        this._unShiftDown = Hotkeys.bind('crop.shift.canvas',    () => { this._shiftHeld = true;  });
        this._unShiftUp   = Hotkeys.bind('crop.shift.canvas.up', () => { this._shiftHeld = false; });
    }

    /** Tear down hotkey subscriptions. Call on canvas dispose. */
    destroy() {
        this._unShiftDown?.(); this._unShiftDown = null;
        this._unShiftUp?.();   this._unShiftUp   = null;
    }

    /** Handle hit radius in image pixels (scaled by zoom for usability). */
    static HANDLE_HIT_RADIUS = 10;
    /** Visible handle diameter in screen pixels. */
    static HANDLE_DIAMETER = 10;

    /**
     * Called when a new image is loaded.
     * Resets the crop rect to the largest centred rectangle fitting the locked ratio.
     * @param {number} imgW
     * @param {number} imgH
     */
    init(imgW, imgH) {
        this._imgW = imgW;
        this._imgH = imgH;
        this._applyRatioToRect();
    }

    /**
     * Set the locked ratio and immediately re-fit the crop rect.
     * Pass `null` for FREE mode (no aspect lock).
     * @param {number|null} ratio - width / height float, or null for free aspect
     */
    setRatio(ratio) {
        this.lockedRatio = ratio;
        this._applyRatioToRect();
    }

    /**
     * RESOLUTION mode (MPI-383): lock to the typed size's ratio and seed the
     * rect at EXACTLY that many image pixels, centred — so a 1920×1080 target
     * on a 784×980 source starts as the frame the user is cropping out to,
     * hanging off both sides. The output is resampled to w×h on apply.
     * @param {number} w
     * @param {number} h
     */
    setExactSize(w, h) {
        if (!(w > 0) || !(h > 0)) return;
        this.lockedRatio = w / h;
        this.cropRect = {
            x: (this._imgW - w) / 2,
            y: (this._imgH - h) / 2,
            w,
            h,
        };
    }

    /**
     * Returns a copy of the crop rect with pixel values rounded.
     * @returns {{ x: number, y: number, w: number, h: number }}
     */
    getCropRect() {
        return {
            x: Math.round(this.cropRect.x),
            y: Math.round(this.cropRect.y),
            w: Math.round(this.cropRect.w),
            h: Math.round(this.cropRect.h),
        };
    }

    // ── Ratio fitting ──────────────────────────────────────────────────────────

    /**
     * Recalculates the crop rect to be the largest centred rect
     * that fits inside the image at the current locked ratio.
     */
    _applyRatioToRect() {
        if (!this._imgW || !this._imgH) return;

        const ratio = this.lockedRatio;

        // FREE mode: full image rect, no ratio constraint
        if (ratio == null) {
            this.cropRect = { x: 0, y: 0, w: this._imgW, h: this._imgH };
            return;
        }

        let w, h;

        // Fit by width first
        w = this._imgW;
        h = w / ratio;

        if (h > this._imgH) {
            // Doesn't fit vertically, fit by height instead
            h = this._imgH;
            w = h * ratio;
        }

        this.cropRect = {
            x: (this._imgW - w) / 2,
            y: (this._imgH - h) / 2,
            w,
            h,
        };
    }

    // ── Handle hit-testing ─────────────────────────────────────────────────────

    /**
     * Returns the handle key under the given image-space point or null.
     * @param {number} imgX
     * @param {number} imgY
     * @param {number} scale - current canvas scale (to adjust handle hit size)
     * @returns {string|null}
     */
    hitTest(imgX, imgY, scale = 1) {
        if (!this.isCroppingMode) return null;

        const { x, y, w, h } = this.cropRect;
        // Hit radius in image pixels — larger when zoomed out
        const r = CropManager.HANDLE_HIT_RADIUS / scale;

        const near = (ax, ay) => Math.abs(imgX - ax) <= r && Math.abs(imgY - ay) <= r;

        if (near(x,       y      )) return 'tl';
        if (near(x + w,   y      )) return 'tr';
        if (near(x,       y + h  )) return 'bl';
        if (near(x + w,   y + h  )) return 'br';
        if (near(x + w/2, y      )) return 't';
        if (near(x + w/2, y + h  )) return 'b';
        if (near(x,       y + h/2)) return 'l';
        if (near(x + w,   y + h/2)) return 'r';

        // Body: inside rect but not on a handle
        if (imgX > x && imgX < x + w && imgY > y && imgY < y + h) return 'body';

        return null;
    }

    // ── Drag API ───────────────────────────────────────────────────────────────

    startDrag(handle, imgX, imgY) {
        this._activeHandle    = handle;
        this._dragStartMouse  = { x: imgX, y: imgY };
        this._dragStartRect   = { ...this.cropRect };
        this.isDragging       = true;
    }

    /**
     * Move the active handle by delta (in image-space pixels).
     * The rect is free to leave the image; it stays locked to ratio and snaps
     * to the image bounds inside SNAP_PX screen pixels.
     * @param {number} imgX - current mouse x in image-space
     * @param {number} imgY - current mouse y in image-space
     * @param {number} scale - current view scale (converts the snap radius to image px)
     */
    drag(imgX, imgY, scale = 1) {
        if (!this.isDragging || !this._activeHandle) return;

        const dx = imgX - this._dragStartMouse.x;
        const dy = imgY - this._dragStartMouse.y;
        const r  = this.lockedRatio;
        const sr = this._dragStartRect;
        const isFree = (r == null);
        const tol = SNAP_PX / (scale || 1);

        // ── Body drag: translate only ─────────────────────────────────────
        if (this._activeHandle === 'body') {
            const moved = { x: sr.x + dx, y: sr.y + dy, w: sr.w, h: sr.h };
            this.cropRect = snapBodyRect(moved, this._imgW, this._imgH, tol);
            return;
        }

        // ── FREE mode: each handle moves its axis independently ──────────
        if (isFree) {
            let { x, y, w, h } = sr;
            const minSize = 20;
            const m = this._shiftHeld ? 2 : 1;
            switch (this._activeHandle) {
                case 'tl': w = sr.w - m * dx; h = sr.h - m * dy; break;
                case 'tr': w = sr.w + m * dx; h = sr.h - m * dy; break;
                case 'bl': w = sr.w - m * dx; h = sr.h + m * dy; break;
                case 'br': w = sr.w + m * dx; h = sr.h + m * dy; break;
                case 't':  h = sr.h - m * dy; break;
                case 'b':  h = sr.h + m * dy; break;
                case 'l':  w = sr.w - m * dx; break;
                case 'r':  w = sr.w + m * dx; break;
            }
            if (this._shiftHeld) {
                const cx = sr.x + sr.w / 2;
                const cy = sr.y + sr.h / 2;
                x = cx - w / 2;
                y = cy - h / 2;
            } else {
                switch (this._activeHandle) {
                    case 'tl': x = sr.x + dx; y = sr.y + dy; break;
                    case 'tr':                y = sr.y + dy; break;
                    case 'bl': x = sr.x + dx;                break;
                    case 't':  y = sr.y + dy; break;
                    case 'l':  x = sr.x + dx; break;
                }
            }
            // Min size only — the rect may hang off the image on any side.
            if (w < minSize) { x = sr.x + sr.w - minSize; w = minSize; }
            if (h < minSize) { y = sr.y + sr.h - minSize; h = minSize; }
            // Snap the moved edges to the image bounds. Skipped while shift is
            // held: that gesture is symmetric about the centre and snapping one
            // edge would silently break the mirror.
            this.cropRect = this._shiftHeld
                ? { x, y, w, h }
                : snapFreeRect({ x, y, w, h }, this._activeHandle, this._imgW, this._imgH, tol);
            return;
        }

        // ── Ratio-locked: derive scale from active handle, then clamp scale
        // by the tightest image-bound. Preserves ratio when hitting any edge.
        const minSize = 20;

        let anchorX, anchorY, signX, signY;
        let targetW;

        if (this._shiftHeld) {
            // Scale from center: anchor = rect center; doubled deltas (mirror)
            anchorX = sr.x + sr.w / 2;
            anchorY = sr.y + sr.h / 2;
            signX = 0;
            signY = 0;
            switch (this._activeHandle) {
                case 'tl': targetW = sr.w - 2 * dx; break;
                case 'tr': targetW = sr.w + 2 * dx; break;
                case 'bl': targetW = sr.w - 2 * dx; break;
                case 'br': targetW = sr.w + 2 * dx; break;
                case 't':  targetW = (sr.h - 2 * dy) * r; break;
                case 'b':  targetW = (sr.h + 2 * dy) * r; break;
                case 'l':  targetW = sr.w - 2 * dx; break;
                case 'r':  targetW = sr.w + 2 * dx; break;
            }
        } else {
            switch (this._activeHandle) {
                case 'tl':
                    anchorX = sr.x + sr.w; anchorY = sr.y + sr.h; signX = -1; signY = -1;
                    targetW = sr.w - dx;
                    break;
                case 'tr':
                    anchorX = sr.x;        anchorY = sr.y + sr.h; signX = +1; signY = -1;
                    targetW = sr.w + dx;
                    break;
                case 'bl':
                    anchorX = sr.x + sr.w; anchorY = sr.y;        signX = -1; signY = +1;
                    targetW = sr.w - dx;
                    break;
                case 'br':
                    anchorX = sr.x;        anchorY = sr.y;        signX = +1; signY = +1;
                    targetW = sr.w + dx;
                    break;
                case 't': {
                    const newH = sr.h - dy;
                    targetW = newH * r;
                    anchorX = sr.x + sr.w / 2; anchorY = sr.y + sr.h; signX = 0; signY = -1;
                    break;
                }
                case 'b': {
                    const newH = sr.h + dy;
                    targetW = newH * r;
                    anchorX = sr.x + sr.w / 2; anchorY = sr.y; signX = 0; signY = +1;
                    break;
                }
                case 'l': {
                    targetW = sr.w - dx;
                    anchorX = sr.x + sr.w; anchorY = sr.y + sr.h / 2; signX = -1; signY = 0;
                    break;
                }
                case 'r': {
                    targetW = sr.w + dx;
                    anchorX = sr.x;        anchorY = sr.y + sr.h / 2; signX = +1; signY = 0;
                    break;
                }
            }
        }

        // Min-size guard
        let w = Math.max(minSize, targetW);
        let h = w / r;
        if (h < minSize) { h = minSize; w = h * r; }

        // Snap to the image bounds by adjusting the SCALE — the ratio is the
        // invariant here, so an edge lands on a bound by resizing the whole
        // rect, never by moving that edge alone. Nothing in range = unchanged.
        // Shift-from-centre is sign 0 on both axes, which snapRatioWidth
        // already treats as "both edges move", so it snaps symmetrically.
        w = Math.max(minSize, snapRatioWidth(w, {
            anchorX, anchorY, signX, signY,
            ratio: r,
            imgW: this._imgW,
            imgH: this._imgH,
            tol,
        }));
        h = w / r;

        // Resolve x/y from anchor + sign
        let x, y;
        if (signX > 0)      x = anchorX;
        else if (signX < 0) x = anchorX - w;
        else                x = anchorX - w / 2;

        if (signY > 0)      y = anchorY;
        else if (signY < 0) y = anchorY - h;
        else                y = anchorY - h / 2;

        this.cropRect = { x, y, w, h };
    }

    endDrag() {
        this.isDragging     = false;
        this._activeHandle  = null;
        this._dragStartRect = null;
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    /**
     * Draw the whole crop overlay in screen/container space on screenUICanvas.
     *
     * Everything lives here — scrim, border, thirds, handles — because the rect
     * can extend past the image and the overlay canvas is only image-sized
     * (MPI-383). Bonus: no `image-rendering: pixelated` on this canvas, so the
     * circles and hairlines stay crisp.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ offsetX: number, offsetY: number, scale: number }} view
     * @param {number} imgW - source image width, for the bounds outline
     * @param {number} imgH
     */
    drawScreen(ctx, view, imgW, imgH) {
        if (!this.isCroppingMode) return;

        const scale = view.scale || 1;
        const sx = (imgX) => view.offsetX + imgX * scale;
        const sy = (imgY) => view.offsetY + imgY * scale;

        const rect = this.cropRect;
        const x = sx(rect.x);
        const y = sy(rect.y);
        const w = rect.w * scale;
        const h = rect.h * scale;
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;

        ctx.save();

        // 1. Scrim over everything outside the crop rect — container-wide, since
        // the "outside" now includes the empty space beyond the image.
        ctx.fillStyle = CROP_SCRIM;
        ctx.fillRect(0, 0, W, Math.max(0, y));
        ctx.fillRect(0, y + h, W, Math.max(0, H - (y + h)));
        ctx.fillRect(0, y, Math.max(0, x), h);
        ctx.fillRect(x + w, y, Math.max(0, W - (x + w)), h);

        // 2. Where the source actually ends — only drawn when the crop leaves
        // it, otherwise it is noise on top of the image edge.
        const leavesImage = rect.x < 0 || rect.y < 0
            || rect.x + rect.w > imgW || rect.y + rect.h > imgH;
        if (leavesImage) {
            ctx.strokeStyle = CROP_BOUNDS;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(sx(0), sy(0), imgW * scale, imgH * scale);
            ctx.setLineDash([]);
        }

        // 3. Crop border
        ctx.strokeStyle = CROP_BORDER;
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(x, y, w, h);

        // 4. Rule-of-thirds grid (2×2 inner lines)
        ctx.strokeStyle = CROP_THIRDS;
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + w / 3,     y);     ctx.lineTo(x + w / 3,     y + h);
        ctx.moveTo(x + w * 2 / 3, y);     ctx.lineTo(x + w * 2 / 3, y + h);
        ctx.moveTo(x, y + h / 3);         ctx.lineTo(x + w, y + h / 3);
        ctx.moveTo(x, y + h * 2 / 3);     ctx.lineTo(x + w, y + h * 2 / 3);
        ctx.stroke();

        // 5. Handles — fixed screen size at any zoom
        const hr = CropManager.HANDLE_DIAMETER / 2;
        const handles = [
            [x,         y,         'tl'], [x + w,     y,         'tr'],
            [x,         y + h,     'bl'], [x + w,     y + h,     'br'],
            [x + w / 2, y,         't' ], [x + w / 2, y + h,     'b' ],
            [x,         y + h / 2, 'l' ], [x + w,     y + h / 2, 'r' ],
        ];

        ctx.fillStyle   = CROP_HANDLE_FILL;
        ctx.strokeStyle = CROP_HANDLE_STROKE;
        ctx.lineWidth   = 2;

        handles.forEach(([hx, hy]) => {
            ctx.beginPath();
            ctx.arc(hx, hy, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        // 6. Active handle redraw
        if (this._activeHandle) {
            const hit = handles.find(([, , k]) => k === this._activeHandle);
            if (hit) {
                const [hx, hy] = hit;
                ctx.beginPath();
                ctx.arc(hx, hy, hr * 1.15, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    /**
     * The box the view should frame while cropping: image ∪ crop rect, padded
     * so handles sitting on the union edge aren't flush against the viewport.
     * Returns null when the crop is inside the image — the plain image fit
     * already covers that and must not be disturbed.
     * @returns {{x:number,y:number,w:number,h:number}|null}
     */
    getFitBox() {
        const { x, y, w, h } = this.cropRect;
        if (!this.isCroppingMode || !this._imgW || !this._imgH) return null;
        if (x >= 0 && y >= 0 && x + w <= this._imgW && y + h <= this._imgH) return null;

        const left   = Math.min(0, x);
        const top    = Math.min(0, y);
        const right  = Math.max(this._imgW, x + w);
        const bottom = Math.max(this._imgH, y + h);
        const padX   = (right - left) * 0.03;
        const padY   = (bottom - top) * 0.03;

        return {
            x: left - padX,
            y: top - padY,
            w: (right - left) + padX * 2,
            h: (bottom - top) + padY * 2,
        };
    }

    /**
     * Returns cursor CSS string for a given handle key so InputController
     * can set canvas.style.cursor appropriately.
     * @param {string|null} handle
     * @returns {string}
     */
    static getCursor(handle) {
        switch (handle) {
            case 'tl': case 'br': return 'nwse-resize';
            case 'tr': case 'bl': return 'nesw-resize';
            case 't':  case 'b':  return 'ns-resize';
            case 'l':  case 'r':  return 'ew-resize';
            case 'body':          return 'move';
            default:              return 'default';
        }
    }
}
