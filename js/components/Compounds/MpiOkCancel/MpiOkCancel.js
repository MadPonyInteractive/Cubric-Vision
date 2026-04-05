import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiOkCancel — Self-contained Confirmation Dialog (Compound)
 *
 * A modal dialog that self-portals to `document.body` with a blurred backdrop
 * and centred positioning. Integrates with OverlayManager (queue + Escape) and
 * the global Events bus (`ui:close-all-popups`).
 *
 * Usage:
 *   const dialog = MpiOkCancel.mount(document.createElement('div'), { ... });
 *   dialog.on('ok', ({ inputValue }) => doSomething(inputValue));
 *   dialog.on('cancel', () => {});
 *   dialog.el.show();   // Portals to body, shows backdrop
 *   dialog.el.hide();   // Hides and cleans up DOM
 *
 * Props:
 * @param {string} [title='']              - Dialog title
 * @param {string} [text='']               - Body text
 * @param {string} [inputPlaceholder]      - If provided, shows an input field
 * @param {string} [inputValue='']         - Initial value for the optional input
 * @param {boolean} [showCancel=true]      - Whether the Cancel button is shown
 * @param {string} [okLabel='OK']          - Label for the confirm button
 * @param {string} [cancelLabel='Cancel']  - Label for the cancel button
 *
 * Emits:
 * 'ok'     { inputValue?: string } — Confirm button clicked
 * 'cancel' {}                      — Cancel button clicked (NOT emitted on Escape/hide)
 * 'input'  { value: string }       — Input field changed
 */
export const MpiOkCancel = ComponentFactory.create({
    name: 'MpiOkCancel',
    css: ['js/components/Compounds/MpiOkCancel/MpiOkCancel.css'],

    template: () => `
        <div class="mpi-ok-cancel" role="dialog" aria-modal="true">
            <div class="mpi-ok-cancel__content">
                <div class="mpi-ok-cancel__title" id="title-slot"></div>
                <div class="mpi-ok-cancel__text"  id="text-slot"></div>
                <div class="mpi-ok-cancel__input" id="input-slot"></div>
            </div>
            <div class="mpi-ok-cancel__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Modal primitive — owns backdrop, portal, Overlays, Events ────────
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(440px, 90vw)',
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        // ── Content: Title ───────────────────────────────────────────────────
        const titleSlot = qs('#title-slot', el);
        if (props.title) titleSlot.textContent = props.title;

        // ── Content: Body text ───────────────────────────────────────────────
        const textSlot = qs('#text-slot', el);
        if (props.text) textSlot.textContent = props.text;

        // ── Content: Optional input field ────────────────────────────────────
        let inputComponent = null;
        const inputSlot = qs('#input-slot', el);
        if (props.inputPlaceholder) {
            inputComponent = MpiInput.mount(document.createElement('div'), {
                type: 'text',
                placeholder: props.inputPlaceholder,
                value: props.inputValue || ''
            });
            inputComponent.on('input', ({ value }) => emit('input', { value }));
            inputSlot.appendChild(inputComponent.el);
        } else {
            inputSlot.style.display = 'none';
        }

        // ── Actions: Cancel button ───────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);

        if (props.showCancel !== false) {
            const cancelBtn = MpiButton.mount(document.createElement('div'), {
                text: props.cancelLabel || 'Cancel',
                variant: 'secondary',
                size: 'md'
            });
            cancelBtn.on('click', () => {
                emit('cancel', {});
                el.hide();
            });
            actionsSlot.appendChild(cancelBtn.el);
        }

        // ── Actions: OK button ───────────────────────────────────────────────
        const okBtn = MpiButton.mount(document.createElement('div'), {
            text: props.okLabel || 'OK',
            variant: 'primary',
            size: 'md'
        });
        okBtn.on('click', () => {
            const inputValue = inputComponent
                ? inputComponent.el.querySelector('input')?.value
                : undefined;
            emit('ok', { inputValue });
            el.hide();
        });
        actionsSlot.appendChild(okBtn.el);
    }
});
