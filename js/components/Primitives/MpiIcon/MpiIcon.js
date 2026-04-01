import { ComponentFactory } from '../../factory.js';
import { ICONS, renderIcon } from '/js/utils/icons.js';

// Re-export for consumers that import { MpiIcon, ICONS } from this module
export { ICONS };

/**
 * MpiIcon — Atomic SVG Icon Primitive
 *
 * A thin wrapper over renderIcon() from icons.js.
 * For standalone icon display (decorative icons, labels, etc.)
 *
 * Props:
 * @param {string}  [name='info']  - Key from ICONS registry
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [size='md'] - Icon size (via CSS class)
 * @param {'muted'|'accent'|'primary'|'danger'|'success'} [color] - Optional color modifier
 * @param {boolean} [stroke=false] - If true, renders as stroke/outline (for ratio rect icons)
 */
export const MpiIcon = ComponentFactory.create({
    name: 'MpiIcon',
    css: ['js/components/Primitives/MpiIcon/MpiIcon.css'],
    template: (props) => renderIcon(
        props.name || 'info',
        props.size || 'md',
        { stroke: props.stroke === true, color: props.color }
    )
});
