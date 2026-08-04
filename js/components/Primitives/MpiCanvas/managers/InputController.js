/**
 * InputController.js
 * Manages event listeners and coordinates user interaction for MpiCanvas.
 */

import { CropManager } from './CropManager.js';
import { ShapeManager } from './ShapeManager.js';
import { Hotkeys } from '/js/managers/hotkeyManager.js';

/**
 * @typedef {Object} Managers
 * @property {import('./ViewManager.js').ViewManager} view
 * @property {import('./MaskManager.js').MaskManager} mask
 * @property {import('./ComparisonManager.js').ComparisonManager} comparison
 * @property {import('./CropManager.js').CropManager} crop
 */

/**
 * @typedef {Object} InputOptions
 * @property {() => void} onDraw
 * @property {() => void} onResetView
 * @property {(pos: number) => void} [onSliderChange]
 * @property {(size: number) => void} [onBrushSizeChange]
 * @property {(type: string) => void} [onBrushTypeChange]
 */

export class InputController {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLElement} container
     * @param {Managers} managers
     * @param {InputOptions} options
     */
    constructor(canvas, container, managers, options, stackEl) {
        this.canvas = canvas;        // baseCanvas — kept for back-compat dataset access
        this.container = container;
        this.stackEl = stackEl || canvas; // image-px transform target
        this.managers = managers;
        this.options = options;

        this.isPanning = false;
        this.startPanX = 0;
        this.startPanY = 0;
        this.isSpacePressed = false;

        this.currentMouseX = undefined;
        this.currentMouseY = undefined;
        /** Last seen ALT state, from the mouse events (MPI-368 — rotate modifier). */
        this._altHeld = false;

        this._boundHandlers = {};
        this._initEvents();
    }

    destroy() {
        this.container.removeEventListener('wheel', this._boundHandlers.wheel);
        this.container.removeEventListener('mousedown', this._boundHandlers.mousedown);
        this.container.removeEventListener('contextmenu', this._boundHandlers.contextmenu);
        this.container.removeEventListener('dblclick', this._boundHandlers.dblclick);
        window.removeEventListener('mousemove', this._boundHandlers.mousemove);
        window.removeEventListener('mouseup', this._boundHandlers.mouseup);
        this._boundHandlers.keydownUnsub?.();
        this._boundHandlers.brushKeyUnsub?.();
        this._boundHandlers.eraserKeyUnsub?.();
        this._boundHandlers.undoKeyUnsub?.();
        this._boundHandlers.redoKeyUnsub?.();
        this._boundHandlers.keyupUnsub?.();
    }

    /**
     * Returns the current mouse position in canvas coordinates.
     * @returns {{ x: number|undefined, y: number|undefined }}
     */
    getMousePosition() {
        return { x: this.currentMouseX, y: this.currentMouseY };
    }

    /**
     * End an in-progress paint/erase stroke and announce it. Only fires when a
     * stroke was actually running, so it is one signal per stroke, not per mouseup.
     * The viewer uses it to publish mask state while a mask tool stays open
     * (MPI-372) — before that, mask state was only published on tool exit.
     */
    _endMaskStroke() {
        if (!this.managers.mask.isDrawingMask) return;
        this.managers.mask.isDrawingMask = false;
        // Close the undo capture opened at mousedown (MPI-376). The box is the
        // only reason a stroke costs kilobytes: without it every stroke would
        // retain two full 1536² layers. A stroke that painted nothing aborts.
        const box = this.managers.mask.takeStrokeBox();
        if (box) this.managers.undo?.commit(box);
        else     this.managers.undo?.abort();
        this.options.onMaskStrokeEnd?.();
    }

    /**
     * The paint twin of `_endMaskStroke` (MPI-375). Same gesture contract on the
     * same shared UndoStack — begin at mousedown, commit the box here, abort when
     * the stroke put nothing down. Kept separate rather than generalised because
     * the two announce different things: a mask stroke publishes mask state to the
     * op strip, a paint stroke does not.
     */
    _endPaintStroke() {
        const paint = this.managers.paint;
        if (!paint?.isDrawing) return;
        paint.isDrawing = false;
        const box = paint.takeStrokeBox();
        if (box) this.managers.undo?.commit(box);
        else     this.managers.undo?.abort();
        this.options.onPaintStrokeEnd?.();
    }

    /**
     * The composite twin (MPI-373). Same gesture contract on the same stack; it
     * announces nothing, because a cut is neither mask state for the op strip nor a
     * paint stroke — the panel reads the hole when the user presses Apply.
     */
    _endCompositeStroke() {
        const comp = this.managers.comp;
        if (!comp?.isDrawing) return;
        comp.isDrawing = false;
        const box = comp.takeStrokeBox();
        if (box) this.managers.undo?.commit(box);
        else     this.managers.undo?.abort();
        this.options.onCompositeStrokeEnd?.();
    }

    _initEvents() {
        const { view, mask, comparison } = this.managers;

        // Wheel: Zoom or Brush Size
        this._boundHandlers.wheel = (e) => {
            e.preventDefault();
            view.isManagedView = false;

            // Whichever brush owns the pointer resizes on the wheel (MPI-375).
            const wheelBrush = (mask.isMaskingMode && mask.paintEnabled) ? mask
                : (this.managers.paint?.isPaintingMode && this.managers.paint.paintEnabled) ? this.managers.paint
                : (this.managers.comp?.isCompositeMode && this.managers.comp.paintEnabled) ? this.managers.comp
                : null;
            if (wheelBrush && !this.isSpacePressed) {
                const delta = -e.deltaY;
                wheelBrush.brushSize = Math.max(1, wheelBrush.brushSize + (delta > 0 ? 5 : -5));
                if (this.options.onBrushSizeChange) {
                    this.options.onBrushSizeChange(wheelBrush.brushSize);
                }
            } else {
                const zoomSpeed = 0.001;
                const delta = -e.deltaY;
                const factor = Math.exp(delta * zoomSpeed);
                const oldScale = view.scale;

                view.scale = Math.max(view.minScale, Math.min(view.maxScale, view.scale * factor));

                // Cursor in container px (CSS pixels, not backing-buffer).
                const cRect = this.container.getBoundingClientRect();
                const cx = e.clientX - cRect.left;
                const cy = e.clientY - cRect.top;
                const imgX = (cx - view.offsetX) / oldScale;
                const imgY = (cy - view.offsetY) / oldScale;

                view.offsetX = cx - imgX * view.scale;
                view.offsetY = cy - imgY * view.scale;
            }
            this.options.onDraw();
        };
        this.container.addEventListener('wheel', this._boundHandlers.wheel, { passive: false });

        // MouseDown: Pan, Mask, Points, Crop, or Slider
        this._boundHandlers.mousedown = (e) => {
            // Points mode is the only consumer of the right button; every other
            // interaction is left-button only.
            const pointsClick = this.managers.mask.pointsMode
                && this.managers.mask.isMaskingMode
                && !this.isSpacePressed
                && (e.button === 0 || e.button === 2);
            if (e.button !== 0 && !pointsClick) return;
            e.preventDefault();

            const c = this._getContainerCoords(e);
            const i = this._getImageCoords(e);
            const { view, mask, comparison, crop, paint, shape, comp } = this.managers;
            const containerW = this.container.getBoundingClientRect().width || 1;
            // ALT is read straight off the mouse event rather than through a
            // hotkeyRegistry binding: it is only ever consulted at gesture start and
            // for the cursor, both of which have an event in hand.
            // ponytail: a registry entry buys nothing here — add one if ALT ever needs
            // to change behaviour with no pointer involved.
            this._altHeld = !!e.altKey;

            if (pointsClick) {
                // Clicking an existing dot removes it, whichever button — that is
                // the "individually removable" gesture. Otherwise left adds a
                // positive point, right a negative one.
                if (!mask.removePointAt(i.x, i.y)) {
                    mask.addPoint(i.x, i.y, e.button === 0);
                }
                this.options.onPointsChange?.(mask.points.length);
                this.updateCursor();
                this.options.onDraw();
                return;
            }

            if (comparison.isOverSlider(c.x, containerW)) {
                comparison.isDraggingSlider = true;
                comparison.sliderPos = Math.max(0, Math.min(1, c.x / containerW));
            } else if (crop.isCroppingMode && !this.isSpacePressed) {
                const handle = crop.hitTest(i.x, i.y, view.scale);
                if (handle) {
                    crop.startDrag(handle, i.x, i.y);
                } else {
                    this.isPanning = true;
                    view.isManagedView = false;
                    this.startPanX = e.clientX - view.offsetX;
                    this.startPanY = e.clientY - view.offsetY;
                }
            } else if (shape?.isActive && !this.isSpacePressed) {
                // MPI-368. Sits where crop's branch does — a gizmo owns the pointer
                // over its handles and hands it back (to a pan) everywhere else.
                const handle = shape.hitTest(i.x, i.y, view.scale);
                if (handle) {
                    shape.startDrag(handle, i.x, i.y, e.altKey);
                } else {
                    this.isPanning = true;
                    view.isManagedView = false;
                    this.startPanX = e.clientX - view.offsetX;
                    this.startPanY = e.clientY - view.offsetY;
                }
            } else if (mask.isMaskingMode && mask.paintEnabled && !this.isSpacePressed) {
                mask.isDrawingMask = true;
                // Open the undo capture BEFORE the first dab — the snapshot has to
                // predate the stroke it will undo. _endMaskStroke() closes it.
                this.managers.undo?.begin(mask.undoLayers());
                mask.takeStrokeBox();
                mask.paint(i.x, i.y);
            } else if (paint?.isPaintingMode && paint.paintEnabled && !this.isSpacePressed) {
                paint.isDrawing = true;
                // Same ordering as the mask brush above: snapshot, reset the stroke
                // state, then the first dab.
                this.managers.undo?.begin(paint.undoLayers());
                paint.takeStrokeBox();
                paint.paint(i.x, i.y);
            } else if (comp?.isCompositeMode && comp.paintEnabled && !this.isSpacePressed) {
                comp.isDrawing = true;
                this.managers.undo?.begin(comp.undoLayers());
                comp.takeStrokeBox();
                comp.paint(i.x, i.y);
            } else {
                this.isPanning = true;
                view.isManagedView = false;
                this.startPanX = e.clientX - view.offsetX;
                this.startPanY = e.clientY - view.offsetY;
            }
            this.updateCursor();
            this.options.onDraw();
        };
        this.container.addEventListener('mousedown', this._boundHandlers.mousedown);

        // Right-click places a negative point, so the browser menu has to go —
        // but only while points mode owns the right button. stopPropagation is
        // load-bearing: MpiCanvasViewer listens for contextmenu on its own root and
        // would otherwise pop the image context menu on every negative point.
        this._boundHandlers.contextmenu = (e) => {
            if (!mask.pointsMode || !mask.isMaskingMode || this.isSpacePressed) return;
            e.preventDefault();
            e.stopPropagation();
        };
        this.container.addEventListener('contextmenu', this._boundHandlers.contextmenu);

        // MouseMove: Global listener
        this._boundHandlers.mousemove = (e) => {
            const c = this._getContainerCoords(e);
            this.currentMouseX = c.x;   // container px (used by brush indicator + slider)
            this.currentMouseY = c.y;
            const { view, mask, comparison, crop, paint, shape, comp } = this.managers;
            this._altHeld = !!e.altKey;

            if (comparison.isDraggingSlider) {
                const containerW = this.container.getBoundingClientRect().width || 1;
                comparison.updateSlider(c.x, containerW);
                if (this.options.onSliderChange) this.options.onSliderChange(comparison.sliderPos);
            } else if (crop.isDragging) {
                const i = this._getImageCoords(e);
                crop.drag(i.x, i.y, view.scale);
            } else if (shape?.isDragging) {
                const i = this._getImageCoords(e);
                // Shift locks the shape's proportions. Read off the event like ALT is:
                // the modifier only ever matters while the pointer is moving.
                shape.drag(i.x, i.y, e.shiftKey);
            } else if (mask.isDrawingMask) {
                const i = this._getImageCoords(e);
                mask.paint(i.x, i.y);
            } else if (paint?.isDrawing) {
                const i = this._getImageCoords(e);
                paint.paint(i.x, i.y);
            } else if (comp?.isDrawing) {
                const i = this._getImageCoords(e);
                comp.paint(i.x, i.y);
            } else if (this.isPanning) {
                view.offsetX = e.clientX - this.startPanX;
                view.offsetY = e.clientY - this.startPanY;
            }

            this.updateCursor();
            this.options.onDraw();
        };
        window.addEventListener('mousemove', this._boundHandlers.mousemove);

        // MouseUp: Global listener
        this._boundHandlers.mouseup = () => {
            this._endMaskStroke();
            this._endPaintStroke();
            this._endCompositeStroke();
            this.managers.crop.endDrag();
            this.managers.shape?.endDrag();
            this.isPanning = false;
            this.managers.comparison.isDraggingSlider = false;
            this.updateCursor();
            // Release is when the crop view settles — the refit is suppressed
            // during the drag, so without a draw here the zoom would only
            // catch up on the next mouse move.
            this.options.onDraw();
        };
        window.addEventListener('mouseup', this._boundHandlers.mouseup);

        // KeyDown: Space and Hotkeys
        this._boundHandlers.keydownUnsub = Hotkeys.bind('canvas.pan.start', () => {
            if (this.isSpacePressed) return;
            this.isSpacePressed = true;
            // Cancel any in-progress mask stroke so Space+drag pans instead of paints.
            // Whatever was already painted counts as a finished stroke — publish it,
            // or the mask that Space interrupted never reaches the op strip.
            this._endMaskStroke();
            // Same for paint, or Space mid-stroke leaves an undo capture open and the
            // NEXT stroke's commit would swallow both.
            this._endPaintStroke();
            this._endCompositeStroke();
            // A gizmo drag has no undo capture to close (the commit is what records),
            // but it must stop tracking or Space+drag would reshape instead of pan.
            this.managers.shape?.endDrag();
            this.updateCursor();
            this.options.onDraw();
        });

        // B / E reach whichever brush owns the pointer — the mask brush or the paint
        // brush (MPI-375). One engine, two destinations, so one pair of keys.
        const _brushOwner = () => {
            if (mask.isMaskingMode) return mask;
            if (this.managers.paint?.isPaintingMode) return this.managers.paint;
            // MPI-373: B / E reach the composite cut too. `brushType` means the
            // INVERSE here — eraser cuts the top image away, brush paints it back —
            // but the owner protocol is the same, so the keys need no branch.
            if (this.managers.comp?.isCompositeMode) return this.managers.comp;
            return null;
        };

        this._boundHandlers.brushKeyUnsub = Hotkeys.bind('mask.brush.canvas', () => {
            const owner = _brushOwner();
            if (!owner) return;
            owner.brushType = 'brush';
            if (this.options.onBrushTypeChange) this.options.onBrushTypeChange('brush');
            this.options.onDraw();
        });

        this._boundHandlers.eraserKeyUnsub = Hotkeys.bind('mask.eraser.canvas', () => {
            const owner = _brushOwner();
            if (!owner) return;
            owner.brushType = 'eraser';
            if (this.options.onBrushTypeChange) this.options.onBrushTypeChange('eraser');
            this.options.onDraw();
        });

        // Undo / redo (MPI-376). Gated on a canvas tool being active, like the brush
        // keys — outside one there is nothing to undo and Ctrl+Z must stay the OS
        // default. Paint shares the SAME stack, so the same keys serve both.
        this._boundHandlers.undoKeyUnsub = Hotkeys.bind('mask.undo.canvas', () => {
            if (!_brushOwner()) return;
            this.options.onUndo?.();
        });

        this._boundHandlers.redoKeyUnsub = Hotkeys.bind('mask.redo.canvas', () => {
            if (!_brushOwner()) return;
            this.options.onRedo?.();
        });

        // KeyUp: Space
        this._boundHandlers.keyupUnsub = Hotkeys.bind('canvas.pan.end', () => {
            this.isSpacePressed = false;
            this.updateCursor();
            this.options.onDraw();
        });

        // DblClick: Reset
        this._boundHandlers.dblclick = () => {
            if (!mask.isMaskingMode || this.isSpacePressed) {
                this.options.onResetView();
            }
        };
        this.container.addEventListener('dblclick', this._boundHandlers.dblclick);
    }

    /** Cursor in container px (CSS). Used by slider hit-test + brush indicator. */
    _getContainerCoords(e) {
        const rect = this.container.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    /**
     * Cursor in image-native px via stack rect (CSS transform applies to getBoundingClientRect).
     * Equivalent to `(container.x - view.offsetX) / view.scale`.
     */
    _getImageCoords(e) {
        const rect = this.stackEl.getBoundingClientRect();
        const s = this.managers.view.scale || 1;
        return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
    }

    updateCursor() {
        const { mask, comparison, crop, view, paint, shape, comp } = this.managers;
        const x = this.currentMouseX;
        const y = this.currentMouseY;
        const target = this.container;
        if (this.isSpacePressed || (this.isPanning && !mask.isMaskingMode && !paint?.isPaintingMode && !comp?.isCompositeMode)) {
            target.style.cursor = 'move';
        } else if (shape?.isActive && !this.isSpacePressed) {
            // Same conversion the crop branch does: container px → image px.
            const imgX = x !== undefined ? (x - view.offsetX) / view.scale : -1;
            const imgY = y !== undefined ? (y - view.offsetY) / view.scale : -1;
            const handle = shape.isDragging
                ? shape._handle
                : shape.hitTest(imgX, imgY, view.scale);
            const rotating = shape.isDragging ? shape._rotating : this._altHeld;
            target.style.cursor = ShapeManager.getCursor(handle, rotating);
        } else if (crop.isCroppingMode && !this.isSpacePressed) {
            // Convert container-px cursor → image-px for crop hit-test.
            const imgX = x !== undefined ? (x - view.offsetX) / view.scale : -1;
            const imgY = y !== undefined ? (y - view.offsetY) / view.scale : -1;
            const handle = crop.isDragging
                ? crop._activeHandle
                : crop.hitTest(imgX, imgY, view.scale);
            target.style.cursor = CropManager.getCursor(handle);
        } else if (mask.isMaskingMode) {
            // Only the brush hides the real cursor — its indicator stands in for
            // it. Points and the other brushless mask tools (MPI-381) keep one.
            if (mask.pointsMode)        target.style.cursor = 'crosshair';
            else if (mask.paintEnabled) target.style.cursor = 'none';
            else                        target.style.cursor = 'default';
        } else if (paint?.isPaintingMode) {
            // Same rule as the mask brush: the ring indicator replaces the cursor,
            // and a brushless paint tool (Shapes, MPI-368) keeps a real one.
            target.style.cursor = paint.paintEnabled ? 'none' : 'default';
        } else if (comp?.isCompositeMode) {
            // Same rule again — Mask Comp takes its cut from a pasted mask and has
            // no brush, so it keeps a real cursor (MPI-373).
            target.style.cursor = comp.paintEnabled ? 'none' : 'default';
        } else if (x !== undefined) {
            const containerW = this.container.getBoundingClientRect().width || 1;
            target.style.cursor = comparison.isOverSlider(x, containerW)
                ? 'ew-resize' : 'default';
        } else {
            target.style.cursor = 'default';
        }
    }
}
