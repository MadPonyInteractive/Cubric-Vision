import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';
import { Overlays } from '../../../managers/overlayManager.js';
import { Events } from '../../../events.js';

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
        // ── Portal nodes (created on show, destroyed on hide) ────────────────
        let _backdrop = null;
        let _wrapper  = null;

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

        // ── Internal: Build and inject the portal ────────────────────────────
        const _doShow = () => {
            // Backdrop
            _backdrop = document.createElement('div');
            _backdrop.className = 'mpi-ok-cancel-backdrop';
            _backdrop.addEventListener('click', () => el.hide());
            document.body.appendChild(_backdrop);

            // Centred wrapper
            _wrapper = document.createElement('div');
            _wrapper.className = 'mpi-ok-cancel-wrapper';
            _wrapper.appendChild(el);
            document.body.appendChild(_wrapper);
        };

        // ── Public: show ─────────────────────────────────────────────────────
        el.show = () => {
            Overlays.request({
                show: _doShow,
                hide: el.hide,
                id: el
            });
        };

        // ── Public: hide ─────────────────────────────────────────────────────
        // NOTE: Does NOT emit 'cancel'. Escape/external closes should not fire
        // cancel events — only the explicit Cancel button does.
        el.hide = () => {
            _backdrop?.remove();
            _backdrop = null;
            _wrapper?.remove();
            _wrapper = null;
            Overlays.release(el);
        };

        // ── Global: respond to ui:close-all-popups ───────────────────────────
        const _unsubClose = Events.on('ui:close-all-popups', () => {
            if (_backdrop) el.hide(); // Only close if currently visible
        });

        // ── Cleanup: unsubscribe when dialog root is permanently removed ──────
        const _observer = new MutationObserver(() => {
            if (!document.contains(el) && !_wrapper) {
                _unsubClose();
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }
});
