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
 *   frameStep(direction)    — direction = +1/-1; pauses first; wraps to
 *                             [0, dur-1/fps] when video.loop
 *   getVideoElement()
 *   _setFps(fps) / _setFrameCount(n)
 *   _setVolume(v) / _setMuted(m)
 *   destroy()
 */

import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';

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
            <div class="mpi-video-surface" data-playing="false">
                <video class="mpi-video-surface__video"
                    ${src ? `src="${src}"` : ''}
                    ${poster ? `poster="${poster}"` : ''}
                    ${autoplay} ${loop} ${muted}
                    playsinline>
                </video>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const video = qs('.mpi-video-surface__video', el);
        const _unsubs = [];

        let _fps = +props.fps > 0 ? +props.fps : 24;
        let _frameCount = null;

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
        const _onPlay   = () => { _syncPlayState(); emit('play',  { time: video.currentTime || 0 }); };
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
            const frameStep = 1 / _fps;
            const maxSeek = Math.max(0, dur - frameStep);
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
        el.frameStep = (direction) => {
            const dur = video.duration;
            if (!Number.isFinite(dur) || dur <= 0) return;
            const dir = direction < 0 ? -1 : 1;
            const frameStep = 1 / _fps;
            video.pause();
            const cur = video.currentTime;
            if (dir < 0) {
                if (video.loop && cur - frameStep < 0) video.currentTime = Math.max(0, dur - frameStep);
                else                                   video.currentTime = Math.max(0, cur - frameStep);
            } else {
                if (video.loop && cur + frameStep > dur) video.currentTime = 0;
                else                                     video.currentTime = Math.min(dur, cur + frameStep);
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
        };

        _syncPlayState();
    }
});
