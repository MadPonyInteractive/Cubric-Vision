/**
 * MpiVideoViewer — Organism: video display with crop-box overlay.
 *
 * Mirrors MpiCanvasViewer role but for video. Internally composes:
 * - MpiVideoPlayer (Compound) for rendering + controls
 * - An overlay canvas (absolute-positioned) for crop-box drawing
 * - A reserved timeline slot (empty, for deferred trim tool)
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
 *   captureSnapshot()                 — returns { blob, dataUrl } of current frame, respecting crop if active
 *   enterUpscaleMode()                — set data-mode="upscale" (visual state for parent)
 *   exitUpscaleMode()                 — reset data-mode="idle"
 *   enterInterpolateMode()            — set data-mode="interpolate"
 *   exitInterpolateMode()             — reset data-mode="idle"
 *   destroy()                         — clean up player, cropTool, observers, listeners
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change' — forwarded from MpiVideoPlayer
 *   'crop-change'  { rect }  — crop rect changed (on cropTool onChange)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiVideoPlayer } from '../../Compounds/MpiVideoPlayer/MpiVideoPlayer.js';
import { createCropTool } from '../../../utils/cropTool.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { captureFrameBlob } from '../../../utils/Video.js';
import { qs, on } from '../../../utils/dom.js';

export const MpiVideoViewer = ComponentFactory.create({
    name: 'MpiVideoViewer',
    css: ['js/components/Organisms/MpiVideoViewer/MpiVideoViewer.css'],

    template: () => `
        <div class="mpi-video-viewer" data-mode="idle">
            <div class="mpi-video-viewer__stage">
                <div data-mount="player" class="mpi-video-viewer__player"></div>
                <canvas class="mpi-video-viewer__overlay"></canvas>
            </div>
            <div class="mpi-video-viewer__timeline"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const fps = props.fps ?? 24;
        const controls = props.controls !== false;
        const _unsubs = [];

        // ── State ────────────────────────────────────────────────────────

        let _playerInstance = null;
        let _cropTool = null;
        let _resizeObserver = null;
        let _videoElement = null;
        let _isInCropMode = false;
        let _cropRatio = SOCIAL_RATIOS[0].ratio;

        // ── Player mount ─────────────────────────────────────────────────

        const playerMount = qs('[data-mount="player"]', el);
        _playerInstance = MpiVideoPlayer.mount(playerMount, { fps, controls });

        const playerEventNames = ['play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change'];
        playerEventNames.forEach((eventName) => {
            _playerInstance.on(eventName, (payload) => emit(eventName, payload));
        });

        _videoElement = _playerInstance.el.getVideoElement();

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

        _unsubs.push(on(_videoElement, 'loadedmetadata', () => {
            if (_cropTool && _isInCropMode) _syncOverlayToVideo();
        }));

        // ── Instance API ─────────────────────────────────────────────────

        el.loadVideo = (url, meta = {}) => {
            if (!url || !_playerInstance?.el) return;
            if (_playerInstance.el._setSrc) _playerInstance.el._setSrc(url);
        };

        el.enterCropMode = (initialRect = null) => {
            if (_isInCropMode) return;
            _isInCropMode = true;
            el.setAttribute('data-mode', 'crop');

            const rect = initialRect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
            _cropTool.enable(rect);

            _syncOverlayToVideo();

            if (_cropRatio !== null) _cropTool.setRatio(_cropRatio);
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

        el.captureSnapshot = async () => {
            let rect = { x: 0, y: 0, width: 1, height: 1 };
            if (_isInCropMode) {
                const cropRect = el.getCropRect();
                if (cropRect) {
                    rect = { x: cropRect.x, y: cropRect.y, width: cropRect.w, height: cropRect.h };
                }
            }
            return captureFrameBlob(_videoElement, rect);
        };

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
            _playerInstance?.destroy?.();
            _playerInstance = null;
            _cropTool?.destroy?.();
            _cropTool = null;
            _videoElement = null;
        };
    },
});
