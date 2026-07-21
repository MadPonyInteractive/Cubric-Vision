import { ComponentFactory } from '../../factory.js';
import { qs } from '../../../utils/dom.js';

export const MpiCheckbox = ComponentFactory.create({
    name: 'MpiCheckbox',
    css: ['js/components/Primitives/MpiCheckbox/MpiCheckbox.css'],

    template: (props) => {
        const checked  = props.checked  ? 'checked'  : '';
        const disabled = props.disabled ? 'disabled' : '';
        const name     = props.name || 'checkbox';
        const label    = props.label || '';
        const isSwitch = props.variant === 'switch';
        const labelHtml = label
            ? `<span class="mpi-checkbox__label">${label}</span>`
            : '';
        const control = isSwitch
            ? '<span class="mpi-checkbox__switch" aria-hidden="true"></span>'
            : '<span class="mpi-checkbox__box" aria-hidden="true"></span>';
        const variantClass = isSwitch ? ' mpi-checkbox--switch' : '';
        return `
            <label class="mpi-checkbox${variantClass}${props.disabled ? ' mpi-checkbox--disabled' : ''}">
                <input type="checkbox" class="mpi-checkbox__input"
                       name="${name}" ${checked} ${disabled}>
                ${control}
                ${labelHtml}
            </label>
        `;
    },

    setup: (el, props, emit) => {
        const input = qs('.mpi-checkbox__input', el);

        input.addEventListener('change', () => {
            props.checked = input.checked;
            emit('change', { checked: input.checked });
        });

        el.isChecked  = () => input.checked;
        el.setChecked = (v) => { input.checked = !!v; };
        el.setDisabled = (v) => {
            input.disabled = !!v;
            el.classList.toggle('mpi-checkbox--disabled', !!v);
        };
    }
});
