/**
 * MuteIcon.js — Reusable mute toggle component.
 */
export class MuteIcon {
    /**
     * @param {HTMLElement} container - The element to inject the button into.
     * @param {Object} config
     * @param {boolean} [config.muted=false] - Initial muted state.
     * @param {number} [config.volume=1] - Current volume (0-1) to determine icon state.
     * @param {(muted: boolean) => void} [config.onToggle] - Callback on click.
     */
    constructor(container, config = {}) {
        this.container = container;
        this.muted = !!config.muted;
        this.volume = config.volume ?? 1;
        this.onToggle = config.onToggle;

        this.el = document.createElement('button');
        this.el.className = `mpi-mute-btn ${this.muted ? 'muted' : ''}`;
        this.el.type = 'button';
        this.el.title = this.muted ? 'Unmute' : 'Mute';

        this.render();
        this.container.appendChild(this.el);

        this.el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.muted = !this.muted;
            this.updateUI();
            if (this.onToggle) this.onToggle(this.muted);
        });
    }

    setMuted(muted) {
        this.muted = muted;
        this.updateUI();
    }

    setVolume(vol) {
        this.volume = vol;
        this.updateUI();
    }

    updateUI() {
        this.el.classList.toggle('muted', this.muted);
        this.el.title = this.muted ? 'Unmute' : 'Mute';
        this.render();
    }

    render() {
        const vol = this.muted ? 0 : this.volume;
        let path = '';

        if (vol === 0) {
            path = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
        } else if (vol < 0.5) {
            path = `<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>`;
        } else {
            path = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
        }

        this.el.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">${path}</svg>`;
    }

    destroy() {
        this.el.remove();
    }
}
