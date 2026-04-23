/**
 * notificationService.js — Bridges generation lifecycle events to OS notifications.
 *
 * Listens for `generation:complete` and forwards a minimal payload to the main process
 * via IPC. Main gates delivery on `mainWindow.isMinimized()`, so this module fires
 * unconditionally; the in-app toast (statusBar) handles the not-minimized case.
 *
 * Browser mode: no-op (ipcRenderer unavailable).
 */

'use strict';

import { Events } from '../events.js';
import { clientLogger } from '../services/clientLogger.js';

let ipcRenderer = null;
try {
    if (typeof window.require === 'function') {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) { /* Browser Mode — silent */ }

let _unsub = null;

/**
 * Initialize the notification bridge. Idempotent.
 */
export function initNotificationService() {
    if (!ipcRenderer || _unsub) return;

    _unsub = Events.on('generation:complete', ({ item, group } = {}) => {
        try {
            const op = group?.operation || item?.operation || 'Generation';
            ipcRenderer.send('notify-generation-complete', {
                title: 'Generation complete',
                body: `${op} finished.`,
            });
        } catch (err) {
            clientLogger.error('notificationService', 'failed to send IPC:', err);
        }
    });
}

/**
 * Tear down the listener. Primarily for hot-reload / tests.
 */
export function destroyNotificationService() {
    if (_unsub) { _unsub(); _unsub = null; }
}
