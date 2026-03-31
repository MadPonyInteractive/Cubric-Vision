import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';

/**
 * MpiScrollableBox — Compound Component
 * 
 * A scrollable container holding a list of MpiButtons.
 *
 * Props:
 * @param {string[]} titles - List of button text labels
 * @param {string|number} [maxHeight] - Optional max height for the scrollable area
 */
export const MpiScrollableBox = ComponentFactory.create({
    name: 'MpiScrollableBox',
    css: ['js/components/Compounds/MpiScrollableBox/MpiScrollableBox.css'],

    template: (props) => {
        const style = props.maxHeight ? `style="max-height: ${props.maxHeight}"` : '';
        const buttonsHtml = (props.titles || []).map(title =>
            MpiButton.template({
                text: title,
                variant: 'primary',
                info: `Select: ${title}` // For hover info
            })
        ).join('');

        return `<div class="mpi-scrollable-box" ${style}>
            <div class="mpi-scrollable-box__list">
                ${buttonsHtml}
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        // Find all buttons that were just templated
        const buttons = el.querySelectorAll('.mpi-btn');

        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const title = props.titles[index];
                emit('click', { value: title });
            });
        });

        // Mouse wheel support for scrolling is native via overflow: auto,
        // but let's ensure it's intuitive.
        el.addEventListener('wheel', (e) => {
            // Passive scroll is fine. If we wanted custom behaviour
            // (like horizontal-to-vertical) we'd add it here.
        }, { passive: true });
    }
});
