import { ComponentFactory } from '../../factory.js';

/**
 * MpiButton — Atomic Button Component
 * 
 * Props:
 * - text (string): Button label
 * - variant (string): 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
 * - size (string): 'sm' | 'md' | 'lg'
 * - info (string): Info Bar / tooltip description
 * - disabled (boolean): Disables interaction
 * - loading (boolean): Shows spinner and disables interaction
 * - type (string): 'button' | 'submit' | 'reset'
 */
export const MpiButton = ComponentFactory.create({
    name: 'MpiButton',
    template: (props, children) => {
        const variant     = props.variant  || 'primary';
        const size        = props.size     || 'md';
        const type        = props.type     || 'button';
        const isDisabled  = props.disabled || props.loading ? 'disabled' : '';
        const isLoading   = props.loading  ? 'mpi-btn--loading' : '';
        const extraClasses = props.extraClasses || '';
        const dataAttrs   = props.info ? `data-info="${props.info}"` : '';

        const textHtml = props.text ? `<span class="mpi-btn__text">${props.text}</span>` : '';

        return `
            <button type="${type}"
                    class="mpi-btn mpi-btn--${variant} mpi-btn--${size} ${isLoading} ${extraClasses}"
                    ${isDisabled} ${dataAttrs}>
                ${textHtml}
                ${children || ''}
            </button>
        `;
    },
    css: ['js/components/Primitives/MpiButton/MpiButton.css'],
    setup: (el, props, emit) => {
        const MIN_PRESS_MS = 150;
        let pressStart = 0;
        let pressTimer = null;

        el.addEventListener('pointerdown', () => {
            if (props.disabled || props.loading) return;
            pressStart = Date.now();
            el.classList.add('is-pressed');
        });

        const releasePress = () => {
            clearTimeout(pressTimer);
            const remaining = MIN_PRESS_MS - (Date.now() - pressStart);
            if (remaining > 0) {
                pressTimer = setTimeout(() => el.classList.remove('is-pressed'), remaining);
            } else {
                el.classList.remove('is-pressed');
            }
        };

        el.addEventListener('pointerup',     releasePress);
        el.addEventListener('pointerleave',  releasePress);
        el.addEventListener('pointercancel', releasePress);

        el.addEventListener('click', (e) => {
            if (props.disabled || props.loading) return;
            emit('click', { originalEvent: e });
        });
    }
});

