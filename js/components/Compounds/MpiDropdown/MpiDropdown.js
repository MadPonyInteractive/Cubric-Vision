import { ComponentFactory } from '../../factory.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { MpiScrollableBox } from '../../Primitives/MpiScrollableBox/MpiScrollableBox.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';

/**
 * MpiDropdown — Block Component
 * 
 * A custom dropdown leveraging MpiButton as trigger and MpiPopup as container.
 */
export const MpiDropdown = ComponentFactory.create({
    name: 'MpiDropdown',
    css: ['js/components/Compounds/MpiDropdown/MpiDropdown.css'],

    template: (props) => {
        const label = props.label || 'Select...';
        const maxHeight = props.maxHeight || '250px';
        const position = props.position || 'top';
        const isActive = props.showPopup || false;

        const triggerBtnHtml = MpiButton.template({
            label,
            variant: 'primary',
            icon: props.icon || (position === 'top' ? 'chevronUp' : 'chevronDown'),
            labelPosition: 'left',
            toggleable: true,
            active: isActive
        });

        const listHtml = MpiScrollableBox.template({
            titles: props.titles || [],
            maxHeight
        });

        const popupHtml = MpiPopup.template({
            active: isActive,
            position
        }, listHtml);

        return `<div class="mpi-dropdown mpi-dropdown--${position}">
            <div class="mpi-dropdown__trigger">
                ${triggerBtnHtml}
            </div>
            ${popupHtml}
        </div>`;
    },

    setup: (el, props, emit) => {
        const trigger = el.querySelector('.mpi-dropdown__trigger');
        const popupEl = el.querySelector('.mpi-popup');
        const listEl = el.querySelector('.mpi-scrollable-box');

        // Toggle popup
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            props.showPopup = !props.showPopup;
            popupEl.classList.toggle('is-active', props.showPopup);
            
            const btn = trigger.querySelector('.mpi-btn');
            if (btn) btn.classList.toggle('is-active', props.showPopup);
        });

        // Setup MpiScrollableBox logic
        if (listEl) {
            MpiScrollableBox.setup(listEl, {
                titles: props.titles || [],
                maxHeight: props.maxHeight,
                selected: [props.label]
            }, (event, data) => {
                if (event === 'select') {
                    const value = data.value;
                    const labelEl = el.querySelector('.mpi-ibtn__label');
                    if (labelEl) labelEl.textContent = value;
                    
                    emit('select', { value });

                    // Auto-close (Dropdown is usually single-select and closes on choice)
                    props.showPopup = false;
                    popupEl.classList.remove('is-active');
                    const btn = trigger.querySelector('.mpi-btn');
                    if (btn) btn.classList.remove('is-active');
                }
            });
        }

        // Close on outside click
        const onOutsideClick = (e) => {
            if (!el.contains(e.target) && props.showPopup) {
                props.showPopup = false;
                popupEl.classList.remove('is-active');
                const btn = trigger.querySelector('.mpi-btn');
                if (btn) btn.classList.remove('is-active');
            }
        };
        document.addEventListener('click', onOutsideClick);
        el._onOutsideClick = onOutsideClick; // store for teardown if needed
    }
});
