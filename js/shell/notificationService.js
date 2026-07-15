/**
 * notificationService.js — Bridges generation/download lifecycle events to notifications.
 *
 * Listens for `generation:complete` and `download:complete`. The `notificationPrefs`
 * checkbox toggles OS notifications only — completion feedback always surfaces. When the
 * pref is ON and the window is unfocused, an OS notification fires (main also gates on
 * isFocused()). In every other case (pref OFF, or window focused) an in-app StatusBar
 * toast fires instead — split via `document.hasFocus()` so the two never both deliver.
 *
 * Browser mode: no ipcRenderer, so the in-app toast always fires.
 */

'use strict';

import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from '../services/clientLogger.js';
import { getModelById } from '../data/modelRegistry.js';
import { StatusBar } from './statusBar.js';

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
    if (_unsubs.length) return;

    // The pref toggles OS notifications only — never mutes completion feedback.
    // OS-eligible (pref on) + unfocused → OS notification. Otherwise (pref off,
    // OR focused) → in-app toast. Main also gates the OS send on isFocused(), so
    // the two paths never both deliver.
    _unsubs.push(Events.on('generation:complete', ({ item, group } = {}) => {
        try {
            const op = group?.operation || item?.operation || 'Generation';
            const osEligible = state.notificationPrefs?.generation !== false;
            if (osEligible && ipcRenderer && !document.hasFocus()) {
                ipcRenderer.send('notify-generation-complete', {
                    title: 'Generation complete',
                    subtitle: 'Cubric Studio',
                    body: `${op} finished.`,
                });
                return;
            }
            // Focused (or pref OFF, or browser mode): in-app feedback. COALESCED —
            // count this gen; ONE summary toast fires when the queue drains (StatusBar
            // owns the count + flush). That single toast rings the in-app chime once
            // (burst-start), so a long queue = one chime, not one per gen. The OS path
            // above didn't fire here, so there's no double sound.
            StatusBar.notifyCompletion();
        } catch (err) {
            clientLogger.error('notificationService', 'failed to notify:', err);
        }
    }));

    // `remote:connection` fires on every feed tick while connected — latch on the
    // rising edge (disconnected → connected, phase cleared) so we notify once.
    let _wasRemoteConnected = false;
    _unsubs.push(Events.on('remote:connection', ({ connected = false, phase = null, gpuName = null } = {}) => {
        try {
            const nowConnected = connected === true && !phase;
            if (nowConnected && !_wasRemoteConnected) {
                _wasRemoteConnected = true;
                const osEligible = state.notificationPrefs?.connection !== false;
                if (osEligible && ipcRenderer && !document.hasFocus()) {
                    ipcRenderer.send('notify-connection-complete', {
                        title: 'Pod connected',
                        subtitle: 'Cubric Studio',
                        body: gpuName ? `${gpuName} ready.` : 'Remote engine ready.',
                    });
                    return;
                }
                StatusBar.notify(gpuName ? `${gpuName} connected.` : 'Remote engine connected.', 'success');
            } else if (!connected) {
                _wasRemoteConnected = false;
            }
        } catch (err) {
            clientLogger.error('notificationService', 'failed to notify:', err);
        }
    }));

    _unsubs.push(Events.on('download:complete', (data = {}) => {
        try {
            // UW installs surface through engine UI — no completion notification
            if (!data.modelId || data.modelId === '__universal_workflow__') return;
            const model = getModelById(data.modelId);
            const modelName = model?.name || data.modelId;
            const osEligible = state.notificationPrefs?.downloads !== false;
            if (osEligible && ipcRenderer && !document.hasFocus()) {
                ipcRenderer.send('notify-download-complete', {
                    title: 'Download complete',
                    subtitle: 'Cubric Studio',
                    body: `${modelName} installed.`,
                });
                return;
            }
            StatusBar.notify(`${modelName} installed.`, 'success');
        } catch (err) {
            clientLogger.error('notificationService', 'failed to notify:', err);
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
