/**
 * interactiveCanvas.js
 * A lightweight vanilla JS class to manage an interactive image viewer on a canvas.
 * Now modularized into sub-managers (View, Mask, Comparison, Input).
 */

import { ViewManager } from './interactiveCanvas/ViewManager.js';
import { MaskManager } from './interactiveCanvas/MaskManager.js';
import { ComparisonManager } from './interactiveCanvas/ComparisonManager.js';
import { InputController } from './interactiveCanvas/InputController.js';

export class InteractiveCanvas {
    constructor(container, options = {}) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // State Managers
        this.view = new ViewManager();
        this.mask = new MaskManager();
        this.comparison = new ComparisonManager();

        this.img = new Image();
        this.img.crossOrigin = "anonymous";
        
        // Grid state (simple enough to keep here or move to a lightweight helper)
        this.gridH = 1;
        this.gridV = 1;

        this.options = {
            onDraw: options.onDraw || null,
            ...options
        };

        // Orchestrate Input
        this.input = new InputController(
            this.canvas, 
            this.container, 
            { view: this.view, mask: this.mask, comparison: this.comparison },
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

    // --- Public Getters (Legacy Proxy) ---
    get scale() { return this.view.scale; }
    set scale(v) { this.view.scale = v; }
    get offsetX() { return this.view.offsetX; }
    set offsetX(v) { this.view.offsetX = v; }
    get offsetY() { return this.view.offsetY; }
    set offsetY(v) { this.view.offsetY = v; }
    get isManagedView() { return this.view.isManagedView; }
    set isManagedView(v) { this.view.isManagedView = v; }
    get maskCanvas() { return this.mask.maskCanvas; }
    get maskCtx() { return this.mask.maskCtx; }
    get brushSize() { return this.mask.brushSize; }
    set brushSize(v) { this.mask.brushSize = v; }
    get brushType() { return this.mask.brushType; }
    set brushType(v) { this.mask.brushType = v; }
    get maskOpacity() { return this.mask.maskOpacity; }
    set maskOpacity(v) { this.mask.maskOpacity = v; }
    get maskColor() { return this.mask.maskColor; }
    set maskColor(v) { this.mask.maskColor = v; }
    get isMaskingMode() { return this.mask.isMaskingMode; }
    set isMaskingMode(v) { this.mask.isMaskingMode = v; }
    get imgAfter() { return this.comparison.imgAfter; }
    set imgAfter(v) { this.comparison.imgAfter = v; }
    get isComparisonMode() { return this.comparison.isComparisonMode; }
    set isComparisonMode(v) { this.comparison.isComparisonMode = v; }
    get sliderPos() { return this.comparison.sliderPos; }
    set sliderPos(v) { this.comparison.sliderPos = v; }

    destroy() {
        console.log('[InteractiveCanvas] Destroying instance and removing listeners...');
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.input.destroy();
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    async setMaskDataURL(dataUrl) {
        await this.mask.setFromURL(dataUrl);
        this.draw();
        console.log('[InteractiveCanvas] Mask loaded and drawn');
    }

    clearImage() {
        this.img = new Image();
        this.img.crossOrigin = "anonymous";
        this.comparison.isComparisonMode = false;
        this.draw();
    }

    async loadImage(url) {
        try {
            await new Promise((resolve, reject) => {
                this.img.onload = resolve;
                this.img.onerror = reject;
                this.img.src = url;
                this.comparison.isComparisonMode = false;
                this.canvas.dataset.mediaUrl = url;
                delete this.canvas.dataset.comparisonUrl;
                this.canvas.dataset.sliderPos = '0.5';
            });

            this.mask.init(this.img.width, this.img.height);
            await this.resetView();
        } catch (err) {
            console.error('[InteractiveCanvas] Failed to load image:', err);
            throw err;
        }
    }

    async loadComparisonImage(url) {
        await this.comparison.load(url);
        this.canvas.dataset.comparisonUrl = url;
        this.draw();
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
        this.canvas.width = rect.width;
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
        this.ctx.drawImage(this.img, 0, 0);

        // 2. Comparison Layer
        if (this.comparison.isComparisonMode && this.comparison.imgAfter.width) {
            this._drawComparisonLayer(scale, offsetX);
        }
        
        // 3. Mask Layer
        this.ctx.globalAlpha = this.mask.maskOpacity;
        this.ctx.drawImage(this.mask.maskCanvas, 0, 0);

        // 4. Grid Overlay
        if (this.gridH > 1 || this.gridV > 1) {
            this._drawGridOverlay(scale);
        }

        this.ctx.restore();

        // 5. Slider UI
        if (this.comparison.isComparisonMode) {
            this._drawSliderUI();
        }

        // 6. Brush Indicator
        this._drawBrushIndicator(scale);
    }

    _drawComparisonLayer(scale, offsetX) {
        this.ctx.save();
        const imgAfter = this.comparison.imgAfter;
        const relScale = Math.max(this.img.width / imgAfter.width, this.img.height / imgAfter.height);
        
        const compW = imgAfter.width * relScale;
        const compH = imgAfter.height * relScale;
        const compX = (this.img.width - compW) / 2;
        const compY = (this.img.height - compH) / 2;

        const clipX = ( (this.comparison.sliderPos * this.canvas.width) - offsetX ) / scale;
        
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
        this.ctx.strokeStyle = 'var(--primary, #9a82bb)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(barX, 0);
        this.ctx.lineTo(barX, this.canvas.height);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(barX, this.canvas.height / 2, 16, 0, Math.PI * 2);
        this.ctx.fillStyle = 'var(--primary, #9a82bb)';
        this.ctx.fill();
        
        this.ctx.fillStyle = '#000';
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
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.arc(this.input.currentMouseX, this.input.currentMouseY, 1, 0, Math.PI * 2);
            this.ctx.fillStyle = 'white';
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    // --- Masking API Proxies ---
    setMaskingMode(enabled) { 
        this.mask.isMaskingMode = enabled; 
        this.input.updateCursor();
        this.draw();
    }
    setBrushSize(size) { this.mask.brushSize = Math.max(1, size); this.draw(); }
    setBrushType(type) { this.mask.brushType = type; }
    flipMaskColor() { const color = this.mask.flipColor(); this.draw(); return color; }
    setMaskOpacity(opacity) { this.mask.maskOpacity = opacity; this.draw(); }
    clearMask() { this.mask.clear(); this.draw(); }
    getMaskDataURL(bg = null, fg = null) { return this.mask.getURL(bg, fg); }
}
