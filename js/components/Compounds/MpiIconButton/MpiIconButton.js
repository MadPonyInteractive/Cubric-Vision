import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';

/**
 * MpiIconButton — Compound Icon Button
 * Composes MpiButton (shell) + MpiIcon (content).
 * All base button styles (glass bg, hover, sizes, loading, disabled)
 * are inherited from MpiButton.css via .mpi-btn classes.
 * This component only adds icon-layout, icon-swap, and press/active
 * behaviour via the compound .mpi-btn.mpi-ibtn selector.
 *
 * Props:
 * @param {string}  icon          - MpiIcon registry key
 * @param {string}  [iconActive]  - Icon shown when toggled (enables icon-swap)
 * @param {string}  [label]       - Optional text label
 * @param {string}  [info]        - Tooltip / Info Bar description
 * @param {'primary'|'danger'|'loading'|'disabled'} [variant='primary']
 * @param {'sm'|'md'|'lg'} [size='md']
 * @param {boolean} [toggleable]  - Click commits the active/pressed state
 * @param {boolean} [active]      - Initial active state
 */
export const MpiIconButton = ComponentFactory.create({
    name: 'MpiIconButton',
    css: ['js/components/Compounds/MpiIconButton/MpiIconButton.css'],

    template: (props) => {
        const variant = props.variant || 'primary';
        const size = props.size || 'md';
        const icon = props.icon || 'info';
        const iconActive = props.iconActive || null;
        const label = props.label || '';
        const labelPosition = props.labelPosition || 'right';
        const info = props.info || label || '';

        const isToggleable = props.toggleable || !!iconActive;
        const isActive = props.active || false;
        const isLoading = variant === 'loading';
        const isDisabled = variant === 'disabled' || props.disabled;

        // Map to MpiButton variants — danger stays danger, everything else = secondary (glass)
        const btnVariant = variant === 'danger' ? 'danger' : 'secondary';

        // Compound modifier classes injected onto the MpiButton shell
        const extraClasses = [
            'mpi-ibtn',
            `mpi-ibtn--label-${labelPosition}`,
            !label ? 'mpi-btn--icon-only' : '',   // square sizing from MpiButton.css
            isToggleable ? 'is-toggleable' : '',
            isActive ? 'is-active' : '',
            iconActive ? 'has-icon-swap' : '',
        ].filter(Boolean).join(' ');

        const isStroke = props.stroke === true;

        // Children: icon containers + optional label
        const iconHtml = MpiIcon.template({ name: icon, size, stroke: isStroke });
        const iconActiveHtml = iconActive ? MpiIcon.template({ name: iconActive, size, stroke: isStroke }) : '';

        const iconContainer = iconActiveHtml
            ? `<span class="mpi-ibtn__icon">${iconHtml}</span><span class="mpi-ibtn__icon-swap">${iconActiveHtml}</span>`
            : `<span class="mpi-ibtn__icon">${iconHtml}</span>`;

        const labelHtml = label ? `<span class="mpi-ibtn__label">${label}</span>` : '';

        // Reorder based on position
        let children = isLoading
            ? `<span class="mpi-ibtn__spinner" aria-hidden="true"></span>`
            : (labelPosition === 'left' || labelPosition === 'top')
                ? `${labelHtml}${iconContainer}`
                : `${iconContainer}${labelHtml}`;

        // Delegate entirely to MpiButton — no separate <button> is created here
        return MpiButton.template({
            variant: btnVariant,
            size,
            disabled: isDisabled || isLoading,
            loading: isLoading,
            iconOnly: !label,
            extraClasses,
            info,
        }, children);
    },

    setup: (el, props, emit) => {
        const isToggleable = props.toggleable || !!props.iconActive;
        const MIN_PRESS_MS = 150;

        let pressStart = 0;
        let pressTimer = null;

        el.addEventListener('pointerdown', () => {
            if (props.disabled || props.variant === 'loading') return;
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

        el.addEventListener('click', () => {
            if (props.disabled || props.variant === 'loading') return;

            if (isToggleable) {
                const next = !el.classList.contains('is-active');
                el.classList.toggle('is-active', next);
                props.active = next;
                emit('toggle', { active: next });
            }

            emit('click', { active: props.active });
        });
    }
});
