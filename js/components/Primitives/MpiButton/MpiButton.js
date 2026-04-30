import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiButton — Atomic Button Primitive
 *
 * Supports both plain text buttons and icon buttons (replaces MpiIconButton).
 *
 * Props (text buttons):
 * @param {string}  [text]          - Button label text
 * @param {string}  [variant='primary'] - 'primary'|'secondary'|'danger'|'outline'|'ghost'
 * @param {string}  [size='md']     - 'sm'|'md'|'lg'
 * @param {string}  [info]          - Info Bar / tooltip description
 * @param {boolean} [disabled]      - Disables interaction
 * @param {boolean} [loading]       - Shows spinner, disables interaction
 * @param {string}  [type='button'] - 'button'|'submit'|'reset'
 * @param {string}  [extraClasses]  - Additional CSS classes injected onto the button
 *
 * Props (icon buttons — all optional):
 * @param {string}  [icon]          - Icon registry key (activates icon-button mode)
 * @param {string}  [iconActive]    - Alternate icon shown in active/toggled state
 * @param {string}  [label]         - Text label alongside the icon
 * @param {'left'|'right'|'top'|'bottom'} [labelPosition='right'] - Label placement
 * @param {boolean} [toggleable]    - Click commits the active state
 * @param {boolean} [active]        - Initial active/toggled state
 */
export const MpiButton = ComponentFactory.create({
    name: 'MpiButton',
    css: ['js/components/Primitives/MpiButton/MpiButton.css'],

    template: (props, children) => {
        const isIconMode = !!props.icon;

        if (!isIconMode) {
            // ── Plain text button ──────────────────────────────────────────────
            const variant = props.variant || 'primary';
            const size = props.size || 'md';
            const type = props.type || 'button';
            const isDisabled = props.disabled || props.loading ? 'disabled' : '';
            const isLoading = props.loading ? 'mpi-btn--loading' : '';
            const shapeClass = props.shape === 'pill' ? 'mpi-btn--pill' : '';
            const extraClasses = props.extraClasses || '';
            const dataAttrs = props.info ? `data-info="${props.info}"` : '';
            const textHtml = props.text ? `<span class="mpi-btn__text">${props.text}</span>` : '';

            return `
                <button type="${props.type || 'button'}"
                        class="mpi-btn mpi-btn--${variant} mpi-btn--${size} ${shapeClass} ${isLoading} ${extraClasses}"
                        ${isDisabled} ${dataAttrs}>
                    ${textHtml}
                    ${children || ''}
                </button>`;
        }

        // ── Icon button mode ───────────────────────────────────────────────────
        const icon = props.icon;
        const iconActive = props.iconActive || null;
        const label = props.label || '';
        const labelPosition = props.labelPosition || 'right';
        const size = props.size || 'md';
        const variant = props.variant || 'primary';
        const info = props.info || label || '';
        const isToggleable = props.toggleable || !!iconActive;
        const isActive = props.active || false;
        const isLoading = variant === 'loading';
        const isDisabled = variant === 'disabled' || props.disabled;

        // Map variant — danger/ghost pass through; everything else → secondary
        const btnVariant = (variant === 'danger' || variant === 'ghost') ? variant : 'secondary';

        const extraClasses = [
            'mpi-ibtn',
            `mpi-ibtn--label-${labelPosition}`,
            !label ? 'mpi-btn--icon-only' : '',
            isToggleable ? 'is-toggleable' : '',
            isActive ? 'is-active' : '',
            iconActive ? 'has-icon-swap' : '',
            props.shape === 'pill' ? 'mpi-btn--pill' : '',
            props.extraClasses || '',
        ].filter(Boolean).join(' ');

        const iconHtml = renderIcon(icon, size);
        const iconActiveHtml = iconActive ? renderIcon(iconActive, size) : '';

        const iconContainer = iconActiveHtml
            ? `<span class="mpi-ibtn__icon">${iconHtml}</span><span class="mpi-ibtn__icon-swap">${iconActiveHtml}</span>`
            : `<span class="mpi-ibtn__icon">${iconHtml}</span>`;

        const labelHtml = label ? `<span class="mpi-ibtn__label">${label}</span>` : '';

        let innerHtml = isLoading
            ? `<span class="mpi-ibtn__spinner" aria-hidden="true"></span>`
            : (labelPosition === 'left' || labelPosition === 'top')
                ? `${labelHtml}${iconContainer}`
                : `${iconContainer}${labelHtml}`;

        const disabledAttr = isDisabled || isLoading ? 'disabled' : '';
        const dataAttrs = info ? `data-info="${info}"` : '';

        return `
            <button type="button"
                    class="mpi-btn mpi-btn--${btnVariant} mpi-btn--${size} ${extraClasses}"
                    ${disabledAttr} ${dataAttrs}>
                ${innerHtml}
            </button>`;
    },

    setup: (el, props, emit) => {
        const MIN_PRESS_MS = 150;
        let pressStart = 0;
        let pressTimer = null;

        el.addEventListener('pointerdown', () => {
            if (props.disabled || props.loading || props.variant === 'loading') return;
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

        el.addEventListener('pointerup', releasePress);
        el.addEventListener('pointerleave', releasePress);
        el.addEventListener('pointercancel', releasePress);

        el.addEventListener('click', (e) => {
            if (props.disabled || props.loading || props.variant === 'loading') return;

            // Toggle logic (icon-button mode only)
            if (props.icon && (props.toggleable || props.iconActive)) {
                const next = !el.classList.contains('is-active');
                el.classList.toggle('is-active', next);
                props.active = next;
                emit('toggle', { active: next });
            }

            emit('click', { originalEvent: e, active: props.active });
        });

        // Public API: sync active state from external code (e.g. _exitCropMode()).
        // Mirrors the pattern of el.setGenerating() in MpiPromptBox.
        el.setActive = (active) => {
            props.active = active;
            el.classList.toggle('is-active', active);
        };
    }
});

