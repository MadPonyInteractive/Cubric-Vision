/**
 * MpiVideoViewer — Organism: video display with crop-box overlay.
 *
 * Mirrors MpiCanvasViewer role but for video. Internally composes:
 * - MpiVideoPlayer for rendering + controls
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
import { MpiVideoPlayer } from '../MpiVideoPlayer/MpiVideoPlayer.js';
import { createCropTool } from '../../../utils/cropTool.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';

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

        const playerMount = el.querySelector('[data-mount="player"]');
        _playerInstance = MpiVideoPlayer.mount(playerMount, { fps, controls });

        const playerEventNames = ['play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change'];
        playerEventNames.forEach((eventName) => {
            _playerInstance.on(eventName, (payload) => emit(eventName, payload));
        });

        _videoElement = _playerInstance.el.querySelector('.mpi-video-player__video');

        // ── Overlay canvas setup ─────────────────────────────────────────

        const overlayCanvas = el.querySelector('.mpi-video-viewer__overlay');
        const stageEl = el.querySelector('.mpi-video-viewer__stage');

        _cropTool = createCropTool({
            overlayCanvas,
            targetElement: _videoElement,
            onChange: (normRect) => {
                emit('crop-change', { rect: normRect });
            },
        });

        // ── Resize observer ──────────────────────────────────────────────

        _resizeObserver = new ResizeObserver(() => {
            if (_cropTool && _isInCropMode) _cropTool.redraw?.();
        });
        _resizeObserver.observe(stageEl);
        _unsubs.push(() => _resizeObserver.disconnect());

        const handleLoadedMetadata = () => {
            if (_cropTool && _isInCropMode) _cropTool.redraw?.();
        };
        _videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        _unsubs.push(() => _videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata));

        // ── Instance API ─────────────────────────────────────────────────

        el.loadVideo = (url, meta = {}) => {
            if (!url || !_playerInstance?.el) return;
            if (_playerInstance.el._setSrc) _playerInstance.el._setSrc(url);
        };

        el.enterCropMode = (initialRect = null) => {
            if (_isInCropMode) return;
            _isInCropMode = true;
            el.setAttribute('data-mode', 'crop');

            const stageRect = stageEl.getBoundingClientRect();
            overlayCanvas.width = stageRect.width;
            overlayCanvas.height = stageRect.height;

            const rect = initialRect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
            _cropTool.enable(rect);

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
            if (!_videoElement || _videoElement.readyState < 2) {
                throw new Error('Video not ready for capture');
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const vW = _videoElement.videoWidth;
            const vH = _videoElement.videoHeight;

            if (_isInCropMode) {
                const cropRect = el.getCropRect();
                if (cropRect) {
                    const sx = cropRect.x * vW;
                    const sy = cropRect.y * vH;
                    const sw = cropRect.w * vW;
                    const sh = cropRect.h * vH;
                    canvas.width = sw;
                    canvas.height = sh;
                    ctx.drawImage(_videoElement, sx, sy, sw, sh, 0, 0, sw, sh);
                } else {
                    canvas.width = vW;
                    canvas.height = vH;
                    ctx.drawImage(_videoElement, 0, 0);
                }
            } else {
                canvas.width = vW;
                canvas.height = vH;
                ctx.drawImage(_videoElement, 0, 0);
            }

            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    const dataUrl = canvas.toDataURL('image/png', 1.0);
                    resolve({ blob, dataUrl });
                });
            });
        };

        el.enterUpscaleMode    = () => el.setAttribute('data-mode', 'upscale');
        el.exitUpscaleMode     = () => el.setAttribute('data-mode', 'idle');
        el.enterInterpolateMode = () => el.setAttribute('data-mode', 'interpolate');
        el.exitInterpolateMode  = () => el.setAttribute('data-mode', 'idle');

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _playerInstance?.destroy?.();
            _playerInstance = null;
            _cropTool?.destroy?.();
            _cropTool = null;
            _resizeObserver = null;
            _videoElement = null;
        };
    },
});
