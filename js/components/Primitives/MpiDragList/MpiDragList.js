import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiDragList — Primitive Component
 * 
 * A scrollable box containing items that can be dragged to reorder.
 *
 * Props:
 * @param {import('../../types.js').MpiDragListItem[]} items - List of items to display
 * @param {string|number} [maxHeight='250px'] - Scrollable area height
 * @param {string} [placeholder='Empty list'] - Text when no items
 */
export const MpiDragList = ComponentFactory.create({
    name: 'MpiDragList',
    css: ['js/components/Primitives/MpiDragList/MpiDragList.css'],

    template: (props) => {
        const items = props.items || [];
        const maxHeight = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : (props.maxHeight || '250px');
        const placeholder = props.placeholder || 'Empty list';

        let listHtml = '';
        if (items.length === 0) {
            listHtml = `<div class="mpi-draglist__empty">${placeholder}</div>`;
        } else {
            listHtml = items.map((item, index) => {
                // Use renderIcon as a drag handle
                const handleHtml = renderIcon('menu', 'sm', { color: 'muted' });

                return `
                    <div class="mpi-draglist__item" draggable="true" data-index="${index}">
                        <div class="mpi-draglist__handle">${handleHtml}</div>
                        <span class="mpi-draglist__label">${item.label}</span>
                    </div>`;
            }).join('');
        }

        return `
            <div class="mpi-draglist" style="max-height: ${maxHeight}">
                <div class="mpi-draglist__container">
                    ${listHtml}
                </div>
            </div>`;
    },

    setup: (el, props, emit) => {
        let draggedEl = null;

        const container = el.querySelector('.mpi-draglist__container');
        const itemsEls = el.querySelectorAll('.mpi-draglist__item');

        itemsEls.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedEl = item;
                item.classList.add('mpi-draglist__item--dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', (e) => {
                item.classList.remove('mpi-draglist__item--dragging');

                // Get the final order from the DOM
                const currentItems = Array.from(el.querySelectorAll('.mpi-draglist__item'));
                const newOrderIndices = currentItems.map(node => parseInt(node.dataset.index, 10));

                // Map back to original objects to emit the new list
                const reorderedItems = newOrderIndices.map(idx => props.items[idx]);

                emit('reorder', {
                    items: reorderedItems,
                    indices: newOrderIndices
                });

                draggedEl = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const target = e.target.closest('.mpi-draglist__item');
                if (target && target !== draggedEl) {
                    const rect = target.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;

                    if (e.clientY < midpoint) {
                        container.insertBefore(draggedEl, target);
                    } else {
                        container.insertBefore(draggedEl, target.nextSibling);
                    }
                }
            });
        });
    }
});
