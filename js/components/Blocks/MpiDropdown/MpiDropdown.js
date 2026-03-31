import { ComponentFactory } from '../../factory.js';
import { MpiPopupButton } from '../../Compounds/MpiPopupButton/MpiPopupButton.js';
import { MpiScrollableBox } from '../../Compounds/MpiScrollableBox/MpiScrollableBox.js';
import { MpiIconButton } from '../../Compounds/MpiIconButton/MpiIconButton.js';

/**
 * MpiDropdown — Block Component
 * 
 * A custom dropdown leveraging MpiPopupButton as a carrier and MpiScrollableBox 
 * as the content.
 *
 * Props:
 * @param {string[]}  titles - Options to display in the list
 * @param {string}    [label='Select...'] - Initial trigger text
 * @param {string}    [maxHeight='250px'] - Max list height before scrolling
 * @param {'top'|'bottom'} [position='top'] - Where the dropdown appears (default above trigger)
 * @param {string}    [icon] - Custom icon name (defaults based on position)
 */
export const MpiDropdown = ComponentFactory.create({
    name: 'MpiDropdown',
    css: ['js/components/Blocks/MpiDropdown/MpiDropdown.css'],

    template: (props) => {
        const label = props.label || 'Select...';
        const maxHeight = props.maxHeight || '250px';
        const position = props.position || 'top';

        // 1. Build the trigger HTML — use MpiIconButton for icon support
        const triggerHtml = MpiIconButton.template({
            label,
            variant: 'primary', // maps to secondary/glass in MpiIconButton
            icon: props.icon || (position === 'top' ? 'chevronUp' : 'chevronDown'),
            labelPosition: 'left',
            toggleable: true
        });

        // 2. Build the list HTML
        const listHtml = MpiScrollableBox.template({
            titles: props.titles || [],
            maxHeight
        });

        // 3. Compose everything inside MpiPopupButton
        const popupHtml = MpiPopupButton.template({
            triggerHtml,
            position
        }, listHtml);

        return `<div class="mpi-dropdown mpi-dropdown--${position}">
            ${popupHtml}
        </div>`;
    },

    setup: (el, props, emit) => {
        // Since MpiDropdown is a Block composing other components via their templates,
        // we must manually invoke their setup logic for the DOM nodes they produced.

        // Shared props for MpiPopupButton so we can control it from here
        const popupProps = {
            triggerHtml: '',
            position: props.position || 'top',
            showPopup: false
        };

        // 1. Setup MpiPopupButton logic (handles trigger clicks, open/close state, etc.)
        const popupBtnEl = el.querySelector('.mpi-popup-btn');
        if (popupBtnEl) MpiPopupButton.setup(popupBtnEl, popupProps, emit);

        // 2. Setup MpiScrollableBox logic inside the popup
        const listEl = el.querySelector('.mpi-scrollable-box');
        if (listEl) {
            MpiScrollableBox.setup(listEl, {
                titles: props.titles || [],
                maxHeight: props.maxHeight
            }, (event, data) => {
                if (event === 'click') {
                    const value = data.value;
                    const triggerBtnText = el.querySelector('.mpi-ibtn__label');

                    if (triggerBtnText) triggerBtnText.textContent = value;
                    emit('select', { value });

                    // Auto-close on selection:
                    popupProps.showPopup = false;
                    if (popupBtnEl) popupBtnEl.classList.remove('is-open');

                    const popupEl = el.querySelector('.mpi-popup');
                    if (popupEl) popupEl.classList.remove('is-active');

                    // Reset trigger state
                    const triggerBtn = el.querySelector('.mpi-popup-btn__trigger .mpi-btn');
                    if (triggerBtn) triggerBtn.classList.remove('is-active');
                }
            });
        }
    }
});
