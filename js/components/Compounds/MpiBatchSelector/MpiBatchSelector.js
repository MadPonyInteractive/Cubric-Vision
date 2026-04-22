import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';

const BATCH_VALUES = [1, 2, 3, 4];

function clampBatch(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 1;
    return Math.min(4, Math.max(1, Math.round(v)));
}

/**
 * MpiBatchSelector — Compound trigger + popup for picking batch size (1..4).
 * Mirrors MpiRatioSelector structure: portaled popup, outside-click dismiss.
 */
export const MpiBatchSelector = ComponentFactory.create({
    name: 'MpiBatchSelector',
    css: ['js/components/Compounds/MpiBatchSelector/MpiBatchSelector.css'],

    template: (props) => {
        const value = clampBatch(props.value ?? 1);
        const isActive = props.showPopup || false;

        const itemsHtml = BATCH_VALUES.map(n => `
            <div class="mpi-batch-sel__item" data-value="${n}">
                ${MpiButton.template({
                    text: String(n),
                    size: 'md',
                    variant: n === value ? 'primary' : 'ghost',
                    info: `Generate ${n} image${n > 1 ? 's' : ''} per run`,
                    extraClasses: n === value ? 'is-active' : '',
                })}
            </div>
        `).join('');

        const popupInnerHtml = `
            <div class="mpi-batch-sel__header">
                ${MpiBadge.template({ label: 'BATCH', variant: 'secondary' })}
            </div>
            <div class="mpi-batch-sel__grid">
                ${itemsHtml}
            </div>
        `;

        const triggerBtnHtml = MpiButton.template({
            icon: 'layers',
            label: String(value),
            size: 'md',
            active: isActive,
            toggleable: true,
            stroke: false,
            info: 'Batch size (images per run)',
        });

        const popupHtml = MpiPopup.template({ active: isActive, position: 'top' }, popupInnerHtml);

        return `<div class="mpi-batch-sel">
            <div class="mpi-batch-sel__trigger">${triggerBtnHtml}</div>
            ${popupHtml}
        </div>`;
    },

    setup: (el, props, emit) => {
        props.value = clampBatch(props.value ?? 1);

        const trigger = el.querySelector('.mpi-batch-sel__trigger');
        const popupEl = el.querySelector('.mpi-popup');
        const grid = el.querySelector('.mpi-batch-sel__grid');

        // Portal popup to body — escapes ancestor overflow/transform stacking contexts.
        document.body.appendChild(popupEl);

        el.getValue = () => clampBatch(props.value);
        el.setValue = (n) => {
            props.value = clampBatch(n);
            updateUI();
        };

        const positionPopup = () => {
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

        const closePopup = () => {
            props.showPopup = false;
            popupEl.classList.remove('is-active');
            const btn = trigger.querySelector('.mpi-btn');
            if (btn) btn.classList.remove('is-active');
            emit('popup_toggle', { active: false });
        };

        const onOutsideClick = (e) => {
            if (!props.showPopup) return;
            if (popupEl.contains(e.target) || el.contains(e.target)) return;
            if (e.target.closest?.('.mpi-dropdown__list')) return;
            closePopup();
        };
        document.addEventListener('click', onOutsideClick);

        const unsubBus = Events.on('ui:close-all-popups', () => {
            if (props.showPopup) closePopup();
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            props.showPopup = !props.showPopup;
            if (props.showPopup) positionPopup();
            popupEl.classList.toggle('is-active', props.showPopup);

            const btn = trigger.querySelector('.mpi-btn');
            if (btn) btn.classList.toggle('is-active', props.showPopup);

            emit('popup_toggle', { active: props.showPopup });
        });

        const updateUI = () => {
            const value = clampBatch(props.value);

            grid.innerHTML = BATCH_VALUES.map(n => `
                <div class="mpi-batch-sel__item" data-value="${n}">
                    ${MpiButton.template({
                        text: String(n),
                        size: 'md',
                        variant: n === value ? 'primary' : 'ghost',
                        extraClasses: n === value ? 'is-active' : '',
                    })}
                </div>
            `).join('');

            trigger.innerHTML = MpiButton.template({
                icon: 'layers',
                label: String(value),
                size: 'md',
                active: props.showPopup,
                toggleable: true,
                stroke: false,
            });
        };

        popupEl.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-batch-sel__item');
            if (!item) return;
            const n = clampBatch(item.dataset.value);
            props.value = n;
            emit('change', { value: n });
            updateUI();
            closePopup();
        });

        const domObserver = new MutationObserver(() => {
            if (!document.contains(el)) {
                if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
                domObserver.disconnect();
                unsubBus();
                document.removeEventListener('click', onOutsideClick);
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        el.destroy = () => {
            domObserver.disconnect();
            unsubBus();
            document.removeEventListener('click', onOutsideClick);
            if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
        };
    }
});
