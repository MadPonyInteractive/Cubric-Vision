/**
 * MpiCanvas — Interactive image viewer / editor canvas (Primitive)
 *
 * A ComponentFactory-wrapped canvas that supports pan/zoom, mask painting,
 * crop overlay, and side-by-side comparison. Exactly one mode may be active
 * at a time; setting any mode automatically deactivates all others.
 *
 * Usage:
 *   const canvas = MpiCanvas.mount(wrapperEl, { onBrushSizeChange: (s) => {} });
 *   await canvas.el.loadImage(url);
 *   canvas.el.activeMode = 'crop';
 *   canvas.on('modechange', ({ mode }) => syncToolbar(mode));
 *
 * Props:
 * @param {(size: number) => void} [onBrushSizeChange] - Called when brush size changes via wheel
 * @param {(type: string) => void} [onBrushTypeChange] - Called when brush type changes via hotkey
 *
 * Instance methods (on instance.el):
 *   loadImage(url)            — load primary image, resets mode to 'none'
 *   loadComparisonImage(url)  — load secondary image, sets mode to 'compare'
 *   clearImage()              — clear canvas, resets mode to 'none'
 *   resetView()               — fit image to container
 *   setGrid(h, v)             — overlay grid lines
 *   setMaskingMode(bool)      — shorthand for activeMode = 'mask'/'none'
 *   setBrushSize(size)
 *   setBrushType(type)
 *   flipMaskColor()
 *   setMaskOpacity(opacity)
 *   clearMask()
 *   getMaskDataURL(bg, fg)
 *   setCropRatio(ratio)
 *   getCropRect()
 *   destroy()
 *
 * Active modes: 'none' | 'mask' | 'crop' | 'compare'
 * Setting activeMode to any value automatically exits all other modes.
 *
 * Emits:
 *   'modechange' { mode: string } — fired whenever activeMode changes
 */

import { ComponentFactory } from '../../factory.js';
import { clientLogger }     from '../../../services/clientLogger.js';
import { ViewManager }       from './managers/ViewManager.js';
import { MaskManager }       from './managers/MaskManager.js';
import { ComparisonManager } from './managers/ComparisonManager.js';
import { CropManager }       from './managers/CropManager.js';
import { InputController }   from './managers/InputController.js';

const getCSSColor = (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

// ── Internal canvas engine ────────────────────────────────────────────────────
// Not exported — consumers use MpiCanvas.mount() and talk to instance.el.*

class _CanvasCore {
    constructor(container, options = {}, onModeChange) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // State Managers
        this.view       = new ViewManager();
        this.mask       = new MaskManager();
        this.comparison = new ComparisonManager();
        this.crop       = new CropManager();
        this._activeMode = 'none';
        this._onModeChange = onModeChange;
        this._maskHidden = false;

        this.img = new Image();
        this.img.crossOrigin = 'anonymous';
        this._processedBitmap = null;

        // Grid state
        this.gridH = 1;
        this.gridV = 1;

        this.options = { onDraw: options.onDraw || null, ...options };

        // Orchestrate Input
        this.input = new InputController(
            this.canvas,
            this.container,
            { view: this.view, mask: this.mask, comparison: this.comparison, crop: this.crop },
            {
                onDraw: () => this.draw(),
                onResetView: () => this.resetView(),
                onSliderChange: (pos) => { this.canvas.dataset.sliderPos = pos; },
                onBrushSizeChange: this.options.onBrushSizeChange,
                onBrushTypeChange: this.options.onBrushTypeChange
            }
        );

        // Lifecycle
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
    }

    // ── Active Mode (mutual exclusion) ────────────────────────────────────────
    // Valid values: 'none' | 'mask' | 'crop' | 'compare'
    get activeMode() { return this._activeMode; }
    set activeMode(v) {
        if (this._activeMode === v) return;
        this._activeMode = v;
        this.mask.isMaskingMode          = v === 'mask';
        this.crop.isCroppingMode         = v === 'crop';
        this.comparison.isComparisonMode = v === 'compare';
        this.input.updateCursor();
        this.draw();
        if (this._onModeChange) this._onModeChange(v);
    }

    // ── Public API Proxies ────────────────────────────────────────────────────
    get scale()          { return this.view.scale; }
    set scale(v)         { this.view.scale = v; }
    get offsetX()        { return this.view.offsetX; }
    set offsetX(v)       { this.view.offsetX = v; }
    get offsetY()        { return this.view.offsetY; }
    set offsetY(v)       { this.view.offsetY = v; }
    get isManagedView()  { return this.view.isManagedView; }
    set isManagedView(v) { this.view.isManagedView = v; }
    get maskCanvas()     { return this.mask.maskCanvas; }
    get maskCtx()        { return this.mask.maskCtx; }
    get brushSize()      { return this.mask.brushSize; }
    set brushSize(v)     { this.mask.brushSize = v; }
    get brushType()      { return this.mask.brushType; }
    set brushType(v)     { this.mask.brushType = v; }
    get maskOpacity()    { return this.mask.maskOpacity; }
    set maskOpacity(v)   { this.mask.maskOpacity = v; }
    get maskColor()      { return this.mask.maskColor; }
    set maskColor(v)     { this.mask.maskColor = v; }
    get isMaskingMode()  { return this._activeMode === 'mask'; }
    set isMaskingMode(v) { this.activeMode = v ? 'mask' : 'none'; }
    get isCroppingMode() { return this._activeMode === 'crop'; }
    set isCroppingMode(v){ this.activeMode = v ? 'crop' : 'none'; }
    get imgAfter()       { return this.comparison.imgAfter; }
    set imgAfter(v)      { this.comparison.imgAfter = v; }
    get isComparisonMode()  { return this._activeMode === 'compare'; }
    set isComparisonMode(v) { this.activeMode = v ? 'compare' : 'none'; }
    get sliderPos()      { return this.comparison.sliderPos; }
    set sliderPos(v)     { this.comparison.sliderPos = v; }
    get maskHidden()     { return this._maskHidden; }
    set maskHidden(v)    { this._maskHidden = v; this.draw(); }

    destroy() {
        if (this._processedBitmap) { this._processedBitmap.close?.(); this._processedBitmap = null; }
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.input.destroy();
        this.crop?.destroy?.();
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    async setMaskDataURL(dataUrl) {
        await this.mask.setFromURL(dataUrl);
        this.draw();
    }

    async compositeMaskDataURL(dataUrl) {
        const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = dataUrl;
        });
        this.mask.maskCtx.globalCompositeOperation = 'source-over';
        this.mask.maskCtx.drawImage(img, 0, 0);
        this.draw();
    }

    setProcessedImage(bitmap) {
        if (this._processedBitmap) this._processedBitmap.close?.();
        this._processedBitmap = bitmap;
        this.draw();
    }

    clearProcessedImage() {
        if (this._processedBitmap) { this._processedBitmap.close?.(); this._processedBitmap = null; }
        this.draw();
    }

    clearImage() {
        if (this._processedBitmap) { this._processedBitmap.close?.(); this._processedBitmap = null; }
        this.img = new Image();
        this.img.crossOrigin = 'anonymous';
        this._activeMode = 'none';
        this.mask.isMaskingMode          = false;
        this.crop.isCroppingMode         = false;
        this.comparison.isComparisonMode = false;
        this.draw();
        if (this._onModeChange) this._onModeChange('none');
    }

    async loadImage(url) {
        try {
            await new Promise((resolve, reject) => {
                this.img.onload = resolve;
                this.img.onerror = reject;
                this.img.src = url;
                // Reset all modes atomically before image loads
                this._activeMode = 'none';
                this.mask.isMaskingMode          = false;
                this.crop.isCroppingMode         = false;
                this.comparison.isComparisonMode = false;
                this.canvas.dataset.mediaUrl = url;
                delete this.canvas.dataset.comparisonUrl;
                this.canvas.dataset.sliderPos = '0.5';
            });
            if (this._onModeChange) this._onModeChange('none');

            this.mask.init(this.img.width, this.img.height);
            this.crop.init(this.img.width, this.img.height);
            await this.resetView();
        } catch (err) {
            clientLogger.error('canvas', 'Failed to load image', err);
            throw err;
        }
    }

    async loadComparisonImage(url) {
        await this.comparison.load(url);
        // ComparisonManager.load() sets comparison.isComparisonMode = true internally;
        // sync _activeMode so getter stays consistent, then fire modechange.
        this._activeMode = 'compare';
        this.canvas.dataset.comparisonUrl = url;
        this.input.updateCursor();
        this.draw();
        if (this._onModeChange) this._onModeChange('compare');
    }

    async resetView() {
        await this.view.reset(this.container, this.img);
        this.resize();
        this.draw();
    }

    setGrid(h, v) {
        this.gridH = Math.max(1, h);
        this.gridV = Math.max(1, v);
        this.draw();
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const oldW = this.canvas.width;
        const oldH = this.canvas.height;
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
        this.view.handleResize(oldW, oldH, this.canvas.width, this.canvas.height);
        this.draw();
    }

    draw() {
        if (!this.img || !this.img.width) return;
        if (this.canvas.width === 0 || this.canvas.height === 0) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { scale, offsetX, offsetY } = this.view.getViewState(
            this.canvas.width, this.canvas.height, this.img.width, this.img.height
        );

        this.ctx.save();
        this.ctx.translate(offsetX, offsetY);
        this.ctx.scale(scale, scale);

        // 1. Base Image
        this.ctx.drawImage(this._processedBitmap ?? this.img, 0, 0);

        // 2. Comparison Layer
        if (this.comparison.isComparisonMode && this.comparison.imgAfter.width) {
            this._drawComparisonLayer(scale, offsetX);
        }

        // 3. Mask Layer (skip if hidden, e.g. during latent previews)
        if (!this._maskHidden) {
            this.ctx.globalAlpha = this.mask.maskOpacity;
            this.ctx.drawImage(this.mask.maskCanvas, 0, 0);
            this.ctx.globalAlpha = 1;
        }

        // 4. Crop Overlay
        this.crop.draw(this.ctx, this.img.width, this.img.height, scale);

        // 5. Grid Overlay
        if (this.gridH > 1 || this.gridV > 1) {
            this._drawGridOverlay(scale);
        }

        this.ctx.restore();

        // 6. Slider UI
        if (this.comparison.isComparisonMode) {
            this._drawSliderUI();
        }

        // 7. Brush Indicator
        this._drawBrushIndicator(scale);
    }

    _drawComparisonLayer(scale, offsetX) {
        this.ctx.save();
        const imgAfter = this.comparison.imgAfter;
        const relScale = Math.max(this.img.width / imgAfter.width, this.img.height / imgAfter.height);

        const compW = imgAfter.width  * relScale;
        const compH = imgAfter.height * relScale;
        const compX = (this.img.width  - compW) / 2;
        const compY = (this.img.height - compH) / 2;

        const clipX = ((this.comparison.sliderPos * this.canvas.width) - offsetX) / scale;

        this.ctx.beginPath();
        this.ctx.rect(clipX, 0, this.img.width - clipX, this.img.height);
        this.ctx.clip();
        this.ctx.drawImage(imgAfter, compX, compY, compW, compH);
        this.ctx.restore();
    }

    _drawGridOverlay(scale) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 2 / scale;
        this.ctx.setLineDash([5 / scale, 5 / scale]);
        this.ctx.beginPath();

        for (let i = 1; i < this.gridH; i++) {
            const y = (this.img.height / this.gridH) * i;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.img.width, y);
        }
        for (let i = 1; i < this.gridV; i++) {
            const x = (this.img.width / this.gridV) * i;
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.img.height);
        }
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.lineDashOffset = 5 / scale;
        this.ctx.stroke();
        this.ctx.restore();
    }

    _drawSliderUI() {
        const barX = this.comparison.sliderPos * this.canvas.width;
        this.ctx.save();
        this.ctx.strokeStyle = getCSSColor('--primary');
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(barX, 0);
        this.ctx.lineTo(barX, this.canvas.height);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(barX, this.canvas.height / 2, 16, 0, Math.PI * 2);
        this.ctx.fillStyle = getCSSColor('--primary');
        this.ctx.fill();

        this.ctx.fillStyle = getCSSColor('--text-2');
        this.ctx.beginPath();
        this.ctx.moveTo(barX - 8, this.canvas.height / 2);
        this.ctx.lineTo(barX - 2, this.canvas.height / 2 - 5);
        this.ctx.lineTo(barX - 2, this.canvas.height / 2 + 5);
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.moveTo(barX + 8, this.canvas.height / 2);
        this.ctx.lineTo(barX + 2, this.canvas.height / 2 - 5);
        this.ctx.lineTo(barX + 2, this.canvas.height / 2 + 5);
        this.ctx.fill();
        this.ctx.restore();
    }

    _drawBrushIndicator(scale) {
        const { x, y } = this.input.getMousePosition();
        if (this.mask.isMaskingMode && x !== undefined && !this.input.isSpacePressed) {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(x, y, (this.mask.brushSize * scale) / 2, 0, Math.PI * 2);
            this.ctx.strokeStyle = this.mask.brushType === 'eraser' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(this.input.currentMouseX, this.input.currentMouseY, 1, 0, Math.PI * 2);
            this.ctx.fillStyle = 'white';
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    // ── Masking API ───────────────────────────────────────────────────────────
    setMaskingMode(enabled) { this.activeMode = enabled ? 'mask' : 'none'; }
    setBrushSize(size)      { this.mask.brushSize = Math.max(1, size); this.draw(); }
    setBrushType(type)      { this.mask.brushType = type; }
    flipMaskColor()         { const c = this.mask.flipColor(); this.draw(); return c; }
    setMaskOpacity(opacity) { this.mask.maskOpacity = opacity; this.draw(); }
    clearMask()             { this.mask.clear(); this.draw(); }
    getMaskDataURL(bg = null, fg = null) { return this.mask.getURL(bg, fg); }

    // ── Crop API ──────────────────────────────────────────────────────────────
    setCropRatio(ratio) { this.crop.setRatio(ratio); this.draw(); }
    getCropRect()       { return this.crop.getCropRect(); }
}

// ── ComponentFactory wrapper ──────────────────────────────────────────────────

export const MpiCanvas = ComponentFactory.create({
    name: 'MpiCanvas',
    // No CSS — the canvas fills its container via JS sizing; callers style the wrapper.
    css: [],

    // A single wrapper div; _CanvasCore appends the <canvas> element inside it.
    // width/height:100% ensures the wrapper is sized by its parent, not by its child
    // canvas element — prevents a ResizeObserver feedback loop.
    template: () => `<div class="mpi-canvas" style="width:100%;height:100%;display:block;overflow:hidden;"></div>`,

    setup: (el, props, emit) => {
        const core = new _CanvasCore(el, props, (mode) => emit('modechange', { mode }));

        // Expose full API directly on el so callers use canvas.el.loadImage() etc.
        // Each property/method delegates to the core instance.

        Object.defineProperty(el, 'activeMode', {
            get: () => core.activeMode,
            set: (v) => { core.activeMode = v; },
            configurable: true
        });

        const _proxy = [
            'scale','offsetX','offsetY','isManagedView',
            'maskCanvas','maskCtx','brushSize','brushType',
            'maskOpacity','maskColor','maskHidden','isMaskingMode','isCroppingMode',
            'imgAfter','isComparisonMode','sliderPos',
            'gridH','gridV','img'
        ];
        _proxy.forEach(key => {
            Object.defineProperty(el, key, {
                get: () => core[key],
                set: (v) => { core[key] = v; },
                configurable: true
            });
        });

        const _methods = [
            'destroy','setMaskDataURL','compositeMaskDataURL','clearImage','loadImage','loadComparisonImage',
            'resetView','setGrid','resize','draw','setProcessedImage','clearProcessedImage',
            'setMaskingMode','setBrushSize','setBrushType','flipMaskColor',
            'setMaskOpacity','clearMask','getMaskDataURL',
            'setCropRatio','getCropRect'
        ];
        _methods.forEach(name => { el[name] = core[name].bind(core); });
    }
});
