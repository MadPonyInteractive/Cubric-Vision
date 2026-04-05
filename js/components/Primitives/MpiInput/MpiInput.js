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
 * @param {'sm'} [size] - Optional size modifier ('sm' renders compact width for inline/toolbar use)
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
        const sizeClass  = props.size      ? `mpi-input--${props.size}` : '';
        const label      = props.label ? `<label class="mpi-input__label" for="${id}">${props.label}</label>` : '';
        const error      = props.error ? `<span class="mpi-input__error-msg">${props.error}</span>` : '';
        const info       = props.info ? `data-info="${props.info}"` : '';
        const autoHeight = props.autoHeight ? 'data-auto-height' : '';

        // For number inputs we use type="text" + inputmode="decimal" to fully own
        // parsing, clamping, stepping, and formatting — avoiding all browser quirks
        // with type="number" (NaN on out-of-range, float precision from step, etc.)
        const inputType = type === 'number' ? 'text' : type;
        const inputMode = type === 'number' ? 'inputmode="decimal"' : '';

        let displayValue = props.value ?? '';
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
                      type="${inputType}"
                      class="mpi-input__field"
                      placeholder="${props.placeholder || ''}"
                      value="${displayValue}"
                      ${inputMode}
                      ${disabled}
                      ${readonly}
                      ${info}>`;

        return `
            <div class="mpi-input ${errorClass} ${roClass} ${sizeClass} ${disabled ? 'mpi-input--disabled' : ''}">
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

        if (type === 'number') {
            const step = props.step ?? 1;

            const clampAndRound = (val) => {
                if (props.min !== undefined) val = Math.max(props.min, val);
                if (props.max !== undefined) val = Math.min(props.max, val);
                if (props.decimals !== undefined) val = parseFloat(val.toFixed(props.decimals));
                return val;
            };

            const commit = (e) => {
                const raw = parseFloat(input.value);
                if (!isNaN(raw)) {
                    const value = clampAndRound(raw);
                    input.value = props.decimals !== undefined ? value.toFixed(props.decimals) : String(value);
                    emit('change', { value, originalEvent: e });
                }
            };

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { commit(e); input.blur(); }
            });
            input.addEventListener('wheel', (e) => {
                e.preventDefault();
                const raw = parseFloat(input.value) || 0;
                const next = clampAndRound(raw + (e.deltaY < 0 ? step : -step));
                input.value = props.decimals !== undefined ? next.toFixed(props.decimals) : String(next);
                emit('change', { value: next, originalEvent: e });
            }, { passive: false });
            input.addEventListener('input', (e) => {
                const raw = parseFloat(e.target.value);
                emit('input', { value: isNaN(raw) ? e.target.value : raw, originalEvent: e });
            });
        } else {
            input.addEventListener('input', (e) => emit('input', { value: e.target.value, originalEvent: e }));
            input.addEventListener('change', (e) => emit('change', { value: e.target.value, originalEvent: e }));
        }
    }
});
