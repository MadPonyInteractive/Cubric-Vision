/**
 * generationService.js — Generation lifecycle manager.
 *
 * Encapsulates the full "run generation → save result → update project" flow.
 * Both MpiGalleryBlock and MpiGroupHistoryBlock call startGeneration()
 * and provide UI callbacks for their specific rendering needs.
 */

import { runCommand } from './commandExecutor.js';
import { saveGeneration, addGroup, updateGroup } from './projectService.js';
import { createImageItem, createVideoItem, createItemGroup, appendToHistory, getModelSettings, replaceHistoryItemById } from '../data/projectModel.js';
import { StatusBar } from '../shell/statusBar.js';
import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { truncateCardName } from '../utils/displayHelpers.js';
import { activeGenerations } from './activeGenerations.js';

// ── Auto-loop tracking ──────────────────────────────────────────────────────
// Active loops keyed by registration id. Re-submission triggers when a loop's
// own generation completes successfully.
const _activeLoops = new Map(); // regId → { config, opts, callbacks }

// ── Cue queue (in-app, single-dispatch) ─────────────────────────────────────
// We own the pending array. Only ONE prompt is ever submitted to ComfyUI at a
// time so Comfy's own queue never grows beyond 1. This avoids races on the
// asset upload step (shared static filenames) and gives us full control over
// pending mutation (clear, reorder).
/** @type {Array<{ config: Object, callbacks: Object, opts: Object }>} */
const _cueQueue = [];
let _cueDispatchInFlight = false;

function _updateQueueDepth() {
    const depth = _cueQueue.length + (_cueDispatchInFlight ? 1 : 0);
    if (state.generationQueueCount !== depth) {
        state.generationQueueCount = depth;
    }
}

function _dispatchNextCue() {
    if (_cueDispatchInFlight) return;
    const next = _cueQueue.shift();
    if (!next) {
        _updateQueueDepth();
        _emitPromptBoxGenerationEndIfIdle();
        return;
    }
    _cueDispatchInFlight = true;
    _updateQueueDepth();

    const finishCueDispatch = () => {
        _cueDispatchInFlight = false;
        _updateQueueDepth();
        setTimeout(() => _dispatchNextCue(), 0);
    };

    const wrappedCallbacks = {
        ...next.callbacks,
        onComplete: (data) => {
            try { next.callbacks.onComplete?.(data); }
            finally { finishCueDispatch(); }
        },
        onError: () => {
            try { next.callbacks.onError?.(); }
            finally { finishCueDispatch(); }
        },
        onCancel: () => {
            try { next.callbacks.onCancel?.(); }
            finally { finishCueDispatch(); }
        },
    };
    startGeneration(next.config, wrappedCallbacks, next.opts);
}

/**
 * Cue-mode entry point. Queues a generation and dispatches when idle.
 * Returns nothing — callers track via `activeGenerations` events.
 */
export function enqueueGeneration(config, callbacks = {}, opts = {}) {
    _cueQueue.push({ config, callbacks, opts });
    _updateQueueDepth();
    _dispatchNextCue();
}

/** Clears all pending Cue jobs (does not interrupt the running one). */
export function clearCueQueue() {
    _cueQueue.length = 0;
    _updateQueueDepth();
}

/** Force a state.generationQueueCount refresh (no-op for own-queue model). */
export function refreshQueueDepth() {
    _updateQueueDepth();
}

function _emitPromptBoxGenerationEndIfIdle() {
    if (activeGenerations.list().some(entry => entry.status === 'running')) return;
    if (_activeLoops.size > 0) return;
    if (_cueDispatchInFlight || _cueQueue.length > 0) return;
    Events.emit('promptbox:generation-end');
}

/**
 * @typedef {Object} GenerationConfig
 * @property {string}   operation
 * @property {Object}   model           — full model object (from modelRegistry)
 * @property {string}   positive
 * @property {string}   negative
 * @property {Array}    mediaItems
 * @property {string}   [maskDataUrl]
 * @property {Object}   [injectionParams]
 * @property {boolean}  [previewOnly]   — multi-stage ops only; injects Preview_Only=true
 */

/**
 * @typedef {Object} GenerationCallbacks
 * @property {function(string):void}        [onPreview]  — called with preview URL
 * @property {function({item, group}):void} [onComplete] — called with final item and group
 * @property {function():void}              [onError]    — called on failure
 * @property {function():void}              [onCancel]   — called on cancel/empty result
 */

/**
 * Start a generation, manage the lifecycle, and persist results.
 *
 * For Gallery: creates a new group with the generated item.
 * For GroupHistory: appends the generated item to an existing group.
 *
 * @param {GenerationConfig} config
 * @param {GenerationCallbacks} callbacks
 * @param {{ existingGroup?: Object, scope?: string, groupId?: string, tempId?: string, placeholderGroup?: Object }} [opts]
 * @returns {{ cancel: function }}
 */
export function startGeneration(config, callbacks = {}, opts = {}) {
    const { operation, model, positive, negative, mediaItems = [], maskDataUrl, injectionParams = {} } = config;
    let samplingStartTime = null;
    const itemId = crypto.randomUUID();
    const isVideo = model.mediaType === 'video';

    const _mode = state.generationMode || 'single';

    Events.emit('tool:running', { tool: 'groupHistory', type: operation });

    const exec = runCommand({
        operation,
        modelId: model.id,
        positive,
        negative,
        mediaItems,
        maskDataUrl,
        injectionParams,
        previewOnly: config.previewOnly === true,
    });

    const { id: _regId } = activeGenerations.start({
        scope:             opts.scope ?? (opts.existingGroup ? 'groupHistory' : 'gallery'),
        groupId:           opts.groupId ?? opts.existingGroup?.id ?? null,
        tempId:            opts.tempId ?? null,
        operation,
        modelId:           model.id,
        placeholderGroup:  opts.placeholderGroup ?? null,
        extraTempIds:      opts.extraTempIds ?? [],
        extraPlaceholders: opts.extraPlaceholders ?? [],
        exec,
    });

    exec.onPromptAck = (promptId) => {
        activeGenerations.setPromptId(_regId, promptId);
    };

    if (_mode === 'autoloop') {
        _activeLoops.set(_regId, {
            config: { ...config, mediaItems: [...mediaItems], injectionParams: { ...injectionParams } },
            opts: { ...opts },
            callbacks,
        });
    }

    exec.onPreview = (url) => {
        activeGenerations.setPreview(_regId, url);
        callbacks.onPreview?.(url);
    };

    exec.onProgress = (value) => StatusBar.progress.update(value);
    exec.onSamplingStart = () => {
        samplingStartTime ??= Date.now();
    };

    exec.onComplete = async (urls) => {
        if (!urls.length) {
            clientLogger.warn('generationService', 'Generation completed but no output returned.');
            Events.emit('tool:cancelled', { tool: 'groupHistory' });
            const _cancelEntry = activeGenerations.get(_regId);
            const _cancelTempId = _cancelEntry?.tempId ?? null;
            const _cancelExtraTempIds = _cancelEntry?.extraTempIds ?? [];
            activeGenerations.end(_regId, { revokePreview: true });
            Events.emit('generation:cancelled', { id: _regId, tempId: _cancelTempId, extraTempIds: _cancelExtraTempIds });
            _emitPromptBoxGenerationEndIfIdle();
            callbacks.onCancel?.();
            return;
        }

        const width  = injectionParams.Width  || 0;
        const height = injectionParams.Height || 0;
        const elapsedMs = samplingStartTime ? Date.now() - samplingStartTime : null;

        // Multi-stage video preview tagging: when this run was a Preview-only pass,
        // tag the saved sidecar with stage='preview' + frozenParams (so a later
        // Continue can re-run with identical seed/prompt/dims) + loraSnapshot
        // (informational record of the LoRAs used at preview time).
        let _previewStage = opts.stage;
        let _previewFrozen = opts.frozenParams;
        let _previewLoraSnapshot = opts.loraSnapshot;
        if (isVideo && config.previewOnly === true && _previewStage === undefined) {
            _previewStage = 'preview';
            _previewFrozen = {
                seed:     exec.seed ?? -1,
                prompt:   positive,
                negative: negative,
                dims:     { w: width, h: height },
                frames:   injectionParams.Frames ?? injectionParams.Frame_Count ?? null,
            };
            const _proj = state.currentProject;
            if (_proj && model.id) {
                const _settings = getModelSettings(_proj, model.id);
                const _loraSlots = Array.isArray(_settings.loras)
                    ? _settings.loras
                    : Object.values(_settings.loras || {}).flat();
                _previewLoraSnapshot = _loraSlots
                    .filter(slot => slot && slot.name)
                    .map(slot => ({
                        name:          slot.name,
                        strengthModel: slot.strengthModel ?? 1.0,
                        strengthClip:  slot.strengthClip  ?? 1.0,
                    }));
            }
        }

        // Build one item per output URL. Each item gets its own uuid (first reuses
        // the pre-allocated itemId so existing telemetry stays consistent).
        const builtItems = [];
        let firstDisplayName = operation;

        // Replacement runs (preview → final) target a specific existing item
        // and emit a single output URL. Force the first (and only) item id
        // to the replaceItemId so save-generation overwrites the same sidecar.
        const _replaceItemId = config.replaceItemId || null;

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const thisItemId = _replaceItemId && i === 0
                ? _replaceItemId
                : (i === 0 ? itemId : crypto.randomUUID());
            let filePath = url;
            let displayName = operation;
            let resolvedDims = width ? { w: width, h: height } : { w: 0, h: 0 };
            let savedData = null;

            if (state.currentProject?.folderPath) {
                try {
                    const data = await saveGeneration({
                        folderPath: state.currentProject.folderPath,
                        comfyViewUrl: url,
                        itemId: thisItemId,
                        operation,
                        meta: { prompt: positive, negativePrompt: negative, modelId: model.id, seed: exec.seed ?? -1 },
                        generationMs: elapsedMs,
                        pixelDimensions: resolvedDims,
                        mediaType: model.mediaType,
                        stage:        _previewStage,
                        frozenParams: _previewFrozen,
                        loraSnapshot: _previewLoraSnapshot,
                        replaceItemId: (_replaceItemId && i === 0) ? _replaceItemId : undefined,
                    });
                    if (data.success) {
                        savedData = data;
                        filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                        displayName = data.displayName || data.filename.replace(/\.[^.]+$/, '');
                        if (data.pixelDimensions) resolvedDims = data.pixelDimensions;
                    }
                } catch (err) {
                    clientLogger.warn('generationService', 'save-generation failed, using comfy URL:', err);
                }
            }

            displayName = truncateCardName(displayName);
            if (i === 0) firstDisplayName = displayName;

            const baseProps = {
                id: thisItemId,
                filePath,
                operation,
                displayName,
                prompt: positive,
                negativePrompt: negative,
                modelId: model.id,
                seed: exec.seed ?? -1,
                pixelDimensions: resolvedDims,
                generationMs: elapsedMs,
            };
            if (isVideo) {
                Object.assign(baseProps, {
                    thumbPath:   savedData?.thumbPath ?? null,
                    fps:         savedData?.fps ?? 0,
                    duration:    savedData?.duration ?? 0,
                    frameCount:  savedData?.frameCount ?? 0,
                    hasAudio:    savedData?.hasAudio ?? false,
                    videoMeta:   savedData?.videoMeta ?? null,
                });
                if (savedData?.stage)        baseProps.stage        = savedData.stage;
                if (savedData?.frozenParams) baseProps.frozenParams = savedData.frozenParams;
                if (savedData?.loraSnapshot) baseProps.loraSnapshot = savedData.loraSnapshot;
            }
            const item = isVideo ? createVideoItem(baseProps) : createImageItem(baseProps);
            builtItems.push(item);
        }

        // Project mutation. MUST await — addGroup/updateGroup are serialized
        // through the mutation chain in projectService; emitting before they
        // resolve makes listeners see stale state.currentProject.
        if (_replaceItemId) {
            // Replacement run (preview → final): swap the matching history slot
            // in the owning group; do NOT add a new group.
            const targetGroup = (state.currentProject?.itemGroups || [])
                .find(g => g.history?.some(h => h.id === _replaceItemId));
            const newItem = builtItems[0];
            if (targetGroup && newItem) {
                const updatedGroup = replaceHistoryItemById(targetGroup, newItem);
                await updateGroup(updatedGroup);
                activeGenerations.end(_regId, { revokePreview: false });
                Events.emit('gallery:item-updated', { groupId: updatedGroup.id, item: newItem, group: updatedGroup });
                Events.emit('generation:complete', { id: _regId, item: newItem, group: updatedGroup });
                callbacks.onComplete?.({ item: newItem, group: updatedGroup });
            } else {
                clientLogger.warn('generationService', 'replaceItemId set but no matching group/item found', { _replaceItemId });
                activeGenerations.end(_regId, { revokePreview: false });
                Events.emit('generation:complete', { id: _regId, item: newItem, group: null });
                callbacks.onComplete?.({ item: newItem, group: null });
            }
        } else if (opts.existingGroup) {
            // GroupHistory mode — append all items to existing group (history view).
            let working = opts.existingGroup;
            for (const it of builtItems) {
                working = appendToHistory(working, it);
            }
            const updatedGroup = {
                ...working,
                width:  opts.existingGroup.width  || width,
                height: opts.existingGroup.height || height,
            };
            await updateGroup(updatedGroup);
            activeGenerations.end(_regId, { revokePreview: false });
            const lastItem = builtItems[builtItems.length - 1];
            Events.emit('generation:complete', { id: _regId, item: lastItem, group: updatedGroup });
            callbacks.onComplete?.({ item: lastItem, group: updatedGroup });
        } else {
            // Gallery mode — one group (card) per item.
            const _galleryEntry = activeGenerations.get(_regId);
            const _galleryTempId = _galleryEntry?.tempId ?? null;
            const _galleryExtraTempIds = _galleryEntry?.extraTempIds ?? [];
            const groups = builtItems.map((it) => {
                const name = truncateCardName(it.displayName || it.operation || firstDisplayName);
                const g = createItemGroup(model.mediaType, { name, width, height });
                return appendToHistory(g, it);
            });
            for (const g of groups) await addGroup(g);
            activeGenerations.end(_regId, { revokePreview: false });
            const firstItem = builtItems[0];
            const firstGroup = groups[0];
            // Single emit — handler reads state.currentProject.itemGroups (already
            // contains all N groups via addGroup) and rebuilds grid with them.
            Events.emit('generation:complete', { id: _regId, item: firstItem, group: firstGroup, tempId: _galleryTempId, extraTempIds: _galleryExtraTempIds });
            callbacks.onComplete?.({ item: firstItem, group: firstGroup });
        }

        Events.emit('tool:idle', { tool: 'groupHistory', type: operation });

        // Auto-loop re-submission: if loop still active, fire again with same config.
        const loop = _activeLoops.get(_regId);
        if (loop) {
            _activeLoops.delete(_regId);
            const next = loop.callbacks.getNextGeneration?.() || {};
            startGeneration(next.config || loop.config, loop.callbacks, next.opts || loop.opts);
        } else {
            _emitPromptBoxGenerationEndIfIdle();
        }
    };

    exec.onError = (err) => {
        Events.emit('tool:cancelled', { tool: 'groupHistory' });
        const _errEntry = activeGenerations.get(_regId);
        const _errTempId = _errEntry?.tempId ?? null;
        const _errExtraTempIds = _errEntry?.extraTempIds ?? [];
        activeGenerations.end(_regId, { revokePreview: true });
        Events.emit('generation:error', { id: _regId, tempId: _errTempId, extraTempIds: _errExtraTempIds });
        _emitPromptBoxGenerationEndIfIdle();
        callbacks.onError?.();
        _activeLoops.delete(_regId);
    };

    return { cancel: () => { _activeLoops.delete(_regId); exec.cancel(); } };
}

/**
 * Stops the auto-loop for a given registration id without interrupting the
 * currently in-flight job. The active job will complete naturally; no
 * re-submission will occur.
 */
export function stopAutoLoop(regId) {
    const had = _activeLoops.delete(regId);
    if (had) console.log('[loop] stopped, no resubmit', regId);
    return had;
}

/**
 * Stops all auto-loops in flight (used when bulk-cancelling).
 */
export function stopAllAutoLoops() {
    if (_activeLoops.size === 0) return;
    console.log('[loop] stopped all', _activeLoops.size);
    _activeLoops.clear();
}

/**
 * Clears all pending Cue jobs from the in-app queue. The currently running
 * job (if any) is not interrupted. Comfy never holds pending jobs in the
 * own-queue model, so no Comfy queue mutation is needed.
 */
export function clearPendingQueue() {
    clearCueQueue();
    _emitPromptBoxGenerationEndIfIdle();
}
