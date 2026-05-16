import { ComponentFactory } from '../../factory.js';
import { qs, qsa } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiRadioGroup — Button-Style Radio Selection Primitive
 *
 * Row, grid, or "featured + grid" of toggle buttons; exactly one active at a time.
 * Supports text labels, icons, icon-only mode, label-position (right/top),
 * size variants, and grid layout with optional featured (full-width) first item.
 *
 * Option shape:
 *   string  — label & value identical, no icon, no info
 *   object  — { label, value, icon?, info?, disabled? }
 *
 * Props:
 * @param {Array<string|{label:string,value:string,icon?:string,info?:string,disabled?:boolean}>} [options=[]]
 * @param {string}  [value=''] - Currently selected value
 * @param {string}  [name='radio'] - Group name (a11y)
 * @param {string}  [info] - Group-level info; per-option info overrides on hover
 * @param {boolean} [iconOnly=false] - Hide labels, render icons only
 * @param {'right'|'top'} [labelPosition='right'] - Label placement vs icon
 * @param {'sm'|'md'|'lg'} [size='md'] - Button size variant
 * @param {number} [columns] - If set, render as CSS grid with N columns
 * @param {boolean} [featuredFirst=false] - First option spans full row (grid only)
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
        const labelPosition = props.labelPosition || 'right';
        const size = props.size || 'md';
        const columns = Number.isFinite(props.columns) ? props.columns : 0;
        const featuredFirst = !!props.featuredFirst && columns > 0;

        const iconSize = size === 'lg' ? 'md' : 'sm';

        const buttonsHtml = options.map((opt, i) => {
            const isObj   = typeof opt !== 'string';
            const label   = isObj ? opt.label : opt;
            const val     = isObj ? opt.value : opt;
            const icon    = isObj ? opt.icon  : null;
            const info    = (isObj && opt.info) ? opt.info : groupInfo;
            const disabled = isObj && opt.disabled;
            const isActive = val === value ? 'is-active' : '';
            const iconHtml = icon ? renderIcon(icon, iconSize) : '';
            const labelHtml = iconOnly ? '' : `<span class="mpi-radio-group__label">${label}</span>`;
            const infoAttr = info ? `data-info="${info}"` : '';
            const disabledAttr = disabled ? 'disabled' : '';
            const iconCls = icon ? 'mpi-radio-group__btn--has-icon' : '';
            const onlyCls = iconOnly ? 'mpi-radio-group__btn--icon-only' : '';
            const featuredCls = (featuredFirst && i === 0) ? 'mpi-radio-group__btn--featured' : '';
            const labelPosCls = `mpi-radio-group__btn--label-${labelPosition}`;
            const sizeCls = `mpi-radio-group__btn--${size}`;
            // For stacked layout, icon goes first then label.
            const content = (labelPosition === 'top')
                ? `${iconHtml ? `<span class="mpi-radio-group__icon">${iconHtml}</span>` : ''}${labelHtml}`
                : `${iconHtml ? `<span class="mpi-radio-group__icon">${iconHtml}</span>` : ''}${labelHtml}`;
            return `<button type="button"
                            class="mpi-radio-group__btn ${iconCls} ${onlyCls} ${labelPosCls} ${sizeCls} ${featuredCls} ${isActive}"
                            data-value="${val}"
                            ${infoAttr}
                            ${disabledAttr}>
                ${content}
            </button>`;
        }).join('');

        const layoutCls = columns > 0 ? 'mpi-radio-group--grid' : 'mpi-radio-group--row';
        const styleAttr = columns > 0 ? `style="--mpi-radio-cols:${columns};"` : '';

        return `
            <div class="mpi-radio-group ${layoutCls}" role="group" aria-label="${name}" ${styleAttr}>
                ${buttonsHtml}
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const _emitSelect = (value) => {
            const option = (props.options || []).find(o => {
                const v = typeof o === 'string' ? o : o.value;
                return v === value;
            });
            emit('select', { value, option });
        };

        el.addEventListener('click', (e) => {
            const btn = e.target.closest('.mpi-radio-group__btn');
            if (!btn || btn.disabled) return;

            qsa('.mpi-radio-group__btn', el).forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            const value = btn.dataset.value;
            props.value = value;
            _emitSelect(value);
        });

        el.setValue = (val) => {
            const btn = qs(`.mpi-radio-group__btn[data-value="${val}"]`, el);
            if (!btn) return;
            if (btn.classList.contains('is-active')) return;

            qsa('.mpi-radio-group__btn', el).forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            props.value = val;
            _emitSelect(val);
        };
    }
});
