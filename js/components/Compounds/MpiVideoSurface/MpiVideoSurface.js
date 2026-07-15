/**
 * MpiVideoSurface — bare <video> surface (Compound).
 *
 * Owns the video element + click-to-toggle-play gesture only. Display +
 * pixel surface concerns live here; control UI lives in MpiVideoControlBar.
 *
 * Props:
 * @param {string}  [src]
 * @param {string}  [poster]
 * @param {boolean} [autoplay=false]
 * @param {boolean} [loop=true]
 * @param {boolean} [muted=false]
 * @param {number}  [volume=1.0]
 * @param {number}  [fps=24]
 *
 * Emits (component-local + bubbled DOM events):
 * 'play' / 'pause' / 'ended'  { time }
 * 'timeupdate'                { time, duration }
 * 'loadedmetadata'            { duration }
 * 'volumechange'              { volume, muted }
 *
 * Instance API (on el):
 *   _setSrc(url)            — replace src + load()
 *   _play() / _pause()
 *   seek(seconds)           — preserves loop-disable/seeked-restore dance
 *                             (clamps to duration - 1/fps to avoid past-end)
 *   frameStep(direction, range?) — direction = +1/-1; pauses first.
 *                             range = { rangeIn, rangeOut } clamps wrap edges
 *                             to that window when video.loop; otherwise wraps
 *                             to [0, dur-1/fps].
 *   getVideoElement()
 *   _setFps(fps) / _setFrameCount(n)
 *   _setVolume(v) / _setMuted(m)
 *   destroy()
 */

import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';
import { frameSink } from '../../../services/frameSink.js';

export const MpiVideoSurface = ComponentFactory.create({
    name: 'MpiVideoSurface',
    css: ['js/components/Compounds/MpiVideoSurface/MpiVideoSurface.css'],

    template: (props) => {
        const src      = props.src || '';
        const poster   = props.poster || '';
        const autoplay = props.autoplay ? 'autoplay' : '';
        const loop     = props.loop !== false ? 'loop' : '';
        const muted    = props.muted ? 'muted' : '';

        return `
            <div class="mpi-video-surface" data-playing="false" data-frame="false">
                <video class="mpi-video-surface__video"
                    ${src ? `src="${src}"` : ''}
                    ${poster ? `poster="${poster}"` : ''}
                    ${autoplay} ${loop} ${muted}
                    playsinline>
                </video>
                <canvas class="mpi-video-surface__frame" aria-hidden="true"></canvas>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const video  = qs('.mpi-video-surface__video', el);
        const canvas = qs('.mpi-video-surface__frame', el);
        const _unsubs = [];

        let _fps = +props.fps > 0 ? +props.fps : 24;
        let _frameCount = null;
        let _src = props.src || '';

        // ── Frame overlay (MPI-283) ───────────────────────────────────────
        // Paint an EXACT decoded frame (mediabunny) on the canvas for
        // paused/frame-step display — <video>.currentTime is not frame-accurate
        // by spec. Show the canvas over the video only while stepping; the
        // native <video> owns PLAY. If the sink can't decode this clip on this
        // platform, we keep the native seek fallback (never worse than before).
        const _showFrameCanvas = (frameCanvas) => {
            const ctx = canvas.getContext('2d');
            canvas.width  = frameCanvas.width;
            canvas.height = frameCanvas.height;
            ctx.drawImage(frameCanvas, 0, 0);
            el.setAttribute('data-frame', 'true');
        };
        const _hideFrameCanvas = () => { el.setAttribute('data-frame', 'false'); };

        if (typeof props.volume === 'number') {
            video.volume = Math.max(0, Math.min(1, props.volume));
        }

        // ── Internal: apply playing data-attr for CSS hooks ───────────────
        const _syncPlayState = () => {
            el.setAttribute('data-playing', String(!video.paused));
        };

        // ── Click-to-toggle (skip clicks bubbling from overlays/controls) ─
        _unsubs.push(on(el, 'click', (ev) => {
            // If any ancestor opted out via data-no-toggle, ignore.
            if (ev.target.closest('[data-no-toggle]')) return;
            if (video.paused) video.play().catch(() => {/* noop */});
            else              video.pause();
        }));

        // ── Native event → component-local re-emit ────────────────────────
        const _onPlay   = () => { _hideFrameCanvas(); _syncPlayState(); emit('play',  { time: video.currentTime || 0 }); };
        const _onPause  = () => { _syncPlayState(); emit('pause', { time: video.currentTime || 0 }); };
        const _onEnded  = () =>                        emit('ended', { time: video.currentTime || 0 });
        const _onTime   = () => emit('timeupdate', { time: video.currentTime || 0, duration: video.duration || 0 });
        const _onMeta   = () => emit('loadedmetadata', { duration: video.duration || 0 });
        const _onVolume = () => emit('volumechange', { volume: video.volume, muted: video.muted });

        _unsubs.push(on(video, 'play',           _onPlay));
        _unsubs.push(on(video, 'pause',          _onPause));
        _unsubs.push(on(video, 'ended',          _onEnded));
        _unsubs.push(on(video, 'timeupdate',     _onTime));
        _unsubs.push(on(video, 'loadedmetadata', _onMeta));
        _unsubs.push(on(video, 'volumechange',   _onVolume));

        // ── Public API ─────────────────────────────────────────────────────

        el.getVideoElement = () => video;

        el._setSrc = (url) => {
            if (!url) return;
            if (_src && _src !== url) frameSink.dispose(_src);
            _src = url;
            _hideFrameCanvas();
            video.src = url;
            video.load();
        };

        el._play  = () => video.play().catch(() => {/* noop */});
        el._pause = () => video.pause();

        el._setFps = (fps) => {
            const n = Number(fps);
            if (Number.isFinite(n) && n > 0) _fps = n;
        };

        el._setFrameCount = (count) => {
            const n = Number(count);
            _frameCount = Number.isFinite(n) && n > 0 ? n : null;
        };

        el.getFps        = () => _fps;
        el.getFrameCount = () => _frameCount;

        // Effective fps: prefer measured fps from frameCount/duration when both
        // are known — declared fps (e.g. "30") often drifts from the file's
        // actual PTS spacing (e.g. 29.97 for NTSC), causing integer frame
        // indexing to collide on repeated frames or fall short of the last
        // frame. Falls back to declared _fps until duration is loaded.
        const _effectiveFps = () => {
            const dur = video.duration;
            if (_frameCount && Number.isFinite(dur) && dur > 0) return _frameCount / dur;
            return _fps;
        };

        el.getEffectiveFps = () => _effectiveFps();

        // Exact integer index of the clip's last frame — same law frameStep uses:
        // for the full clip prefer probed frameCount-1 (avoids a synthetic
        // one-past-last on short clips); for a trim, round(out * effFps). MPI-287.
        el.lastFrameIndex = (trimOut = null) => {
            const dur = video.duration;
            const eff = _effectiveFps();
            if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(eff) || eff <= 0) return null;
            const hasTrim = Number.isFinite(+trimOut) && +trimOut > 0 && +trimOut < dur - 1e-6;
            if (hasTrim) return Math.max(0, Math.round(+trimOut * eff));
            return _frameCount ? _frameCount - 1 : Math.max(0, Math.round(dur * eff) - 1);
        };

        // Frame-accurate decode of a single frame to a canvas via the shared sink
        // (same exact-decode path the scrub overlay uses). Returns null when the
        // clip can't be decoded on this platform — caller falls back to native
        // <video> capture. MPI-287.
        el.captureFrameCanvas = async (frameIndex) => {
            if (!_src || !Number.isFinite(frameIndex)) return null;
            return frameSink.getFrameCanvas(_src, frameIndex, _effectiveFps());
        };

        el._setVolume = (v) => {
            video.volume = Math.max(0, Math.min(1, +v || 0));
        };

        el._setMuted = (m) => {
            video.muted = !!m;
        };

        // ── seek + loop disable/restore dance (preserved from monolith) ────
        el.seek = (seconds) => {
            const dur = video.duration;
            if (!Number.isFinite(dur) || dur <= 0) return;
            const eff = _effectiveFps();
            const frameStep = 1 / eff;
            const maxSeek = Math.max(0, dur - frameStep * 0.5);
            const clamped = Math.max(0, Math.min(maxSeek, +seconds || 0));
            const wasLoop = video.loop;
            if (wasLoop) video.loop = false;
            video.currentTime = clamped;
            if (wasLoop) {
                const restore = () => { video.loop = true; video.removeEventListener('seeked', restore); };
                video.addEventListener('seeked', restore);
            }
        };

        // ── frameStep with wrap-on-loop (preserved from monolith) ──────────
        // Optional range clamps wrap-edges to a trim window. Caller passes
        // `loop` explicitly because native <video>.loop is forced off when a
        // sub-clip range is active (control bar emulates loop via timeupdate);
        // we still want wrap-on-loop behavior driven by user intent.
        //
        // Step semantics work in INTEGER frame space to avoid float
        // off-by-ones at range edges. Range timestamps are half-open
        // `[lo, hi)` — visible frames are `floor(lo*fps) … floor(hi*fps)-1`.
        el.frameStep = async (direction, range = null) => {
            const dur = video.duration;
            if (!Number.isFinite(dur) || dur <= 0) return;
            const dir = direction < 0 ? -1 : 1;
            const eff = _effectiveFps();
            const fs  = 1 / eff;
            video.pause();

            const hasRange = range
                && Number.isFinite(+range.rangeIn)
                && Number.isFinite(+range.rangeOut)
                && +range.rangeOut > +range.rangeIn;
            const loSec = hasRange ? +range.rangeIn  : 0;
            const hiSec = hasRange ? Math.min(dur, +range.rangeOut) : dur;
            const wantLoop = (range && typeof range.loop === 'boolean')
                ? range.loop
                : video.loop;

            const loFrame = Math.round(loSec * eff);
            // The trim out timestamp is inclusive: sub-ranges cover
            // `loFrame ... round(hiSec*eff)`. For the full clip only, prefer
            // probed frameCount so `duration * fps` does not create a
            // synthetic one-past-last frame on very short clips.
            const fullRange = loSec <= 1e-6 && Math.abs(hiSec - dur) <= 1e-6;
            const lastFrame = fullRange && _frameCount
                ? Math.max(loFrame, _frameCount - 1)
                : Math.max(loFrame, Math.round(hiSec * eff));
            const curFrame = Math.max(loFrame, Math.min(lastFrame, Math.round(video.currentTime * eff)));

            let nextFrame;
            if (dir < 0) {
                if (curFrame <= loFrame) {
                    nextFrame = wantLoop ? lastFrame : loFrame;
                } else {
                    nextFrame = curFrame - 1;
                }
            } else {
                if (curFrame >= lastFrame) {
                    nextFrame = wantLoop ? loFrame : lastFrame;
                } else {
                    nextFrame = curFrame + 1;
                }
            }

            // Paint the EXACT decoded frame on the canvas FIRST, THEN move the
            // native currentTime. Order matters: the canvas overlay owns the
            // visible pixels while stepping, and seeking the <video> underneath
            // makes it briefly render its own (drifted) seek target. If we seek
            // before the canvas is up, that native repaint flashes through — the
            // "interpolated flash / play-then-jump-back" glitch on scrub. With
            // the canvas already covering, moving currentTime for audio/PLAY
            // sync is invisible.
            const frameCanvas = _src
                ? await frameSink.getFrameCanvas(_src, nextFrame, eff)
                : null;
            if (frameCanvas) {
                _showFrameCanvas(frameCanvas);
                video.currentTime = nextFrame * fs;
            } else {
                // Undecodable on this platform (or no src): fall back to the old
                // quarter-frame-bias seek so stepping is no worse than before.
                _hideFrameCanvas();
                video.currentTime = nextFrame * fs + 0.25 * fs;
            }
        };

        // ── Cleanup ───────────────────────────────────────────────────────
        el.destroy = () => {
            while (_unsubs.length) {
                const fn = _unsubs.pop();
                try { fn(); } catch (_) { /* noop */ }
            }
            // Stop + unload media
            try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) { /* noop */ }
            if (_src) { try { frameSink.dispose(_src); } catch (_) { /* noop */ } }
        };

        _syncPlayState();
    }
});
