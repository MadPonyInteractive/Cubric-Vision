import { ComponentFactory } from '../../factory.js';
import { qs, qsa, on } from '../../../utils/dom.js';

/**
 * MpiDropdown — Select / Dropdown Primitive
 *
 * A custom dropdown with controlled open direction. Zero dependencies.
 * The option list is portalled to document.body on mount so it is immune to
 * ancestor overflow:hidden and CSS transform stacking-context issues.
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
            const label    = typeof opt === 'string' ? opt : opt.label;
            const val      = typeof opt === 'string' ? opt : opt.value;
            const active   = val === value ? 'is-active' : '';
            const disabled = opt.disabled ? 'is-disabled' : '';
            return `<div class="mpi-dropdown__option ${active} ${disabled}" data-value="${val}">${label}</div>`;
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
        const trigger = qs('.mpi-dropdown__trigger', el);
        const list    = qs('.mpi-dropdown__list', el);
        const labelEl = qs('.mpi-dropdown__label', el);

        if (props.disabled) return;

        // Portal: move list to document.body so no ancestor transform or
        // overflow:hidden can affect it. The list is always hidden until opened.
        list.dataset.direction = props.direction || 'down';
        document.body.appendChild(list);

        /** Aligns the portalled list to the trigger using viewport coordinates. */
        const positionList = () => {
            const rect      = trigger.getBoundingClientRect();
            const direction = props.direction || 'down';

            list.style.width = `${rect.width}px`;
            list.style.left  = `${rect.left + window.scrollX}px`;

            if (direction === 'up') {
                list.style.top    = '';
                list.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            } else {
                list.style.top    = `${rect.bottom + 4}px`;
                list.style.bottom = '';
            }
        };

        let cleanupScroll = null;
        let cleanupResize = null;

        const closeList = () => {
            root.classList.remove('is-open');
            list.classList.remove('is-open');
            if (cleanupScroll) { cleanupScroll(); cleanupScroll = null; }
            if (cleanupResize) { cleanupResize(); cleanupResize = null; }
        };

        /** Full teardown: close list, remove portal node, detach all listeners. */
        const destroy = () => {
            closeList();
            if (list.parentNode) list.parentNode.removeChild(list);
            document.removeEventListener('click', onOutside);
            observer.disconnect();
        };

        // Toggle list
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const opening = !list.classList.contains('is-open');

            if (opening) {
                positionList();
                root.classList.add('is-open');
                list.classList.add('is-open');
                cleanupScroll = on(window, 'scroll', closeList, { passive: true, capture: true });
                cleanupResize = on(window, 'resize', closeList, { passive: true });
            } else {
                closeList();
            }

            list.setAttribute('aria-expanded', opening);
        });

        // Select option
        list.addEventListener('click', (e) => {
            const option = e.target.closest('.mpi-dropdown__option');
            if (!option || option.classList.contains('is-disabled')) return;

            const value = option.dataset.value;
            const label = option.textContent.trim();

            qsa('.mpi-dropdown__option', list).forEach(o =>
                o.classList.toggle('is-active', o === option)
            );

            labelEl.textContent = label;
            props.value = value;

            closeList();
            emit('change', { value, label });
        });

        /**
         * Rebuild the option list and update the trigger label.
         * @param {Array<string|{label:string, value:string, disabled?:boolean}>} newOptions
         * @param {string} selectedValue
         */
        el.setOptions = (newOptions, selectedValue) => {
            const selected = newOptions.find(o => (typeof o === 'string' ? o : o.value) === selectedValue);
            labelEl.textContent = selected
                ? (typeof selected === 'string' ? selected : selected.label)
                : (props.placeholder ?? 'Select...');
            props.value = selectedValue;

            list.innerHTML = newOptions.map(opt => {
                const label    = typeof opt === 'string' ? opt : opt.label;
                const val      = typeof opt === 'string' ? opt : opt.value;
                const active   = val === selectedValue ? 'is-active' : '';
                const disabled = opt.disabled ? 'is-disabled' : '';
                return `<div class="mpi-dropdown__option ${active} ${disabled}" data-value="${val}">${label}</div>`;
            }).join('');
        };

        // Close on outside click; also handles el removal (no-click path covered by observer)
        const onOutside = (e) => {
            if (!el.contains(e.target) && !list.contains(e.target)) closeList();
        };
        document.addEventListener('click', onOutside);

        // Watch for el being removed from the DOM and clean up the portal node.
        // Observes document.body so it catches removal at any ancestor level.
        const observer = new MutationObserver(() => {
            if (!document.contains(el)) destroy();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
