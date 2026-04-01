import { ComponentFactory } from '../../factory.js';

/**
 * MpiPopup — Floating container primitive
 * 
 * Props:
 * @param {boolean} [active=false] - Visibility state
 * @param {string}  [variant='glass'] - Style variant
 * @param {string}  [position='top'] - Position relative to trigger (top, bottom, left, right)
 * @param {Array}   [items=[]] - Optional list of items: { id, label, iconHtml }
 */
export const MpiPopup = ComponentFactory.create({
    name: 'MpiPopup',
    css: ['js/components/Primitives/MpiPopup/MpiPopup.css'],

    template: (props, children) => {
        const activeClass = props.active ? 'is-active' : '';
        const variant = props.variant || 'glass';
        const position = props.position || 'top';
        
        let contentHtml = children || '';
        
        if (props.items && Array.isArray(props.items)) {
            contentHtml += props.items.map(item => `
                <div class="mpi-popup__item" data-id="${item.id}">
                    ${item.iconHtml ? `<span class="mpi-popup__item-icon">${item.iconHtml}</span>` : ''}
                    <span class="mpi-popup__item-label">${item.label}</span>
                </div>
            `).join('');
        }

        return `<div class="mpi-popup mpi-popup--${variant} mpi-popup--${position} ${activeClass}">
            <div class="mpi-popup__content">
                ${contentHtml}
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        // Core interaction handling
        el.addEventListener('mouseenter', (e) => emit('mouseenter', e));
        el.addEventListener('mouseleave', (e) => emit('mouseleave', e));
        
        // Item click handling
        el.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-popup__item');
            if (item) {
                const id = item.getAttribute('data-id');
                emit('select', { id, el: item });
            }
            emit('click', e);
        });
    }
});
