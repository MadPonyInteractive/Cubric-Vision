import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
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
            <div class="mpi-error-dialog__summary" id="summary-slot" autoHeight: true></div>
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

        // ── Summary Input ────────────────────────────────────────────────────
        const summarySlot = qs('#summary-slot', el);
        const summaryInput = MpiInput.mount(document.createElement('div'), {
            type: 'textarea',
            placeholder: 'Briefly describe what you were doing when this error occurred...',
            label: 'Error Summary (optional)',
        });
        summaryInput.el.style.width = '100%';
        summarySlot.appendChild(summaryInput.el);
        const summaryField = summaryInput.el.querySelector('.mpi-input__field');

        // ── Actions ──────────────────────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);

        const reportBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Report on GitHub',
            variant: 'outline',
            size: 'md',
            icon: 'external-link',
            label: 'Report on GitHub',
        });
        reportBtn.on('click', async () => {
            emit('report', {});
            try {
                const logRes = await fetch('/logs/read');
                if (!logRes.ok) {
                    console.warn('Log fetch failed:', logRes.status);
                }
                const logData = await logRes.json();
                const log = logData.log || '';

                const title = titleSlot.textContent;
                const message = messageSlot.textContent;
                const summary = summaryField.value.trim();

                // Send to backend to create GitHub issue
                const createRes = await fetch('/github/create-issue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, message, summary, log })
                });

                const createData = await createRes.json();

                if (!createData.success) {
                    console.error('Failed to create GitHub issue:', createData.error);
                    return;
                }

                console.log('GitHub issue created:', createData.issueUrl);

                // Open issue in system browser via Electron IPC
                try {
                    const { ipcRenderer } = require('electron');
                    if (ipcRenderer) {
                        await ipcRenderer.invoke('open-external', createData.issueUrl);
                    } else {
                        window.open(createData.issueUrl);
                    }
                } catch (ipcErr) {
                    console.warn('Electron IPC unavailable, falling back to window.open:', ipcErr);
                    window.open(createData.issueUrl);
                }
            } catch (err) {
                console.error('Failed to create GitHub issue:', err);
            }
        });
        actionsSlot.appendChild(reportBtn.el);

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
            summaryField.value = '';
        };
    }
});
