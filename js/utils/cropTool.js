/**
 * cropTool.js
 *
 * Crop box state and interaction manager — rendering-target-agnostic.
 * Manages normalized (0–1) crop rect, aspect-ratio locking, drag/resize,
 * handle hit-testing, and overlay drawing for any canvas-based viewer.
 *
 * Works with images (naturalWidth/Height) or video (videoWidth/videoHeight).
 * Does NOT assume MpiCanvas — can be used by any viewer with an overlay canvas.
 *
 * Normalized coordinates: [0..1] relative to content's intrinsic bounds.
 * Caller maps pixel↔normalized using getContentBounds().
 *
 * Usage:
 *   const cropTool = createCropTool({
 *     overlayCanvas,     // HTMLCanvasElement for overlay drawing
 *     targetElement,     // img or video element with intrinsic dimensions
 *     onChange,          // (normRect) => void, called on drag end
 *   });
 *
 *   cropTool.enable({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
 *   cropTool.setRatio(16/9);
 *   cropTool.getRect();  // { x, y, w, h } normalized
 *   cropTool.destroy();
 */

/* Stage canvas color constants — JS cannot use CSS vars in per-frame draws.
 * Values mirror MAPPING.md §9. Update here if tokens change in 01_base.css. */
const SCRIM         = 'oklch(0.20 0.020 350 / 0.55)'; /* --surface-canvas 55% */
const CROP_BORDER   = 'oklch(0.66 0.014 80 / 0.9)';   /* --ink-3 90% */
const CROP_THIRDS   = 'oklch(0.66 0.014 80 / 0.35)';  /* --ink-3 35% */
const HANDLE_FILL   = 'oklch(0.95 0.005 80 / 0.95)';  /* --ink-1 95% */
const HANDLE_STROKE = 'oklch(0.20 0.020 350 / 0.6)';  /* --surface-canvas 60% */
const CROP_STROKE   = 'oklch(0.66 0.014 80)';          /* --ink-3 (active handle) */

import { Hotkeys } from '../managers/hotkeyManager.js';

export function createCropTool({ overlayCanvas, targetElement, onChange }) {
    let _isEnabled = false;
    let _lockedRatio = null; // null = FREE (no aspect lock)
    let _normRect = { x: 0, y: 0, w: 1, h: 1 }; // normalized [0..1]
    let _shiftHeld = false; // scale from center when true
    let _unShiftDown = null;
    let _unShiftUp   = null;

    // Drag state
    let _isDragging = false;
    let _activeHandle = null; // 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r'|'body'|null
    let _dragStartNormRect = null;
    let _dragStartMouse = null; // { x, y } in normalized coords

    // Event handlers (stored for cleanup)
    const _boundHandlers = {};

    // Handle size in pixels (at 1:1 scale)
    const HANDLE_SIZE = 16;

    /**
     * Get the bounding rect of the actual content (accounting for letterbox/pillarbox).
     * For images: uses naturalWidth/naturalHeight; for video: uses videoWidth/videoHeight.
     * Returns { x, y, w, h } in overlay canvas pixel space.
     */
    function _getContentBounds() {
        const canvasW = overlayCanvas.width;
        const canvasH = overlayCanvas.height;

        let contentW, contentH;
        if (targetElement.tagName === 'VIDEO') {
            contentW = targetElement.videoWidth || 1;
            contentH = targetElement.videoHeight || 1;
        } else {
            // Image or generic img element
            contentW = targetElement.naturalWidth || targetElement.width || 1;
            contentH = targetElement.naturalHeight || targetElement.height || 1;
        }

        // Fit content inside canvas, maintaining aspect ratio (letterbox/pillarbox)
        let displayW = canvasW;
        let displayH = canvasH;
        const contentRatio = contentW / contentH;
        const canvasRatio = canvasW / canvasH;

        if (contentRatio > canvasRatio) {
            // Content is wider — fit by width
            displayH = canvasW / contentRatio;
        } else {
            // Content is taller — fit by height
            displayW = canvasH * contentRatio;
        }

        const x = (canvasW - displayW) / 2;
        const y = (canvasH - displayH) / 2;

        return { x, y, w: displayW, h: displayH };
    }

    /**
     * Convert normalized coords to pixel coords in overlay canvas.
     */
    function _normToPixel(normX, normY) {
        const bounds = _getContentBounds();
        const pixelX = bounds.x + normX * bounds.w;
        const pixelY = bounds.y + normY * bounds.h;
        return { x: pixelX, y: pixelY };
    }

    /**
     * Convert pixel coords to normalized coords.
     */
    function _pixelToNorm(pixelX, pixelY) {
        const bounds = _getContentBounds();
        const normX = (pixelX - bounds.x) / bounds.w;
        const normY = (pixelY - bounds.y) / bounds.h;
        return { x: normX, y: normY };
    }

    /**
     * Get content aspect ratio (intrinsic W/H) for normalizing crop ratios.
     * Normalized space is [0..1]×[0..1] over anisotropic content, so a crop
     * ratio (w/h in pixels) maps to normRatio = ratio * (contentH/contentW).
     */
    function _contentAspect() {
        let cw, ch;
        if (targetElement.tagName === 'VIDEO') {
            cw = targetElement.videoWidth || 1;
            ch = targetElement.videoHeight || 1;
        } else {
            cw = targetElement.naturalWidth || targetElement.width || 1;
            ch = targetElement.naturalHeight || targetElement.height || 1;
        }
        return cw / ch;
    }

    /**
     * Clamp and fit normalized rect to locked ratio and bounds.
     */
    function _applyRatioToRect(rect = _normRect) {
        // FREE mode: full normalized rect, no constraint
        if (_lockedRatio == null) {
            _normRect = { x: 0, y: 0, w: 1, h: 1 };
            return;
        }

        const contentAspect = _contentAspect();
        // Pixel ratio → normalized-space ratio (account for anisotropic norm coords)
        const normRatio = _lockedRatio / contentAspect;
        let { x, y, w, h } = rect;

        // Fit by width first
        w = 1;
        h = w / normRatio;

        if (h > 1) {
            // Doesn't fit vertically, fit by height instead
            h = 1;
            w = h * normRatio;
        }

        // Center
        x = (1 - w) / 2;
        y = (1 - h) / 2;

        _normRect = { x, y, w, h };
    }

    /**
     * Hit-test normalized coordinates against handles.
     * Returns handle key or null.
     */
    function _hitTest(normX, normY) {
        if (!_isEnabled) return null;

        const { x, y, w, h } = _normRect;
        // Hit radius in normalized space (fixed pixel size, scaled by content width)
        const bounds = _getContentBounds();
        const hitRadius = HANDLE_SIZE / bounds.w;

        const near = (ax, ay) => Math.abs(normX - ax) <= hitRadius && Math.abs(normY - ay) <= hitRadius;

        // Corners
        if (near(x, y)) return 'tl';
        if (near(x + w, y)) return 'tr';
        if (near(x, y + h)) return 'bl';
        if (near(x + w, y + h)) return 'br';

        // Edge midpoints
        if (near(x + w / 2, y)) return 't';
        if (near(x + w / 2, y + h)) return 'b';
        if (near(x, y + h / 2)) return 'l';
        if (near(x + w, y + h / 2)) return 'r';

        // Body (inside rect but not on handle)
        if (normX > x && normX < x + w && normY > y && normY < y + h) return 'body';

        return null;
    }

    /**
     * Start dragging a handle.
     */
    function _startDrag(handle, normX, normY) {
        _activeHandle = handle;
        _dragStartMouse = { x: normX, y: normY };
        _dragStartNormRect = { ..._normRect };
        _isDragging = true;
    }

    /**
     * Drag the active handle.
     */
    function _drag(normX, normY) {
        if (!_isDragging || !_activeHandle || !_dragStartNormRect) return;

        const dx = normX - _dragStartMouse.x;
        const dy = normY - _dragStartMouse.y;
        const sr = _dragStartNormRect;
        const isFree = (_lockedRatio == null);
        const minSize = 0.05;

        // ── Body drag: translate only, clamp position ─────────────────────
        if (_activeHandle === 'body') {
            let x = sr.x + dx;
            let y = sr.y + dy;
            x = Math.max(0, Math.min(x, 1 - sr.w));
            y = Math.max(0, Math.min(y, 1 - sr.h));
            _normRect = { x, y, w: sr.w, h: sr.h };
            return;
        }

        // ── FREE mode: each handle moves its axis independently ──────────
        if (isFree) {
            let { x, y, w, h } = sr;
            // Shift = mirror axis change across center → 2x axis delta, anchor = center
            const m = _shiftHeld ? 2 : 1;
            switch (_activeHandle) {
                case 'tl': w = sr.w - m * dx; h = sr.h - m * dy; break;
                case 'tr': w = sr.w + m * dx; h = sr.h - m * dy; break;
                case 'bl': w = sr.w - m * dx; h = sr.h + m * dy; break;
                case 'br': w = sr.w + m * dx; h = sr.h + m * dy; break;
                case 't':  h = sr.h - m * dy; break;
                case 'b':  h = sr.h + m * dy; break;
                case 'l':  w = sr.w - m * dx; break;
                case 'r':  w = sr.w + m * dx; break;
            }
            if (_shiftHeld) {
                // Anchor = original center
                const cx = sr.x + sr.w / 2;
                const cy = sr.y + sr.h / 2;
                x = cx - w / 2;
                y = cy - h / 2;
            } else {
                // Original anchor logic
                switch (_activeHandle) {
                    case 'tl': x = sr.x + dx; y = sr.y + dy; break;
                    case 'tr':                y = sr.y + dy; break;
                    case 'bl': x = sr.x + dx;                break;
                    case 't':  y = sr.y + dy; break;
                    case 'l':  x = sr.x + dx; break;
                }
            }
            if (w < minSize) { x = sr.x + sr.w - minSize; w = minSize; }
            if (h < minSize) { y = sr.y + sr.h - minSize; h = minSize; }
            x = Math.max(0, x);
            y = Math.max(0, y);
            w = Math.min(w, 1 - x);
            h = Math.min(h, 1 - y);
            _normRect = { x, y, w, h };
            return;
        }

        // ── Ratio-locked: anchor + sign + scale-fit, preserves ratio ─────
        const r = _lockedRatio / _contentAspect();

        let anchorX, anchorY, signX, signY, targetW;

        if (_shiftHeld) {
            // Scale from center: anchor = rect center; targetW doubled (mirror)
            anchorX = sr.x + sr.w / 2;
            anchorY = sr.y + sr.h / 2;
            signX = 0;
            signY = 0;
            switch (_activeHandle) {
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
            switch (_activeHandle) {
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

        let w = Math.max(minSize, targetW);
        let h = w / r;
        if (h < minSize) { h = minSize; w = h * r; }

        // Bound max w by horizontal space available from anchor
        let maxW = w;
        if (signX > 0)      maxW = Math.min(maxW, 1 - anchorX);
        else if (signX < 0) maxW = Math.min(maxW, anchorX);
        else                maxW = Math.min(maxW, 2 * Math.min(anchorX, 1 - anchorX));

        // Bound by vertical space, converted to width via ratio
        let maxH;
        if (signY > 0)      maxH = 1 - anchorY;
        else if (signY < 0) maxH = anchorY;
        else                maxH = 2 * Math.min(anchorY, 1 - anchorY);
        maxW = Math.min(maxW, maxH * r);

        w = Math.max(minSize, maxW);
        h = w / r;

        let x, y;
        if (signX > 0)      x = anchorX;
        else if (signX < 0) x = anchorX - w;
        else                x = anchorX - w / 2;

        if (signY > 0)      y = anchorY;
        else if (signY < 0) y = anchorY - h;
        else                y = anchorY - h / 2;

        _normRect = { x, y, w, h };
    }

    function _endDrag() {
        _isDragging = false;
        _activeHandle = null;
        _dragStartNormRect = null;
    }

    /**
     * Get cursor CSS for a handle.
     */
    function _getCursor(handle) {
        switch (handle) {
            case 'tl':
            case 'br':
                return 'nwse-resize';
            case 'tr':
            case 'bl':
                return 'nesw-resize';
            case 't':
            case 'b':
                return 'ns-resize';
            case 'l':
            case 'r':
                return 'ew-resize';
            case 'body':
                return 'move';
            default:
                return 'default';
        }
    }

    /**
     * Redraw the crop overlay.
     * Clears canvas and draws crop box, handles, grid, and scrim.
     * Scrim dims everything outside the crop rect, but stays within content bounds.
     */
    function _redraw() {
        if (!_isEnabled) return;

        const ctx = overlayCanvas.getContext('2d');
        const bounds = _getContentBounds();
        const { x, y, w, h } = _normRect;

        // Guard against unloaded video/image
        if (bounds.w <= 0 || bounds.h <= 0) return;

        // Convert normalized crop rect to pixel space
        const px = bounds.x + x * bounds.w;
        const py = bounds.y + y * bounds.h;
        const pw = w * bounds.w;
        const ph = h * bounds.h;

        // Clear canvas
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        ctx.save();

        // 1. Dark scrim outside crop rect (within content bounds only)
        ctx.fillStyle = SCRIM;
        // Top (from content top to crop top)
        if (py > bounds.y) {
            ctx.fillRect(bounds.x, bounds.y, bounds.w, py - bounds.y);
        }
        // Bottom (from crop bottom to content bottom)
        if (py + ph < bounds.y + bounds.h) {
            ctx.fillRect(bounds.x, py + ph, bounds.w, bounds.y + bounds.h - (py + ph));
        }
        // Left of crop (within content height bounds)
        if (px > bounds.x) {
            ctx.fillRect(bounds.x, py, px - bounds.x, ph);
        }
        // Right of crop (within content height bounds)
        if (px + pw < bounds.x + bounds.w) {
            ctx.fillRect(px + pw, py, bounds.x + bounds.w - (px + pw), ph);
        }

        // 2. Crop border
        ctx.strokeStyle = CROP_BORDER;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(px, py, pw, ph);

        // 3. Rule-of-thirds grid
        ctx.strokeStyle = CROP_THIRDS;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        // Vertical thirds
        ctx.moveTo(px + pw / 3, py);
        ctx.lineTo(px + pw / 3, py + ph);
        ctx.moveTo(px + (pw * 2) / 3, py);
        ctx.lineTo(px + (pw * 2) / 3, py + ph);
        // Horizontal thirds
        ctx.moveTo(px, py + ph / 3);
        ctx.lineTo(px + pw, py + ph / 3);
        ctx.moveTo(px, py + (ph * 2) / 3);
        ctx.lineTo(px + pw, py + (ph * 2) / 3);
        ctx.stroke();

        // 4. Draw handles (corner + edge)
        const hs = HANDLE_SIZE / 2;
        const handles = [
            [px, py, 'tl'],
            [px + pw, py, 'tr'],
            [px, py + ph, 'bl'],
            [px + pw, py + ph, 'br'],
            [px + pw / 2, py, 't'],
            [px + pw / 2, py + ph, 'b'],
            [px, py + ph / 2, 'l'],
            [px + pw, py + ph / 2, 'r'],
        ];

        ctx.fillStyle = HANDLE_FILL;
        ctx.strokeStyle = HANDLE_STROKE;
        ctx.lineWidth = 0.8;

        handles.forEach(([hx, hy]) => {
            ctx.beginPath();
            ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
            ctx.fill();
            ctx.stroke();
        });

        // 5. Highlight active handle
        if (_activeHandle) {
            const hit = handles.find(([, , k]) => k === _activeHandle);
            if (hit) {
                const [hx, hy] = hit;
                ctx.fillStyle = CROP_STROKE;
                ctx.beginPath();
                ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    /**
     * Set up event listeners on overlay canvas.
     */
    function _setupEvents() {
        _boundHandlers.pointerdown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            const rect = overlayCanvas.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;
            const pixelY = e.clientY - rect.top;
            const { x: normX, y: normY } = _pixelToNorm(pixelX, pixelY);

            const handle = _hitTest(normX, normY);
            if (handle) {
                _startDrag(handle, normX, normY);
            }

            overlayCanvas.style.cursor = _getCursor(_activeHandle);
            _redraw();
        };

        _boundHandlers.pointermove = (e) => {
            const rect = overlayCanvas.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;
            const pixelY = e.clientY - rect.top;
            const { x: normX, y: normY } = _pixelToNorm(pixelX, pixelY);

            if (_isDragging) {
                _drag(normX, normY);
                onChange?.(_normRect);
                _redraw();
            } else {
                const handle = _hitTest(normX, normY);
                overlayCanvas.style.cursor = _getCursor(handle);
            }
        };

        _boundHandlers.pointerup = () => {
            _endDrag();
            overlayCanvas.style.cursor = 'default';
            _redraw();
        };

        overlayCanvas.addEventListener('pointerdown', _boundHandlers.pointerdown);
        window.addEventListener('pointermove', _boundHandlers.pointermove);
        window.addEventListener('pointerup', _boundHandlers.pointerup);
    }

    function _removeEvents() {
        overlayCanvas.removeEventListener('pointerdown', _boundHandlers.pointerdown);
        window.removeEventListener('pointermove', _boundHandlers.pointermove);
        window.removeEventListener('pointerup', _boundHandlers.pointerup);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        /**
         * Enable crop tool with optional initial normalized rect.
         */
        enable(initialRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }) {
            if (_isEnabled) return;
            _isEnabled = true;
            _normRect = initialRect;
            _applyRatioToRect();
            _setupEvents();
            _unShiftDown = Hotkeys.bind('crop.shift.video',    () => { _shiftHeld = true;  });
            _unShiftUp   = Hotkeys.bind('crop.shift.video.up', () => { _shiftHeld = false; });
            _redraw();
        },

        /**
         * Disable crop tool and clean up listeners.
         */
        disable() {
            if (!_isEnabled) return;
            _isEnabled = false;
            _removeEvents();
            _unShiftDown?.(); _unShiftDown = null;
            _unShiftUp?.();   _unShiftUp   = null;
            _shiftHeld = false;
            const ctx = overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        },

        /**
         * Set aspect ratio (w/h). Pass null for FREE crop (no aspect lock).
         */
        setRatio(ratio) {
            _lockedRatio = (ratio == null) ? null : ratio;
            _applyRatioToRect();
            _redraw();
        },

        /**
         * Get current normalized crop rect { x, y, w, h } in [0..1] space.
         */
        getRect() {
            return { ..._normRect };
        },

        /**
         * Set crop rect programmatically (normalized).
         */
        setRect(normRect) {
            _normRect = { ...normRect };
            _applyRatioToRect();
            _redraw();
        },

        /**
         * Redraw overlay (call after canvas resize or target element changes).
         */
        redraw() {
            _redraw();
        },

        /**
         * Get content bounds for external coordinate mapping.
         */
        getContentBounds() {
            return _getContentBounds();
        },

        /**
         * Clean up: remove all listeners and clear canvas.
         */
        destroy() {
            this.disable();
        },
    };
}
