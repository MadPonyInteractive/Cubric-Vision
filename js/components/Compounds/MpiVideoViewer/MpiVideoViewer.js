/**
 * MpiVideoViewer — Compound: video display with crop-box overlay.
 *
 * Mirrors MpiCanvasViewer role but for video. Internally composes:
 * - MpiVideoPlayer (Compound) for rendering + controls
 * - An overlay canvas (absolute-positioned) for crop-box drawing
 * - A reserved timeline slot (empty, for deferred trim tool)
 *
 * @param {number} [fps=24] - Frame rate for video playback (passed to MpiVideoPlayer)
 * @param {boolean} [controls=true] - Show video player controls
 *
 * Instance API (on el):
 *   loadVideo(url, meta = {})         — load video URL; meta may include { fps, duration, frameCount, hasAudio }
 *   enterCropMode(initialRect = null) — enable crop overlay; initialRect normalized [0..1] or default center rect
 *   exitCropMode()                    — disable crop overlay
 *   getCropRect()                     — returns current normalized crop rect { x, y, w, h }
 *   setCropRatio(ratio)               — set aspect ratio lock (null = free)
 *   captureSnapshot()                 — returns { blob, dataUrl } of current frame, respecting crop if active
 *   destroy()                         — clean up player, cropTool, observers, listeners
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change' — forwarded from MpiVideoPlayer
 *   'crop-change'  { rect }           — crop rect changed (on cropTool onChange)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiVideoPlayer } from '../MpiVideoPlayer/MpiVideoPlayer.js';
import { createCropTool } from '../../../utils/cropTool.js';

export const MpiVideoViewer = ComponentFactory.create({
    name: 'MpiVideoViewer',
    css: ['js/components/Compounds/MpiVideoViewer/MpiVideoViewer.css'],

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
        let _cropRatio = null; // aspect ratio lock, null = free

        // ── Player mount ─────────────────────────────────────────────────

        const playerMount = el.querySelector('[data-mount="player"]');
        _playerInstance = MpiVideoPlayer.mount(playerMount, {
            fps,
            controls,
        });

        // Forward player events
        const playerEventNames = ['play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change'];
        playerEventNames.forEach((eventName) => {
            _playerInstance.on(eventName, (payload) => {
                emit(eventName, payload);
            });
        });

        // Get reference to the actual video element for cropTool
        _videoElement = _playerInstance.el.querySelector('.mpi-video-player__video');

        // ── Overlay canvas setup ─────────────────────────────────────────

        const overlayCanvas = el.querySelector('.mpi-video-viewer__overlay');
        const stageEl = el.querySelector('.mpi-video-viewer__stage');

        // Initialize cropTool (disabled initially)
        _cropTool = createCropTool({
            overlayCanvas,
            targetElement: _videoElement,
            onChange: (normRect) => {
                emit('crop-change', { rect: normRect });
            },
        });

        // ── Resize observer for canvas resizing ──────────────────────────

        _resizeObserver = new ResizeObserver(() => {
            if (_cropTool && _isInCropMode) {
                _cropTool.redraw?.();
            }
        });

        _resizeObserver.observe(stageEl);
        _unsubs.push(() => {
            if (_resizeObserver) {
                _resizeObserver.disconnect();
            }
        });

        // Redraw on loadedmetadata to capture real video bounds
        const handleLoadedMetadata = () => {
            if (_cropTool && _isInCropMode) {
                _cropTool.redraw?.();
            }
        };

        _videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        _unsubs.push(() => {
            _videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        });

        // ── Instance API ─────────────────────────────────────────────────

        el.loadVideo = (url, meta = {}) => {
            if (_playerInstance && _playerInstance.el._setSrc) {
                _playerInstance.el._setSrc(url);
            }
            // Store meta for future use (fps, duration, frameCount, hasAudio)
            // Currently just pass fps to player (already done via props)
            if (meta.fps) {
                // Could update player fps if needed via a future setter
            }
        };

        el.enterCropMode = (initialRect = null) => {
            if (_isInCropMode) return;
            _isInCropMode = true;
            el.setAttribute('data-mode', 'crop');

            // Size canvas to match stage bounds
            const stageRect = stageEl.getBoundingClientRect();
            overlayCanvas.width = stageRect.width;
            overlayCanvas.height = stageRect.height;

            // Use provided rect or default center rect
            const rect = initialRect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
            _cropTool.enable(rect);

            // Apply aspect ratio lock if set
            if (_cropRatio !== null) {
                _cropTool.setRatio(_cropRatio);
            }
        };

        el.exitCropMode = () => {
            if (!_isInCropMode) return;
            _isInCropMode = false;
            el.setAttribute('data-mode', 'idle');
            _cropTool.disable();
        };

        el.getCropRect = () => {
            if (!_cropTool) return null;
            return _cropTool.getRect?.() ?? null;
        };

        el.setCropRatio = (ratio) => {
            _cropRatio = ratio;
            if (_cropTool && _isInCropMode) {
                _cropTool.setRatio(ratio);
            }
        };

        el.captureSnapshot = async () => {
            if (!_videoElement || _videoElement.readyState < 2) {
                throw new Error('Video not ready for capture');
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const vW = _videoElement.videoWidth;
            const vH = _videoElement.videoHeight;

            // If in crop mode, crop the frame
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
                // Full frame
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

        el.destroy = () => {
            // Clean up player
            if (_playerInstance && _playerInstance.destroy) {
                _playerInstance.destroy();
            }
            _playerInstance = null;

            // Clean up cropTool
            if (_cropTool && _cropTool.destroy) {
                _cropTool.destroy();
            }
            _cropTool = null;

            // Clean up observer
            if (_resizeObserver) {
                _resizeObserver.disconnect();
            }
            _resizeObserver = null;

            // Clean up listeners
            _unsubs.forEach((fn) => fn());
            _unsubs.length = 0;

            _videoElement = null;
        };
    },
});
