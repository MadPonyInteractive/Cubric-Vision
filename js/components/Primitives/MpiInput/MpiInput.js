import { ComponentFactory } from '../../factory.js';

/**
 * MpiInput — Form Input Primitive
 * 
 * Props:
 * @param {'text'|'email'|'password'|'number'} [type='text'] - Input type
 * @param {string} [placeholder=''] - Placeholder text
 * @param {string|number} [value=''] - Initial value
 * @param {string} [label=''] - Field label
 * @param {boolean} [disabled=false] - Disabled state
 * @param {string} [error=''] - Error message
 * @param {string} [info=''] - Info Bar description
 */
export const MpiInput = ComponentFactory.create({
    name: 'MpiInput',
    css: ['js/components/Primitives/MpiInput/MpiInput.css'],

    template: (props) => {
        const type = props.type || 'text';
        const id = `mpi-input-${Math.random().toString(36).substr(2, 9)}`;
        const disabled = props.disabled ? 'disabled' : '';
        const errorClass = props.error ? 'mpi-input--error' : '';
        const label = props.label ? `<label class="mpi-input__label" for="${id}">${props.label}</label>` : '';
        const error = props.error ? `<span class="mpi-input__error-msg">${props.error}</span>` : '';
        const info = props.info ? `data-info="${props.info}"` : '';

        const field = type === 'textarea' 
            ? `<textarea id="${id}" 
                         class="mpi-input__field mpi-input__field--textarea" 
                         placeholder="${props.placeholder || ''}" 
                         ${disabled}
                         ${info}>${props.value || ''}</textarea>`
            : `<input id="${id}" 
                      type="${type}" 
                      class="mpi-input__field" 
                      placeholder="${props.placeholder || ''}" 
                      value="${props.value || ''}" 
                      ${disabled}
                      ${info}>`;

        return `
            <div class="mpi-input ${errorClass} ${disabled ? 'mpi-input--disabled' : ''}">
                ${label}
                <div class="mpi-input__wrapper">
                    ${field}
                </div>
                ${error}
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const input = el.querySelector('.mpi-input__field');
        input.addEventListener('input', (e) => {
            emit('input', { value: e.target.value, originalEvent: e });
        });
        input.addEventListener('change', (e) => {
            emit('change', { value: e.target.value, originalEvent: e });
        });
    }
});
