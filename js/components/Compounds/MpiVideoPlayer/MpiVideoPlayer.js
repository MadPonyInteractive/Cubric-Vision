import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { formatTime } from '../../../utils/string.js';

/**
 * MpiVideoPlayer — Compound: Video + Custom Controls Overlay.
 *
 * Orchestrates a video element with a stylish glass-morphic control set.
 * Includes an inlined volume control (mute button + slider).
 *
 * Props:
 * @param {string} [src] - Video source URL
 * @param {string} [poster] - Poster image URL
 * @param {boolean} [autoplay=false] - Auto-play on mount
 * @param {boolean} [loop=false] - Loop playback
 * @param {boolean} [muted=false] - Start muted
 * @param {number} [volume=1.0] - Initial volume (0–1)
 * @param {boolean} [controls=true] - Show custom UI controls overlay
 *
 * Emits:
 * 'play' { time: number }
 * 'pause' { time: number }
 * 'ended' { time: number }
 * 'timeupdate' { time: number, duration: number }
 * 'change' { volume: number, muted: boolean }
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
                            <div class="mpi-video-player__time">
                                <span class="mpi-video-player__current">00:00.00</span>
                                <span class="mpi-video-player__separator">/</span>
                                <span class="mpi-video-player__duration">00:00.00</span>
                            </div>
                        </div>
                        
                        <div class="mpi-video-player__right">
                            <div class="mpi-video-player__volume">
                                <div class="mpi-video-player__volume-mute"></div>
                                <div class="mpi-video-player__volume-slider"></div>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="mpi-video-player__overlay">
                    <div class="mpi-video-player__big-play">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const video = el.querySelector('.mpi-video-player__video');
        const hasControls = props.controls !== false;

        let isSeeking = false;

        // --- Sub-components (only if controls are enabled) ---
        if (hasControls) {
            const playPauseWrapper = el.querySelector('.mpi-video-player__play-pause-wrapper');
            const sliderWrapper = el.querySelector('.mpi-video-player__slider-wrapper');
            const volumeMuteWrapper = el.querySelector('.mpi-video-player__volume-mute');
            const volumeSliderWrapper = el.querySelector('.mpi-video-player__volume-slider');
            const currentTimeEl = el.querySelector('.mpi-video-player__current');
            const durationEl = el.querySelector('.mpi-video-player__duration');

            // 1. Play/Pause Button
            const playBtn = MpiButton.mount(playPauseWrapper, {
                icon: 'play',
                iconActive: 'pause',
                active: !video.paused,
                size: 'md',
                info: 'Play/Pause'
            });

            // 2. Progress Slider
            const progressSlider = MpiProgressBar.mount(sliderWrapper, {
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

            const muteBtn = MpiButton.mount(volumeMuteWrapper, {
                icon: initialMuted ? 'volumeOff' : (initialVolume < 0.5 ? 'volumeLow' : 'volumeHigh'),
                size: 'md',
                info: 'Mute/Unmute'
            });

            const volumeSlider = MpiProgressBar.mount(volumeSliderWrapper, {
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
            progressSlider.el.querySelector('input').addEventListener('input', () => {
                isSeeking = true;
            });
            progressSlider.el.querySelector('input').addEventListener('change', () => {
                isSeeking = false;
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

            // Video events for UI sync
            video.addEventListener('play', updatePlayState);
            video.addEventListener('pause', updatePlayState);
            video.addEventListener('timeupdate', updateTime);
            video.addEventListener('loadedmetadata', updateTime);
            video.addEventListener('volumechange', () => {
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
            });
        }

        // --- Global Interactions ---

        // Toggle play on video click
        el.addEventListener('click', (e) => {
            // Don't toggle if clicking controls
            if (e.target.closest('.mpi-video-player__controls')) return;
            video.paused ? video.play() : video.pause();
        });

        video.addEventListener('ended', () => {
            emit('ended', { time: video.currentTime });
        });

        // --- External API ---
        el._setSrc = (url) => {
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
    }
});
