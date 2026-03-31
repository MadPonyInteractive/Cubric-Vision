/**
 * VolumeControl.js — Unified Volume & Mute Component.
 * Orchestrates a MuteIcon and a Slider popup.
 */
import { Slider } from './Slider.js';
import { MuteIcon } from './MuteIcon.js';

export class VolumeControl {
    /**
     * @param {Object} els
     * @param {HTMLElement} els.container - Parent container for hover events.
     * @param {HTMLElement} els.icon - Container for the mute icon button.
     * @param {HTMLElement} els.popup - Container for the slider popup.
     * @param {Object} config
     * @param {number} [config.volume=1] - 0 to 1
     * @param {boolean} [config.muted=false]
     * @param {boolean} [config.showValue=false]
     * @param {(vol: number, muted: boolean) => void} [config.onChange]
     */
    constructor(els, config = {}) {
        this.els = els;
        this.container = els.container || els.control;
        this.volume = config.volume ?? 1;
        this.muted = !!config.muted;
        this.onChange = config.onChange;

        this.init(config);
        this.bindEvents();
    }

    init(config) {
        // 1. Setup Mute Icon
        this.muteIcon = new MuteIcon(this.els.icon, {
            muted: this.muted,
            volume: this.volume,
            onToggle: (m) => {
                this.muted = m;
                this.slider.setValue(m ? 0 : this.volume);
                this.triggerChange();
            }
        });

        // 2. Setup Slider Popup
        this.slider = new Slider(this.els.popup, {
            orientation: 'vertical',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.muted ? 0 : this.volume,
            popup: true,
            wheel: true,
            showValue: config.showValue ?? false,
            onChange: (v) => {
                // If sliding up from 0, unmute
                if (this.muted && v > 0) {
                    this.muted = false;
                }
                // Update internal base volume only if not muted, or if v > 0
                if (v > 0) {
                    this.volume = v;
                    this.muted = false;
                } else {
                    this.muted = true;
                }

                this.muteIcon.setVolume(v);
                this.muteIcon.setMuted(this.muted);
                this.triggerChange();
            }
        });
    }

    bindEvents() {
        if (!this.container) return;

        this.container.addEventListener('mouseenter', () => {
            this.slider.show();
        });

        this.container.addEventListener('mouseleave', () => {
            this.slider.hide();
        });
    }

    triggerChange() {
        if (this.onChange) {
            this.onChange(this.volume, this.muted);
        }
    }

    setVolume(vol) {
        this.volume = vol;
        this.slider.setValue(this.muted ? 0 : vol, true);
        this.muteIcon.setVolume(vol);
    }

    setMuted(muted) {
        this.muted = muted;
        this.slider.setValue(muted ? 0 : this.volume, true);
        this.muteIcon.setMuted(muted);
    }

    destroy() {
        this.muteIcon.destroy();
        this.slider.destroy();
    }
}
