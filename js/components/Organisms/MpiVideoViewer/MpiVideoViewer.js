/**
 * MpiVideoViewer — Organism: video display with crop-box overlay.
 *
 * Mirrors MpiCanvasViewer role but for video. Internally composes:
 * - MpiVideoSurface (Compound) for the bare <video> + click-to-toggle
 * - An overlay canvas (absolute-positioned) for crop-box drawing
 * - MpiViewerCorners (Compound) for the top-right chip strip
 *
 * Control bar (MpiVideoControlBar) is NOT owned by the viewer. The parent
 * Block mounts it (typically full-width below the viewer row) and wires it
 * via `viewer.el.attachControlBar(controlBarInstance)`. This lets the bar
 * span the full app window like the prompt box, and lets non-video surfaces
 * reuse the bar (e.g. audio-only) without dragging the viewer along.
 *
 * Tool action bars (crop, upscale, interpolate) are owned by the parent Block.
 *
 * @param {number}  [fps=24]         - Frame rate for video playback
 *
 * Instance API (on el):
 *   loadVideo(url, meta = {})              — load video URL; meta may include
 *                                            { fps, duration, frameCount,
 *                                              hasAudio, trim }. fps/frameCount/
 *                                              trim are proxied to the attached
 *                                              control bar when present.
 *   attachControlBar(controlBarInstance)    — wire an external MpiVideoControlBar
 *                                             instance; the bar's attachSurface
 *                                             is called internally.
 *   detachControlBar()                      — drop the attached control bar ref;
 *                                             caller is responsible for the
 *                                             instance's lifetime.
 *   enterCropMode(initialRect = null)       — enable crop overlay
 *   exitCropMode()                          — disable crop overlay
 *   getCropRect()                           — current normalized crop rect
 *   setCropRatio(ratio)                     — aspect ratio lock (null = free)
 *   captureSnapshot({ time }?)              — { blob, dataUrl }
 *   enterUpscaleMode() / exitUpscaleMode()
 *   enterInterpolateMode() / exitInterpolateMode()
 *   setTopRight(items)                      — corner chip strip
 *   resetView()                             — fit video back to stage (zoom=1, no pan)
 *   setGenerating(bool)                     — show/hide spinner (generation flag);
 *                                             OR'd with internal load flag
 *   setLoading(bool)                        — external load flag (rare; loadVideo
 *                                             toggles it automatically off the first
 *                                             loadeddata/error)
 *   getSurfaceInstance()                    — MpiVideoSurface instance (for
 *                                             external attach via factories)
 *   getSourceElement()                      — raw <video> element
 *   destroy()
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate'  — forwarded from MpiVideoSurface
 *   'change'   { volume, muted }            — forwarded from surface volumechange
 *   'loadedmetadata' { duration }           — forwarded from surface
 *   'crop-change' { rect }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiVideoSurface } from '../../Compounds/MpiVideoSurface/MpiVideoSurface.js';
import { MpiViewerCorners } from '../../Compounds/MpiViewerCorners/MpiViewerCorners.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { createCropTool } from '../../../utils/cropTool.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { captureFrameBlob } from '../../../utils/video.js';
import { qs, on } from '../../../utils/dom.js';
import { Events } from '../../../events.js';

export const MpiVideoViewer = ComponentFactory.create({
    name: 'MpiVideoViewer',
    css: ['js/components/Organisms/MpiVideoViewer/MpiVideoViewer.css'],

    template: () => `
        <div class="mpi-video-viewer" data-mode="idle">
            <div class="mpi-video-viewer__stage">
                <div data-mount="surface" class="mpi-video-viewer__player"></div>
                <canvas class="mpi-video-viewer__overlay"></canvas>
                <div class="mpi-video-viewer__spinner" id="spinner-wrap"></div>
                <div class="mpi-video-viewer__corners" id="corners-mount"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        const fps = props.fps ?? 24;
        const _unsubs = [];

        // ── State ────────────────────────────────────────────────────────

        let _surfaceInstance = null;
        let _controlBarInstance = null;
        let _cornersInstance = null;
        let _cropTool = null;
        let _resizeObserver = null;
        let _videoElement = null;
        let _isInCropMode = false;
        let _cropRatio = SOCIAL_RATIOS[0].ratio;

        // ── Surface mount ────────────────────────────────────────────────

        const surfaceMount = qs('[data-mount="surface"]', el);
        _surfaceInstance = MpiVideoSurface.mount(surfaceMount, { fps });

        _surfaceInstance.on('play',           (p) => emit('play',           p));
        _surfaceInstance.on('pause',          (p) => emit('pause',          p));
        _surfaceInstance.on('ended',          (p) => emit('ended',          p));
        _surfaceInstance.on('timeupdate',     (p) => emit('timeupdate',     p));
        _surfaceInstance.on('volumechange',   (p) => emit('change',         p));
        _surfaceInstance.on('loadedmetadata', (p) => emit('loadedmetadata', p));

        _videoElement = _surfaceInstance.el.getVideoElement();

        // ── Spinner ──────────────────────────────────────────────────────
        // Mirrors MpiCanvasViewer: visibility = _isGenerating || _isLoading.
        // _isLoading is internal — flipped on by loadVideo, off by the first
        // loadeddata / error fired by the underlying <video>.
        const spinnerWrap = qs('#spinner-wrap', el);
        MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });

        let _isGenerating = false;
        let _isLoading = false;
        const _syncSpinner = () => {
            spinnerWrap.classList.toggle('mpi-video-viewer__spinner--visible', _isGenerating || _isLoading);
        };
        const _setGeneratingSpinner = (on) => {
            _isGenerating = !!on;
            _syncSpinner();
        };
        const _setLoadingSpinner = (on) => {
            _isLoading = !!on;
            _syncSpinner();
        };

        _unsubs.push(on(_videoElement, 'loadeddata', () => _setLoadingSpinner(false)));
        _unsubs.push(on(_videoElement, 'error',      () => _setLoadingSpinner(false)));

        // ── Top-right chip strip ─────────────────────────────────────────
        _cornersInstance = MpiViewerCorners.mount(qs('#corners-mount', el));

        // ── Overlay canvas setup ─────────────────────────────────────────

        const overlayCanvas = qs('.mpi-video-viewer__overlay', el);
        const stageEl = qs('.mpi-video-viewer__stage', el);
        const playerEl = qs('.mpi-video-viewer__player', el);

        // ── Pan/zoom state ───────────────────────────────────────────────
        // Transform applied to playerEl. Reset on every loadVideo + on dblclick.
        // Disabled while a tool mode is active (crop/upscale/interpolate) to keep
        // overlay hit-testing aligned with the untransformed video rect.
        const _view = { scale: 1, tx: 0, ty: 0 };
        const MIN_SCALE = 1;
        const MAX_SCALE = 10;
        let _panning = false;
        let _panStartX = 0;
        let _panStartY = 0;
        let _panStartTx = 0;
        let _panStartTy = 0;
        let _dragMoved = false;

        const _applyTransform = () => {
            playerEl.style.transform =
                `translate(${_view.tx}px, ${_view.ty}px) scale(${_view.scale})`;
            stageEl.dataset.zoomed = _view.scale > 1.0001 ? 'true' : 'false';
            if (_cropTool && _isInCropMode) _syncOverlayToVideo();
        };

        const _resetView = () => {
            _view.scale = 1;
            _view.tx = 0;
            _view.ty = 0;
            _applyTransform();
        };

        const _toolModeActive = () => el.getAttribute('data-mode') !== 'idle';

        _cropTool = createCropTool({
            overlayCanvas,
            targetElement: _videoElement,
            onChange: (normRect) => {
                emit('crop-change', { rect: normRect });
            },
        });

        const _syncOverlayToVideo = () => {
            const videoRect = _videoElement.getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();

            overlayCanvas.style.left   = (videoRect.left - stageRect.left) + 'px';
            overlayCanvas.style.top    = (videoRect.top  - stageRect.top)  + 'px';
            overlayCanvas.style.width  = videoRect.width  + 'px';
            overlayCanvas.style.height = videoRect.height + 'px';

            overlayCanvas.width  = Math.max(1, Math.round(videoRect.width));
            overlayCanvas.height = Math.max(1, Math.round(videoRect.height));

            _cropTool.redraw?.();
        };

        _resizeObserver = new ResizeObserver(() => {
            if (_cropTool && _isInCropMode) _syncOverlayToVideo();
        });
        _resizeObserver.observe(stageEl);
        _resizeObserver.observe(_videoElement);
        _unsubs.push(() => _resizeObserver?.disconnect());

        _unsubs.push(on(el, 'contextmenu', (e) => {
            e.preventDefault();
            Events.emit('video-viewer:context-menu', { x: e.clientX, y: e.clientY });
        }));

        // ── Zoom (wheel) ────────────────────────────────────────────────
        _unsubs.push(on(stageEl, 'wheel', (e) => {
            if (_toolModeActive()) return;
            e.preventDefault();
            const zoomSpeed = 0.0015;
            const factor = Math.exp(-e.deltaY * zoomSpeed);
            const oldScale = _view.scale;
            const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
            if (newScale === oldScale) return;

            // Zoom around cursor: keep the stage point under the cursor fixed.
            const rect = stageEl.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            // Image point under cursor (in untransformed playerEl coords).
            const ix = (cx - _view.tx) / oldScale;
            const iy = (cy - _view.ty) / oldScale;
            _view.scale = newScale;
            _view.tx = cx - ix * newScale;
            _view.ty = cy - iy * newScale;
            // Snap back to 0,0 at scale 1 to keep video centered when fully fit.
            if (_view.scale <= 1.0001) { _view.tx = 0; _view.ty = 0; }
            _applyTransform();
        }, { passive: false }));

        // ── Pan (mousedown/move/up) — only when zoomed in ───────────────
        _unsubs.push(on(stageEl, 'mousedown', (e) => {
            if (e.button !== 0) return;
            if (_toolModeActive()) return;
            if (_view.scale <= 1.0001) return; // nothing to pan
            _panning = true;
            _dragMoved = false;
            _panStartX = e.clientX;
            _panStartY = e.clientY;
            _panStartTx = _view.tx;
            _panStartTy = _view.ty;
            stageEl.dataset.panning = 'true';
        }));

        const _onWinMove = (e) => {
            if (!_panning) return;
            const dx = e.clientX - _panStartX;
            const dy = e.clientY - _panStartY;
            if (!_dragMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) _dragMoved = true;
            _view.tx = _panStartTx + dx;
            _view.ty = _panStartTy + dy;
            _applyTransform();
        };
        const _onWinUp = () => {
            if (!_panning) return;
            _panning = false;
            stageEl.dataset.panning = 'false';
        };
        window.addEventListener('mousemove', _onWinMove);
        window.addEventListener('mouseup', _onWinUp);
        _unsubs.push(() => window.removeEventListener('mousemove', _onWinMove));
        _unsubs.push(() => window.removeEventListener('mouseup', _onWinUp));

        // Suppress the surface's click-to-toggle when the user actually dragged.
        // Capture-phase so we intercept before MpiVideoSurface's bubble handler.
        _unsubs.push(on(stageEl, 'click', (e) => {
            if (_dragMoved) {
                e.stopPropagation();
                e.preventDefault();
                _dragMoved = false;
            }
        }, true));

        // ── Double-click → fit to window ────────────────────────────────
        _unsubs.push(on(stageEl, 'dblclick', (e) => {
            if (_toolModeActive()) return;
            e.stopPropagation();
            e.preventDefault();
            _resetView();
        }));

        _unsubs.push(on(_videoElement, 'loadedmetadata', () => {
            if (_cropTool && _isInCropMode) {
                _syncOverlayToVideo();
                _cropTool.setRatio(_cropRatio);
            }
        }));

        // ── Instance API ─────────────────────────────────────────────────

        el.attachControlBar = (cbInstance) => {
            if (!cbInstance || _controlBarInstance === cbInstance) return;
            _controlBarInstance = cbInstance;
            try { cbInstance.el.attachSurface(_surfaceInstance); } catch (_) { /* noop */ }
        };

        el.detachControlBar = () => {
            try { _controlBarInstance?.el.detachSurface?.(); } catch (_) { /* noop */ }
            _controlBarInstance = null;
        };

        el.getSurfaceInstance = () => _surfaceInstance;

        el.loadVideo = (url, meta = {}) => {
            if (!url || !_surfaceInstance?.el) return;
            if (meta.fps) {
                _surfaceInstance.el._setFps(meta.fps);
                _controlBarInstance?.el.setFps?.(meta.fps);
            }
            if (meta.frameCount) {
                _surfaceInstance.el._setFrameCount(meta.frameCount);
                _controlBarInstance?.el.setFrameCount?.(meta.frameCount);
            }
            // Persisted trim range — applied after loadedmetadata resets to
            // full clip (control bar listens). One-shot.
            const trim = meta.trim;
            if (trim && Number.isFinite(+trim.in) && Number.isFinite(+trim.out)) {
                _controlBarInstance?.el.setPendingTrim?.(+trim.in, +trim.out);
            } else {
                _controlBarInstance?.el.setPendingTrim?.(null);
            }
            _setLoadingSpinner(true);
            _surfaceInstance.el._setSrc(url);
            _resetView();
        };

        el.setGenerating = (on) => _setGeneratingSpinner(on);
        el.setLoading    = (on) => _setLoadingSpinner(on);

        el.resetView = () => _resetView();

        el.setRangeQuiet = (i, o) => _controlBarInstance?.el.setRangeQuiet?.(i, o);
        el.getRange      = () => _controlBarInstance?.el.getRange?.() ?? null;

        el.setTopRight = (items) => _cornersInstance?.el.setTopRight(items);

        el.enterCropMode = (initialRect = null) => {
            if (_isInCropMode) return;
            _isInCropMode = true;
            el.setAttribute('data-mode', 'crop');

            const rect = initialRect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
            _cropTool.enable(rect);

            _syncOverlayToVideo();

            _cropTool.setRatio(_cropRatio);
        };

        el.exitCropMode = () => {
            if (!_isInCropMode) return;
            _isInCropMode = false;
            el.setAttribute('data-mode', 'idle');
            _cropTool.disable();
        };

        el.getCropRect = () => _cropTool?.getRect?.() ?? null;

        el.setCropRatio = (ratio) => {
            _cropRatio = ratio;
            if (_cropTool && _isInCropMode) _cropTool.setRatio(ratio);
        };

        el.captureSnapshot = async ({ time } = {}) => {
            let rect = { x: 0, y: 0, width: 1, height: 1 };
            if (_isInCropMode) {
                const cropRect = el.getCropRect();
                if (cropRect) {
                    rect = { x: cropRect.x, y: cropRect.y, width: cropRect.w, height: cropRect.h };
                }
            }
            const range = _controlBarInstance?.el.getRange?.();
            let target = Number.isFinite(+time) ? +time : null;
            if (target === null && range && Number.isFinite(+range.in) && Number.isFinite(+range.out)) {
                const cur = _videoElement?.currentTime ?? 0;
                if (cur < range.in || cur > range.out) target = range.in;
            }
            if (target !== null && _videoElement
                && Math.abs((_videoElement.currentTime || 0) - target) > 1e-3) {
                await new Promise(resolve => {
                    const onSeeked = () => {
                        _videoElement.removeEventListener('seeked', onSeeked);
                        resolve();
                    };
                    _videoElement.addEventListener('seeked', onSeeked);
                    _surfaceInstance?.el.seek(target);
                });
            }
            return captureFrameBlob(_videoElement, rect);
        };

        el.getSourceElement = () => _videoElement;

        el.enterUpscaleMode    = () => el.setAttribute('data-mode', 'upscale');
        el.exitUpscaleMode     = () => el.setAttribute('data-mode', 'idle');
        el.enterInterpolateMode = () => el.setAttribute('data-mode', 'interpolate');
        el.exitInterpolateMode  = () => el.setAttribute('data-mode', 'idle');

        let _destroyed = false;
        el.destroy = () => {
            if (_destroyed) return;
            _destroyed = true;
            _unsubs.forEach(fn => fn?.());
            _unsubs.length = 0;
            _resizeObserver?.disconnect();
            _resizeObserver = null;
            // Control bar lifetime is owned externally — only detach the
            // surface reference; do not destroy the instance.
            try { _controlBarInstance?.el.detachSurface?.(); } catch (_) { /* noop */ }
            _controlBarInstance = null;
            _cornersInstance?.el?.destroy?.();
            _cornersInstance?.destroy?.();
            _cornersInstance = null;
            _surfaceInstance?.destroy?.();
            _surfaceInstance = null;
            _cropTool?.destroy?.();
            _cropTool = null;
            _videoElement = null;
        };
    },
});
