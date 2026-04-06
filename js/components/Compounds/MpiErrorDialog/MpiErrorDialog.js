import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiErrorDialog — Global Error Notification Dialog (Compound)
 *
 * A self-contained blocking modal that surfaces actionable error messages to
 * the user. Integrates with OverlayManager and the global Events bus.
 *
 * Designed to be used as a singleton via `showError()` in shell.js.
 * Callers never mount this directly — they call:
 *   import { showError } from '../../shell.js';
 *   showError('Title', 'What went wrong', { downloadLog: true });
 *
 * Props:
 * @param {string}  [title='An error occurred']  - Dialog title
 * @param {string}  [message='']                 - Error details shown to user
 * @param {boolean} [downloadLog=true]           - Whether to show the Download Log button
 *
 * Instance methods (on instance.el):
 *   show()  — portals backdrop + dialog to document.body
 *   hide()  — removes portal, releases OverlayManager
 *   setError(title, message) — update content before or after show()
 *
 * Emits:
 * 'dismiss'     {} — Dismiss button clicked
 * 'downloadLog' {} — Download Log button clicked
 */
export const MpiErrorDialog = ComponentFactory.create({
    name: 'MpiErrorDialog',
    css: ['js/components/Compounds/MpiErrorDialog/MpiErrorDialog.css'],

    template: () => `
        <div class="mpi-error-dialog" role="alertdialog" aria-modal="true">
            <div class="mpi-error-dialog__header">
                <div class="mpi-error-dialog__icon" id="icon-slot"></div>
                <div class="mpi-error-dialog__title" id="title-slot"></div>
            </div>
            <div class="mpi-error-dialog__message" id="message-slot"></div>
            <div class="mpi-error-dialog__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Modal primitive — owns backdrop, portal, Overlays, Events ────────
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(480px, 90vw)',
            backdropClose: false,
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        // ── Icon ─────────────────────────────────────────────────────────────
        const iconSlot = qs('#icon-slot', el);
        const icon = MpiIcon.mount(document.createElement('div'), {
            name: 'info',
            size: 'lg',
            color: 'danger',
        });
        iconSlot.appendChild(icon.el);

        // ── Title ────────────────────────────────────────────────────────────
        const titleSlot = qs('#title-slot', el);
        titleSlot.textContent = props.title || 'An error occurred';

        // ── Message ──────────────────────────────────────────────────────────
        const messageSlot = qs('#message-slot', el);
        messageSlot.textContent = props.message || '';

        // ── Actions ──────────────────────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);

        if (props.downloadLog !== false) {
            const downloadBtn = MpiButton.mount(document.createElement('div'), {
                text: 'Download Log',
                variant: 'outline',
                size: 'md',
                icon: 'download',
                label: 'Download Log',
            });
            downloadBtn.on('click', () => {
                emit('downloadLog', {});
                const a = document.createElement('a');
                a.href = '/logs/download';
                a.download = 'mpi-app.log';
                a.click();
            });
            actionsSlot.appendChild(downloadBtn.el);
        }

        const dismissBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Dismiss',
            variant: 'primary',
            size: 'md',
        });
        dismissBtn.on('click', () => {
            emit('dismiss', {});
            el.hide();
        });
        actionsSlot.appendChild(dismissBtn.el);

        // ── setError — update content at any time ────────────────────────────
        el.setError = (title, message) => {
            titleSlot.textContent = title || 'An error occurred';
            messageSlot.textContent = message || '';
        };
    }
});
