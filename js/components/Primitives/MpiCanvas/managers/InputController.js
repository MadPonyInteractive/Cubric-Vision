/**
 * InputController.js
 * Manages event listeners and coordinates user interaction for MpiCanvas.
 */

import { CropManager } from './CropManager.js';

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
    constructor(canvas, container, managers, options) {
        this.canvas = canvas;
        this.container = container;
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
        this.canvas.removeEventListener('wheel', this._boundHandlers.wheel);
        this.canvas.removeEventListener('mousedown', this._boundHandlers.mousedown);
        this.canvas.removeEventListener('dblclick', this._boundHandlers.dblclick);
        window.removeEventListener('mousemove', this._boundHandlers.mousemove);
        window.removeEventListener('mouseup', this._boundHandlers.mouseup);
        window.removeEventListener('keydown', this._boundHandlers.keydown);
        window.removeEventListener('keyup', this._boundHandlers.keyup);
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

                const imgX = (e.offsetX - view.offsetX) / oldScale;
                const imgY = (e.offsetY - view.offsetY) / oldScale;

                view.offsetX = e.offsetX - imgX * view.scale;
                view.offsetY = e.offsetY - imgY * view.scale;
            }
            this.options.onDraw();
        };
        this.canvas.addEventListener('wheel', this._boundHandlers.wheel, { passive: false });

        // MouseDown: Pan, Mask, Crop, or Slider
        this._boundHandlers.mousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            const { x, y } = this._getCanvasCoords(e);
            const { view, mask, comparison, crop } = this.managers;

            if (comparison.isOverSlider(x, this.canvas.width)) {
                comparison.isDraggingSlider = true;
                comparison.sliderPos = x / this.canvas.width;
            } else if (crop.isCroppingMode && !this.isSpacePressed) {
                const imgX = (x - view.offsetX) / view.scale;
                const imgY = (y - view.offsetY) / view.scale;
                const handle = crop.hitTest(imgX, imgY, view.scale);
                if (handle) {
                    crop.startDrag(handle, imgX, imgY);
                } else {
                    // Clicked outside crop rect — start pan
                    this.isPanning = true;
                    view.isManagedView = false;
                    this.startPanX = e.clientX - view.offsetX;
                    this.startPanY = e.clientY - view.offsetY;
                }
            } else if (mask.isMaskingMode && !this.isSpacePressed) {
                mask.isDrawingMask = true;
                this._paintMaskAt(x, y);
            } else {
                this.isPanning = true;
                view.isManagedView = false;
                this.startPanX = e.clientX - view.offsetX;
                this.startPanY = e.clientY - view.offsetY;
            }
            this.updateCursor();
            this.options.onDraw();
        };
        this.canvas.addEventListener('mousedown', this._boundHandlers.mousedown);

        // MouseMove: Global listener
        this._boundHandlers.mousemove = (e) => {
            const { x, y } = this._getCanvasCoords(e);
            this.currentMouseX = x;
            this.currentMouseY = y;
            const { view, mask, comparison, crop } = this.managers;

            if (comparison.isDraggingSlider) {
                comparison.updateSlider(x, this.canvas.width);
                if (this.options.onSliderChange) this.options.onSliderChange(comparison.sliderPos);
            } else if (crop.isDragging) {
                const imgX = (x - view.offsetX) / view.scale;
                const imgY = (y - view.offsetY) / view.scale;
                crop.drag(imgX, imgY);
            } else if (mask.isDrawingMask) {
                this._paintMaskAt(x, y);
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
        this._boundHandlers.keydown = (e) => {
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

            if (e.code === 'Space' && !this.isSpacePressed) {
                if (this.container.offsetParent === null || isInput) return;
                e.preventDefault();
                this.isSpacePressed = true;
                this.updateCursor();
                this.options.onDraw();
            }

            if (mask.isMaskingMode && !isInput) {
                const key = e.key.toLowerCase();
                if (key === 'b' || key === 'e') {
                    const type = key === 'b' ? 'brush' : 'eraser';
                    mask.brushType = type;
                    if (this.options.onBrushTypeChange) this.options.onBrushTypeChange(type);
                    this.options.onDraw();
                }
            }
        };
        window.addEventListener('keydown', this._boundHandlers.keydown);

        // KeyUp: Space
        this._boundHandlers.keyup = (e) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                this.updateCursor();
                this.options.onDraw();
            }
        };
        window.addEventListener('keyup', this._boundHandlers.keyup);

        // DblClick: Reset
        this._boundHandlers.dblclick = () => {
            if (!mask.isMaskingMode || this.isSpacePressed) {
                this.options.onResetView();
            }
        };
        this.canvas.addEventListener('dblclick', this._boundHandlers.dblclick);
    }

    _getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    _paintMaskAt(mouseX, mouseY) {
        const { view, mask } = this.managers;
        const imgX = (mouseX - view.offsetX) / view.scale;
        const imgY = (mouseY - view.offsetY) / view.scale;
        mask.paint(imgX, imgY);
    }

    updateCursor() {
        const { mask, comparison, crop } = this.managers;
        const x = this.currentMouseX;
        const y = this.currentMouseY;
        if (this.isSpacePressed || (this.isPanning && !mask.isMaskingMode)) {
            this.canvas.style.cursor = 'move';
        } else if (crop.isCroppingMode && !this.isSpacePressed) {
            const { view } = this.managers;
            const imgX = x !== undefined ? (x - view.offsetX) / view.scale : -1;
            const imgY = y !== undefined ? (y - view.offsetY) / view.scale : -1;
            const handle = crop.isDragging
                ? crop._activeHandle
                : crop.hitTest(imgX, imgY, view.scale);
            this.canvas.style.cursor = CropManager.getCursor(handle);
        } else if (mask.isMaskingMode) {
            this.canvas.style.cursor = 'none';
        } else if (comparison.isOverSlider(x, this.canvas.width)) {
            this.canvas.style.cursor = 'ew-resize';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }
}
