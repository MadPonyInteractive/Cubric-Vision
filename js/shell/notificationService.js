/**
 * notificationService.js — Bridges generation/download lifecycle events to OS notifications.
 *
 * Listens for `generation:complete` and `download:complete` and forwards a minimal payload
 * to the main process via IPC. Main gates delivery on `!mainWindow.isFocused()`, so this
 * module fires unconditionally; the in-app toast handles the focused case.
 *
 * Browser mode: no-op (ipcRenderer unavailable).
 */

'use strict';

import { Events } from '../events.js';
import { clientLogger } from '../services/clientLogger.js';
import { getModelById } from '../data/modelRegistry.js';

let ipcRenderer = null;
try {
    if (typeof window.require === 'function') {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) { /* Browser Mode — silent */ }

const _unsubs = [];

function sendNotificationPayload(payload = {}, { minimizeFirst = false } = {}) {
    if (!ipcRenderer) return false;
    if (minimizeFirst) {
        ipcRenderer.send('window-minimize');
    }
    const delay = minimizeFirst ? 180 : 0;
    window.setTimeout(() => {
        ipcRenderer.send('notify-generation-complete', payload);
    }, delay);
    return true;
}

/**
 * Initialize the notification bridge. Idempotent.
 */
export function initNotificationService() {
    if (!ipcRenderer || _unsubs.length) return;

    _unsubs.push(Events.on('generation:complete', ({ item, group } = {}) => {
        try {
            const op = group?.operation || item?.operation || 'Generation';
            ipcRenderer.send('notify-generation-complete', {
                title: 'Generation complete',
                subtitle: 'Cubric Studio',
                body: `${op} finished.`,
            });
        } catch (err) {
            clientLogger.error('notificationService', 'failed to send IPC:', err);
        }
    }));

    _unsubs.push(Events.on('download:complete', (data = {}) => {
        try {
            // UW installs surface through engine UI — skip OS notification
            if (!data.modelId || data.modelId === '__universal_workflow__') return;
            const model = getModelById(data.modelId);
            const modelName = model?.name || data.modelId;
            ipcRenderer.send('notify-download-complete', {
                title: 'Download complete',
                subtitle: 'Cubric Studio',
                body: `${modelName} installed.`,
            });
        } catch (err) {
            clientLogger.error('notificationService', 'failed to send IPC:', err);
        }
    }));
}

/**
 * Tear down the listeners. Primarily for hot-reload / tests.
 */
export function destroyNotificationService() {
    while (_unsubs.length) { _unsubs.pop()(); }
}

export function triggerGenerationCompleteNotification({ minimizeFirst = false } = {}) {
    return sendNotificationPayload({
        title: 'Generation complete',
        subtitle: 'Cubric Studio',
        body: 'Dev gallery test finished.',
    }, { minimizeFirst });
}
