import { ComponentFactory } from '../../factory.js';
import { MpiIconButton } from '../MpiIconButton/MpiIconButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';

/**
 * MpiMuteIcon — Compound component for mute/volume toggle.
 * Composes MpiIconButton with volume-state-aware icon swap.
 *
 * Props:
 * @param {boolean} [muted=false] - Muted state
 * @param {number}  [volume=1.0] - Volume level 0–1 (used to pick icon: off/low/high)
 * @param {'sm'|'md'|'lg'} [size='md'] - Button size
 * 
 * Emits:
 * 'change' { muted: boolean, volume: number }
 */
export const MpiMuteIcon = ComponentFactory.create({
    name: 'MpiMuteIcon',
    css: ['js/components/Compounds/MpiMuteIcon/MpiMuteIcon.css'],

    template: (props) => {
        const muted = props.muted ?? false;
        const volume = props.volume ?? 1.0;
        const size = props.size || 'md';
        const icon = muted ? 'volumeOff' : (volume > 0.5 ? 'volumeHigh' : 'volumeLow');

        return MpiIconButton.template({
            icon,
            size,
            info: muted ? 'Unmute' : 'Mute',
            extraClasses: 'mpi-mute-icon'
        });
    },

    setup: (el, props, emit) => {
        let muted = props.muted ?? false;
        let volume = props.volume ?? 1.0;
        const size = props.size || 'md';

        // Functional inheritence: use MpiIconButton's setup to handle clicks/toggles
        MpiIconButton.setup(el, { ...props, toggleable: false }, emit);

        /** Force re-render of inner icon based on current state */
        function _updateIcon() {
            const iconName = muted ? 'volumeOff' : (volume > 0.5 ? 'volumeHigh' : 'volumeLow');
            const iconContainer = el.querySelector('.mpi-ibtn__icon');
            if (iconContainer) {
                iconContainer.innerHTML = MpiIcon.template({ name: iconName, size });
            }
            
            el.dataset.muted = muted ? '1' : '0';
            el.setAttribute('data-info', muted ? 'Unmute' : 'Mute');
            el.title = muted ? 'Unmute' : 'Mute';
        }

        el.addEventListener('click', (e) => {
            // MpiIconButton setup also emits its own events, but we override state here
            muted = !muted; 
            _updateIcon();
            emit('change', { muted, volume });
        });

        // Add public API methods to the element for orchestration by VolumeControl
        el._setVolume = (v) => {
            volume = v;
            _updateIcon();
        };

        el._setMuted = (m) => {
            muted = m;
            _updateIcon();
        };

        // Initial icon sync
        _updateIcon();
    }
});

