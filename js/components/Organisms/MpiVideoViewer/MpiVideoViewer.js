/**
 * MpiVideoViewer — Organism: video display with crop-box overlay.
 *
 * Mirrors MpiCanvasViewer role but for video. Internally composes:
 * - MpiVideoSurface (Compound) for the bare <video> + click-to-toggle
 * - MpiVideoControlBar (Compound) for transport + embedded MpiTrimBar
 * - An overlay canvas (absolute-positioned) for crop-box drawing
 *
 * Tool action bars (crop, upscale, interpolate) are owned by the parent Block,
 * not this viewer. Viewer only owns display + crop overlay state.
 *
 * @param {number} [fps=24]        - Frame rate for video playback
 * @param {boolean} [controls=true] - Show video player controls
 *
 * Instance API (on el):
 *   loadVideo(url, meta = {})         — load video URL; meta may include { fps, duration, frameCount, hasAudio }
 *   enterCropMode(initialRect = null) — enable crop overlay; initialRect normalized [0..1] or default center rect
 *   exitCropMode()                    — disable crop overlay
 *   getCropRect()                     — returns current normalized crop rect { x, y, w, h }
 *   setCropRatio(ratio)               — set aspect ratio lock (null = free)
 *   captureSnapshot({ time }?)        — returns { blob, dataUrl }; optional `time` seeks first; clamps playhead to active range otherwise
 *   enterUpscaleMode()                — set data-mode="upscale" (visual state for parent)
 *   exitUpscaleMode()                 — reset data-mode="idle"
 *   enterInterpolateMode()            — set data-mode="interpolate"
 *   exitInterpolateMode()             — reset data-mode="idle"
 *   setTopRight(items)                — set corner chip strip (see MpiViewerCorners props)
 *   destroy()                         — clean up surface, control bar, cropTool, observers, listeners
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate' — forwarded from MpiVideoSurface
 *   'change'   { volume, muted }            — forwarded from MpiVideoSurface 'volumechange'
 *   'loop-change' { loop }                  — forwarded from MpiVideoControlBar
 *   'crop-change' { rect }                  — crop rect changed (on cropTool onChange)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiVideoSurface } from '../../Compounds/MpiVideoSurface/MpiVideoSurface.js';
import { MpiVideoControlBar } from '../../Compounds/MpiVideoControlBar/MpiVideoControlBar.js';
import { MpiViewerCorners } from '../../Compounds/MpiViewerCorners/MpiViewerCorners.js';
import { createCropTool } from '../../../utils/cropTool.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { captureFrameBlob } from '../../../utils/Video.js';
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
                <div class="mpi-video-viewer__corners" id="corners-mount"></div>
            </div>
            <div class="mpi-video-viewer__timeline" data-mount="control-bar"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const fps = props.fps ?? 24;
        const controls = props.controls !== false;
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

        // ── Surface + control bar mounts ─────────────────────────────────

        const surfaceMount = qs('[data-mount="surface"]', el);
        _surfaceInstance = MpiVideoSurface.mount(surfaceMount, { fps });

        if (controls) {
            const controlBarMount = qs('[data-mount="control-bar"]', el);
            _controlBarInstance = MpiVideoControlBar.mount(controlBarMount, { fps });
            _controlBarInstance.el.attachSurface(_surfaceInstance);
        }

        // Forward the same six external events the viewer used to emit.
        // 5 from surface, loop-change from control bar. 'change' (volume/mute)
        // synthesised from surface 'volumechange' to keep the legacy contract.
        _surfaceInstance.on('play',           (p) => emit('play',           p));
        _surfaceInstance.on('pause',          (p) => emit('pause',          p));
        _surfaceInstance.on('ended',          (p) => emit('ended',          p));
        _surfaceInstance.on('timeupdate',     (p) => emit('timeupdate',     p));
        _surfaceInstance.on('volumechange',   (p) => emit('change',         p));
        _surfaceInstance.on('loadedmetadata', (p) => emit('loadedmetadata', p));
        _controlBarInstance?.on('loop-change',  (p) => emit('loop-change',  p));
        _controlBarInstance?.on('range-change', (p) => emit('range-change', p));

        _videoElement = _surfaceInstance.el.getVideoElement();

        // ── Top-right chip strip ─────────────────────────────────────────
        _cornersInstance = MpiViewerCorners.mount(qs('#corners-mount', el));

        // ── Overlay canvas setup ─────────────────────────────────────────

        const overlayCanvas = qs('.mpi-video-viewer__overlay', el);
        const stageEl = qs('.mpi-video-viewer__stage', el);

        _cropTool = createCropTool({
            overlayCanvas,
            targetElement: _videoElement,
            onChange: (normRect) => {
                emit('crop-change', { rect: normRect });
            },
        });

        // ── Sync overlay canvas to video element's rendered bounding rect ─

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

        // ── Resize observer ──────────────────────────────────────────────

        _resizeObserver = new ResizeObserver(() => {
            if (_cropTool && _isInCropMode) _syncOverlayToVideo();
        });
        _resizeObserver.observe(stageEl);
        _resizeObserver.observe(_videoElement);
        _unsubs.push(() => _resizeObserver?.disconnect());

        // Right-click anywhere on the viewer (including crop overlay) emits
        // `video-viewer:context-menu`. Bound on the viewer root in capture
        // phase so the crop overlay canvas can't preempt with native menu.
        _unsubs.push(on(el, 'contextmenu', (e) => {
            e.preventDefault();
            Events.emit('video-viewer:context-menu', { x: e.clientX, y: e.clientY });
        }));

        _unsubs.push(on(_videoElement, 'loadedmetadata', () => {
            if (_cropTool && _isInCropMode) {
                _syncOverlayToVideo();
                // Re-apply ratio now that intrinsic videoWidth/Height are known
                _cropTool.setRatio(_cropRatio);
            }
        }));

        // ── Instance API ─────────────────────────────────────────────────

        el.loadVideo = (url, meta = {}) => {
            if (!url || !_surfaceInstance?.el) return;
            if (meta.fps) {
                _surfaceInstance.el._setFps(meta.fps);
                _controlBarInstance?.el.setFps(meta.fps);
            }
            if (meta.frameCount) {
                _surfaceInstance.el._setFrameCount(meta.frameCount);
                _controlBarInstance?.el.setFrameCount(meta.frameCount);
            }
            // Persisted trim range — applied after loadedmetadata resets to
            // full clip (control bar listens). One-shot.
            const trim = meta.trim;
            if (trim && Number.isFinite(+trim.in) && Number.isFinite(+trim.out)) {
                _controlBarInstance?.el.setPendingTrim?.(+trim.in, +trim.out);
            } else {
                _controlBarInstance?.el.setPendingTrim?.(null);
            }
            _surfaceInstance.el._setSrc(url);
        };

        el.setRangeQuiet = (i, o) => _controlBarInstance?.el.setRangeQuiet(i, o);
        el.getRange      = () => _controlBarInstance?.el.getRange();

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
            // Resolve target time: explicit > clamp current playhead to active
            // range > leave alone. Avoids regressing snapshots when playhead
            // drifts outside [in, out] (defensive — shouldn't happen post-Phase E.1).
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
            _controlBarInstance?.destroy?.();
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
