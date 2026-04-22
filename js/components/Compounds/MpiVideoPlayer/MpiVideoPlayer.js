import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { formatTime } from '../../../utils/string.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiVideoPlayer — Compound: Video + Custom Controls Overlay.
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
        const video = el.querySelector('.mpi-video-player__video');
        const hasControls = props.controls !== false;
        const _unsubs = [];

        let isSeeking = false;

        // ── Hoist button declarations out of if-block for destroy() scope ──
        let playBtn, progressSlider, muteBtn, volumeSlider;
        let frameBackBtn, frameForwardBtn, loopBtn, fullscreenBtn;

        // --- Sub-components (only if controls are enabled) ---
        if (hasControls) {
            const playPauseWrapper = el.querySelector('.mpi-video-player__play-pause-wrapper');
            const sliderWrapper = el.querySelector('.mpi-video-player__slider-wrapper');
            const volumeMuteWrapper = el.querySelector('.mpi-video-player__volume-mute');
            const volumeSliderWrapper = el.querySelector('.mpi-video-player__volume-slider');
            const frameBackWrapper = el.querySelector('.mpi-video-player__frame-back-wrapper');
            const frameForwardWrapper = el.querySelector('.mpi-video-player__frame-forward-wrapper');
            const loopWrapper = el.querySelector('.mpi-video-player__loop-wrapper');
            const fullscreenWrapper = el.querySelector('.mpi-video-player__fullscreen-wrapper');
            const currentTimeEl = el.querySelector('.mpi-video-player__current');
            const durationEl = el.querySelector('.mpi-video-player__duration');

            const fps = props.fps || 24;

            // 1. Play/Pause Button
            playBtn = MpiButton.mount(playPauseWrapper, {
                icon: 'play',
                iconActive: 'pause',
                active: !video.paused,
                size: 'lg',
                info: 'Play/Pause'
            });

            // 2. Progress Slider
            progressSlider = MpiProgressBar.mount(sliderWrapper, {
                min: 0,
                max: 1000, // High granularity
                step: 1,
                value: 0,
                info: 'Seek: {value}', // Will update template dynamically if needed, but we mostly use it for seeking
                variant: 'primary'
            });

            // 3. Volume Control (inlined: mute button + slider)
            const initialVolume = props.volume !== undefined ? props.volume : 1.0;
            const initialMuted = props.muted || false;

            muteBtn = MpiButton.mount(volumeMuteWrapper, {
                icon: initialMuted ? 'volumeOff' : (initialVolume < 0.5 ? 'volumeLow' : 'volumeHigh'),
                size: 'lg',
                info: 'Mute/Unmute'
            });

            // 4. Frame-Back Button
            frameBackBtn = MpiButton.mount(frameBackWrapper, {
                icon: 'frameBack',
                size: 'lg',
                info: 'Previous Frame'
            });

            // 5. Frame-Forward Button
            frameForwardBtn = MpiButton.mount(frameForwardWrapper, {
                icon: 'frameForward',
                size: 'lg',
                info: 'Next Frame'
            });

            // 6. Loop Toggle Button
            loopBtn = MpiButton.mount(loopWrapper, {
                icon: 'loop',
                active: video.loop,
                size: 'lg',
                info: 'Loop'
            });

            // 7. Fullscreen Button
            fullscreenBtn = MpiButton.mount(fullscreenWrapper, {
                icon: 'fullscreen',
                size: 'lg',
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
                    const input = progressSlider.el.querySelector('input');
                    input.value = Math.round(pct);
                    // Trigger primitive's visual update
                    input.dispatchEvent(new Event('input'));
                }

                emit('timeupdate', { time: cur, duration: dur });
            };

            // --- Handlers ---

            playBtn.on('click', () => {
                video.paused ? video.play() : video.pause();
            });

            progressSlider.on('change', ({ value }) => {
                if (video.duration) {
                    video.currentTime = (value / 1000) * video.duration;
                }
            });

            // Slider 'input' (dragging) to pause time syncing
            const handleSeekStart = () => { isSeeking = true; };
            const handleSeekEnd = () => { isSeeking = false; };
            progressSlider.el.querySelector('input').addEventListener('input', handleSeekStart);
            progressSlider.el.querySelector('input').addEventListener('change', handleSeekEnd);
            _unsubs.push(() => {
                progressSlider.el.querySelector('input').removeEventListener('input', handleSeekStart);
                progressSlider.el.querySelector('input').removeEventListener('change', handleSeekEnd);
            });

            // Volume slider change
            volumeSlider.on('change', ({ value }) => {
                const newVolume = value / 100;
                video.volume = newVolume;
                if (video.muted && newVolume > 0) {
                    video.muted = false;
                }
                emit('change', { volume: newVolume, muted: video.muted });
            });

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
                // Update mute button icon
                const isMuted = video.muted;
                const vol = video.volume;
                const newIcon = isMuted ? 'volumeOff' : (vol < 0.5 ? 'volumeLow' : 'volumeHigh');
                muteBtn.el.setAttribute('data-icon', newIcon);

                // Update slider position
                const sliderInput = volumeSlider.el.querySelector('input');
                if (sliderInput) {
                    sliderInput.value = Math.round(video.volume * 100);
                    sliderInput.dispatchEvent(new Event('input'));
                }
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
                const sliderInput = volumeSlider.el.querySelector('input');
                if (sliderInput) {
                    sliderInput.value = Math.round(video.volume * 100);
                    sliderInput.dispatchEvent(new Event('input'));
                }
            };

            el._setMuted = (m) => {
                video.muted = m;
                const newIcon = m ? 'volumeOff' : (video.volume < 0.5 ? 'volumeLow' : 'volumeHigh');
                muteBtn.el.setAttribute('data-icon', newIcon);
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
