/**
 * InputController.js
 * Manages event listeners and coordinates user interaction for MpiCanvas.
 */

import { CropManager } from './CropManager.js';
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

        this._boundHandlers = {};
        this._initEvents();
    }

    destroy() {
        this.container.removeEventListener('wheel', this._boundHandlers.wheel);
        this.container.removeEventListener('mousedown', this._boundHandlers.mousedown);
        this.container.removeEventListener('dblclick', this._boundHandlers.dblclick);
        window.removeEventListener('mousemove', this._boundHandlers.mousemove);
        window.removeEventListener('mouseup', this._boundHandlers.mouseup);
        this._boundHandlers.keydownUnsub?.();
        this._boundHandlers.brushKeyUnsub?.();
        this._boundHandlers.eraserKeyUnsub?.();
        this._boundHandlers.keyupUnsub?.();
    }

    /**
     * Returns the current mouse position in canvas coordinates.
     * @returns {{ x: number|undefined, y: number|undefined }}
     */
    getMousePosition() {
        return { x: this.currentMouseX, y: this.currentMouseY };
    }

    _initEvents() {
        const { view, mask, comparison } = this.managers;

        // Wheel: Zoom or Brush Size
        this._boundHandlers.wheel = (e) => {
            e.preventDefault();
            view.isManagedView = false;

            if (mask.isMaskingMode && !this.isSpacePressed) {
                const delta = -e.deltaY;
                mask.brushSize = Math.max(1, mask.brushSize + (delta > 0 ? 5 : -5));
                if (this.options.onBrushSizeChange) {
                    this.options.onBrushSizeChange(mask.brushSize);
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

        // MouseDown: Pan, Mask, Crop, or Slider
        this._boundHandlers.mousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            const c = this._getContainerCoords(e);
            const i = this._getImageCoords(e);
            const { view, mask, comparison, crop } = this.managers;
            const containerW = this.container.getBoundingClientRect().width || 1;

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
            } else if (mask.isMaskingMode && !this.isSpacePressed) {
                mask.isDrawingMask = true;
                mask.paint(i.x, i.y);
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

        // MouseMove: Global listener
        this._boundHandlers.mousemove = (e) => {
            const c = this._getContainerCoords(e);
            this.currentMouseX = c.x;   // container px (used by brush indicator + slider)
            this.currentMouseY = c.y;
            const { view, mask, comparison, crop } = this.managers;

            if (comparison.isDraggingSlider) {
                const containerW = this.container.getBoundingClientRect().width || 1;
                comparison.updateSlider(c.x, containerW);
                if (this.options.onSliderChange) this.options.onSliderChange(comparison.sliderPos);
            } else if (crop.isDragging) {
                const i = this._getImageCoords(e);
                crop.drag(i.x, i.y);
            } else if (mask.isDrawingMask) {
                const i = this._getImageCoords(e);
                mask.paint(i.x, i.y);
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
            this.managers.mask.isDrawingMask = false;
            this.managers.crop.endDrag();
            this.isPanning = false;
            this.managers.comparison.isDraggingSlider = false;
            this.updateCursor();
        };
        window.addEventListener('mouseup', this._boundHandlers.mouseup);

        // KeyDown: Space and Hotkeys
        this._boundHandlers.keydownUnsub = Hotkeys.bind('canvas.pan.start', () => {
            if (this.isSpacePressed) return;
            this.isSpacePressed = true;
            // Cancel any in-progress mask stroke so Space+drag pans instead of paints
            this.managers.mask.isDrawingMask = false;
            this.updateCursor();
            this.options.onDraw();
        });

        this._boundHandlers.brushKeyUnsub = Hotkeys.bind('mask.brush.canvas', () => {
            if (!mask.isMaskingMode) return;
            mask.brushType = 'brush';
            if (this.options.onBrushTypeChange) this.options.onBrushTypeChange('brush');
            this.options.onDraw();
        });

        this._boundHandlers.eraserKeyUnsub = Hotkeys.bind('mask.eraser.canvas', () => {
            if (!mask.isMaskingMode) return;
            mask.brushType = 'eraser';
            if (this.options.onBrushTypeChange) this.options.onBrushTypeChange('eraser');
            this.options.onDraw();
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
        const { mask, comparison, crop, view } = this.managers;
        const x = this.currentMouseX;
        const y = this.currentMouseY;
        const target = this.container;
        if (this.isSpacePressed || (this.isPanning && !mask.isMaskingMode)) {
            target.style.cursor = 'move';
        } else if (crop.isCroppingMode && !this.isSpacePressed) {
            // Convert container-px cursor → image-px for crop hit-test.
            const imgX = x !== undefined ? (x - view.offsetX) / view.scale : -1;
            const imgY = y !== undefined ? (y - view.offsetY) / view.scale : -1;
            const handle = crop.isDragging
                ? crop._activeHandle
                : crop.hitTest(imgX, imgY, view.scale);
            target.style.cursor = CropManager.getCursor(handle);
        } else if (mask.isMaskingMode) {
            target.style.cursor = 'none';
        } else if (x !== undefined) {
            const containerW = this.container.getBoundingClientRect().width || 1;
            target.style.cursor = comparison.isOverSlider(x, containerW)
                ? 'ew-resize' : 'default';
        } else {
            target.style.cursor = 'default';
        }
    }
}
