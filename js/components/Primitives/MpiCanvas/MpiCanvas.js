/**
 * setProcessedImage / clearProcessedImage audit (to-do 1, 2026-04-28)
 * Post-revert: ZERO consumers in repo (grep `setProcessedImage|clearProcessedImage|_processedBitmap` → no hits in js/).
 * MpiToolOptionsRaw component removed during raw GPU revert; no live caller exists.
 * To-do 4 will (re)introduce the API as forward-compat hook for future raw tool re-add:
 *   setProcessedImage(bitmap)  // bitmap: HTMLImageElement | ImageBitmap | HTMLCanvasElement
 *   clearProcessedImage()
 * _renderBase() will draw (_processedBitmap ?? img) at (0,0), 1:1 native.
 */

/* Stage canvas color constants — JS cannot use CSS vars in per-frame draws.
 * Values mirror the token block in styles/01_base.css — that is the source of
 * truth; update here when a token changes. (NOT docs/redesign/MAPPING.md §9:
 * it is a superseded wave-2.6 proposal whose table drifted from this file.) */
const BRUSH_CURSOR         = 'oklch(0.76 0.17 355)';        /* --accent-heat — paint ring */
const BRUSH_CURSOR_OUTLINE = 'oklch(0.16 0.02 350 / 0.9)';  /* --surface-canvas 90% — the DARK half of the ring */
const BRUSH_ERASER         = 'oklch(0.78 0.14 220)';        /* --accent-frost — erase ring */
const BRUSH_DOT            = 'oklch(0.76 0.17 355)';         /* --accent-heat */
const SLIDER_ARROW         = 'oklch(0.66 0.014 80)';       /* --ink-3 */
const GRID_LINE            = 'oklch(0.95 0.005 80 / 0.8)'; /* --ink-1 80% */
const GRID_LINE_SHADOW     = 'oklch(0.16 0.02 350 / 0.5)'; /* surface-canvas 50% */
const MASK_POINT_POSITIVE  = 'oklch(0.78 0.13 150)';       /* --accent-ok */
const MASK_POINT_NEGATIVE  = 'oklch(0.76 0.17 355)';       /* --accent-heat */
const MASK_POINT_RING      = 'oklch(0.16 0.02 350 / 0.9)'; /* --surface-canvas 90% */
const MASK_INVERT_FILL     = 'oklch(0 0 0)';               /* pure black — invert display */
const MASK_BW_BG           = 'oklch(0 0 0)';               /* B/W view backdrop — mask draws white on it */
const MASK_BW_BG_INVERTED  = 'oklch(1 0 0)';               /* …and white when the display is inverted */
const MASK_AUTO_FILL       = 'oklch(0.78 0.13 150)';       /* --accent-ok, matches the positive dot */

/* Screen-px radius of a point-prompt dot. Purely a display size — the graph gets
 * bare coordinates, and polarity rides in WHICH list a point lands in. */
const MASK_POINT_DRAW_R = 6;

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
 * @param {(count: number) => void} [onPointsChange] - Called when a point prompt is added or removed
 * @param {() => void} [onMaskStrokeEnd] - Called once when a paint/erase stroke finishes
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
 *   setPointsMode(bool)       — point-prompt mode: clicks place SAM dots, not paint
 *   clearMaskPoints() / getMaskPointCount() / getPointsJSON()
 *   bakeAutoPicksInto('manual'|'subtract') — Add / Subtract the detected mask
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
import { AUTO_PIXEL_THRESHOLD } from '../../../state.js';
import { ViewManager }       from './managers/ViewManager.js';
import { MaskManager }       from './managers/MaskManager.js';
import { ComparisonManager } from './managers/ComparisonManager.js';
import { CropManager }       from './managers/CropManager.js';
import { UndoStack }         from './managers/UndoStack.js';
import { InputController }   from './managers/InputController.js';

const getCSSColor = (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

/** True if value is a valid first arg for CanvasRenderingContext2D.drawImage(). */
function _isDrawable(src) {
    if (!src) return false;
    return (src instanceof HTMLImageElement)
        || (src instanceof HTMLVideoElement)
        || (src instanceof HTMLCanvasElement)
        || (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap)
        || (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas);
}

// GPU MAX_TEXTURE_SIZE probe — done once at module load. Fallback 4096.
const MAX_TEXTURE_SIZE = (() => {
    try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return 4096;
        return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    } catch { return 4096; }
})();

// ── Internal canvas engine ────────────────────────────────────────────────────
// Not exported — consumers use MpiCanvas.mount() and talk to instance.el.*

class _CanvasCore {
    constructor(container, options = {}, onModeChange) {
        this.container = container;

        // Stack wrapper (image-native px, transformed via CSS in to-do 5)
        this.stackEl = document.createElement('div');
        this.stackEl.className = 'mpi-canvas__stack';
        this.stackEl.style.position = 'absolute';
        this.stackEl.style.top = '0';
        this.stackEl.style.left = '0';
        this.stackEl.style.transformOrigin = '0 0';
        this.container.appendChild(this.stackEl);

        // Base canvas — image native px (size set in loadImage). Draws img + processed bitmap.
        // image-rendering owned by styles/01_base.css (`html.pixel-mode-*` + stackEl data-zoom-mode).
        this.baseCanvas = document.createElement('canvas');
        this.baseCanvas.dataset.role = 'base';
        this.baseCanvas.style.position = 'absolute';
        this.baseCanvas.style.top = '0';
        this.baseCanvas.style.left = '0';
        this.baseCtx = this.baseCanvas.getContext('2d');
        this.stackEl.appendChild(this.baseCanvas);

        // Overlay canvas — image native px. Mask/crop/grid (transparent).
        // image-rendering owned by styles/01_base.css (`html.pixel-mode-*` + stackEl data-zoom-mode).
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.dataset.role = 'overlay';
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.stackEl.appendChild(this.overlayCanvas);

        // Screen-UI canvas — container px. Brush indicator + slider UI.
        this.screenUICanvas = document.createElement('canvas');
        this.screenUICanvas.dataset.role = 'screen-ui';
        this.screenUICanvas.style.position = 'absolute';
        this.screenUICanvas.style.top = '0';
        this.screenUICanvas.style.left = '0';
        this.screenUICanvas.style.pointerEvents = 'none';
        this.screenUICtx = this.screenUICanvas.getContext('2d');
        this.container.appendChild(this.screenUICanvas);

        // Aliases — keep InputController wiring + dataset reads working.
        this.canvas = this.baseCanvas;
        this.ctx = this.baseCtx;

        // Processed bitmap (forward-compat hook for raw tool re-add).
        this._processedBitmap = null;

        // Comparison playback state — populated when before/after is a video.
        this._videoBefore = null;     // HTMLVideoElement | null
        this._beforeKind  = 'image';  // 'image' | 'video'
        this._beforeFps   = 24;
        this._compareLoop = true;     // loop on by default
        this._compareUserPlaying = false; // true while user-initiated play is active
        this._compareRafId = null;
        this._compareVideoHandlers = []; // [{ video, name, fn }] for teardown

        // State Managers
        this.view       = new ViewManager();
        this.mask       = new MaskManager();
        this.comparison = new ComparisonManager();
        this.crop       = new CropManager();
        // MPI-376: ONE stack for the whole canvas, not one per tool — masking uses
        // it now, MPI-375's paint layer plugs into the same entries later.
        this.undoStack  = new UndoStack();
        this.mask.undo  = this.undoStack;
        this._activeMode = 'none';
        this._onModeChange = onModeChange;
        this._maskHidden = false;

        this.img = new Image();
        this.img.crossOrigin = 'anonymous';

        // Grid state
        this.gridH = 1;
        this.gridV = 1;

        this.options = { onDraw: options.onDraw || null, ...options };

        // Orchestrate Input
        this.input = new InputController(
            this.canvas,
            this.container,
            { view: this.view, mask: this.mask, comparison: this.comparison, crop: this.crop, undo: this.undoStack },
            {
                onDraw: () => { this._applyTransform(); this.draw(); },
                onResetView: () => this.resetView(),
                onSliderChange: (pos) => { this.canvas.dataset.sliderPos = pos; },
                onBrushSizeChange: this.options.onBrushSizeChange,
                onBrushTypeChange: this.options.onBrushTypeChange,
                onPointsChange: this.options.onPointsChange,
                onMaskStrokeEnd: this.options.onMaskStrokeEnd,
                onUndo: () => this.undoMask(),
                onRedo: () => this.redoMask()
            },
            this.stackEl
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
        // Disconnect ResizeObserver FIRST so resize() can't fire during teardown
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this._stopComparePlayback();
        this._teardownBeforeVideo();
        this.input?.destroy?.();
        this.crop?.destroy?.();
        this.mask?.destroy?.();
        // Retained snapshots + the full-size scratch buffers are the biggest thing
        // this component holds after the layers themselves — drop them explicitly.
        this.undoStack?.destroy?.();
        this.comparison?.destroy?.();
        // Zero canvas dims before removal — forces Chromium to release GPU texture backing immediately
        for (const c of [this.baseCanvas, this.overlayCanvas, this.screenUICanvas]) {
            if (c) { c.width = 0; c.height = 0; }
        }
        // Remove all canvases + stack from DOM
        for (const node of [this.baseCanvas, this.overlayCanvas, this.screenUICanvas, this.stackEl]) {
            if (node && node.parentNode) node.parentNode.removeChild(node);
        }
        // Close ImageBitmap if held — GPU memory not released until .close()
        if (this._processedBitmap instanceof ImageBitmap) this._processedBitmap.close();
        this.baseCanvas = null;
        this.overlayCanvas = null;
        this.screenUICanvas = null;
        this.stackEl = null;
        this.baseCtx = null;
        this.overlayCtx = null;
        this.screenUICtx = null;
        this.canvas = null;
        this.ctx = null;
        this.img = null;
        this._processedBitmap = null;
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
        // Write into manual layer; recomposite refreshes display.
        this.mask.manualCtx.globalCompositeOperation = 'source-over';
        this.mask.manualCtx.drawImage(img, 0, 0, this.mask.manualCanvas.width, this.mask.manualCanvas.height);
        this.mask._recomposite();
        this.draw();
    }

    clearImage() {
        this._stopComparePlayback();
        this._teardownBeforeVideo();
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
            if (!this.baseCanvas) throw new Error(`loadImage called on destroyed canvas (url=${url})`);
            // Drop any prior video-before state + ensure this.img is a real Image
            // (loadVideo replaces it with a duck-typed {width,height} stub).
            this._stopComparePlayback();
            this._teardownBeforeVideo();
            if (!(this.img instanceof HTMLImageElement)) {
                this.img = new Image();
                this.img.crossOrigin = 'anonymous';
            }
            await new Promise((resolve, reject) => {
                this.img.onload = resolve;
                this.img.onerror = () => reject(new Error(`Image failed to load: ${url}`));
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
            // Bail if canvas was destroyed during async image load (navigation/teardown race)
            if (!this.img || !this.baseCanvas) return;
            if (this._onModeChange) this._onModeChange('none');

            // Clamp to GPU MAX_TEXTURE_SIZE — prevents lost-context on huge images.
            const imgW = this.img.width;
            const imgH = this.img.height;
            const ratio = Math.min(1, MAX_TEXTURE_SIZE / Math.max(imgW, imgH));
            const clampedW = Math.round(imgW * ratio);
            const clampedH = Math.round(imgH * ratio);

            this._sizeImageCanvases(clampedW, clampedH);

            this.mask.init(this.img.width, this.img.height);
            this.crop.init(this.img.width, this.img.height);
            await this.resetView();
        } catch (err) {
            clientLogger.error('canvas', 'Failed to load image', err);
            throw err;
        }
    }

    async loadComparisonImage(url) {
        this._stopComparePlayback();
        this._teardownAfterVideo();
        await this.comparison.load(url);
        // ComparisonManager.load() sets comparison.isComparisonMode = true internally;
        // sync _activeMode so getter stays consistent, then fire modechange.
        this._activeMode = 'compare';
        this.canvas.dataset.comparisonUrl = url;
        this.input.updateCursor();
        this.draw();
        this._wireComparePlayback();
        if (this._onModeChange) this._onModeChange('compare');
    }

    /**
     * Load a video as the primary "before" media. Sizes canvases to video native px.
     * @param {string} url
     * @param {{ fps?: number }} [opts]
     */
    async loadVideo(url, opts = {}) {
        try {
            if (!this.baseCanvas) throw new Error(`loadVideo called on destroyed canvas (url=${url})`);

            this._teardownBeforeVideo();

            const v = document.createElement('video');
            v.crossOrigin = 'anonymous';
            v.muted = true;
            v.loop = false; // loop handled by ComparisonPlayback
            v.playsInline = true;
            v.preload = 'auto';
            v.src = url;

            await new Promise((resolve, reject) => {
                const onData = () => { cleanup(); resolve(); };
                const onErr  = () => { cleanup(); reject(new Error(`Video failed to load: ${url}`)); };
                const cleanup = () => {
                    v.removeEventListener('loadeddata', onData);
                    v.removeEventListener('error', onErr);
                };
                v.addEventListener('loadeddata', onData);
                v.addEventListener('error', onErr);
            });
            try { v.currentTime = 0; } catch (_) {}

            if (!this.baseCanvas) return; // teardown raced
            this._videoBefore = v;
            this._beforeKind  = 'video';
            this._beforeFps   = opts.fps > 0 ? opts.fps : 24;

            // Mirror loadImage atomic mode reset
            this._activeMode = 'none';
            this.mask.isMaskingMode          = false;
            this.crop.isCroppingMode         = false;
            this.comparison.isComparisonMode = false;
            this.canvas.dataset.mediaUrl = url;
            delete this.canvas.dataset.comparisonUrl;
            this.canvas.dataset.sliderPos = '0.5';
            if (this._onModeChange) this._onModeChange('none');

            // Drive ViewManager.reset (relies on this.img.width/.height). Use a stub Image-like
            // object exposing width/height for ViewManager + a real Image kept on this.img so
            // existing img.width consumers don't crash.
            const w = v.videoWidth;
            const h = v.videoHeight;
            this.img = { width: w, height: h }; // duck-typed for ViewManager.reset

            const ratio = Math.min(1, MAX_TEXTURE_SIZE / Math.max(w, h));
            const clampedW = Math.round(w * ratio);
            const clampedH = Math.round(h * ratio);
            this.baseCanvas.width  = clampedW;
            this.baseCanvas.height = clampedH;
            this.baseCanvas.style.width  = clampedW + 'px';
            this.baseCanvas.style.height = clampedH + 'px';
            this.overlayCanvas.width  = clampedW;
            this.overlayCanvas.height = clampedH;
            this.overlayCanvas.style.width  = clampedW + 'px';
            this.overlayCanvas.style.height = clampedH + 'px';
            this.stackEl.style.width  = clampedW + 'px';
            this.stackEl.style.height = clampedH + 'px';

            await this.resetView();
        } catch (err) {
            clientLogger.error('canvas', 'Failed to load video', err);
            throw err;
        }
    }

    /**
     * Load a video as the "after" comparison media.
     * @param {string} url
     * @param {{ fps?: number }} [opts]
     */
    async loadComparisonVideo(url, opts = {}) {
        this._stopComparePlayback();
        this._teardownAfterVideo();
        await this.comparison.loadVideo(url, opts.fps || 24);
        this._activeMode = 'compare';
        this.canvas.dataset.comparisonUrl = url;
        this.input.updateCursor();
        this.draw();
        this._wireComparePlayback();
        if (this._onModeChange) this._onModeChange('compare');
    }

    // ── Compare playback (image+video / video+video pairs) ────────────────────

    _hasAnyCompareVideo() {
        return this._beforeKind === 'video' || this.comparison.afterKind === 'video';
    }

    _wireComparePlayback() {
        this._teardownCompareVideoHandlers();
        const handlers = [];
        const attach = (video, name) => {
            if (!video || video.tagName !== 'VIDEO') return;
            const onTimeUpdate = () => this._onCompareTick(name);
            const onPlay   = () => this._kickCompareRaf();
            const onPause  = () => { /* rAF self-stops when both paused */ };
            const onEnded  = () => this._onCompareEnded();
            const onSeeked = () => this.draw();
            video.addEventListener('timeupdate', onTimeUpdate);
            video.addEventListener('play',   onPlay);
            video.addEventListener('pause',  onPause);
            video.addEventListener('ended',  onEnded);
            video.addEventListener('seeked', onSeeked);
            handlers.push({ video, name: 'timeupdate', fn: onTimeUpdate });
            handlers.push({ video, name: 'play',   fn: onPlay });
            handlers.push({ video, name: 'pause',  fn: onPause });
            handlers.push({ video, name: 'ended',  fn: onEnded });
            handlers.push({ video, name: 'seeked', fn: onSeeked });
            try { video.currentTime = 0; } catch (_) {}
        };
        attach(this._videoBefore, 'before');
        if (this.comparison.afterKind === 'video') attach(this.comparison.imgAfter, 'after');
        this._compareVideoHandlers = handlers;
    }

    _teardownCompareVideoHandlers() {
        for (const { video, name, fn } of this._compareVideoHandlers) {
            try { video.removeEventListener(name, fn); } catch (_) {}
        }
        this._compareVideoHandlers = [];
    }

    _shorterDuration() {
        const a = this._beforeKind === 'video' ? (this._videoBefore?.duration || 0) : Infinity;
        const b = this.comparison.afterKind === 'video' ? (this.comparison.imgAfter?.duration || 0) : Infinity;
        const d = Math.min(a, b);
        return Number.isFinite(d) ? d : 0;
    }

    _onCompareTick(_name) {
        const dur = this._shorterDuration();
        if (dur > 0) {
            const tBefore = this._beforeKind === 'video' ? (this._videoBefore?.currentTime || 0) : 0;
            const tAfter  = this.comparison.afterKind === 'video' ? (this.comparison.imgAfter?.currentTime || 0) : 0;
            const t = Math.max(tBefore, tAfter);
            if (t >= dur - 0.001) {
                this._onCompareEnded();
                return;
            }
        }
    }

    _onCompareEnded() {
        const shouldLoop = this._compareLoop && this._compareUserPlaying;
        this._pauseBoth();
        this._seekBoth(0);
        if (shouldLoop) {
            // resume in next tick so video.currentTime=0 settles
            requestAnimationFrame(() => this._playBoth());
        } else {
            this._compareUserPlaying = false;
        }
        this.draw();
    }

    _isAnyComparePlaying() {
        if (this._videoBefore && !this._videoBefore.paused) return true;
        if (this.comparison.afterKind === 'video' && this.comparison.imgAfter && !this.comparison.imgAfter.paused) return true;
        return false;
    }

    _playBoth() {
        this._compareUserPlaying = true;
        const dur = this._shorterDuration();
        if (this._videoBefore) {
            if (dur > 0 && this._videoBefore.currentTime >= dur - 0.001) try { this._videoBefore.currentTime = 0; } catch (_) {}
            this._videoBefore.play().catch(() => {});
        }
        if (this.comparison.afterKind === 'video' && this.comparison.imgAfter) {
            if (dur > 0 && this.comparison.imgAfter.currentTime >= dur - 0.001) try { this.comparison.imgAfter.currentTime = 0; } catch (_) {}
            this.comparison.imgAfter.play().catch(() => {});
        }
        this._kickCompareRaf();
    }

    _pauseBoth() {
        try { this._videoBefore?.pause(); } catch (_) {}
        if (this.comparison.afterKind === 'video') {
            try { this.comparison.imgAfter?.pause(); } catch (_) {}
        }
    }

    _seekBoth(t) {
        try { if (this._videoBefore) this._videoBefore.currentTime = t; } catch (_) {}
        if (this.comparison.afterKind === 'video') {
            try { this.comparison.imgAfter.currentTime = t; } catch (_) {}
        }
        this.draw();
    }

    _kickCompareRaf() {
        if (this._compareRafId != null) return;
        const tick = () => {
            this._compareRafId = null;
            if (!this.baseCanvas) return;
            this.draw();
            if (this._isAnyComparePlaying()) {
                this._compareRafId = requestAnimationFrame(tick);
            }
        };
        this._compareRafId = requestAnimationFrame(tick);
    }

    _stopComparePlayback() {
        if (this._compareRafId != null) {
            cancelAnimationFrame(this._compareRafId);
            this._compareRafId = null;
        }
        this._compareUserPlaying = false;
        this._pauseBoth();
        this._teardownCompareVideoHandlers();
    }

    _teardownBeforeVideo() {
        if (this._videoBefore) {
            try { this._videoBefore.pause(); } catch (_) {}
            try { this._videoBefore.removeAttribute('src'); this._videoBefore.load(); } catch (_) {}
            this._videoBefore = null;
        }
        this._beforeKind = 'image';
        this._beforeFps  = 24;
    }

    _teardownAfterVideo() {
        // ComparisonManager.destroy zeroes imgAfter; here we only clear video handlers
        // when re-loading a new comparison media. Pause + detach old video element.
        if (this.comparison.afterKind === 'video' && this.comparison.imgAfter) {
            try { this.comparison.imgAfter.pause(); } catch (_) {}
            try { this.comparison.imgAfter.removeAttribute('src'); this.comparison.imgAfter.load(); } catch (_) {}
        }
    }

    // Public compare playback API
    playCompare()  { if (this._hasAnyCompareVideo()) this._playBoth(); }
    pauseCompare() {
        this._compareUserPlaying = false;
        this._pauseBoth();
        this.draw();
    }
    togglePlayCompare() {
        if (!this._hasAnyCompareVideo()) return;
        if (this._isAnyComparePlaying()) {
            this._compareUserPlaying = false;
            this._pauseBoth();
        } else {
            this._playBoth();
        }
        this.draw();
    }
    /** Step frames on both video sides by the SAME delta-time so paired videos stay
     *  in sync regardless of fps mismatch. Delta = 1/maxFps across all video sides
     *  (highest temporal resolution wins). Clamps at ends, no wrap.
     *  Tracks pending seek time per video so rapid presses accumulate even when
     *  Chromium coalesces in-flight seeks. */
    frameStepCompare(dir = 1) {
        if (!this._hasAnyCompareVideo()) return;
        this._compareUserPlaying = false;
        this._pauseBoth();

        // Highest fps among active video sides — drives the shared step size.
        let maxFps = 1;
        if (this._beforeKind === 'video')         maxFps = Math.max(maxFps, this._beforeFps);
        if (this.comparison.afterKind === 'video') maxFps = Math.max(maxFps, this.comparison.afterFps);
        const step = 1 / Math.max(1, maxFps);

        const stepVideo = (v) => {
            if (!v) return;
            const dur = v.duration || 0;
            const base = (v._pendingSeekTime != null) ? v._pendingSeekTime : v.currentTime;
            let next = base + dir * step;
            next = Math.max(0, Math.min(Math.max(0, dur - 0.0001), next));
            v._pendingSeekTime = next;
            try { v.currentTime = next; } catch (_) {}
            const onSeeked = () => {
                if (Math.abs(v.currentTime - next) < step / 2) v._pendingSeekTime = null;
                v.removeEventListener('seeked', onSeeked);
            };
            v.addEventListener('seeked', onSeeked);
        };
        if (this._videoBefore) stepVideo(this._videoBefore);
        if (this.comparison.afterKind === 'video') stepVideo(this.comparison.imgAfter);
        // seeked handler (in _wireComparePlayback) calls draw() when frame arrives.
    }
    setCompareLoop(on) { this._compareLoop = !!on; }
    getCompareLoop()   { return this._compareLoop; }
    isCompareVideoPair() { return this._hasAnyCompareVideo(); }

    _displayImage() {
        return this.img;
    }

    _sizeImageCanvases(width, height) {
        this.baseCanvas.width  = width;
        this.baseCanvas.height = height;
        this.baseCanvas.style.width  = width + 'px';
        this.baseCanvas.style.height = height + 'px';
        this.overlayCanvas.width  = width;
        this.overlayCanvas.height = height;
        this.overlayCanvas.style.width  = width + 'px';
        this.overlayCanvas.style.height = height + 'px';
        this.stackEl.style.width  = width + 'px';
        this.stackEl.style.height = height + 'px';
    }

    async resetView() {
        await this.view.reset(this.container, this._displayImage());
        this.resize();
        this._applyTransform();
        this.draw();
    }

    _applyTransform() {
        if (!this.stackEl) return;
        this.stackEl.style.transform = this.view.getCSSTransform();
        // Auto-mode zoom hint — CSS only consumes this under `html.pixel-mode-auto`.
        const scale = this.view.scale || 1;
        this.stackEl.dataset.zoomMode = scale >= AUTO_PIXEL_THRESHOLD ? 'pixel' : 'smooth';
    }

    setGrid(h, v) {
        this.gridH = Math.max(1, h);
        this.gridV = Math.max(1, v);
        this.draw();
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        // Base + overlay buffers locked to image-px in loadImage; do NOT touch here.
        const oldW = this.screenUICanvas.width;
        const oldH = this.screenUICanvas.height;
        this.screenUICanvas.width  = rect.width;
        this.screenUICanvas.height = rect.height;
        this.screenUICanvas.style.width  = rect.width  + 'px';
        this.screenUICanvas.style.height = rect.height + 'px';
        const display = this._displayImage();
        if (this.view.isManagedView && display && display.width) {
            this.view.refit(rect.width, rect.height, display.width, display.height, this.crop.getFitBox());
        } else {
            this.view.handleResize(oldW, oldH, rect.width, rect.height);
        }
        this._applyTransform();
        this.draw();
    }

    draw() {
        const display = this._displayImage();
        if (!display || !display.width) return;
        if (this.baseCanvas.width === 0 || this.baseCanvas.height === 0) return;
        this._refitForCrop(display);
        this._renderBase();
        this._renderOverlay();
        this._renderScreenUI();
    }

    /**
     * A crop rect bigger than the image would sit half off-screen under the
     * managed fit, so while cropping the view frames image ∪ crop instead
     * (MPI-383).
     *
     * NEVER while dragging: the scale is what maps the cursor to image space,
     * so changing it mid-gesture makes the rect chase the pointer. The zoom
     * settles on release instead. A user who has panned or zoomed dropped
     * managed view already and keeps their own framing.
     */
    _refitForCrop(display) {
        if (!this.view.isManagedView || this.crop.isDragging) return;
        const box = this.crop.getFitBox();
        const rect = this.container.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.view.refit(rect.width, rect.height, display.width, display.height, box);
        this._applyTransform();
    }

    _renderBase() {
        const ctx = this.baseCtx;
        ctx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        const src = (this._beforeKind === 'video' && this._videoBefore)
            ? this._videoBefore
            : (this._processedBitmap || this.img);
        if (!_isDrawable(src)) return;
        ctx.drawImage(src, 0, 0, this.baseCanvas.width, this.baseCanvas.height);
    }

    _renderOverlay() {
        const ctx = this.overlayCtx;
        const W = this.overlayCanvas.width;
        const H = this.overlayCanvas.height;
        ctx.clearRect(0, 0, W, H);

        // 1. Comparison clip layer (image-px math; overlay ctx un-transformed)
        if (this.comparison.isComparisonMode && this.comparison.afterWidth) {
            this._drawComparisonLayer();
        }

        // 2. Mask
        if (!this._maskHidden) {
            // B/W view (MPI-381): the mask ALONE, opaque, on a flat background —
            // stray specks are invisible as a 70%-alpha tint over a busy image.
            // Opacity is deliberately ignored here rather than producing grey
            // mush; invert still applies, so the two together show exactly what
            // gets exported. The green auto layer below still draws on top.
            if (this.mask.bwView) {
                ctx.globalAlpha = 1;
                ctx.fillStyle = this.mask.displayInverted ? MASK_BW_BG_INVERTED : MASK_BW_BG;
                ctx.fillRect(0, 0, W, H);
            } else {
                ctx.globalAlpha = this.mask.maskOpacity;
            }
            if (this.mask.displayInverted) {
                ctx.drawImage(this._recolorMaskLayer(this.mask.maskCanvas, MASK_INVERT_FILL, W, H), 0, 0);
            } else {
                ctx.drawImage(this.mask.maskCanvas, 0, 0, W, H);
            }
            // The DETECTED subset, recolored on top of the same pixels the union
            // above already drew — otherwise a detection landing inside an
            // already-painted area is invisible and the user cannot see what the
            // run returned. DISPLAY ONLY: every export still reads maskCanvas.
            if (this.mask.hasAutoLayer) {
                ctx.drawImage(this._recolorMaskLayer(this.mask.autoCanvas, MASK_AUTO_FILL, W, H), 0, 0);
            }
            ctx.globalAlpha = 1;
        }

        // 2b. Point prompts — drawn above the mask so a dot stays visible on top
        // of the region it produced.
        if (this.mask.pointsMode && this.mask.points.length) this._drawMaskPoints();

        // 3. Crop overlay draws on the SCREEN canvas (_renderScreenUI) — the
        // rect may leave the image, which this image-sized canvas cannot show.

        // 4. Grid
        if (this.gridH > 1 || this.gridV > 1) {
            this._drawGridOverlay();
        }
    }

    _renderScreenUI() {
        const ctx = this.screenUICtx;
        ctx.clearRect(0, 0, this.screenUICanvas.width, this.screenUICanvas.height);
        if (this.comparison.isComparisonMode) this._drawSliderUI();
        const display = this._displayImage();
        this.crop.drawScreen(ctx, this.view, display?.width || 0, display?.height || 0);
        this._drawBrushIndicator();
    }

    _drawComparisonLayer() {
        const ctx = this.overlayCtx;
        const imgAfter = this.comparison.imgAfter;
        if (!imgAfter) return;

        const afterW = this.comparison.afterWidth;
        const afterH = this.comparison.afterHeight;
        if (!afterW || !afterH) return;

        const baseW = this.baseCanvas.width;
        const baseH = this.baseCanvas.height;

        ctx.save();
        const relScale = Math.max(baseW / afterW, baseH / afterH);
        const compW = afterW * relScale;
        const compH = afterH * relScale;
        const compX = (baseW - compW) / 2;
        const compY = (baseH - compH) / 2;

        // sliderPos is a fraction of the CONTAINER (screen space) so the split bar
        // stays fixed while the image pans/zooms under it. Overlay ctx is un-transformed
        // image-px, so convert: screen bar x → image-px via the inverse view transform.
        const rect = this.container.getBoundingClientRect();
        const sliderScreenX = this.comparison.sliderPos * rect.width;
        const clipX = (sliderScreenX - this.view.offsetX) / (this.view.scale || 1);

        ctx.beginPath();
        ctx.rect(clipX, 0, baseW - clipX, baseH);
        ctx.clip();
        ctx.drawImage(imgAfter, compX, compY, compW, compH);
        ctx.restore();
    }

    /** Recolor a mask layer's opaque pixels to `color`, via a scratch buffer so
     *  the source-atop fill cannot touch what is already on the overlay (the
     *  comparison layer draws first). The buffer is reused across frames AND
     *  across both calls in one frame — safe because drawImage copies
     *  synchronously before the next call overwrites it. */
    _recolorMaskLayer(src, color, W, H) {
        const buf = this._maskTintBuf || (this._maskTintBuf = document.createElement('canvas'));
        if (buf.width !== W || buf.height !== H) { buf.width = W; buf.height = H; }
        const bctx = buf.getContext('2d');
        bctx.clearRect(0, 0, W, H);
        bctx.drawImage(src, 0, 0, W, H);
        bctx.globalCompositeOperation = 'source-atop';
        bctx.fillStyle = color;
        bctx.fillRect(0, 0, W, H);
        bctx.globalCompositeOperation = 'source-over';
        return buf;
    }

    /** Point prompts. Overlay ctx is image-px, so divide by scale to keep the
     *  dots a constant size on screen at any zoom. */
    _drawMaskPoints() {
        const ctx = this.overlayCtx;
        const s = this.view.scale || 1;
        const r = MASK_POINT_DRAW_R / s;
        ctx.save();
        ctx.lineWidth = 2 / s;
        ctx.strokeStyle = MASK_POINT_RING;
        for (const p of this.mask.points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = p.positive ? MASK_POINT_POSITIVE : MASK_POINT_NEGATIVE;
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawGridOverlay() {
        const ctx = this.overlayCtx;
        const scale = this.view.scale || 1;
        const display = this._displayImage();
        ctx.save();
        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.beginPath();

        for (let i = 1; i < this.gridH; i++) {
            const y = (display.height / this.gridH) * i;
            ctx.moveTo(0, y);
            ctx.lineTo(display.width, y);
        }
        for (let i = 1; i < this.gridV; i++) {
            const x = (display.width / this.gridV) * i;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, display.height);
        }
        ctx.stroke();

        ctx.strokeStyle = GRID_LINE_SHADOW;
        ctx.lineDashOffset = 5 / scale;
        ctx.stroke();
        ctx.restore();
    }

    _drawSliderUI() {
        const ctx = this.screenUICtx;
        const W = this.screenUICanvas.width;
        const H = this.screenUICanvas.height;
        // Screen-space bar: fixed fraction of the container, independent of pan/zoom.
        const barX = this.comparison.sliderPos * W;
        ctx.save();
        ctx.strokeStyle = BRUSH_CURSOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(barX, 0);
        ctx.lineTo(barX, H);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(barX, H / 2, 16, 0, Math.PI * 2);
        ctx.fillStyle = BRUSH_CURSOR;
        ctx.fill();

        ctx.fillStyle = SLIDER_ARROW;
        ctx.beginPath();
        ctx.moveTo(barX - 8, H / 2);
        ctx.lineTo(barX - 2, H / 2 - 5);
        ctx.lineTo(barX - 2, H / 2 + 5);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(barX + 8, H / 2);
        ctx.lineTo(barX + 2, H / 2 - 5);
        ctx.lineTo(barX + 2, H / 2 + 5);
        ctx.fill();
        ctx.restore();
    }

    _drawBrushIndicator() {
        const ctx = this.screenUICtx;
        const scale = this.view.scale || 1;
        const { x, y } = this.input.getMousePosition();
        if (this.mask.pointsMode) return;    // dots, not a brush — nothing to indicate
        if (!this.mask.paintEnabled) return; // brushless mask tool (MPI-381)
        if (this.mask.isMaskingMode && x !== undefined && !this.input.isSpacePressed) {
            const r = (this.mask.brushSize * scale) / 2;
            const accent = this.mask.brushType === 'eraser' ? BRUSH_ERASER : BRUSH_CURSOR;
            ctx.save();
            // Two-tone ring, same trick as _drawGridOverlay(): one accent pass, one
            // dark pass offset half a period, so the dashes interleave. A single
            // colour is invisible against a background of its own hue — which is
            // exactly how the eraser (drawn in --surface-canvas) vanished on black.
            // Equal halves + offset = period/2 tiles the ring completely; change one
            // and the other must follow or bare arcs open up.
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = accent;
            ctx.stroke();
            ctx.lineDashOffset = 4;
            ctx.strokeStyle = BRUSH_CURSOR_OUTLINE;
            ctx.stroke();
            // Centre dot — accent fill inside a dark ring, as _drawMaskPoints() does,
            // so it survives a light background too. Both dash settings must reset.
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = BRUSH_CURSOR_OUTLINE;
            ctx.stroke();
            ctx.restore();
        }
    }

    // ── Processed bitmap API (forward-compat hook for raw tool re-add) ────────
    setProcessedImage(bitmap) {
        this._processedBitmap = bitmap || null;
        this.draw();
    }
    clearProcessedImage() {
        this._processedBitmap = null;
        this.draw();
    }

    // ── Masking API ───────────────────────────────────────────────────────────
    setMaskingMode(enabled) { this.activeMode = enabled ? 'mask' : 'none'; }
    setBrushSize(size)      { this.mask.brushSize = Math.max(1, size); this.draw(); }
    setBrushType(type)      { this.mask.brushType = type; }
    flipMaskColor()         { const c = this.mask.flipColor(); this.draw(); return c; }
    setMaskInverted(v)      { this.mask.displayInverted = !!v; this.draw(); }
    isMaskInverted()        { return !!this.mask.displayInverted; }
    setMaskBwView(v)        { this.mask.bwView = !!v; this.draw(); }
    isMaskBwView()          { return !!this.mask.bwView; }
    setMaskPaintEnabled(v)  { this.mask.paintEnabled = !!v; this.draw(); }
    setMaskOpacity(opacity) { this.mask.maskOpacity = opacity; this.draw(); }
    clearMask()             { this.mask.clear(); this.draw(); }

    // ── Undo API (MPI-376) ────────────────────────────────────────────────────

    /**
     * Restore the source layers, then re-derive. `onMaskStrokeEnd` is reused
     * deliberately: an undo IS a mask change, and that callback is the viewer's
     * one publish path (_publishMaskState → evaluateMask → mask-ready), so the op
     * strip locks and unlocks on an undo exactly as it does on a stroke.
     * @returns {boolean} true when something was undone
     */
    undoMask() { return this._applyUndo(this.undoStack.undo()); }
    /** @returns {boolean} true when something was redone */
    redoMask() { return this._applyUndo(this.undoStack.redo()); }
    _applyUndo(ok) {
        if (!ok) return false;
        this.mask.refresh();
        this.draw();
        this.options.onMaskStrokeEnd?.();
        return true;
    }
    /** Drop history without touching pixels — for a LOAD that replaces the layers. */
    clearMaskUndo()         { this.undoStack.clear(); }
    canUndoMask()           { return this.undoStack.canUndo(); }
    canRedoMask()           { return this.undoStack.canRedo(); }
    /**
     * Retained-pixel readout. Memory is the binding constraint on this stack, so
     * the cost has to be observable rather than assumed — this is what the depth
     * and per-entry figures in docs/masking-undo.md were measured with.
     * @returns {{depth:number, bytes:number, lastEntryBytes:number}}
     */
    getUndoStats()          { return { depth: this.undoStack.depth, bytes: this.undoStack.bytes, lastEntryBytes: this.undoStack.lastEntryBytes }; }
    getMaskDataURL(bg = null, fg = null) { return this.mask.getURL(bg, fg); }
    getManualURL()          { return this.mask.getManualURL(); }
    getSubtractURL()        { return this.mask.getSubtractURL(); }
    async setManualFromDataURL(url)   { await this.mask.setManualFromDataURL(url); this.draw(); }
    async setSubtractFromDataURL(url) { await this.mask.setSubtractFromDataURL(url); this.draw(); }
    setAutoPickMasks(map)        { this.mask.setAutoPickMasks(map); this.draw(); }
    setSelectedAutoPicks(set)    { this.mask.setSelectedAutoPicks(set); this.draw(); }
    clearAutoPicks()             { this.mask.clearAutoPicks(); this.draw(); }
    bakeAutoPicksInto(target)    { const ok = this.mask.bakeAutoPicksInto(target); this.draw(); return ok; }

    // ── Point-prompt API (MPI-361) ────────────────────────────────────────────
    setPointsMode(enabled)       { this.mask.pointsMode = !!enabled; this.draw(); }
    isPointsMode()               { return !!this.mask.pointsMode; }
    clearMaskPoints()            { this.mask.clearPoints(); this.draw(); }
    getMaskPointCount()          { return this.mask.points.length; }
    getPointsJSON()              { return this.mask.getPointsJSON(); }

    // ── Crop API ──────────────────────────────────────────────────────────────
    setCropRatio(ratio) { this.crop.setRatio(ratio); this.draw(); }
    /** RESOLUTION mode: seed the rect at exactly w×h image px, centred (MPI-383). */
    setCropSize(w, h)   { this.crop.setExactSize(w, h); this.draw(); }
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
    template: () => `<div class="mpi-canvas" style="position:relative;width:100%;height:100%;display:block;overflow:hidden;"></div>`,

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
            'gridH','gridV','img','mask'
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
            'loadVideo','loadComparisonVideo',
            'playCompare','pauseCompare','togglePlayCompare','frameStepCompare',
            'setCompareLoop','getCompareLoop','isCompareVideoPair',
            'resetView','setGrid','resize','draw',
            'setMaskingMode','setBrushSize','setBrushType','flipMaskColor',
            'setMaskInverted','isMaskInverted','setMaskBwView','isMaskBwView','setMaskPaintEnabled',
            'setMaskOpacity','clearMask','getMaskDataURL',
            'getManualURL','getSubtractURL','setManualFromDataURL','setSubtractFromDataURL',
            'setAutoPickMasks','setSelectedAutoPicks','clearAutoPicks','bakeAutoPicksInto',
            'undoMask','redoMask','clearMaskUndo','canUndoMask','canRedoMask','getUndoStats',
            'setPointsMode','isPointsMode','clearMaskPoints','getMaskPointCount','getPointsJSON',
            // ALLOWLIST — a core method missing here is `undefined` on el, and the
            // caller dies with "not a function" nowhere near this file.
            'setCropRatio','setCropSize','getCropRect',
            'setProcessedImage','clearProcessedImage'
        ];
        _methods.forEach(name => { el[name] = core[name].bind(core); });
    }
});
