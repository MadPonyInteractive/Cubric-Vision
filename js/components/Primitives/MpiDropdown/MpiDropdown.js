import { ComponentFactory } from '../../factory.js';
import { qs, qsa, on } from '../../../utils/dom.js';
import { Events } from '../../../events.js';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const optionValue = (opt) => typeof opt === 'string' ? opt : opt.value;
const optionLabel = (opt) => typeof opt === 'string' ? opt : opt.label;
const optionMeta = (opt) => typeof opt === 'string' ? '' : (opt.meta ?? opt.description ?? opt.detail ?? '');

const renderOption = (opt, value) => {
    const label    = optionLabel(opt);
    const val      = optionValue(opt);
    const meta     = optionMeta(opt);
    const active   = val === value ? 'is-active' : '';
    const disabled = opt.disabled ? 'is-disabled' : '';
    const infoAttr = (typeof opt === 'object' && opt.info)
        ? ` data-info="${escapeHtml(opt.info)}"`
        : '';
    const metaHtml = meta
        ? `<span class="mpi-dropdown__option-meta">${escapeHtml(meta)}</span>`
        : '';

    return `
        <div class="mpi-dropdown__option ${active} ${disabled}"
             data-value="${escapeHtml(val)}"
             data-label="${escapeHtml(label)}"${infoAttr}>
            <span class="mpi-dropdown__option-label">${escapeHtml(label)}</span>
            ${metaHtml}
        </div>
    `;
};

/**
 * MpiDropdown — Select / Dropdown Primitive
 *
 * A custom dropdown with controlled open direction. Zero dependencies.
 * The option list is portalled to document.body on mount so it is immune to
 * ancestor overflow:hidden and CSS transform stacking-context issues.
 *
 * Props:
 * @param {Array<string|{label:string,value:string,meta?:string,description?:string,detail?:string,info?:string}>} [options=[]] - Option list
 * @param {string} [value=''] - Currently selected value
 * @param {string} [placeholder='Select...'] - Placeholder shown when nothing is selected
 * @param {boolean} [disabled=false] - Disabled state
 * @param {'up'|'down'} [direction='down'] - Whether the list opens above or below the trigger
 * @param {string} [info] - Info Bar description
 * @param {string} [extraClasses=''] - Additional BEM modifier/helper classes on the root
 * @param {boolean} [wrapLabels=false] - Allow option labels to wrap to multiple lines
 *
 * Emits:
 * 'change' { value: string, label: string }
 * 'open'   {}  — fired when the option list opens (use to refresh live options)
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
        const extraClasses = props.extraClasses || '';
        // Forward extraClasses to the portalled list too — it lives in document.body,
        // so a root-only modifier can't reach its options (e.g. .mpi-dropdown--runpod).
        const listClasses = `${props.wrapLabels ? 'mpi-dropdown__list--wrap' : ''} ${extraClasses}`.trim();

        const selected = options.find(o => optionValue(o) === value);
        const triggerLabel = selected
            ? optionLabel(selected)
            : placeholder;

        const optionsHtml = options.map(opt => renderOption(opt, value)).join('');

        return `
            <div class="mpi-dropdown mpi-dropdown--${direction} ${extraClasses} ${disabled ? 'mpi-dropdown--disabled' : ''}"
                 ${info}>
                <button type="button"
                        class="mpi-dropdown__trigger"
                        ${disabled ? 'disabled' : ''}>
                    <span class="mpi-dropdown__label">${escapeHtml(triggerLabel)}</span>
                    <span class="mpi-dropdown__chevron" aria-hidden="true"></span>
                </button>
                <div class="mpi-dropdown__list ${listClasses}" role="listbox">
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
        const _unsubs = [];
        let observer = null;
        let destroyed = false;

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
            if (destroyed) return;
            destroyed = true;
            closeList();
            if (list.parentNode) list.parentNode.removeChild(list);
            _unsubs.forEach(fn => fn?.());
            observer?.disconnect();
        };
        el.destroy = destroy;

        // Toggle list
        _unsubs.push(on(trigger, 'click', (e) => {
            e.stopPropagation();
            const opening = !list.classList.contains('is-open');

            if (opening) {
                positionList();
                root.classList.add('is-open');
                list.classList.add('is-open');
                // Lets callers refresh live data when the list opens (e.g. the
                // RunPod GPU picker re-fetches stock so it is never stale).
                emit('open', {});
                cleanupScroll = on(window, 'scroll', (e) => {
                    if (list.contains(e.target)) return;
                    closeList();
                }, { passive: true, capture: true });
                cleanupResize = on(window, 'resize', closeList, { passive: true });
            } else {
                closeList();
            }

            list.setAttribute('aria-expanded', opening);
        }));

        // Select option
        _unsubs.push(on(list, 'click', (e) => {
            e.stopPropagation();
            const option = e.target.closest('.mpi-dropdown__option');
            if (!option || option.classList.contains('is-disabled')) return;

            const value = option.dataset.value;
            const label = option.dataset.label || qs('.mpi-dropdown__option-label', option)?.textContent?.trim() || option.textContent.trim();

            qsa('.mpi-dropdown__option', list).forEach(o =>
                o.classList.toggle('is-active', o === option)
            );

            labelEl.textContent = label;
            props.value = value;

            closeList();
            emit('change', { value, label });
        }));

        /**
         * Rebuild the option list and update the trigger label.
         * @param {Array<string|{label:string, value:string, disabled?:boolean, meta?:string, description?:string, detail?:string}>} newOptions
         * @param {string} selectedValue
         */
        el.setOptions = (newOptions, selectedValue) => {
            const selected = newOptions.find(o => optionValue(o) === selectedValue);
            labelEl.textContent = selected
                ? optionLabel(selected)
                : (props.placeholder ?? 'Select...');
            props.value = selectedValue;
            props.options = newOptions;

            list.innerHTML = newOptions.map(opt => renderOption(opt, selectedValue)).join('');
        };

        // Close on outside click; also handles el removal (no-click path covered by observer)
        const onOutside = (e) => {
            if (!el.contains(e.target) && !list.contains(e.target)) closeList();
        };
        _unsubs.push(on(document, 'click', onOutside));
        _unsubs.push(Events.on('ui:close-all-popups', closeList));

        // Watch for el being removed from the DOM and clean up the portal node.
        // Observes document.body so it catches removal at any ancestor level.
        observer = new MutationObserver(() => {
            if (!document.contains(el)) destroy();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
