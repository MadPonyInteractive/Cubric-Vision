/**
 * notificationService.js — Bridges generation/download lifecycle events to notifications.
 *
 * Listens for `generation:complete` and `download:complete`. The `notificationPrefs`
 * checkbox toggles OS notifications only — completion feedback always surfaces. When the
 * pref is ON and the window is unfocused, an OS notification fires (main also gates on
 * isFocused()). In every other case (pref OFF, or window focused) an in-app StatusBar
 * toast fires instead — split via `document.hasFocus()` so the two never both deliver.
 *
 * MPI-310 — DOWNLOAD completions additionally DEFER an in-app toast to the next focus.
 * The either/or split above loses the message outright when the OS notification is
 * missed (focus assist, another app fullscreen, dismissed from the tray), and a download
 * is the one flow users deliberately walk away from — so returning to the app left no
 * trace that a multi-GB install had finished. The deferred toast is the trace.
 *
 * Browser mode: no ipcRenderer, so the in-app toast always fires.
 */

'use strict';

import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from '../services/clientLogger.js';
import { getModelById } from '../data/modelRegistry.js';
import { PLUGINS, pluginDepKey } from '../data/pluginsRegistry.js';
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
// Single pending flush timer — replaced (never stacked) on each count→0 so a
// leftover timer from a previous batch can't fire against a new one.
let _flushTimer = null;

// MPI-310 — messages owed to the user on their next return to the window. Queued when
// we hand off to an OS notification that may never be seen; drained by the `focus`
// listener registered in init. Deduped by text so a batch of installs finishing while
// away yields one line each, not repeats.
const _pendingOnFocus = [];

function _deferToFocus(message, variant = 'success') {
    if (!_pendingOnFocus.some(p => p.message === message)) {
        _pendingOnFocus.push({ message, variant });
    }
}

function _flushPendingOnFocus() {
    while (_pendingOnFocus.length) {
        const { message, variant } = _pendingOnFocus.shift();
        StatusBar.notify(message, variant);
    }
}

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

    // MPI-310 — drain anything owed from a completion that landed while the window was
    // unfocused. `focus` (not visibilitychange): an Electron window can be visible but
    // unfocused behind another app, which is exactly the case that queued the message.
    const _onFocus = () => _flushPendingOnFocus();
    window.addEventListener('focus', _onFocus);
    _unsubs.push(() => window.removeEventListener('focus', _onFocus));

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
        const depth = Number(count) || 0;
        // Queue refilled (a new item running/pending) → the previous drain is no
        // longer the end of the batch. Cancel any pending flush; the new batch will
        // flush when IT drains. This also stops a slow pending flush from a finished
        // cue firing "as the next cue starts".
        if (depth !== 0) { if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; } return; }
        if (_doneCount <= 0) return;               // nothing finished to report
        if (_flushTimer) return;                   // a flush is already scheduled
        // Defer ~a frame: the last item's `generation:complete` and the count
        // reaching 0 fire from decoupled paths in either order, and pressing Cue
        // again briefly re-derives the count; wait so the count settles, then
        // re-check it's STILL 0 before firing. Single timer — never stacked.
        _flushTimer = setTimeout(() => {
            _flushTimer = null;
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
        }, 150);
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
            // MPI-310 — a PLUGIN install broadcasts its `plugin:<id>` key here, which
            // MODELS never contains, so the raw key leaked into the notification body
            // ("plugin:image-describer installed."). Same miss as the uninstall toast.
            const modelName = getModelById(data.modelId)?.name
                || PLUGINS.find(p => pluginDepKey(p.id) === data.modelId)?.title
                || data.modelId;
            const message = `${modelName} installed.`;
            const osEligible = state.notificationPrefs?.downloads !== false;
            if (osEligible && ipcRenderer && !document.hasFocus()) {
                ipcRenderer.send('notify-download-complete', {
                    title: 'Download complete',
                    subtitle: 'Cubric Studio',
                    body: message,
                });
                // The OS notification may never be seen — owe the user a toast on return.
                _deferToFocus(message, 'success');
                return;
            }
            StatusBar.notify(message, 'success');
        } catch (err) {
            clientLogger.error('notificationService', 'failed to notify:', err);
        }
    }));
}

/**
 * Tear down the listeners. Primarily for hot-reload / tests.
 */
export function destroyNotificationService() {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    _doneCount = 0;
    _pendingOnFocus.length = 0;
    while (_unsubs.length) { _unsubs.pop()(); }
}

export function triggerGenerationCompleteNotification({ minimizeFirst = false } = {}) {
    return sendNotificationPayload({
        title: 'Generation complete',
        subtitle: 'Cubric Studio',
        body: 'Dev gallery test finished.',
    }, { minimizeFirst });
}
