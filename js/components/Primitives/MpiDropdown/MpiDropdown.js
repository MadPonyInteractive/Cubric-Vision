import { ComponentFactory } from '../../factory.js';

/**
 * MpiDropdown — Select / Dropdown Primitive
 *
 * A custom dropdown with controlled open direction. Zero dependencies.
 *
 * Props:
 * @param {Array<string|{label:string,value:string}>} [options=[]] - Option list
 * @param {string} [value=''] - Currently selected value
 * @param {string} [placeholder='Select...'] - Placeholder shown when nothing is selected
 * @param {boolean} [disabled=false] - Disabled state
 * @param {'up'|'down'} [direction='down'] - Whether the list opens above or below the trigger
 * @param {string} [info] - Info Bar description
 *
 * Emits:
 * 'change' { value: string, label: string }
 */
export const MpiDropdown = ComponentFactory.create({
    name: 'MpiDropdown',
    css: ['js/components/Primitives/MpiDropdown/MpiDropdown.css'],

    template: (props) => {
        const options     = props.options   || [];
        const value       = props.value     ?? '';
        const placeholder = props.placeholder ?? 'Select...';
        const disabled    = props.disabled  || false;
        const direction   = props.direction || 'down';
        const info        = props.info ? `data-info="${props.info}"` : '';

        const selected = options.find(o => (typeof o === 'string' ? o : o.value) === value);
        const triggerLabel = selected
            ? (typeof selected === 'string' ? selected : selected.label)
            : placeholder;

        const optionsHtml = options.map(opt => {
            const label  = typeof opt === 'string' ? opt : opt.label;
            const val    = typeof opt === 'string' ? opt : opt.value;
            const active = val === value ? 'is-active' : '';
            return `<div class="mpi-dropdown__option ${active}" data-value="${val}">${label}</div>`;
        }).join('');

        return `
            <div class="mpi-dropdown mpi-dropdown--${direction} ${disabled ? 'mpi-dropdown--disabled' : ''}"
                 ${info}>
                <button type="button"
                        class="mpi-dropdown__trigger"
                        ${disabled ? 'disabled' : ''}>
                    <span class="mpi-dropdown__label">${triggerLabel}</span>
                    <span class="mpi-dropdown__chevron" aria-hidden="true"></span>
                </button>
                <div class="mpi-dropdown__list" role="listbox">
                    ${optionsHtml}
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const root    = el;
        const trigger = el.querySelector('.mpi-dropdown__trigger');
        const list    = el.querySelector('.mpi-dropdown__list');
        const labelEl = el.querySelector('.mpi-dropdown__label');

        if (props.disabled) return;

        // Toggle list
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = root.classList.toggle('is-open');
            list.setAttribute('aria-expanded', isOpen);
        });

        // Select option
        list.addEventListener('click', (e) => {
            const option = e.target.closest('.mpi-dropdown__option');
            if (!option) return;

            const value = option.dataset.value;
            const label = option.textContent.trim();

            // Update active state
            list.querySelectorAll('.mpi-dropdown__option').forEach(o =>
                o.classList.toggle('is-active', o === option)
            );

            labelEl.textContent = label;
            props.value = value;

            root.classList.remove('is-open');
            emit('change', { value, label });
        });

        // Close on outside click — self-removes once the element leaves the DOM
        const onOutside = (e) => {
            if (!document.contains(el)) {
                document.removeEventListener('click', onOutside);
                return;
            }
            if (!el.contains(e.target)) root.classList.remove('is-open');
        };
        document.addEventListener('click', onOutside);
    }
});
