import { ComponentFactory } from '../../factory.js';
import { qsa } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiRadioGroup — Horizontal Button-Style Selection Primitive
 *
 * Renders a row of toggle buttons where exactly one is active at a time.
 * Supports text labels, icons, icon-only mode, and per-option info strings
 * (data-info → status bar) and per-option emitted events.
 *
 * Option shape:
 *   string  — label & value identical, no icon, no info
 *   object  — { label, value, icon?, info?, disabled? }
 *
 * Props:
 * @param {Array<string|{label:string,value:string,icon?:string,info?:string,disabled?:boolean}>} [options=[]]
 * @param {string}  [value=''] - Currently selected value
 * @param {string}  [name='radio'] - Group name (a11y)
 * @param {string}  [info] - Group-level info; per-option info overrides this on hover
 * @param {boolean} [iconOnly=false] - Hide labels, render icons only
 *
 * Emits:
 *   'select' { value, option }
 */
export const MpiRadioGroup = ComponentFactory.create({
    name: 'MpiRadioGroup',
    css: ['js/components/Primitives/MpiRadioGroup/MpiRadioGroup.css'],

    template: (props) => {
        const options  = props.options  || [];
        const value    = props.value    ?? '';
        const name     = props.name     || 'radio';
        const iconOnly = !!props.iconOnly;
        const groupInfo = props.info ?? '';

        const buttonsHtml = options.map(opt => {
            const isObj   = typeof opt !== 'string';
            const label   = isObj ? opt.label : opt;
            const val     = isObj ? opt.value : opt;
            const icon    = isObj ? opt.icon  : null;
            const info    = (isObj && opt.info) ? opt.info : groupInfo;
            const disabled = isObj && opt.disabled;
            const isActive = val === value ? 'is-active' : '';
            const iconHtml = icon ? renderIcon(icon, 'sm') : '';
            const labelHtml = iconOnly ? '' : `<span class="mpi-radio-group__label">${label}</span>`;
            const infoAttr = info ? `data-info="${info}"` : '';
            const disabledAttr = disabled ? 'disabled' : '';
            const iconCls = icon ? 'mpi-radio-group__btn--has-icon' : '';
            const onlyCls = iconOnly ? 'mpi-radio-group__btn--icon-only' : '';
            return `<button type="button"
                            class="mpi-radio-group__btn ${iconCls} ${onlyCls} ${isActive}"
                            data-value="${val}"
                            ${infoAttr}
                            ${disabledAttr}>
                ${iconHtml ? `<span class="mpi-radio-group__icon">${iconHtml}</span>` : ''}
                ${labelHtml}
            </button>`;
        }).join('');

        return `
            <div class="mpi-radio-group" role="group" aria-label="${name}">
                ${buttonsHtml}
            </div>
        `;
    },

    setup: (el, props, emit) => {
        el.addEventListener('click', (e) => {
            const btn = e.target.closest('.mpi-radio-group__btn');
            if (!btn || btn.disabled) return;

            qsa('.mpi-radio-group__btn', el).forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            const value = btn.dataset.value;
            props.value = value;
            const option = (props.options || []).find(o => {
                const v = typeof o === 'string' ? o : o.value;
                return v === value;
            });
            emit('select', { value, option });
        });
    }
});
