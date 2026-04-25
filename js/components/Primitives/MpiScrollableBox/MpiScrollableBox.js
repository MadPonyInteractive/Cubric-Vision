import { ComponentFactory } from '../../factory.js';
import { qsa } from '../../../utils/dom.js';

/**
 * MpiScrollableBox — Primitive Component
 * 
 * A minimal, performant scrollable box for list selections.
 *
 * Props:
 * @param {string[]} titles - List of item labels
 * @param {string|number} [maxHeight] - Optional max height
 * @param {'single'|'multiple'} [selectionMode='single'] - Selection behavior
 * @param {string[]} [selected=[]] - Initially selected items
 */
export const MpiScrollableBox = ComponentFactory.create({
    name: 'MpiScrollableBox',
    css: ['js/components/Primitives/MpiScrollableBox/MpiScrollableBox.css'],

    template: (props) => {
        const style = props.maxHeight ? `style="max-height: ${props.maxHeight}"` : '';
        const initialSelected = props.selected || [];

        const itemsHtml = (props.titles || []).map(title => {
            const isSelected = initialSelected.includes(title);
            return `
                <div class="mpi-scrollable-box__item ${isSelected ? 'is-selected' : ''}" 
                     data-value="${title}">
                    ${title}
                </div>
            `;
        }).join('');

        return `<div class="mpi-scrollable-box" ${style}>
            <div class="mpi-scrollable-box__list">
                ${itemsHtml}
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        const items = qsa('.mpi-scrollable-box__item', el);
        const mode = props.selectionMode || 'single';
        
        // Track selection in a local set for easy lookups
        let currentSelection = new Set(props.selected || []);

        items.forEach(item => {
            item.addEventListener('click', () => {
                const value = item.getAttribute('data-value');

                if (mode === 'single') {
                    // Deselect others
                    items.forEach(i => i.classList.remove('is-selected'));
                    item.classList.add('is-selected');
                    currentSelection.clear();
                    currentSelection.add(value);
                } else {
                    // Toggle multiple
                    const isSelected = item.classList.toggle('is-selected');
                    if (isSelected) {
                        currentSelection.add(value);
                    } else {
                        currentSelection.delete(value);
                    }
                }

                emit('select', { 
                    value, 
                    selection: Array.from(currentSelection) 
                });
            });
        });

        // Wheel behavior
        el.addEventListener('wheel', (e) => {}, { passive: true });
    }
});

