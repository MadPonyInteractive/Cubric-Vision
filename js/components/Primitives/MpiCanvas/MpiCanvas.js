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
import { qs }               from '../../../utils/dom.js';
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

        // DOM structure: stack holds base + overlay (image-px); screen-ui is container-px
        this.stackEl = qs('.mpi-canvas__stack', container);

        this.baseCanvas = document.createElement('canvas');
        this.baseCanvas.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;';
        this.baseCtx = this.baseCanvas.getContext('2d');
        this.stackEl.appendChild(this.baseCanvas);

        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;';
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.stackEl.appendChild(this.overlayCanvas);

        this.screenUICanvas = qs('.mpi-canvas__screen-ui', container);
        this.screenUICtx = this.screenUICanvas.getContext('2d');

        // Alias for all existing code — unchanged behaviour until to-do 2+
        this.canvas = this.baseCanvas;
        this.ctx    = this.baseCtx;



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
        this._externalBase = null; // set via setBaseCanvas; null = use internal 2D base
        this._baseDirty    = false; // true only when base pixel content changed
        this._overlayDirty = false; // true when mask/crop/grid/comparison overlay changed

        // Grid state
        this.gridH = 1;
        this.gridV = 1;

        this.options = { onDraw: options.onDraw || null, ...options };

        // rAF throttle: one pending frame per draw tier
        this._rafFull    = null;
        this._rafFast    = null;
        this._rafScreen  = null;

        const _schedFull   = () => { if (this._rafFull)   return; this._overlayDirty = true; this._rafFull   = requestAnimationFrame(() => { this._rafFull   = null; this.draw(); }); };
        const _schedFast   = () => { if (this._rafFast)   return; this._rafFast   = requestAnimationFrame(() => { this._rafFast   = null; this._overlayDirty = true; this._renderOverlay(); this._renderScreenUI(); }); };
        const _schedScreen = () => { if (this._rafScreen) return; this._rafScreen = requestAnimationFrame(() => { this._rafScreen = null; this._renderScreenUI(); }); };

        // Orchestrate Input
        this.input = new InputController(
            this.screenUICanvas,
            this.container,
            { view: this.view, mask: this.mask, comparison: this.comparison, crop: this.crop },
            {
                onDraw:     _schedFull,
                onDrawFast: _schedFast,
                onScreenUI: _schedScreen,
                onResetView: () => this.resetView(),
                onMarkOverlayDirty: () => { this._overlayDirty = true; },
                onSliderChange: (pos) => { this.canvas.dataset.sliderPos = pos; this._overlayDirty = true; },
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
        this._overlayDirty = true;
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
    set maskHidden(v)    { this._maskHidden = v; this._overlayDirty = true; this.draw(); }

    destroy() {
        console.log('[mpicanvas] destroyed');
        if (this._rafFull)   { cancelAnimationFrame(this._rafFull);   this._rafFull   = null; }
        if (this._rafFast)   { cancelAnimationFrame(this._rafFast);   this._rafFast   = null; }
        if (this._rafScreen) { cancelAnimationFrame(this._rafScreen); this._rafScreen = null; }
        if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
        this.input?.destroy();
        this.crop?.destroy?.();
        this.mask?.destroy?.();
        this.comparison?.destroy?.();
        if (this._externalBase && this._externalBase.parentNode) {
            this._externalBase.parentNode.removeChild(this._externalBase);
        }
        this._externalBase = null;
        if (this.baseCanvas && this.baseCanvas.parentNode)     { this.baseCanvas.parentNode.removeChild(this.baseCanvas); }
        if (this.overlayCanvas && this.overlayCanvas.parentNode) { this.overlayCanvas.parentNode.removeChild(this.overlayCanvas); }
        if (this.screenUICanvas && this.screenUICanvas.parentNode) { this.screenUICanvas.parentNode.removeChild(this.screenUICanvas); }
        if (this.stackEl && this.stackEl.parentNode)           { this.stackEl.parentNode.removeChild(this.stackEl); }
        this.baseCanvas = this.baseCtx = this.canvas = this.ctx = null;
        this.overlayCanvas = this.overlayCtx = null;
        this.screenUICanvas = this.screenUICtx = null;
        this.stackEl = null;
    }

    async setMaskDataURL(dataUrl) {
        await this.mask.setFromURL(dataUrl);
        this._overlayDirty = true;
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
        this._overlayDirty = true;
        this.draw();
    }

    setBaseCanvas(externalCanvasEl) {
        // Remove previous external base if present
        if (this._externalBase && this._externalBase.parentNode) {
            this._externalBase.parentNode.removeChild(this._externalBase);
        }
        // Hide the internal 2D base canvas
        this.baseCanvas.style.display = 'none';
        this._externalBase = externalCanvasEl;
        externalCanvasEl.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;';
        if (this.img.width) {
            externalCanvasEl.style.width  = this.img.width  + 'px';
            externalCanvasEl.style.height = this.img.height + 'px';
        }
        this.stackEl.insertBefore(externalCanvasEl, this.overlayCanvas);
        console.log('[mpicanvas] base-source', externalCanvasEl.tagName, externalCanvasEl.width, externalCanvasEl.height);
    }

    clearBaseCanvas() {
        if (this._externalBase && this._externalBase.parentNode) {
            this._externalBase.parentNode.removeChild(this._externalBase);
        }
        this._externalBase = null;
        this.baseCanvas.style.display = '';
        this._baseDirty = true;
        console.log('[mpicanvas] base-source', this.baseCanvas.tagName, this.baseCanvas.width, this.baseCanvas.height, '(2D fallback)');
        this.draw();
    }

    clearImage() {
        this.img = new Image();
        this.img.crossOrigin = 'anonymous';
        this._activeMode = 'none';
        this.mask.isMaskingMode          = false;
        this.crop.isCroppingMode         = false;
        this.comparison.isComparisonMode = false;
        this._baseDirty = true;
        this._overlayDirty = true;
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

            const iw = this.img.width;
            const ih = this.img.height;
            this.baseCanvas.width  = iw;  this.baseCanvas.height  = ih;
            this.overlayCanvas.width = iw; this.overlayCanvas.height = ih;
            this.baseCanvas.style.width    = iw + 'px'; this.baseCanvas.style.height    = ih + 'px';
            this.overlayCanvas.style.width = iw + 'px'; this.overlayCanvas.style.height = ih + 'px';
            this.stackEl.style.width  = iw + 'px';
            this.stackEl.style.height = ih + 'px';
            this._baseDirty = true;
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
        this._overlayDirty = true;
        this.draw();
        if (this._onModeChange) this._onModeChange('compare');
    }

    _applyTransform() {
        const { scale, offsetX, offsetY } = this.view;
        this.stackEl.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
    }

    async resetView() {
        await this.view.reset(this.container, this.img);
        this.resize();
        this._applyTransform();
        this._overlayDirty = true;
        this.draw();
    }

    setGrid(h, v) {
        this.gridH = Math.max(1, h);
        this.gridV = Math.max(1, v);
        this._overlayDirty = true;
        this.draw();
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const oldW = this.screenUICanvas.width;
        const oldH = this.screenUICanvas.height;
        this.screenUICanvas.width  = rect.width;
        this.screenUICanvas.height = rect.height;
        this.view.handleResize(oldW, oldH, this.screenUICanvas.width, this.screenUICanvas.height);
        if (this.img && this.img.width) {
            this.view.getViewState(this.screenUICanvas.width, this.screenUICanvas.height, this.img.width, this.img.height);
        }
        this._applyTransform();
        this.draw();
    }

    draw() {
        if (!this.img || !this.img.width) return;
        this._applyTransform();
        this._renderBase();
        this._renderOverlay();
        this._renderScreenUI();
    }

    _renderBase() {
        if (this._externalBase) return; // Pixi self-renders; nothing to do
        if (!this._baseDirty) return;   // pixel content unchanged — skip redraw
        this._baseDirty = false;
        this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        this.baseCtx.drawImage(this.img, 0, 0);
    }

    _renderOverlay() {
        if (!this._overlayDirty) return;
        this._overlayDirty = false;
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        if (this.comparison.isComparisonMode && this.comparison.imgAfter.width) {
            this._drawComparisonLayer();
        }

        if (!this._maskHidden) {
            this.overlayCtx.globalAlpha = this.mask.maskOpacity;
            this.overlayCtx.drawImage(this.mask.maskCanvas, 0, 0);
            this.overlayCtx.globalAlpha = 1;
        }

        this.crop.draw(this.overlayCtx, this.img.width, this.img.height, this.view.scale);

        if (this.gridH > 1 || this.gridV > 1) {
            this._drawGridOverlay();
        }

    }

    _renderScreenUI() {
        const w = this.screenUICanvas.width;
        const h = this.screenUICanvas.height;
        if (w === 0 || h === 0) return;
        this.screenUICtx.clearRect(0, 0, w, h);

        if (this.comparison.isComparisonMode) {
            this._drawSliderUI();
        }
        this._drawBrushIndicator();
    }

    _drawComparisonLayer() {
        this.overlayCtx.save();
        const imgAfter = this.comparison.imgAfter;
        const relScale = Math.max(this.img.width / imgAfter.width, this.img.height / imgAfter.height);

        const compW = imgAfter.width  * relScale;
        const compH = imgAfter.height * relScale;
        const compX = (this.img.width  - compW) / 2;
        const compY = (this.img.height - compH) / 2;

        const clipX = (this.comparison.sliderPos * this.screenUICanvas.width - this.view.offsetX) / this.view.scale;

        this.overlayCtx.beginPath();
        this.overlayCtx.rect(clipX, 0, this.img.width - clipX, this.img.height);
        this.overlayCtx.clip();
        this.overlayCtx.drawImage(imgAfter, compX, compY, compW, compH);
        this.overlayCtx.restore();
    }

    _drawGridOverlay() {
        const s = this.view.scale;
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.overlayCtx.lineWidth = 2 / s;
        this.overlayCtx.setLineDash([5 / s, 5 / s]);
        this.overlayCtx.beginPath();

        for (let i = 1; i < this.gridH; i++) {
            const y = (this.img.height / this.gridH) * i;
            this.overlayCtx.moveTo(0, y);
            this.overlayCtx.lineTo(this.img.width, y);
        }
        for (let i = 1; i < this.gridV; i++) {
            const x = (this.img.width / this.gridV) * i;
            this.overlayCtx.moveTo(x, 0);
            this.overlayCtx.lineTo(x, this.img.height);
        }
        this.overlayCtx.stroke();

        this.overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.overlayCtx.lineDashOffset = 5 / s;
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
    }

    _drawSliderUI() {
        const w = this.screenUICanvas.width;
        const h = this.screenUICanvas.height;
        const barX = this.comparison.sliderPos * w;
        this.screenUICtx.save();
        this.screenUICtx.strokeStyle = getCSSColor('--primary');
        this.screenUICtx.lineWidth = 2;
        this.screenUICtx.beginPath();
        this.screenUICtx.moveTo(barX, 0);
        this.screenUICtx.lineTo(barX, h);
        this.screenUICtx.stroke();

        this.screenUICtx.beginPath();
        this.screenUICtx.arc(barX, h / 2, 16, 0, Math.PI * 2);
        this.screenUICtx.fillStyle = getCSSColor('--primary');
        this.screenUICtx.fill();

        this.screenUICtx.fillStyle = getCSSColor('--text-2');
        this.screenUICtx.beginPath();
        this.screenUICtx.moveTo(barX - 8, h / 2);
        this.screenUICtx.lineTo(barX - 2, h / 2 - 5);
        this.screenUICtx.lineTo(barX - 2, h / 2 + 5);
        this.screenUICtx.fill();

        this.screenUICtx.beginPath();
        this.screenUICtx.moveTo(barX + 8, h / 2);
        this.screenUICtx.lineTo(barX + 2, h / 2 - 5);
        this.screenUICtx.lineTo(barX + 2, h / 2 + 5);
        this.screenUICtx.fill();
        this.screenUICtx.restore();
    }

    _drawBrushIndicator() {
        const { x, y } = this.input.getMousePosition();
        if (this.mask.isMaskingMode && x !== undefined && !this.input.isSpacePressed) {
            const scale = this.view.scale;
            this.screenUICtx.save();
            this.screenUICtx.beginPath();
            this.screenUICtx.arc(x, y, (this.mask.brushSize * scale) / 2, 0, Math.PI * 2);
            this.screenUICtx.strokeStyle = this.mask.brushType === 'eraser' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
            this.screenUICtx.lineWidth = 2;
            this.screenUICtx.stroke();

            this.screenUICtx.beginPath();
            this.screenUICtx.arc(this.input.currentMouseX, this.input.currentMouseY, 1, 0, Math.PI * 2);
            this.screenUICtx.fillStyle = 'white';
            this.screenUICtx.fill();
            this.screenUICtx.restore();
        }
    }

    // ── Masking API ───────────────────────────────────────────────────────────
    setMaskingMode(enabled) { this.activeMode = enabled ? 'mask' : 'none'; }
    setBrushSize(size)      { this.mask.brushSize = Math.max(1, size); this.draw(); }
    setBrushType(type)      { this.mask.brushType = type; }
    flipMaskColor()         { const c = this.mask.flipColor(); this._overlayDirty = true; this.draw(); return c; }
    setMaskOpacity(opacity) { this.mask.maskOpacity = opacity; this._overlayDirty = true; this.draw(); }
    clearMask()             { this.mask.clear(); this._overlayDirty = true; this.draw(); }
    getMaskDataURL(bg = null, fg = null) { return this.mask.getURL(bg, fg); }

    // ── Crop API ──────────────────────────────────────────────────────────────
    setCropRatio(ratio) { this.crop.setRatio(ratio); this._overlayDirty = true; this.draw(); }
    getCropRect()       { return this.crop.getCropRect(); }
}

// ── ComponentFactory wrapper ──────────────────────────────────────────────────

export const MpiCanvas = ComponentFactory.create({
    name: 'MpiCanvas',
    // No CSS — the canvas fills its container via JS sizing; callers style the wrapper.
    css: [],

    template: () => `<div class="mpi-canvas" style="width:100%;height:100%;display:block;overflow:hidden;position:relative;"><div class="mpi-canvas__stack" style="position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;"></div><canvas class="mpi-canvas__screen-ui" style="position:absolute;left:0;top:0;width:100%;height:100%;"></canvas></div>`,

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
            'resetView','setGrid','resize','draw','setBaseCanvas','clearBaseCanvas',
            'setMaskingMode','setBrushSize','setBrushType','flipMaskColor',
            'setMaskOpacity','clearMask','getMaskDataURL',
            'setCropRatio','getCropRect'
        ];
        _methods.forEach(name => { el[name] = core[name].bind(core); });
    }
});
