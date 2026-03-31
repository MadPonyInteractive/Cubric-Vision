/**
 * videoPlayerCore.js — Reusable video playback utilities.
 *
 * RULES FOR AGENTS:
 * - Import from here for any tool that needs video playback controls.
 * - These are pure binding functions — they attach behavior to existing DOM elements.
 * - No tool-specific logic lives here. Every function must work for ANY video tool.
 */
import { VolumeControl } from './VolumeControl.js';

const _PLAY_ICON  = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const _PAUSE_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// ─── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Formats seconds into MM:SS.ms display string.
 * @param {number} s
 * @returns {string}
 */
export function formatTime(s) {
    if (isNaN(s) || s < 0) return '00:00.00';
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms  = Math.floor((s % 1) * 100);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

// ─── Bindings ─────────────────────────────────────────────────────────────────

/**
 * Binds a play/pause button to a video element.
 * Automatically syncs button icon on play, pause, and click.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLButtonElement} btnEl
 */
export function bindPlayPause(videoEl, btnEl) {
    if (!btnEl) return;
    const update = () => { btnEl.innerHTML = videoEl.paused ? _PLAY_ICON : _PAUSE_ICON; };
    btnEl.addEventListener('click', () => { videoEl.paused ? videoEl.play() : videoEl.pause(); });
    videoEl.addEventListener('play', update);
    videoEl.addEventListener('pause', update);
}

/**
 * Binds a time display element to update on video timeupdate.
 * Format: "MM:SS.ms / MM:SS.ms"
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLElement} displayEl
 */
export function bindTimeDisplay(videoEl, displayEl) {
    if (!displayEl) return;
    videoEl.addEventListener('timeupdate', () => {
        displayEl.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`;
    });
}

/**
 * Binds a complete volume control: hover popup, drag slider, mousewheel, mute toggle.
 * 
 * @param {HTMLVideoElement} videoEl
 * @param {{ controlEl: HTMLElement, popupEl: HTMLElement, sliderEl: HTMLElement, iconEl: HTMLElement, onVolumeChange: Function }} elements
 */
export function bindVolumeControl(videoEl, { controlEl, popupEl, sliderEl, iconEl, onVolumeChange }) {
    if (!controlEl || !popupEl || !iconEl) return;

    const _notify = () => { if (onVolumeChange) onVolumeChange(videoEl.volume, videoEl.muted); };

    // Clear existing DOM
    popupEl.innerHTML = '';
    iconEl.innerHTML = '';

    new VolumeControl(
        { container: controlEl, icon: iconEl, popup: popupEl },
        {
            volume: videoEl.volume,
            muted: videoEl.muted,
            showValue: false, // Default to no value for video players
            onChange: (v, m) => {
                videoEl.volume = v;
                videoEl.muted = m;
                _notify();
            }
        }
    );
}