import { ComponentFactory } from '../../factory.js';
import { qsa } from '../../../utils/dom.js';

/**
 * MpiRadioGroup — Horizontal Button-Style Selection Primitive
 *
 * Renders a row of toggle buttons where exactly one is active at a time.
 * Zero dependencies.
 *
 * Props:
 * @param {Array<string|{label:string,value:string}>} [options=[]] - Option list
 * @param {string} [value=''] - Currently selected value
 * @param {string} [name='radio'] - Group name (for semantics / accessibility)
 * @param {string} [info] - Info Bar description
 *
 * Emits:
 * 'select' { value: string }
 */
export const MpiRadioGroup = ComponentFactory.create({
    name: 'MpiRadioGroup',
    css: ['js/components/Primitives/MpiRadioGroup/MpiRadioGroup.css'],

    template: (props) => {
        const options = props.options || [];
        const value   = props.value ?? '';
        const name    = props.name  || 'radio';
        const info    = props.info ? `data-info="${props.info}"` : '';

        const buttonsHtml = options.map(opt => {
            const label   = typeof opt === 'string' ? opt : opt.label;
            const val     = typeof opt === 'string' ? opt : opt.value;
            const isActive = val === value ? 'is-active' : '';
            return `<button type="button"
                            class="mpi-radio-group__btn ${isActive}"
                            data-value="${val}"
                            ${info}>${label}</button>`;
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
            if (!btn) return;

            qsa('.mpi-radio-group__btn', el).forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            const value = btn.dataset.value;
            props.value = value;
            emit('select', { value });
        });
    }
});
