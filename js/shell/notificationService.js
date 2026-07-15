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

// Finished-gen counter for the coalesced completion notification (flushed when
// state.generationQueueCount reaches 0). See the generation:complete handler.
let _doneCount = 0;

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

    // COALESCE the whole queue into ONE completion notification. Per-gen firing
    // (an OS notification + chime per item) was noise on a queue of N. Instead:
    // count every finished gen, and fire once when the WHOLE queue drains —
    // `state.generationQueueCount` (running + the _cueQueue pending items) reaching
    // 0 is the authoritative "batch done" signal. The generationStore's own depth
    // is NOT it: the cue queue feeds one job at a time, so store depth hits 0
    // between every item → it would fire per-gen.
    //
    // Route decided at FLUSH time (focus can change during the run): unfocused +
    // pref on → one OS notification; else → one in-app summary toast (rings the
    // chime once). Main also gates the OS send on isFocused(), so no double.
    _unsubs.push(Events.on('generation:complete', () => { _doneCount++; }));
    _unsubs.push(Events.onState('generationQueueCount', (count) => {
        if ((Number(count) || 0) !== 0) return;   // queue not empty yet
        if (_doneCount <= 0) return;               // nothing finished to report
        // Defer to the next tick: the last item's `generation:complete` and the
        // queue-count reaching 0 fire from decoupled paths in either order, so a
        // synchronous flush here can miss the final increment. On the next tick the
        // count is settled and every completion is counted. Re-check the count is
        // still 0 (a fast re-cue could have refilled the queue meanwhile).
        setTimeout(() => {
            if ((Number(state.generationQueueCount) || 0) !== 0) return;
            if (_doneCount <= 0) return;
            const n = _doneCount;
            _doneCount = 0;
            try {
                const body = n === 1 ? 'Generation finished.' : `${n} generations finished.`;
                const osEligible = state.notificationPrefs?.generation !== false;
                if (osEligible && ipcRenderer && !document.hasFocus()) {
                    ipcRenderer.send('notify-generation-complete', {
                        title: 'Generation complete',
                        subtitle: 'Cubric Studio',
                        body,
                    });
                    return;
                }
                StatusBar.notify(body, 'success'); // in-app; rings the chime once
            } catch (err) {
                clientLogger.error('notificationService', 'failed to notify:', err);
            }
        }, 0);
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
