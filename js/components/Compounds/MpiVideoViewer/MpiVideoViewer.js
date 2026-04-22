/**
 * MpiVideoViewer — Compound: video display with crop-box overlay.
 *
 * Mirrors MpiCanvasViewer role but for video. Internally composes:
 * - MpiVideoPlayer (Compound) for rendering + controls
 * - An overlay canvas (absolute-positioned) for crop-box drawing
 * - A reserved timeline slot (empty, for deferred trim tool)
 * - Optional MpiToolActionBars (mounted in barContainer) for crop, upscale, interpolate
 *
 * @param {number} [fps=24] - Frame rate for video playback (passed to MpiVideoPlayer)
 * @param {boolean} [controls=true] - Show video player controls
 * @param {HTMLElement} [barContainer] - DOM node where tool action bars are mounted
 *
 * Instance API (on el):
 *   loadVideo(url, meta = {})         — load video URL; meta may include { fps, duration, frameCount, hasAudio }
 *   enterCropMode(initialRect = null) — enable crop overlay; initialRect normalized [0..1] or default center rect
 *   exitCropMode()                    — disable crop overlay
 *   getCropRect()                     — returns current normalized crop rect { x, y, w, h }
 *   setCropRatio(ratio)               — set aspect ratio lock (null = free)
 *   captureSnapshot()                 — returns { blob, dataUrl } of current frame, respecting crop if active
 *   enterUpscaleMode()                — show upscale action bar
 *   exitUpscaleMode()                 — hide upscale action bar
 *   enterInterpolateMode()            — show interpolate action bar
 *   exitInterpolateMode()             — hide interpolate action bar
 *   destroy()                         — clean up player, cropTool, observers, listeners
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change' — forwarded from MpiVideoPlayer
 *   'crop-change'       { rect }      — crop rect changed (on cropTool onChange)
 *   'crop-save-snapshot'              — user clicked "Save Snapshot" in crop action bar
 *   'crop-save-video'                 — user clicked "Save Cropped Video" in crop action bar
 *   'crop-cancel'                     — user clicked "Cancel" in crop action bar
 *   'upscale-run'                     — user clicked "Upscale" in upscale action bar
 *   'upscale-cancel'                  — user clicked "Cancel" in upscale action bar
 *   'interpolate-run'                 — user clicked "Interpolate" in interpolate action bar
 *   'interpolate-cancel'              — user clicked "Cancel" in interpolate action bar
 *  User Comment: CRITICAL: This component does not follow rules of component hirerarchy, it imports compounds being a compound itself (BAD IMPLEMENTATION)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiVideoPlayer } from '../MpiVideoPlayer/MpiVideoPlayer.js';
import { MpiToolActionBar } from '../MpiToolActionBar/MpiToolActionBar.js';
import { MpiRatioSelector } from '../MpiRatioSelector/MpiRatioSelector.js';
import { createCropTool } from '../../../utils/cropTool.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';

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
        const barContainer = props.barContainer || null;
        const _unsubs = [];

        // ── State ────────────────────────────────────────────────────────

        let _playerInstance = null;
        let _cropTool = null;
        let _resizeObserver = null;
        let _videoElement = null;
        let _isInCropMode = false;
        let _cropRatio = SOCIAL_RATIOS[0].ratio;
        let _cropBar = null;
        let _ratioSel = null;
        let _upscaleBar = null;
        let _interpolateBar = null;

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

        // ── Crop action bar (mounted in external barContainer, hidden by default) ──

        if (barContainer) {
            _ratioSel = MpiRatioSelector.mount(document.createElement('div'), {
                modelType: 'social',
                value: SOCIAL_RATIOS[0].label,
            });
            _ratioSel.on('change', ({ ratio }) => {
                _cropRatio = ratio;
                if (_cropTool && _isInCropMode) _cropTool.setRatio(ratio);
            });

            const cropBarSlot = document.createElement('div');
            cropBarSlot.className = 'mpi-video-viewer__bar-slot';
            barContainer.appendChild(cropBarSlot);

            _cropBar = MpiToolActionBar.mount(cropBarSlot, {
                leftSlot: _ratioSel,
                actions: [
                    { key: 'snapshot', icon: 'camera', label: 'Save Snapshot',     variant: 'ghost',   info: 'Save current frame as image (cropped if crop active)' },
                    { key: 'cancel',   icon: 'close',  label: 'Cancel',            variant: 'ghost',   info: 'Cancel crop' },
                    { key: 'apply',    icon: 'check',  label: 'Save Cropped Video', variant: 'primary', info: 'Encode cropped region to new video' },
                ],
            });

            _cropBar.on('action', ({ key }) => {
                if (key === 'snapshot') emit('crop-save-snapshot', {});
                if (key === 'apply')    emit('crop-save-video', {});
                if (key === 'cancel')   emit('crop-cancel', {});
            });

            // ── Upscale action bar ────────────────────────────────────────
            const upscaleBarSlot = document.createElement('div');
            upscaleBarSlot.className = 'mpi-video-viewer__bar-slot';
            barContainer.appendChild(upscaleBarSlot);

            _upscaleBar = MpiToolActionBar.mount(upscaleBarSlot, {
                actions: [
                    { key: 'cancel', icon: 'close',  label: 'Cancel',  variant: 'ghost',   info: 'Cancel upscale' },
                    { key: 'run',    icon: 'rocket',  label: 'Upscale', variant: 'primary', info: 'Run video upscale' },
                ],
            });
            _upscaleBar.on('action', ({ key }) => {
                if (key === 'run')    emit('upscale-run', {});
                if (key === 'cancel') emit('upscale-cancel', {});
            });

            // ── Interpolate action bar ────────────────────────────────────
            const interpolateBarSlot = document.createElement('div');
            interpolateBarSlot.className = 'mpi-video-viewer__bar-slot';
            barContainer.appendChild(interpolateBarSlot);

            _interpolateBar = MpiToolActionBar.mount(interpolateBarSlot, {
                actions: [
                    { key: 'cancel', icon: 'close', label: 'Cancel',      variant: 'ghost',   info: 'Cancel interpolate' },
                    { key: 'run',    icon: 'film',  label: 'Interpolate',  variant: 'primary', info: 'Run frame interpolation' },
                ],
            });
            _interpolateBar.on('action', ({ key }) => {
                if (key === 'run')    emit('interpolate-run', {});
                if (key === 'cancel') emit('interpolate-cancel', {});
            });
        }

        // ── Instance API ─────────────────────────────────────────────────

        el.loadVideo = (url, meta = {}) => {
            if (!url) return; // Silent fail on empty URL
            if (!_playerInstance || !_playerInstance.el) return; // Player not ready
            if (_playerInstance.el._setSrc) {
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

            if (_cropBar) _cropBar.el.show();
        };

        el.exitCropMode = () => {
            if (!_isInCropMode) return;
            _isInCropMode = false;
            el.setAttribute('data-mode', 'idle');
            _cropTool.disable();
            if (_cropBar) _cropBar.el.hide();
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

        el.hideAllToolBars = () => {
            el.setAttribute('data-mode', 'idle');
            if (_cropBar) _cropBar.el.hide();
            if (_upscaleBar) _upscaleBar.el.hide();
            if (_interpolateBar) _interpolateBar.el.hide();
            _isInCropMode = false;
            _cropTool?.disable();
        };

        el.enterUpscaleMode = () => {
            el.setAttribute('data-mode', 'upscale');
            if (_upscaleBar) _upscaleBar.el.show();
        };

        el.exitUpscaleMode = () => {
            el.setAttribute('data-mode', 'idle');
            if (_upscaleBar) _upscaleBar.el.hide();
        };

        el.enterInterpolateMode = () => {
            el.setAttribute('data-mode', 'interpolate');
            if (_interpolateBar) _interpolateBar.el.show();
        };

        el.exitInterpolateMode = () => {
            el.setAttribute('data-mode', 'idle');
            if (_interpolateBar) _interpolateBar.el.hide();
        };

        el.destroy = () => {
            if (_cropBar && _cropBar.destroy) _cropBar.destroy();
            _cropBar = null;
            if (_ratioSel && _ratioSel.destroy) _ratioSel.destroy();
            _ratioSel = null;
            if (_upscaleBar && _upscaleBar.destroy) _upscaleBar.destroy();
            _upscaleBar = null;
            if (_interpolateBar && _interpolateBar.destroy) _interpolateBar.destroy();
            _interpolateBar = null;

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
