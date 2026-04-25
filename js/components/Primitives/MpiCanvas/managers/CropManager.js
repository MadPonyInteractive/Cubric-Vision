/**
 * CropManager.js
 * Manages crop-rect state, ratio locking, handle hit-testing, and draw logic.
 *
 * Coordinates are always in image-space pixels unless noted.
 * The host MpiCanvas calls draw() and passes the 2D context
 * (already translated/scaled into image-space).
 *
 * Handles:
 *   'tl','tr','bl','br'   — corner handles
 *   't','b','l','r'       — edge midpoint handles
 *   'body'                — drag the whole rect
 *   null                  — no hit / not in crop mode
 */

import { Hotkeys } from '../../../../managers/hotkeyManager.js';

const getCSSColor = (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

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
        this._unShiftDown = Hotkeys.register('shift',      () => { this._shiftHeld = true;  });
        this._unShiftUp   = Hotkeys.registerKeyup('shift', () => { this._shiftHeld = false; });
    }

    /** Tear down hotkey subscriptions. Call on canvas dispose. */
    destroy() {
        this._unShiftDown?.(); this._unShiftDown = null;
        this._unShiftUp?.();   this._unShiftUp   = null;
    }

    /** Handle size in image pixels (scaled visually by draw) */
    static HANDLE_SIZE = 10;

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
        const r = CropManager.HANDLE_SIZE / scale;

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
     * Keeps rect clamped inside image bounds and locked to ratio.
     * @param {number} imgX - current mouse x in image-space
     * @param {number} imgY - current mouse y in image-space
     */
    drag(imgX, imgY) {
        if (!this.isDragging || !this._activeHandle) return;

        const dx = imgX - this._dragStartMouse.x;
        const dy = imgY - this._dragStartMouse.y;
        const r  = this.lockedRatio;
        const sr = this._dragStartRect;
        const isFree = (r == null);

        // ── Body drag: translate only, clamp position ─────────────────────
        if (this._activeHandle === 'body') {
            let x = sr.x + dx;
            let y = sr.y + dy;
            x = Math.max(0, Math.min(x, this._imgW - sr.w));
            y = Math.max(0, Math.min(y, this._imgH - sr.h));
            this.cropRect = { x, y, w: sr.w, h: sr.h };
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
            // Min size + clamp inside image (each axis independent)
            if (w < minSize) { x = sr.x + sr.w - minSize; w = minSize; }
            if (h < minSize) { y = sr.y + sr.h - minSize; h = minSize; }
            x = Math.max(0, x);
            y = Math.max(0, y);
            w = Math.min(w, this._imgW - x);
            h = Math.min(h, this._imgH - y);
            this.cropRect = { x, y, w, h };
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

        // Clamp w/h together so the rect (anchored at anchor, growing in sign
        // direction) stays inside [0..imgW] x [0..imgH]. Compute max allowed
        // w, then refit h from w to keep ratio.
        let maxW = w;

        // Horizontal bound
        if (signX > 0)      maxW = Math.min(maxW, this._imgW - anchorX);
        else if (signX < 0) maxW = Math.min(maxW, anchorX);
        else                maxW = Math.min(maxW, 2 * Math.min(anchorX, this._imgW - anchorX));

        // Vertical bound — convert to width via ratio
        let maxH;
        if (signY > 0)      maxH = this._imgH - anchorY;
        else if (signY < 0) maxH = anchorY;
        else                maxH = 2 * Math.min(anchorY, this._imgH - anchorY);
        maxW = Math.min(maxW, maxH * r);

        w = Math.max(minSize, maxW);
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
     * Draws the crop overlay.
     * Called inside MpiCanvas draw() AFTER ctx.save/translate/scale,
     * so all coordinates are in image-space. Scale is passed for handle sizing.
     *
     * @param {CanvasRenderingContext2D} ctx - Already transformed to image-space
     * @param {number} imgW
     * @param {number} imgH
     * @param {number} scale - current view scale (for fixed-size handles)
     */
    draw(ctx, imgW, imgH, scale) {
        if (!this.isCroppingMode) return;

        const { x, y, w, h } = this.cropRect;

        // 1. Dark scrim outside crop rect (4 rects)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0,     0,     imgW, y    );          // top
        ctx.fillRect(0,     y + h, imgW, imgH - y - h);  // bottom
        ctx.fillRect(0,     y,     x,    h    );          // left
        ctx.fillRect(x + w, y,     imgW - x - w, h);     // right

        // 2. Crop border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth   = 1.5 / scale;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h);

        // 3. Rule-of-thirds grid (2×2 inner lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth   = 0.8 / scale;
        ctx.beginPath();
        // Vertical thirds
        ctx.moveTo(x + w / 3, y);     ctx.lineTo(x + w / 3, y + h);
        ctx.moveTo(x + w * 2/3, y);   ctx.lineTo(x + w * 2/3, y + h);
        // Horizontal thirds
        ctx.moveTo(x, y + h / 3);     ctx.lineTo(x + w, y + h / 3);
        ctx.moveTo(x, y + h * 2/3);   ctx.lineTo(x + w, y + h * 2/3);
        ctx.stroke();

        // 4. Corner + edge handles
        const hs = CropManager.HANDLE_SIZE / scale;  // handle half-size
        const handles = [
            [x,       y,       'tl'], [x + w,   y,       'tr'],
            [x,       y + h,   'bl'], [x + w,   y + h,   'br'],
            [x + w/2, y,       't' ], [x + w/2, y + h,   'b' ],
            [x,       y + h/2, 'l' ], [x + w,   y + h/2, 'r' ],
        ];

        ctx.fillStyle   = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth   = 0.8 / scale;

        handles.forEach(([hx, hy]) => {
            ctx.beginPath();
            ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
            ctx.fill();
            ctx.stroke();
        });

        // 5. Active handle highlight
        if (this._activeHandle) {
            const hit = handles.find(([,, k]) => k === this._activeHandle);
            if (hit) {
                const [hx, hy] = hit;
                ctx.fillStyle = getCSSColor('--neon-electric');
                ctx.beginPath();
                ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
                ctx.fill();
            }
        }

        ctx.restore();
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
