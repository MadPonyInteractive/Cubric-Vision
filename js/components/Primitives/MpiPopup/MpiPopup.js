import { ComponentFactory } from '../../factory.js';

/**
 * MpiPopup — Floating container primitive
 * 
 * Props:
 * @param {boolean} [active=false] - Visibility state
 * @param {string}  [variant='glass'] - Style variant
 */
export const MpiPopup = ComponentFactory.create({
    name: 'MpiPopup',
    css: ['js/components/Primitives/MpiPopup/MpiPopup.css'],

    template: (props, children) => {
        const activeClass = props.active ? 'is-active' : '';
        const variant = props.variant || 'glass';
        
        return `<div class="mpi-popup mpi-popup--${variant} ${activeClass}">
            <div class="mpi-popup__content">
                ${children || ''}
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        // Primitive should not dictate close behavior via mouseleave
    }
});
