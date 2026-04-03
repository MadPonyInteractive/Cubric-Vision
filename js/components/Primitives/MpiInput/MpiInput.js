import { ComponentFactory } from '../../factory.js';

/**
 * MpiInput — Form Input Primitive
 *
 * Props:
 * @param {'text'|'email'|'password'|'number'|'textarea'} [type='text'] - Input type
 * @param {string} [placeholder=''] - Placeholder text
 * @param {string|number} [value=''] - Initial value
 * @param {string} [label=''] - Field label
 * @param {boolean} [disabled=false] - Disabled state
 * @param {boolean} [readonly=false] - Read-only state (display value, no editing)
 * @param {boolean} [autoHeight=false] - textarea only: grow to fit content automatically
 * @param {string} [error=''] - Error message
 * @param {string} [info=''] - Info Bar description
 * @param {number} [min] - number type only: minimum value
 * @param {number} [max] - number type only: maximum value
 * @param {number} [step] - number type only: step increment (0.01 for floats, 1 for integers)
 * @param {number} [decimals] - number type only: number of decimal places to display (default: auto)
 */
export const MpiInput = ComponentFactory.create({
    name: 'MpiInput',
    css: ['js/components/Primitives/MpiInput/MpiInput.css'],

    template: (props) => {
        const type       = props.type || 'text';
        const id         = `mpi-input-${Math.random().toString(36).substr(2, 9)}`;
        const disabled   = props.disabled  ? 'disabled'  : '';
        const readonly   = props.readonly  ? 'readonly'  : '';
        const errorClass = props.error     ? 'mpi-input--error' : '';
        const roClass    = props.readonly  ? 'mpi-input--readonly' : '';
        const label      = props.label ? `<label class="mpi-input__label" for="${id}">${props.label}</label>` : '';
        const error      = props.error ? `<span class="mpi-input__error-msg">${props.error}</span>` : '';
        const info       = props.info ? `data-info="${props.info}"` : '';
        const autoHeight = props.autoHeight ? 'data-auto-height' : '';

        // Number input attributes & value formatting
        const min   = type === 'number' && props.min !== undefined ? `min="${props.min}"` : '';
        const max   = type === 'number' && props.max !== undefined ? `max="${props.max}"` : '';
        const step  = type === 'number' && props.step !== undefined ? `step="${props.step}"` : '';

        let displayValue = props.value || '';
        if (type === 'number' && props.decimals !== undefined && displayValue !== '') {
            displayValue = parseFloat(displayValue).toFixed(props.decimals);
        }

        const field = type === 'textarea'
            ? `<textarea id="${id}"
                         class="mpi-input__field mpi-input__field--textarea${props.autoHeight ? ' mpi-input__field--auto-height' : ''}"
                         placeholder="${props.placeholder || ''}"
                         ${disabled}
                         ${readonly}
                         ${info}
                         ${autoHeight}>${props.value || ''}</textarea>`
            : `<input id="${id}"
                      type="${type}"
                      class="mpi-input__field"
                      placeholder="${props.placeholder || ''}"
                      value="${displayValue}"
                      ${min}
                      ${max}
                      ${step}
                      ${disabled}
                      ${readonly}
                      ${info}>`;

        return `
            <div class="mpi-input ${errorClass} ${roClass} ${disabled ? 'mpi-input--disabled' : ''}">
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
        const type = props.type || 'text';

        // Auto-height for textareas
        if (input.tagName === 'TEXTAREA' && input.hasAttribute('data-auto-height')) {
            const resize = () => {
                input.style.height = 'auto';
                input.style.height = `${input.scrollHeight}px`;
            };
            resize();
            input.addEventListener('input', resize);
        }

        input.addEventListener('input', (e) => {
            const value = type === 'number' && e.target.value !== '' ? parseFloat(e.target.value) : e.target.value;
            emit('input', { value, originalEvent: e });
        });
        input.addEventListener('change', (e) => {
            const value = type === 'number' && e.target.value !== '' ? parseFloat(e.target.value) : e.target.value;
            emit('change', { value, originalEvent: e });
        });
    }
});
