import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { formatTime } from '../../../utils/string.js';
import { renderIcon } from '../../../utils/icons.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiVideoPlayer — Organism: Video + Custom Controls Overlay.
 *
 * Orchestrates a video element with a stylish glass-morphic control set.
 * Includes an inlined volume control (mute button + slider), loop/fullscreen, and frame-step controls.
 *
 * Props:
 * @param {string} [src] - Video source URL
 * @param {string} [poster] - Poster image URL
 * @param {boolean} [autoplay=false] - Auto-play on mount
 * @param {boolean} [loop=false] - Loop playback
 * @param {boolean} [muted=false] - Start muted
 * @param {number} [volume=1.0] - Initial volume (0–1)
 * @param {number} [fps=24] - Frame rate for frame-step buttons
 * @param {boolean} [controls=true] - Show custom UI controls overlay
 *
 * Emits:
 * 'play' { time: number }
 * 'pause' { time: number }
 * 'ended' { time: number }
 * 'timeupdate' { time: number, duration: number }
 * 'change' { volume: number, muted: boolean }
 * 'loop-change' { loop: boolean }
 */
export const MpiVideoPlayer = ComponentFactory.create({
    name: 'MpiVideoPlayer',
    css: ['js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.css'],

    template: (props) => {
        const src = props.src || '';
        const poster = props.poster || '';
        const autoplay = props.autoplay ? 'autoplay' : '';
        const loop = props.loop ? 'loop' : '';
        const muted = props.muted ? 'muted' : '';
        const hasControls = props.controls !== false;

        return `
            <div class="mpi-video-player ${hasControls ? 'has-controls' : ''}" data-playing="false">
                <video class="mpi-video-player__video" 
                    ${src ? `src="${src}"` : ''} 
                    ${poster ? `poster="${poster}"` : ''} 
                    ${autoplay} ${loop} ${muted} 
                    playsinline>
                </video>
                
                ${hasControls ? `
                <div class="mpi-video-player__controls">
                    <div class="mpi-video-player__progress">
                        <!-- MpiSlider for playback progress -->
                        <div class="mpi-video-player__slider-wrapper"></div>
                    </div>
                    
                    <div class="mpi-video-player__bottom">
                        <div class="mpi-video-player__left">
                            <div class="mpi-video-player__play-pause-wrapper"></div>
                            <div class="mpi-video-player__frame-back-wrapper"></div>
                            <div class="mpi-video-player__frame-forward-wrapper"></div>
                            <div class="mpi-video-player__time">
                                <span class="mpi-video-player__current">00:00.00</span>
                                <span class="mpi-video-player__separator">/</span>
                                <span class="mpi-video-player__duration">00:00.00</span>
                            </div>
                        </div>

                        <div class="mpi-video-player__right">
                            <div class="mpi-video-player__loop-wrapper"></div>
                            <div class="mpi-video-player__volume">
                                <div class="mpi-video-player__volume-mute"></div>
                                <div class="mpi-video-player__volume-slider"></div>
                            </div>
                            <div class="mpi-video-player__fullscreen-wrapper"></div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="mpi-video-player__overlay">
                    <div class="mpi-video-player__big-play">
                        ${renderIcon('play', 'lg')}
                    </div>
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const video = qs('.mpi-video-player__video', el);
        const hasControls = props.controls !== false;
        const _unsubs = [];

        let isSeeking = false;

        // ── Hoist button declarations out of if-block for destroy() scope ──
        let playBtn, progressSlider, muteBtn, volumeSlider;
        let frameBackBtn, frameForwardBtn, loopBtn, fullscreenBtn;

        // --- Sub-components (only if controls are enabled) ---
        if (hasControls) {
            const playPauseWrapper = qs('.mpi-video-player__play-pause-wrapper', el);
            const sliderWrapper = qs('.mpi-video-player__slider-wrapper', el);
            const volumeMuteWrapper = qs('.mpi-video-player__volume-mute', el);
            const volumeSliderWrapper = qs('.mpi-video-player__volume-slider', el);
            const frameBackWrapper = qs('.mpi-video-player__frame-back-wrapper', el);
            const frameForwardWrapper = qs('.mpi-video-player__frame-forward-wrapper', el);
            const loopWrapper = qs('.mpi-video-player__loop-wrapper', el);
            const fullscreenWrapper = qs('.mpi-video-player__fullscreen-wrapper', el);
            const currentTimeEl = qs('.mpi-video-player__current', el);
            const durationEl = qs('.mpi-video-player__duration', el);

            const fps = props.fps || 24;

            // 1. Play/Pause Button
            playBtn = MpiButton.mount(playPauseWrapper, {
                icon: 'play',
                iconActive: 'pause',
                active: !video.paused,
                size: 'sm',
                info: 'Play/Pause'
            });

            // 2. Progress Slider
            progressSlider = MpiProgressBar.mount(sliderWrapper, {
                min: 0,
                max: 1000,
                step: 1,
                value: 0,
                info: 'Seek: {value}',
                variant: 'primary',
                interactive: true,
                handle: true
            });

            // 3. Volume Control (inlined: mute button + slider)
            const initialVolume = props.volume !== undefined ? props.volume : 1.0;
            const initialMuted = props.muted || false;

            muteBtn = MpiButton.mount(volumeMuteWrapper, {
                icon: 'volumeHigh',
                iconActive: 'volumeOff',
                active: initialMuted,
                size: 'sm',
                info: 'Mute/Unmute'
            });

            // 4. Frame-Back Button
            frameBackBtn = MpiButton.mount(frameBackWrapper, {
                icon: 'frameBack',
                size: 'sm',
                info: 'Previous Frame'
            });

            // 5. Frame-Forward Button
            frameForwardBtn = MpiButton.mount(frameForwardWrapper, {
                icon: 'frameForward',
                size: 'sm',
                info: 'Next Frame'
            });

            // 6. Loop Toggle Button
            loopBtn = MpiButton.mount(loopWrapper, {
                icon: 'loop',
                active: video.loop,
                size: 'sm',
                info: 'Loop'
            });

            // 7. Fullscreen Button
            fullscreenBtn = MpiButton.mount(fullscreenWrapper, {
                icon: 'fullscreen',
                size: 'sm',
                info: 'Fullscreen'
            });

            volumeSlider = MpiProgressBar.mount(volumeSliderWrapper, {
                min: 0,
                max: 100,
                step: 1,
                value: Math.round(initialVolume * 100),
                prefix: '',
                suffix: '%',
                interactive: true,
                handle: true,
                variant: 'primary'
            });

            // --- UI Syncing Logic ---

            const updatePlayState = () => {
                const isPlaying = !video.paused;
                el.setAttribute('data-playing', isPlaying);
                playBtn.el.classList.toggle('is-active', isPlaying);
            };

            const updateTime = () => {
                if (isSeeking) return;

                const cur = video.currentTime || 0;
                const dur = video.duration || 0;

                currentTimeEl.textContent = formatTime(cur);
                durationEl.textContent = formatTime(dur);

                if (dur > 0) {
                    const pct = (cur / dur) * 1000;
                    console.log('[seek] quiet sync →', Math.round(pct));
                    progressSlider.el.setValueQuiet(Math.round(pct));
                }

                emit('timeupdate', { time: cur, duration: dur });
            };

            // --- Handlers ---

            playBtn.on('click', () => {
                video.paused ? video.play() : video.pause();
            });

            const doSeek = (value) => {
                console.log('[seek] →', value);
                if (video.duration) {
                    video.currentTime = (value / 1000) * video.duration;
                }
            };

            // Real-time seek during drag
            progressSlider.on('input', ({ value }) => {
                isSeeking = true;
                doSeek(value);
            });

            // Commit on mouseup (also seeks, resets flag)
            progressSlider.on('change', ({ value }) => {
                doSeek(value);
                isSeeking = false;
            });
            // Volume slider — real-time during drag + commit on mouseup
            const doVolume = (value) => {
                console.log('[vol] →', value);
                const newVolume = value / 100;
                video.volume = newVolume;
                if (video.muted && newVolume > 0) {
                    video.muted = false;
                }
                emit('change', { volume: newVolume, muted: video.muted });
            };

            volumeSlider.on('input', ({ value }) => doVolume(value));
            volumeSlider.on('change', ({ value }) => doVolume(value));

            // Mute button toggle
            muteBtn.on('click', () => {
                video.muted = !video.muted;
                emit('change', { volume: video.volume, muted: video.muted });
            });

            // Frame-back button: seek backward by 1/fps
            frameBackBtn.on('click', () => {
                video.pause();
                const frameStep = 1 / fps;
                video.currentTime = Math.max(0, video.currentTime - frameStep);
            });

            // Frame-forward button: seek forward by 1/fps
            frameForwardBtn.on('click', () => {
                video.pause();
                const frameStep = 1 / fps;
                video.currentTime = Math.min(video.duration, video.currentTime + frameStep);
            });

            // Loop toggle button
            loopBtn.on('click', () => {
                video.loop = !video.loop;
                loopBtn.el.classList.toggle('is-active', video.loop);
                emit('loop-change', { loop: video.loop });
            });

            // Fullscreen button
            fullscreenBtn.on('click', async () => {
                try {
                    if (document.fullscreenElement) {
                        await document.exitFullscreen();
                    } else {
                        await el.requestFullscreen();
                    }
                } catch (err) {
                    console.error('Fullscreen request failed:', err);
                }
            });

            // Video events for UI sync
            const handleVolumeChange = () => {
                const isMuted = video.muted;
                console.log('[mute] →', isMuted);
                muteBtn.el.classList.toggle('is-active', isMuted);
                console.log('[vol] quiet sync →', Math.round(video.volume * 100));
                volumeSlider.el.setValueQuiet(Math.round(video.volume * 100));
            };

            video.addEventListener('play', updatePlayState);
            video.addEventListener('pause', updatePlayState);
            video.addEventListener('timeupdate', updateTime);
            video.addEventListener('loadedmetadata', updateTime);
            video.addEventListener('volumechange', handleVolumeChange);

            _unsubs.push(() => {
                video.removeEventListener('play', updatePlayState);
                video.removeEventListener('pause', updatePlayState);
                video.removeEventListener('timeupdate', updateTime);
                video.removeEventListener('loadedmetadata', updateTime);
                video.removeEventListener('volumechange', handleVolumeChange);
            });
        }

        // --- Global Interactions ---

        // Toggle play on video click
        const handleVideoClick = (e) => {
            // Don't toggle if clicking controls
            if (e.target.closest('.mpi-video-player__controls')) return;
            video.paused ? video.play() : video.pause();
        };

        const handleEnded = () => {
            emit('ended', { time: video.currentTime });
        };

        el.addEventListener('click', handleVideoClick);
        video.addEventListener('ended', handleEnded);

        _unsubs.push(() => {
            el.removeEventListener('click', handleVideoClick);
            video.removeEventListener('ended', handleEnded);
        });

        // --- External API ---

        /** Instance API: returns the raw video element (stable contract for parent organisms) */
        el.getVideoElement = () => qs('.mpi-video-player__video', el);

        el._setSrc = (url) => {
            if (!url) return;
            video.src = url;
            video.load();
        };

        el._play = () => video.play();
        el._pause = () => video.pause();

        // Volume control API (for external consumers)
        if (hasControls) {
            el._setVolume = (v) => {
                video.volume = Math.max(0, Math.min(1, v));
                volumeSlider.el.setValueQuiet(Math.round(video.volume * 100));
            };

            el._setMuted = (m) => {
                video.muted = m;
                muteBtn.el.classList.toggle('is-active', m);
            };
        }

        // --- Cleanup & Destroy ---
        el.destroy = () => {
            if (hasControls) {
                if (playBtn && playBtn.destroy) playBtn.destroy();
                if (progressSlider && progressSlider.destroy) progressSlider.destroy();
                if (muteBtn && muteBtn.destroy) muteBtn.destroy();
                if (volumeSlider && volumeSlider.destroy) volumeSlider.destroy();
                if (frameBackBtn && frameBackBtn.destroy) frameBackBtn.destroy();
                if (frameForwardBtn && frameForwardBtn.destroy) frameForwardBtn.destroy();
                if (loopBtn && loopBtn.destroy) loopBtn.destroy();
                if (fullscreenBtn && fullscreenBtn.destroy) fullscreenBtn.destroy();
            }
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
        };
    }
});
