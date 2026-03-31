import { ComponentFactory } from '../../factory.js';

/**
 * MpiBadge — Badge/Label Primitive
 * 
 * Props:
 * @param {string} label - Badge text or count
 * @param {'primary'|'secondary'|'success'|'warning'|'danger'|'info'} [variant='primary'] - Color variant
 * @param {boolean} [pill=false] - Rounded pill style
 */
export const MpiBadge = ComponentFactory.create({
    name: 'MpiBadge',
    css: ['js/components/Primitives/MpiBadge/MpiBadge.css'],

    template: (props) => {
        const variant = props.variant || 'primary';
        const pillClass = props.pill ? 'mpi-badge--pill' : '';
        
        return `<span class="mpi-badge mpi-badge--${variant} ${pillClass}">${props.label}</span>`;
    }
});
