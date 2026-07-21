/**
 * MpiVideoControlBar — video transport + trim controls (Compound).
 *
 * Owns play/frame±/loop/audio/fullscreen/frames-toggle buttons, time
 * display, and an embedded MpiTrimBar. Drives an attached MpiVideoSurface
 * via `attachSurface()`. Owns video hotkeys (rebound to the surface).
 *
 * Range UX is wired but visual-only at this phase — defaults to full clip;
 * persistence + range-aware ops land in Phase D/E.
 *
 * Props:
 * @param {number}  [fps=24]
 * @param {boolean} [showTrim=true]  - When false the embedded MpiTrimBar is
 *                                     not mounted and trim hotkeys/range API
 *                                     become no-ops. Use for audio-only or
 *                                     trim-less surfaces.
 *
 * Instance API (on el):
 *   attachSurface(surfaceEl)        — wire to MpiVideoSurface el
 *   detachSurface()                 — drop surface listeners + hotkeys
 *   setRange(in, out) / setRangeQuiet(in, out)   (no-op when showTrim=false)
 *   getRange() / getValue()                       (returns null when showTrim=false)
 *   setPendingTrim(in, out)                       (no-op when showTrim=false)
 *   setVolume(v) / setMuted(m)
 *   setFrameCount(n)
 *   destroy()
 *
 * Emits (component-local):
 *   'loop-change' { loop }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiTrimBar } from '../MpiTrimBar/MpiTrimBar.js';
import { formatTime } from '../../../utils/string.js';
import { qs } from '../../../utils/dom.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';

export const MpiVideoControlBar = ComponentFactory.create({
    name: 'MpiVideoControlBar',
    css: ['js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.css'],

    template: () => `
        <div class="mpi-video-control-bar" data-no-toggle>
            <div class="mpi-video-control-bar__left">
                <div data-mount="play"></div>
                <div data-mount="frame-back"></div>
                <div data-mount="frame-forward"></div>
                <div class="mpi-video-control-bar__time">
                    <span class="mpi-video-control-bar__current">00:00.00</span>
                    <span class="mpi-video-control-bar__separator">/</span>
                    <span class="mpi-video-control-bar__duration">00:00.00</span>
                </div>
            </div>

            <div class="mpi-video-control-bar__trim" data-mount="trim"></div>

            <div class="mpi-video-control-bar__right">
                <div data-mount="frames-toggle"></div>
                <div data-mount="loop"></div>
                <div class="mpi-video-control-bar__volume">
                    <div data-mount="mute"></div>
                    <div class="mpi-video-control-bar__volume-slider" data-mount="volume"></div>
                </div>
                <div data-mount="fullscreen"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        const _unsubs = [];
        const _hotkeyUnsubs = [];

        let _fps = +props.fps > 0 ? +props.fps : 24;
        let _frameCount = null;
        let _showFrames = true;
        let _surface = null;
        let _surfaceUnsubs = [];
        const _showTrim = props.showTrim !== false;

        // Active range — defaults set on loadedmetadata.
        let _in = 0;
        let _out = 0;
        let _duration = 0;

        // Loop intent — independent of native video.loop. When range is a
        // strict subset of the clip we disable native loop and emulate the
        // wrap inside timeupdate so loop honors [in, out].
        let _loopIntent = false;

        const _isFullRange = () => _in <= 1e-3 && _out >= _duration - 1e-3;
        const _isSubRange = () => _out > _in && !_isFullRange();

        const _syncNativeLoop = () => {
            if (!_surface) return;
            const v = _surface.getVideoElement();
            v.loop = _loopIntent && _isFullRange();
        };

        let _frameWatchId = 0;

        const _frameBounds = () => {
            const eff = _fps;
            const loFrame = Math.max(0, Math.round(_in * eff));
            const lastFrame = _isFullRange() && Number.isFinite(_frameCount) && _frameCount > 0
                ? _frameCount - 1
                : Math.max(loFrame, Math.round(_out * eff));
            return { eff, loFrame, lastFrame };
        };

        const _seekFrame = (frameIndex) => {
            if (!_surface) return;
            const { eff } = _frameBounds();
            const fs = eff > 0 ? 1 / eff : 0;
            _surface.seek((frameIndex / eff) + fs * 0.25);
        };

        const _stopFrameWatch = () => {
            if (!_frameWatchId || !_surface) return;
            const v = _surface.getVideoElement();
            v.cancelVideoFrameCallback?.(_frameWatchId);
            _frameWatchId = 0;
        };

        // Sub-range playback boundary. Compare the native media time directly
        // against the out-point time — do NOT reverse-engineer a frame index
        // from currentTime (it drifts vs the file's true PTS; that rounding is
        // exactly what froze sub-range loops before). At the out-point: loop →
        // seek back to in AND keep playing; no-loop → pause. A small lead
        // (~half a frame) triggers the wrap before the last in-range frame is
        // overshot.
        const _handleRangeBoundary = (time) => {
            if (!_surface || !_isSubRange()) return;
            const v = _surface.getVideoElement();
            if (!v || v.paused) return;
            const t = Number(time) || 0;
            const lead = _fps > 0 ? 0.5 / _fps : 0;
            // Only the out-point matters during playback: time only moves
            // forward. (A "rewound before in" guard here re-fired every frame
            // right after the wrap-seek landed a hair below _in, pinning the
            // playhead on the in-handle — that was the in≠0 freeze.) Seeking to
            // the in-point on play-start is handled by _seekRangeStartIfNeeded.
            if (t >= _out - lead) {
                if (_loopIntent) {
                    _surface.seek(_in);
                    _surface._play();
                } else {
                    _surface._pause();
                }
            }
        };

        const _startFrameWatch = () => {
            if (!_surface) return;
            const v = _surface.getVideoElement();
            if (typeof v.requestVideoFrameCallback !== 'function') return;
            _stopFrameWatch();
            const tick = (_now, metadata = {}) => {
                _frameWatchId = 0;
                _handleRangeBoundary(metadata.mediaTime ?? v.currentTime ?? 0);
                if (!v.paused) _frameWatchId = v.requestVideoFrameCallback(tick);
            };
            _frameWatchId = v.requestVideoFrameCallback(tick);
        };

        const _seekRangeStartIfNeeded = () => {
            if (!_surface || !_isSubRange()) return;
            const v = _surface.getVideoElement();
            const lead = _fps > 0 ? 0.5 / _fps : 0;
            const t = v.currentTime || 0;
            if (t < _in - lead || t >= _out - lead) _surface.seek(_in);
        };

        const _togglePlay = () => {
            if (!_surface) return;
            const v = _surface.getVideoElement();
            if (!v.paused) {
                _surface._pause();
                return;
            }
            _seekRangeStartIfNeeded();
            _surface._play();
        };

        // One-shot pending trim applied after the next loadedmetadata.
        // Set via setPendingTrim() before _setSrc — survives the default
        // full-clip reset that loadedmetadata performs.
        let _pendingTrim = null;

        // ── Mount sub-components ──────────────────────────────────────────
        const playBtn = MpiButton.mount(qs('[data-mount="play"]', el),         { icon: 'play', iconActive: 'pause', size: 'sm', info: 'Play/Pause (SPACE)' });
        const frameBackBtn = MpiButton.mount(qs('[data-mount="frame-back"]', el), { icon: 'frameBack', size: 'sm', info: 'Previous Frame (←)' });
        const frameFwdBtn  = MpiButton.mount(qs('[data-mount="frame-forward"]', el), { icon: 'frameForward', size: 'sm', info: 'Next Frame (→)' });
        const framesToggleBtn = MpiButton.mount(qs('[data-mount="frames-toggle"]', el), { icon: 'frames', active: _showFrames, size: 'sm', info: 'Show frames / seconds' });
        if (_showFrames) framesToggleBtn.el.classList.add('is-active');

        const loopBtn  = MpiButton.mount(qs('[data-mount="loop"]', el),       { icon: 'loop', size: 'sm', info: 'Loop (L)' });
        const muteBtn  = MpiButton.mount(qs('[data-mount="mute"]', el),       { icon: 'volumeHigh', iconActive: 'volumeOff', size: 'sm', info: 'Mute/Unmute (M)' });
        const fsBtn    = MpiButton.mount(qs('[data-mount="fullscreen"]', el), { icon: 'fullscreen', size: 'sm', info: 'Fullscreen (F)' });

        const volumeSlider = MpiProgressBar.mount(qs('[data-mount="volume"]', el), {
            min: 0, max: 100, step: 1, value: 100,
            prefix: '', suffix: '%',
            interactive: true, handle: true, variant: 'primary'
        });

        const trim = _showTrim
            ? MpiTrimBar.mount(qs('[data-mount="trim"]', el), {
                  duration: 0, fps: _fps, value: 0, inPoint: 0, outPoint: 0
              })
            : null;

        const currentTimeEl = qs('.mpi-video-control-bar__current', el);
        const durationEl    = qs('.mpi-video-control-bar__duration', el);

        // ── Helpers ───────────────────────────────────────────────────────
        const _formatFrame = (s, isDuration = false) => {
            if (isDuration && Number.isFinite(_frameCount) && _frameCount > 0) {
                return String(_frameCount).padStart(4, '0');
            }
            let frame = Math.max(0, Math.round(s * _fps));
            if (Number.isFinite(_frameCount) && _frameCount > 0) {
                frame = Math.min(frame, _frameCount - 1);
            }
            return String(frame).padStart(4, '0');
        };

        const _renderTime = (cur, dur) => {
            if (_showFrames) {
                currentTimeEl.textContent = _formatFrame(cur, false);
                durationEl.textContent    = _formatFrame(dur, true);
            } else {
                currentTimeEl.textContent = formatTime(cur);
                durationEl.textContent    = formatTime(dur);
            }
        };

        // Snap a raw video.currentTime to the exact frame's TRUE timestamp
        // (idx / effFps) so the trim bar receives the same seconds value a drop
        // on that frame commits. The last-frame→100% normalization lives solely
        // in MpiTrimBar._pctOf — do NOT stretch to idx/lastIdx*dur here or it
        // gets applied twice, shifting the echoed playhead one frame off the
        // drop position (the "playhead jumps on release" bug).
        const _displayTime = (time) => {
            if (!_surface) return time;
            const dur = _duration;
            if (!Number.isFinite(dur) || dur <= 0) return time;
            const fc = _frameCount;
            if (!fc || fc < 2) return time;
            const effFps = fc / dur;
            const lastIdx = fc - 1;
            let idx = Math.round(time * effFps);
            if (idx < 0) idx = 0;
            else if (idx > lastIdx) idx = lastIdx;
            return idx / effFps;
        };

        const _syncPlayBtn = () => {
            if (!_surface) return;
            const v = _surface.getVideoElement();
            playBtn.el.classList.toggle('is-active', !v.paused);
        };

        // ── Trim wiring (visual sync) ─────────────────────────────────────
        if (trim) {
            trim.on('seek', ({ time }) => {
                if (!_surface) return;
                _surface.seek(time);
            });
            trim.on('seek-preview', ({ time }) => {
                if (!_surface) return;
                _surface.seek(time);
            });
            trim.on('range-change', ({ in: i, out: o }) => {
                _in = i; _out = o;
                _syncNativeLoop();
                emit('range-change', { in: i, out: o });
            });
        }

        // ── Button wiring ─────────────────────────────────────────────────
        playBtn.on('click', () => {
            _togglePlay();
        });

        const _activeRange = () => ({ rangeIn: _in, rangeOut: _out, loop: _loopIntent });
        frameBackBtn.on('click', () => _surface?.frameStep(-1, _activeRange()));
        frameFwdBtn.on('click',  () => _surface?.frameStep(+1, _activeRange()));

        loopBtn.on('click', () => {
            if (!_surface) return;
            _loopIntent = !_loopIntent;
            _syncNativeLoop();
            loopBtn.el.classList.toggle('is-active', _loopIntent);
            emit('loop-change', { loop: _loopIntent });
        });

        framesToggleBtn.on('click', () => {
            _showFrames = !_showFrames;
            framesToggleBtn.el.classList.toggle('is-active', _showFrames);
            if (_surface) {
                const v = _surface.getVideoElement();
                _renderTime(v.currentTime || 0, v.duration || 0);
            }
        });

        muteBtn.on('click', () => {
            if (!_surface) return;
            const v = _surface.getVideoElement();
            _surface._setMuted(!v.muted);
        });

        const _doVolume = (value) => {
            if (!_surface) return;
            const newVolume = value / 100;
            _surface._setVolume(newVolume);
            const v = _surface.getVideoElement();
            if (v.muted && newVolume > 0) _surface._setMuted(false);
        };
        volumeSlider.on('input',  ({ value }) => _doVolume(value));
        volumeSlider.on('change', ({ value }) => _doVolume(value));

        fsBtn.on('click', async () => {
            try {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    const videoEl = _surface ? _surface.getVideoElement() : null;
                    if (videoEl) await videoEl.requestFullscreen();
                }
            } catch (err) { console.error('Fullscreen request failed:', err); }
        });

        // ── Hotkey adjust helper ──────────────────────────────────────────
        const _adjustVolume = (delta) => {
            if (!_surface) return;
            const v = _surface.getVideoElement();
            const next = Math.max(0, Math.min(100, Math.round(v.volume * 100) + delta));
            _surface._setVolume(next / 100);
            if (v.muted && next > 0) _surface._setMuted(false);
        };

        // ── Public API ────────────────────────────────────────────────────

        /**
         * @param {object} surfaceInstance — the MpiVideoSurface INSTANCE returned by mount()
         *                                   (so we can subscribe to component-local emits).
         */
        el.attachSurface = (surfaceInstance) => {
            if (!surfaceInstance || _surface === surfaceInstance) return;
            el.detachSurface();
            _surface = surfaceInstance.el;
            _surface._setFps(_fps);
            const video = _surface.getVideoElement();

            // Reset UI to surface state
            volumeSlider.el.setValueQuiet(Math.round(video.volume * 100));
            muteBtn.el.classList.toggle('is-active', video.muted);
            _loopIntent = !!video.loop;
            loopBtn.el.classList.toggle('is-active', _loopIntent);
            _renderTime(video.currentTime || 0, video.duration || 0);
            trim?.el.setFps(_fps);
            trim?.el.setFrameCount(_frameCount);
            if (Number.isFinite(video.duration) && video.duration > 0) {
                _duration = video.duration;
                trim?.el.setDuration(_duration);
                trim?.el.setRangeQuiet(0, _duration);
                _in = 0; _out = _duration;
            }
            _syncNativeLoop();
            _syncPlayBtn();

            // Subscribe to surface component events
            _surfaceUnsubs.push(
                addCb(surfaceInstance, 'play',          () => { _seekRangeStartIfNeeded(); _syncPlayBtn(); _startFrameWatch(); }),
                addCb(surfaceInstance, 'pause',         () => { _syncPlayBtn(); _stopFrameWatch(); }),
                addCb(surfaceInstance, 'timeupdate',    ({ time, duration }) => {
                    _renderTime(time, duration);
                    if (duration > 0) trim?.el.setValueQuiet(_displayTime(time));
                    // Range-loop emulation — only during natural playback.
                    // Frame-step + manual seeks set currentTime directly and
                    // must NOT be re-routed back into the range (the surface's
                    // frameStep already handles range-aware wrapping).
                    _handleRangeBoundary(time);
                }),
                // Native EOF with a sub-range: video.loop is forced off, so the
                // clip dead-stops at the real end before timeupdate can wrap it.
                // Emulate the loop here when the out-point sits at (or near) the
                // clip end.
                addCb(surfaceInstance, 'ended', () => {
                    if (_loopIntent && _isSubRange()) {
                        _surface.seek(_in);
                        _surface._play();
                    }
                }),
                addCb(surfaceInstance, 'loadedmetadata', ({ duration }) => {
                    _duration = duration || 0;
                    trim?.el.setDuration(_duration);
                    if (_pendingTrim
                        && Number.isFinite(_pendingTrim.in)
                        && Number.isFinite(_pendingTrim.out)
                        && _pendingTrim.out > _pendingTrim.in
                        && _pendingTrim.out <= _duration + 1e-3) {
                        _in  = Math.max(0, _pendingTrim.in);
                        _out = Math.min(_duration, _pendingTrim.out);
                    } else {
                        _in = 0; _out = _duration;
                    }
                    _pendingTrim = null;
                    trim?.el.setRangeQuiet(_in, _out);
                    _syncNativeLoop();
                    _renderTime(video.currentTime || 0, _duration);
                }),
                addCb(surfaceInstance, 'volumechange', ({ volume, muted }) => {
                    muteBtn.el.classList.toggle('is-active', muted);
                    volumeSlider.el.setValueQuiet(Math.round(volume * 100));
                }),
            );

            // Bind hotkeys (unbind on detach)
            _hotkeyUnsubs.push(Hotkeys.bind('video.playPause',     () => _togglePlay()));
            _hotkeyUnsubs.push(Hotkeys.bind('video.frame.back',    () => _surface.frameStep(-1, _activeRange())));
            _hotkeyUnsubs.push(Hotkeys.bind('video.frame.forward', () => _surface.frameStep(+1, _activeRange())));
            _hotkeyUnsubs.push(Hotkeys.bind('video.volume.up',     () => _adjustVolume(+10)));
            _hotkeyUnsubs.push(Hotkeys.bind('video.volume.down',   () => _adjustVolume(-10)));
            _hotkeyUnsubs.push(Hotkeys.bind('video.loop',          () => loopBtn.el.click()));
            _hotkeyUnsubs.push(Hotkeys.bind('video.mute',          () => muteBtn.el.click()));
            _hotkeyUnsubs.push(Hotkeys.bind('video.frame.first',   () => {
                if (!_surface) return;
                _surface.getVideoElement().pause();
                _surface.seek(_in);
            }));
            _hotkeyUnsubs.push(Hotkeys.bind('video.frame.last',    () => {
                if (!_surface) return;
                const v = _surface.getVideoElement();
                v.pause();
                const { lastFrame } = _frameBounds();
                _seekFrame(lastFrame);
            }));

            if (trim) {
                _hotkeyUnsubs.push(Hotkeys.bind('video.trim.in', () => {
                    if (!_surface) return;
                    const cur = _surface.getVideoElement().currentTime || 0;
                    trim.el.setRange(cur, _out > cur ? _out : _duration);
                }));
                _hotkeyUnsubs.push(Hotkeys.bind('video.trim.out', () => {
                    if (!_surface) return;
                    const cur = _surface.getVideoElement().currentTime || 0;
                    trim.el.setRange(_in < cur ? _in : 0, cur);
                }));
                _hotkeyUnsubs.push(Hotkeys.bind('video.trim.clear', () => {
                    trim.el.setRange(0, _duration);
                }));
            }
        };

        el.detachSurface = () => {
            _stopFrameWatch();
            while (_surfaceUnsubs.length) {
                const fn = _surfaceUnsubs.pop();
                try { fn(); } catch (_) { /* noop */ }
            }
            while (_hotkeyUnsubs.length) {
                const fn = _hotkeyUnsubs.pop();
                try { fn(); } catch (_) { /* noop */ }
            }
            _surface = null;
        };

        el.setRangeQuiet = (i, o) => trim?.el.setRangeQuiet(i, o);
        el.setRange      = (i, o) => trim?.el.setRange(i, o);
        el.getRange      = () => trim?.el.getRange() ?? null;
        el.getValue      = () => trim?.el.getValue() ?? null;

        /**
         * Stash a trim range to apply on the NEXT loadedmetadata. Pass null
         * to clear (next clip resets to full range).
         * @param {number|null} inSec
         * @param {number} [outSec]
         */
        el.setPendingTrim = (inSec, outSec) => {
            if (!trim) return;
            if (inSec === null || inSec === undefined) { _pendingTrim = null; return; }
            const i = +inSec, o = +outSec;
            if (Number.isFinite(i) && Number.isFinite(o) && o > i) {
                _pendingTrim = { in: i, out: o };
            } else {
                _pendingTrim = null;
            }
        };

        el.setVolume = (v) => _surface?._setVolume(v);
        el.setMuted  = (m) => _surface?._setMuted(m);

        el.setFrameCount = (n) => {
            _frameCount = Number.isFinite(+n) && +n > 0 ? +n : null;
            trim?.el.setFrameCount(_frameCount);
            if (_surface) _surface._setFrameCount(_frameCount);
            if (_surface) {
                const v = _surface.getVideoElement();
                _renderTime(v.currentTime || 0, v.duration || 0);
            }
        };

        el.setFps = (fps) => {
            const n = Number(fps);
            if (!Number.isFinite(n) || n <= 0) return;
            _fps = n;
            trim?.el.setFps(_fps);
            _surface?._setFps(_fps);
        };

        el.destroy = () => {
            el.detachSurface();
            _unsubs.forEach(fn => { try { fn(); } catch (_) { /* noop */ } });
            _unsubs.length = 0;
            try { trim?.destroy(); } catch (_) { /* noop */ }
            try { playBtn.destroy(); } catch (_) { /* noop */ }
            try { frameBackBtn.destroy(); } catch (_) { /* noop */ }
            try { frameFwdBtn.destroy(); } catch (_) { /* noop */ }
            try { framesToggleBtn.destroy(); } catch (_) { /* noop */ }
            try { loopBtn.destroy(); } catch (_) { /* noop */ }
            try { muteBtn.destroy(); } catch (_) { /* noop */ }
            try { fsBtn.destroy(); } catch (_) { /* noop */ }
            try { volumeSlider.destroy(); } catch (_) { /* noop */ }
        };
    }
});

/**
 * Wrap instance.on() registration to return an unsubscribe function.
 * Factory's instance.on() doesn't currently expose unbind — so we wrap and
 * gate via a flag.
 */
function addCb(instance, event, cb) {
    let active = true;
    instance.on(event, (payload) => {
        if (!active) return;
        try { cb(payload); } catch (err) { console.error(`[MpiVideoControlBar] surface ${event} cb error:`, err); }
    });
    return () => { active = false; };
}
