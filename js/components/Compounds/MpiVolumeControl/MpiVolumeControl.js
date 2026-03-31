import { ComponentFactory } from '../../factory.js';
import { MpiMuteIcon }  from '../MpiMuteIcon/MpiMuteIcon.js';
import { MpiSlider }    from '../MpiSlider/MpiSlider.js';
import { MpiPopup }     from '../../Primitives/MpiPopup/MpiPopup.js';

/**
 * MpiVolumeControl — Compound: MpiMuteIcon + MpiSlider popup.
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
        let muted  = props.muted  ?? false;
        let _prevVolume = volume > 0 ? volume : 1.0;

        // Container structure
        const iconContainer = document.createElement('div');
        iconContainer.className = 'mpi-volume-control__icon';
        const popupContainer = document.createElement('div');
        popupContainer.className = 'mpi-volume-control__popup';
        
        el.appendChild(iconContainer);
        el.appendChild(popupContainer);

        // Mount Mute Icon
        const muteIcon = MpiMuteIcon.mount(iconContainer, { volume, muted });
        
        // Mount Popup
        const popup = MpiPopup.mount(popupContainer, { variant: 'glass' });
        
        // Create Slot for Slider inside Popup
        const sliderSlot = document.createElement('div');
        sliderSlot.className = 'mpi-volume-control__slider-wrapper';
        popup.el.querySelector('.mpi-popup__content').appendChild(sliderSlot);

        // Mount Slider (0-100 for granularity, then map to 0-1)
        const slider = MpiSlider.mount(sliderSlot, {
            min: 0, 
            max: 100, 
            step: 1, 
            value: muted ? 0 : Math.round(volume * 100),
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

        // Handle Mute Toggle from Icon
        muteIcon.on('change', ({ muted: isMuted }) => {
            muted = isMuted;
            if (muted) {
                _prevVolume = volume > 0 ? volume : _prevVolume;
                slider.el.querySelector('input').value = 0;
            } else {
                volume = _prevVolume;
                slider.el.querySelector('input').value = Math.round(volume * 100);
            }
            // Trigger slider visual update (ProgressBar setup listens for 'input')
            slider.el.querySelector('input').dispatchEvent(new Event('input'));
            
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
            
            // Sync Icon
            muteIcon.el._setVolume?.(volume);
            muteIcon.el._setMuted?.(muted);
            
            emit('change', { volume, muted });
        });

        // External API for programmatic updates
        el._setVolume = (v) => {
            volume = v;
            if (!muted) {
                slider.el.querySelector('input').value = Math.round(v * 100);
                slider.el.querySelector('input').dispatchEvent(new Event('input'));
            }
            muteIcon.el._setVolume?.(v);
        };

        el._setMuted = (m) => {
            muted = m;
            slider.el.querySelector('input').value = m ? 0 : Math.round(volume * 100);
            slider.el.querySelector('input').dispatchEvent(new Event('input'));
            muteIcon.el._setMuted?.(m);
        };
    }
});
