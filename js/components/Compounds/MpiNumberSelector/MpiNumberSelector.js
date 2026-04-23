import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiNumberSelector — Compound trigger + popup for picking a value from a fixed list.
 *
 * Generic replacement for MpiBatchSelector. Values are caller-supplied strings.
 *
 * Props:
 * @param {string[]} values              - Ordered list of selectable value strings
 * @param {string}   [value]             - Initially selected value (defaults to values[0])
 * @param {string}   [icon]               - Icon shown on the trigger button (optional, none by default)
 * @param {string}   [popupTitle]        - Badge label shown at top of popup (optional)
 * @param {string}   [info]              - Tooltip on the trigger button
 *
 * Instance methods (on instance.el):
 *   getValue()       — returns current selected string
 *   setValue(string) — imperatively set value; re-renders grid + trigger
 *
 * Emits:
 *   'change'       { value: string } — user picked a new value
 *   'popup_toggle' { active: boolean }
 */
export const MpiNumberSelector = ComponentFactory.create({
    name: 'MpiNumberSelector',
    css: ['js/components/Compounds/MpiNumberSelector/MpiNumberSelector.css'],

    template: (props) => {
        const values   = props.values || [];
        const current  = props.value ?? values[0] ?? '';
        const icon     = props.icon ?? null;
        const isActive = props.showPopup || false;

        const itemsHtml = values.map(v => `
            <div class="mpi-number-sel__item" data-value="${v}">
                ${MpiButton.template({
                    text: String(v),
                    size: 'md',
                    variant: v === current ? 'primary' : 'ghost',
                    extraClasses: v === current ? 'is-active' : '',
                })}
            </div>
        `).join('');

        const popupInnerHtml = `
            ${props.popupTitle ? `
            <div class="mpi-number-sel__header">
                ${MpiBadge.template({ label: props.popupTitle, variant: 'secondary' })}
            </div>` : ''}
            <div class="mpi-number-sel__grid">
                ${itemsHtml}
            </div>
        `;

        const triggerHtml = MpiButton.template({
            ...(icon ? { icon, label: String(current) } : { text: String(current), variant: 'secondary' }),
            size: 'md',
            active: isActive,
            toggleable: true,
            info: props.info || '',
        });

        const popupHtml = MpiPopup.template({ active: isActive, position: 'top' }, popupInnerHtml);

        return `<div class="mpi-number-sel">
            <div class="mpi-number-sel__trigger">${triggerHtml}</div>
            ${popupHtml}
        </div>`;
    },

    setup: (el, props, emit) => {
        const values = props.values || [];
        props.value  = props.value ?? values[0] ?? '';

        const trigger = qs('.mpi-number-sel__trigger', el);
        const popupEl = qs('.mpi-popup', el);
        const grid    = qs('.mpi-number-sel__grid', el);
        const icon    = props.icon ?? null;

        // Portal to body — escapes ancestor overflow/transform stacking contexts.
        // MpiPopup.template() renders raw HTML only; no setup() runs, so we portal manually.
        document.body.appendChild(popupEl);

        el.getValue = () => props.value;
        el.setValue = (v) => {
            if (!values.includes(String(v))) return;
            props.value = String(v);
            _updateUI();
        };

        const _positionPopup = () => {
            const rect = trigger.getBoundingClientRect();
            popupEl.style.bottom = `${window.innerHeight - rect.top + 12}px`;
            popupEl.style.left   = `${rect.left + rect.width / 2}px`;
            popupEl.style.top    = '';

            requestAnimationFrame(() => {
                const pr = popupEl.getBoundingClientRect();
                const margin = 8;
                const overflowLeft  = margin - pr.left;
                const overflowRight = pr.right - (window.innerWidth - margin);
                if (overflowLeft > 0)  popupEl.style.left = `${parseFloat(popupEl.style.left) + overflowLeft}px`;
                if (overflowRight > 0) popupEl.style.left = `${parseFloat(popupEl.style.left) - overflowRight}px`;
            });
        };

        const _closePopup = () => {
            props.showPopup = false;
            popupEl.classList.remove('is-active');
            const btn = qs('.mpi-btn', trigger);
            if (btn) btn.classList.remove('is-active');
            emit('popup_toggle', { active: false });
        };

        const _onOutsideClick = (e) => {
            if (!props.showPopup) return;
            if (popupEl.contains(e.target) || el.contains(e.target)) return;
            if (e.target.closest?.('.mpi-dropdown__list')) return;
            _closePopup();
        };
        document.addEventListener('click', _onOutsideClick);

        const _unsubBus = Events.on('ui:close-all-popups', () => {
            if (props.showPopup) _closePopup();
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            props.showPopup = !props.showPopup;
            if (props.showPopup) _positionPopup();
            popupEl.classList.toggle('is-active', props.showPopup);
            const btn = qs('.mpi-btn', trigger);
            if (btn) btn.classList.toggle('is-active', props.showPopup);
            emit('popup_toggle', { active: props.showPopup });
        });

        const _updateUI = () => {
            const current = props.value;

            grid.innerHTML = values.map(v => `
                <div class="mpi-number-sel__item" data-value="${v}">
                    ${MpiButton.template({
                        text: String(v),
                        size: 'md',
                        variant: v === current ? 'primary' : 'ghost',
                        extraClasses: v === current ? 'is-active' : '',
                    })}
                </div>
            `).join('');

            trigger.innerHTML = MpiButton.template({
                ...(icon ? { icon, label: String(current) } : { text: String(current), variant: 'secondary' }),
                size: 'md',
                active: props.showPopup,
                toggleable: true,
                info: props.info || '',
            });
        };

        popupEl.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-number-sel__item');
            if (!item) return;
            const v = item.dataset.value;
            if (!values.includes(v)) return;
            props.value = v;
            emit('change', { value: v });
            _updateUI();
            _closePopup();
        });

        // Remove portal when component leaves DOM.
        const _domObserver = new MutationObserver(() => {
            if (!document.contains(el)) {
                if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
                _domObserver.disconnect();
                _unsubBus();
                document.removeEventListener('click', _onOutsideClick);
            }
        });
        _domObserver.observe(document.body, { childList: true, subtree: true });

        el.destroy = () => {
            _domObserver.disconnect();
            _unsubBus();
            document.removeEventListener('click', _onOutsideClick);
            if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
        };
    }
});
