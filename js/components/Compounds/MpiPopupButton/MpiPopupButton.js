import { ComponentFactory } from '../../factory.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';

/**
 * MpiPopupButton — Compound Component
 * 
 * Composes a generic trigger element with a floating popup.
 * Evaluated as Compound because it leverages the MpiPopup Primitive.
 *
 * Props:
 * @param {string} triggerHtml - HTML for the trigger button
 * @param {boolean} [showPopup=false] - Initial state
 */
export const MpiPopupButton = ComponentFactory.create({
    name: 'MpiPopupButton',
    css: ['js/components/Compounds/MpiPopupButton/MpiPopupButton.css'],

    template: (props, children) => {
        const isActive = props.showPopup || false;
        const position = props.position || 'top';
        const popupHtml = MpiPopup.template({ active: isActive }, children);

        return `<div class="mpi-popup-btn ${isActive ? 'is-open' : ''} mpi-popup-btn--${position}">
            ${popupHtml}
            <div class="mpi-popup-btn__trigger">
                ${props.triggerHtml || ''}
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        const trigger = el.querySelector('.mpi-popup-btn__trigger');
        const popupEl = el.querySelector('.mpi-popup');
        let leaveTimer = null;

        // Toggle popup
        trigger.addEventListener('click', (e) => {
            const btn = e.target.closest('.mpi-btn') || trigger.firstElementChild;
            if (!btn) return;

            e.stopPropagation();
            props.showPopup = !props.showPopup;
            el.classList.toggle('is-open', props.showPopup);
            popupEl.classList.toggle('is-active', props.showPopup);
            
            btn.classList.toggle('is-active', props.showPopup);
            
            emit('popup_toggle', { active: props.showPopup });
        });

        // Handle mouseleave with a timeout bridge so crossing the gap doesn't close it
        el.addEventListener('mouseleave', () => {
            leaveTimer = setTimeout(() => {
                if (props.showPopup) {
                    props.showPopup = false;
                    el.classList.remove('is-open');
                    popupEl.classList.remove('is-active');
                    
                    const btn = trigger.querySelector('.mpi-btn') || trigger.firstElementChild;
                    if (btn) btn.classList.remove('is-active');
                    
                    emit('popup_toggle', { active: false });
                }
            }, 150);
        });

        el.addEventListener('mouseenter', () => {
            if (leaveTimer) clearTimeout(leaveTimer);
        });
    }
});
