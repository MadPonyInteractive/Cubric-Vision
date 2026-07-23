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

// Route + fire the coalesced completion notification. Extracted so it can be
// re-checked from a setTimeout closure without duplicating the routing.
function _fireCompletionNotification() {
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
}

// Arm the single deferred flush IF the batch is drained (queue at 0) and at least
// one gen finished. Called from BOTH edges that can complete a batch: the queue
// count reaching 0, AND a `generation:complete` arriving. This matters because the
// two fire from decoupled paths in an ORDER THAT IS NOT GUARANTEED — a single
// gallery gen releases its store lane (count → 0) BEFORE it emits
// `generation:complete` (see generationService: `activeGenerations.end` then the
// emit). If only the count→0 edge armed the flush, `_doneCount` was still 0 at that
// instant and the notification was silently dropped (the "no toast on a single gen"
// bug). Whichever edge lands last with count==0 && _doneCount>0 arms the timer; the
// timer re-checks both at fire time so a refill in the ~frame gap still cancels it.
function _maybeArmFlush() {
    if ((Number(state.generationQueueCount) || 0) !== 0) return; // batch not drained
    if (_doneCount <= 0) return;                                 // nothing to report
    if (_flushTimer) return;                                     // already scheduled
    // Defer ~a frame: the last item's `generation:complete` and the count reaching 0
    // fire from decoupled paths in either order, and pressing Cue again briefly
    // re-derives the count; wait so it settles, then re-check before firing.
    _flushTimer = setTimeout(() => {
        _flushTimer = null;
        if ((Number(state.generationQueueCount) || 0) !== 0) return;
        if (_doneCount <= 0) return;
        _fireCompletionNotification();
    }, 150);
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
    // A finished gen — count it, then try to arm the flush. On a SINGLE gen this
    // edge lands AFTER count→0 (the lane released before the emit), so this is the
    // edge that actually arms the flush; on a multi-gen batch the count→0 edge below
    // does. Either way the timer's re-check settles the race.
    _unsubs.push(Events.on('generation:complete', () => { _doneCount++; _maybeArmFlush(); }));
    _unsubs.push(Events.onState('generationQueueCount', (count) => {
        const depth = Number(count) || 0;
        // Queue refilled (a new item running/pending) → the previous drain is no
        // longer the end of the batch. Cancel any pending flush; the new batch will
        // flush when IT drains. This also stops a slow pending flush from a finished
        // cue firing "as the next cue starts".
        if (depth !== 0) { if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; } return; }
        _maybeArmFlush();
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
    while (_unsubs.length) { _unsubs.pop()(); }
}

export function triggerGenerationCompleteNotification({ minimizeFirst = false } = {}) {
    return sendNotificationPayload({
        title: 'Generation complete',
        subtitle: 'Cubric Studio',
        body: 'Dev gallery test finished.',
    }, { minimizeFirst });
}
