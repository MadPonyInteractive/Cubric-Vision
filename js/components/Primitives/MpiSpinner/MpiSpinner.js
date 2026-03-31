import { ComponentFactory } from '../../factory.js';

/**
 * MpiSpinner — Loading Spinner Primitive
 * 
 * Props:
 * @param {'sm'|'md'|'lg'} [size='md'] - Spinner size
 * @param {'primary'|'secondary'|'light'|'dark'} [variant='primary'] - Color variant
 */
export const MpiSpinner = ComponentFactory.create({
    name: 'MpiSpinner',
    css: ['js/components/Primitives/MpiSpinner/MpiSpinner.css'],

    template: (props) => {
        const size = props.size || 'md';
        const variant = props.variant || 'primary';
        return `<div class="mpi-spinner mpi-spinner--${size} mpi-spinner--${variant}"></div>`;
    }
});
