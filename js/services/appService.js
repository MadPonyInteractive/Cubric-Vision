/**
 * appService.js — Run path for Apps (MPI-256).
 *
 * An App is a second producer into the generation queue: it builds a config from
 * its descriptor + collected inputs and hands it to enqueueGeneration() exactly like
 * the History block's universal tool ops (model:{id:null}, no getNextGeneration).
 *
 * The one thing the universal path does NOT do on its own is a MODEL guard — universal
 * ops resolve their weights at dispatch and would fail deep in the engine if a required
 * model isn't installed. So submitAppGeneration pre-flights appAvailability and aborts
 * with a toast BEFORE anything enters the queue.
 */

'use strict';

import { enqueueGeneration } from './generationService.js';
import { getAppById, appAvailability } from '../data/appsRegistry.js';
import { state } from '../state.js';
import { Events } from '../events.js';

/**
 * Queue a generation for an App.
 *
 * @param {import('../data/appsRegistry.js').AppDef|string} appOrId
 * @param {Object} inputs - Collected by the app's uiComponent. Media are passed by
 *                          reference (content-addressed store paths), never base64.
 * @param {Object} [callbacks] - onComplete/onError/onCancel, forwarded to enqueueGeneration.
 * @returns {{queueJobId: string}|null} enqueue result, or null if the guard aborted.
 */
export function submitAppGeneration(appOrId, inputs = {}, callbacks = {}) {
    const app = typeof appOrId === 'string' ? getAppById(appOrId) : appOrId;
    if (!app) {
        Events.emit('ui:warning', { message: 'That app could not be found.' });
        return null;
    }

    // Pre-flight MODEL guard — universal ops have none of their own.
    const { available, missing } = appAvailability(app);
    if (!available) {
        Events.emit('ui:warning', {
            message: `${app.title} needs ${missing.length === 1 ? 'a model' : 'models'} installed first — open it in the App Library to install.`,
        });
        return null;
    }

    // Build config from the descriptor + inputs. Positive/negative stay empty unless
    // the app declares them (the app workflow IS the recipe — RUN CLEAN, no project LoRAs;
    // the universal model:{id:null} path already injects none, getModelSettings is keyed
    // by model.id).
    const mediaItems = Array.isArray(inputs.mediaItems) ? inputs.mediaItems : [];
    const config = {
        operation: app.operation,
        model: { id: null, mediaType: app.mediaType || 'image' },
        positive: inputs.positive || '',
        negative: inputs.negative || '',
        mediaItems,
        injectionParams: inputs.injectionParams || {},
        // Additive, threaded to the sidecar save path (Phase 2 item 4) so Reuse can
        // reopen this App with its inputs restored.
        appId: app.id,
        appInputs: inputs,
    };

    // Placeholder group so the gallery shows a live "Generating…" card (with the
    // source image as an input-preview) while the job runs — mirrors the PromptBox
    // gallery path (MpiGalleryBlock mkPlaceholder). Without it an app gen was invisible
    // in the grid until it completed (no in-progress card, no preview/latent). The
    // gallery block renders opts.placeholderGroup off the running activeGenerations entry.
    const tempId = crypto.randomUUID();
    const ip = config.injectionParams || {};
    const srcUrl = mediaItems[0]?.url || mediaItems[0]?.filePath || null;
    const placeholderGroup = {
        id: tempId,
        type: 'image',
        name: 'Generating...',
        history: srcUrl ? [{
            id: `${tempId}-input-preview`,
            type: 'image',
            filePath: srcUrl,
            name: 'Generating...',
            displayName: 'Generating...',
            operation: app.operation,
            inputPreview: true,
            pixelDimensions: { w: 0, h: 0 },
        }] : [],
        selectedIndex: 0,
        width:  Number(ip.Width  || ip.width)  || 1024,
        height: Number(ip.Height || ip.height) || 1024,
        isGenerating: true,
    };

    // NO getNextGeneration — arming the loop would re-fire app gens. forceLocal only
    // when the user has explicitly pinned the local engine (mirrors state.engineOverride).
    const opts = { scope: 'gallery', tempId, placeholderGroup };
    if (state.engineOverride === 'local') opts.forceLocal = true;

    const res = enqueueGeneration(config, callbacks, opts);
    // Return the tempId so the caller (MpiBaseApp) can match this job's live latent
    // previews (generation:preview carries the regId → activeGenerations entry → tempId).
    return res ? { ...res, tempId } : null;
}

/**
 * Reuse routing for App cards (MPI-256 Phase 5). An app gen's sidecar carries
 * `appId` + `appInputs`; Reuse on such a card must reopen the APP with those inputs
 * restored, NOT fill the PromptBox. Both Gallery + History reuse entry points call
 * this at the TOP of their reuse flow and `return` when it handles the item.
 *
 * Seeds `state.s_appInputs[appId]` (top-level replace) BEFORE emitting `app:open`,
 * so the freshly-mounted MpiBaseApp reads the restored inputs on mount. If a required
 * model is missing, routes to the App Library (to install) instead of a broken app.
 *
 * @param {Object} item - The reused history item (payload.item).
 * @returns {boolean} true if the item was an app card and was handled.
 */
export function openAppFromReuse(item) {
    const appId = item?.appId;
    if (!appId) return false;
    const app = getAppById(appId);
    if (!app) return false; // unknown app id → let normal reuse handle it

    const { available } = appAvailability(app);
    if (!available) {
        // Missing a required model — send the user to the Library to install it,
        // rather than opening an app that can't run.
        Events.emit('ui:warning', {
            message: `${app.title} needs its model installed — opening the App Library.`,
        });
        Events.emit('apps:open');
        return true;
    }

    // Restore the saved inputs, then open the app. Seed first — MpiBaseApp reads
    // s_appInputs[appId] on mount.
    if (item.appInputs && typeof item.appInputs === 'object') {
        state.s_appInputs = { ...state.s_appInputs, [appId]: item.appInputs };
    }
    // Defer the open by a tick: Reuse is triggered from a context menu / reuse
    // dialog whose teardown fires a bare `ui:close-all-popups` AFTER this returns —
    // which the App overlay (MpiOverlay) obeys and would immediately hide. Emitting
    // on the next tick lets that close settle first, so the app actually opens.
    setTimeout(() => Events.emit('app:open', { appId }), 0);
    return true;
}
