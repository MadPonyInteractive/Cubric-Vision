import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiVolumeControl — Compound: MpiButton (mute toggle) + MpiProgressBar popup.
 * Orchestrates volume state between a toggleable icon and a vertical slider.
 *
 * Props:
 * @param {number} [volume=1.0] - Initial volume 0–1
 * @param {boolean} [muted=false] - Initial muted state
 *
 * Emits:
 * 'change' { volume: number, muted: boolean }
 */
export const MpiVolumeControl = ComponentFactory.create({
    name: 'MpiVolumeControl',
    css: ['js/components/Compounds/MpiVolumeControl/MpiVolumeControl.css'],

    template: () => `<div class="mpi-volume-control"></div>`,

    setup: (el, props, emit) => {
        let volume = props.volume ?? 1.0;
        let muted = props.muted ?? false;
        let _prevVolume = volume > 0 ? volume : 1.0;

        // ── Volume icon helper ─────────────────────────────────────────────────
        const _volumeIcon = () => muted ? 'volumeOff' : (volume > 0.5 ? 'volumeHigh' : 'volumeLow');

        // Container structure
        const iconContainer = document.createElement('div');
        iconContainer.className = 'mpi-volume-control__icon';
        const popupContainer = document.createElement('div');
        popupContainer.className = 'mpi-volume-control__popup';

        el.appendChild(iconContainer);
        el.appendChild(popupContainer);

        // Mount mute toggle button
        const muteBtn = MpiButton.mount(iconContainer, {
            icon: _volumeIcon(),
            info: muted ? 'Unmute' : 'Mute',
            size: 'md',
        });

        /** Syncs the button icon and tooltip to current volume/muted state */
        const _syncIcon = () => {
            const iconEl = muteBtn.el.querySelector('.mpi-ibtn__icon');
            if (iconEl) iconEl.innerHTML = renderIcon(_volumeIcon(), 'md');
            muteBtn.el.setAttribute('data-info', muted ? 'Unmute' : 'Mute');
        };

        // Mount Popup
        const popup = MpiPopup.mount(popupContainer, { variant: 'glass' });

        // Create slot for slider inside popup
        const sliderSlot = document.createElement('div');
        sliderSlot.className = 'mpi-volume-control__slider-wrapper';
        popup.el.querySelector('.mpi-popup__content').appendChild(sliderSlot);

        // Mount Slider (0-100 for granularity, mapped to 0-1)
        const slider = MpiProgressBar.mount(sliderSlot, {
            min: 0,
            max: 100,
            step: 1,
            value: muted ? 0 : Math.round(volume * 100),
            interactive: true,
            wheel: true,
            info: 'Volume: {value}%',
            variant: 'primary'
        });

        // Toggle Visibility on Hover
        let hoverTimer;
        el.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimer);
            popup.el.classList.add('is-active');
        });

        el.addEventListener('mouseleave', () => {
            hoverTimer = setTimeout(() => {
                popup.el.classList.remove('is-active');
            }, 300);
        });

        // Handle Mute Toggle
        muteBtn.on('click', () => {
            muted = !muted;
            if (muted) {
                _prevVolume = volume > 0 ? volume : _prevVolume;
                slider.el.querySelector('input').value = 0;
            } else {
                volume = _prevVolume;
                slider.el.querySelector('input').value = Math.round(volume * 100);
            }
            slider.el.querySelector('input').dispatchEvent(new Event('input'));
            _syncIcon();
            emit('change', { volume: muted ? 0 : volume, muted });
        });

        // Handle Slider Changes
        slider.on('change', ({ value }) => {
            const v = value / 100;
            if (v > 0) {
                volume = v;
                muted = false;
            } else {
                muted = true;
            }
            _syncIcon();
            emit('change', { volume, muted });
        });

        // External API for programmatic updates (used by MpiVideoPlayer)
        el._setVolume = (v) => {
            volume = v;
            if (!muted) {
                slider.el.querySelector('input').value = Math.round(v * 100);
                slider.el.querySelector('input').dispatchEvent(new Event('input'));
            }
            _syncIcon();
        };

        el._setMuted = (m) => {
            muted = m;
            slider.el.querySelector('input').value = m ? 0 : Math.round(volume * 100);
            slider.el.querySelector('input').dispatchEvent(new Event('input'));
            _syncIcon();
        };
    }
});

