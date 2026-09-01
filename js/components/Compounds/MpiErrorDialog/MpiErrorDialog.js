import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { qs } from '../../../utils/dom.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { APP_VERSION } from '../../../core/appVersion.js';
import { APP_STAGE } from '../../../core/appStage.js';
import { BUILD_HASH } from '../../../core/buildInfo.js';

/**
 * MpiErrorDialog — Global Error Notification Dialog (Compound)
 *
 * A self-contained blocking modal that surfaces actionable error messages to
 * the user, and lets them turn one into a bug report we can actually act on:
 * a prefilled GitHub issue form plus the log file itself, revealed in the OS
 * file manager so they can attach it. Both paths are credential-free — the
 * predecessor auto-filed through the GitHub API with a token the portable
 * build strips, so the button was dead in every release (MPI-675).
 *
 * Designed to be used as a singleton via `showError()` in shell.js.
 * Callers never mount this directly — they call:
 *   import { showError } from '../../shell.js';
 *   showError('Title', 'What went wrong');
 *
 * Props: none.
 *
 * Instance methods (on instance.el):
 *   show()  — portals backdrop + dialog to document.body
 *   hide()  — removes portal, releases OverlayManager
 *   setError(title, message) — update content before or after show()
 *
 * Emits:
 * 'dismiss'   {} — Dismiss button clicked
 * 'report'    {} — Report on GitHub button clicked
 * 'showLog'   {} — Show log file button clicked
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
            <div class="mpi-error-dialog__status" id="status-slot" hidden></div>
            <div class="mpi-error-dialog__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Modal primitive — owns backdrop, portal, Overlays, Events ────────
        const modal = MpiModal.mount(document.createElement('div'), {
            // 560, not 480: the row now carries two report affordances beside
            // Dismiss, and at 480 it wrapped Dismiss onto its own line.
            width: 'min(560px, 90vw)',
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
        const summaryField = qs('.mpi-input__field', summaryInput.el);

        // ── Status line ──────────────────────────────────────────────────────
        // Every failure below lands here. A report path that fails silently is
        // the defect this dialog was rebuilt to remove, so no branch may end in
        // a log line the user cannot see.
        const statusSlot = qs('#status-slot', el);
        const setStatus = (text) => {
            statusSlot.textContent = text || '';
            statusSlot.hidden = !text;
        };

        /** Open a URL in the system browser. Returns false if nothing opened. */
        async function openExternal(url) {
            try {
                const { ipcRenderer } = require('electron');
                if (ipcRenderer) {
                    await ipcRenderer.invoke('open-external', url);
                    return true;
                }
            } catch (ipcErr) {
                clientLogger.warn('error-dialog', 'Electron IPC unavailable, falling back to window.open', ipcErr);
            }
            try {
                return Boolean(window.open(url, '_blank'));
            } catch (openErr) {
                clientLogger.error('error-dialog', 'window.open failed', openErr);
                return false;
            }
        }

        // ── Actions ──────────────────────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);

        // With `icon` set MpiButton renders `label`, not `text` — `info` is the tooltip.
        const logBtn = MpiButton.mount(document.createElement('div'), {
            variant: 'outline',
            size: 'md',
            icon: 'folder',
            label: 'Show log file',
            info: 'Open the app log in your file manager so you can attach it',
        });
        logBtn.on('click', async () => {
            emit('showLog', {});
            setStatus('');
            try {
                const res = await fetch('/logs/reveal', { method: 'POST' });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || `HTTP ${res.status}`);
                setStatus(`Log file: ${data.logPath}`);
            } catch (err) {
                clientLogger.error('error-dialog', 'Could not reveal the log file', err);
                setStatus(`Could not open the log folder (${err.message}). Look for app.log under the Cubric Vision logs folder in your user data directory.`);
            }
        });
        actionsSlot.appendChild(logBtn.el);

        const reportBtn = MpiButton.mount(document.createElement('div'), {
            variant: 'outline',
            size: 'md',
            icon: 'chat',
            label: 'Report on GitHub',
            info: 'Open a prefilled bug report in your browser',
        });
        reportBtn.on('click', async () => {
            emit('report', {});
            setStatus('');

            let url;
            try {
                // The server builds the URL: it owns the log path, the OS
                // details and secret redaction. Build metadata is advisory.
                const res = await fetch('/github/issue-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: titleSlot.textContent,
                        message: messageSlot.textContent,
                        summary: summaryField.value.trim(),
                        build: { appVersion: APP_VERSION, stage: APP_STAGE, hash: BUILD_HASH },
                    }),
                });
                const data = await res.json();
                if (!data.success || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
                url = data.url;
            } catch (err) {
                clientLogger.error('error-dialog', 'Could not build the report URL', err);
                setStatus(`Could not prepare the report (${err.message}). File it by hand at https://github.com/MadPonyInteractive/Cubric-Vision/issues and attach the log with the button above.`);
                return;
            }

            if (!await openExternal(url)) {
                setStatus(`Could not open your browser. Copy this address into it:\n${url}`);
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
            setStatus('');
        };
    }
});
