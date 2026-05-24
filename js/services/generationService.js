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
import { trackConcatJob } from './concatProgress.js';
import { extractFilenameFromPath } from '../utils/mediaActions.js';

// ── Cue queue (in-app, single-dispatch) ─────────────────────────────────────
// We own the pending array. Only ONE prompt is ever submitted to ComfyUI at a
// time so Comfy's own queue never grows beyond 1. This avoids races on the
// asset upload step (shared static filenames) and gives us full control over
// pending mutation (clear, reorder).
//
// Loop mode: when state.loopArmed is true and the dispatcher drains to empty,
// we ask the last-dispatched job's `getNextGeneration` callback for a fresh
// payload (live PromptBox state — model/op/prompt/media at re-fire time) and
// enqueue it. Re-fire triggers on complete, cancel, AND error. Only flipping
// state.loopArmed = false halts re-fire.
/** @type {Array<{ config: Object, callbacks: Object, opts: Object }>} */
const _cueQueue = [];
let _cueDispatchInFlight = false;
/** Most-recent dispatched job — used by loop re-fire to fetch fresh payloads. */
let _lastJobForLoop = null;

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
        // Loop re-fire: when armed and queue just drained, ask the last job
        // for a fresh payload (live PromptBox state) and re-enqueue. Halts
        // when state.loopArmed flips false or callback returns nothing.
        if (state.loopArmed && _lastJobForLoop) {
            const fresh = _lastJobForLoop.callbacks?.getNextGeneration?.();
            if (fresh && fresh.config) {
                enqueueGeneration(fresh.config, _lastJobForLoop.callbacks, fresh.opts || _lastJobForLoop.opts);
                return;
            }
        }
        _emitPromptBoxGenerationEndIfIdle();
        return;
    }
    _cueDispatchInFlight = true;
    _lastJobForLoop = next;
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
    const removed = _cueQueue.splice(0, _cueQueue.length);
    _updateQueueDepth();
    for (const job of removed) {
        try { job.callbacks?.onCancel?.(); } catch {}
    }
}

/**
 * Removes pending Cue jobs matching `predicate(job)`. Returns removed jobs.
 * Each removed job has its `onCancel` callback fired so callers can roll back
 * UI state (e.g., flip "Queued..." card back to preview state).
 * Does NOT interrupt the running job.
 */
export function removeCueJob(predicate) {
    if (typeof predicate !== 'function') return [];
    const removed = [];
    for (let i = _cueQueue.length - 1; i >= 0; i--) {
        if (predicate(_cueQueue[i])) {
            removed.push(..._cueQueue.splice(i, 1));
        }
    }
    if (removed.length) {
        _updateQueueDepth();
        for (const job of removed) {
            try { job.callbacks?.onCancel?.(); } catch {}
        }
    }
    return removed;
}

/** Force a state.generationQueueCount refresh (no-op for own-queue model). */
export function refreshQueueDepth() {
    _updateQueueDepth();
}

/**
 * Read-only snapshot of pending Cue jobs (does NOT include the in-flight one).
 * Used by blocks to rehydrate per-card "queued" UI state after navigation,
 * since block-instance Maps are destroyed on workspace switch but the cue
 * queue lives at module scope.
 */
export function peekCueQueue() {
    return _cueQueue.slice();
}

function _emitPromptBoxGenerationEndIfIdle() {
    if (activeGenerations.list().some(entry => entry.status === 'running')) return;
    if (_cueDispatchInFlight || _cueQueue.length > 0) return;
    if (state.loopArmed) return;
    Events.emit('promptbox:generation-end');
}

async function _deleteSavedItems(items) {
    const project = state.currentProject;
    if (!project?.id || !project?.folderPath) return;
    for (const item of items || []) {
        const filename = extractFilenameFromPath(item?.filePath);
        if (!filename || !item?.id) continue;
        try {
            const res = await fetch(
                `/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}&itemId=${encodeURIComponent(item.id)}`,
                { method: 'DELETE' }
            );
            if (!res.ok) {
                clientLogger.warn('generationService', 'orphan output cleanup returned non-ok status', {
                    status: res.status,
                    itemId: item.id,
                    filename,
                });
            }
        } catch (err) {
            clientLogger.warn('generationService', 'orphan output cleanup failed', err);
        }
    }
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
 * @property {boolean}  [historyMode]   — history workspace context; forces Preview_Only=false on _ms ops
 * @property {boolean}  [extend]        — when true, after save-generation the saved video is
 *                                       concatenated onto `sourceItemId` via /extend-video.
 *                                       The intermediate item is deleted; the extended output
 *                                       replaces it in the existing history group.
 * @property {string}   [sourceItemId]  — required when extend=true; UUID of the source video
 *                                       in the same project that the generation extends.
 * @property {number}   [trimIn]        — optional; when extend=true, slice the source video
 *                                       starting at `trimIn` seconds before concatenation.
 * @property {number}   [trimOut]       — optional; when extend=true, slice the source video
 *                                       ending at `trimOut` seconds before concatenation.
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
        historyMode: config.historyMode === true,
        isStage2: config.isStage2 === true,
        loadLatentName: config.loadLatentName,
        previewLatentFilePath: config.previewLatentFilePath,
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
        replaceItemId:     config.replaceItemId ?? null,
        sourceGroupId:     opts.sourceGroupId ?? null,
    });

    exec.onPromptAck = (promptId) => {
        activeGenerations.setPromptId(_regId, promptId);
    };

    exec.onPreview = (url) => {
        activeGenerations.setPreview(_regId, url);
        callbacks.onPreview?.(url);
    };

    exec.onProgress = (value) => {
        if (samplingStartTime) StatusBar.progress.update(value);
    };
    exec.onSamplingStart = () => {
        samplingStartTime ??= Date.now();
    };

    exec.onComplete = async (urls, outputInfo = {}) => {
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

        const width  = injectionParams.Width  || injectionParams.width  || 0;
        const height = injectionParams.Height || injectionParams.height || 0;
        const elapsedMs = samplingStartTime ? Date.now() - samplingStartTime : null;

        // Multi-stage video preview tagging: when this run was a Preview-only pass,
        // tag the saved sidecar with stage='preview' + frozenParams (so a later
        // Continue can re-run with identical seed/prompt/dims) + loraSnapshot
        // (informational record of the LoRAs used at preview time).
        let _previewStage = opts.stage;
        let _previewFrozen = opts.frozenParams;
        let _previewLoraSnapshot = opts.loraSnapshot;
        let _previewAssets = opts.previewAssets;
        const _frozenMediaItems = mediaItems
            .filter(item => item?.url && item?.mediaType)
            .map((item, index) => ({
                id:        item.id ?? `frozen-media-${index}`,
                url:       item.url,
                mediaType: item.mediaType,
                source:    item.source ?? null,
                role:      item.role ?? null,
            }));
        if (isVideo && config.previewOnly === true && config.historyMode !== true && _previewStage === undefined) {
            _previewStage = 'preview';
            // Snapshot the full injectionParams map (minus Preview_Only, which is
            // a stage marker, not a user-controlled param). Continue replays this
            // wholesale so any PromptBox control (Duration, Motion_Intensity, and
            // any future control) is locked to the preview-time value.
            const { Preview_Only: _skip, ...frozenInjection } = injectionParams;
            _previewFrozen = {
                seed:     exec.seed ?? -1,
                prompt:   positive,
                negative: negative,
                dims:     { w: width, h: height },
                injectionParams: frozenInjection,
                mediaItems: _frozenMediaItems,
            };
            _previewAssets = {
                latent: Array.isArray(outputInfo.latents) ? outputInfo.latents[0] || null : null,
                snapshots: _frozenMediaItems
                    .filter(item =>
                        item.mediaType === 'image' &&
                        (item.role === 'startFrame' || item.role === 'endFrame')
                    )
                    .map(item => ({
                        id: item.id,
                        role: item.role,
                        mediaType: item.mediaType,
                        url: item.url,
                    })),
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
                        previewAssets: _previewAssets,
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
                // Server returns aggregated generationMs on preview→final replace
                // (prev stage + this stage). Prefer it over the local timer.
                generationMs: savedData?.generationMs ?? elapsedMs,
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
                if (savedData?.previewAssets) baseProps.previewAssets = savedData.previewAssets;
            }
            const item = isVideo ? createVideoItem(baseProps) : createImageItem(baseProps);
            builtItems.push(item);
        }

        // Extend post-process: concat the freshly-saved I2V output onto the
        // source video. Replaces builtItems[0] with the extended output and
        // deletes the intermediate item so only the extended video lands in
        // the history group. Source video is untouched.
        if (isVideo && config.extend === true && config.sourceItemId && state.currentProject?.folderPath) {
            const intermediate = builtItems[0];
            const generatedAbs = intermediate?.filePath
                ? (() => {
                    try {
                        const u = new URL(intermediate.filePath, 'http://localhost');
                        const raw = u.searchParams.get('path');
                        return raw ? decodeURIComponent(raw) : '';
                    } catch (_) { return ''; }
                })()
                : '';

            if (!generatedAbs) {
                clientLogger.warn('generationService', 'extend: intermediate filePath unresolved; skipping concat');
            } else {
                const jobId = `extend-${_regId}-${Date.now()}`;
                try {
                    const concatPromise = trackConcatJob({ jobId, label: 'Concatenating videos' });
                    const extendBody = {
                        jobId,
                        folderPath: state.currentProject.folderPath,
                        sourceItemId: config.sourceItemId,
                        generatedFilePath: generatedAbs,
                        modelId: model.id,
                        prompt:  positive,
                        negativePrompt: negative,
                        seed: exec.seed ?? -1,
                        op: operation,
                    };
                    if (Number.isFinite(+config.trimIn) && Number.isFinite(+config.trimOut)
                        && +config.trimOut > +config.trimIn) {
                        extendBody.trimIn  = +config.trimIn;
                        extendBody.trimOut = +config.trimOut;
                    }
                    const resp = await fetch('/extend-video', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(extendBody),
                    });
                    const data = await resp.json();
                    if (!resp.ok || !data?.success || !data?.item) {
                        throw new Error(data?.error || 'extend-video failed');
                    }
                    // Wait for SSE-driven done event so StatusBar completes.
                    // The HTTP response and SSE done fire close together; the
                    // promise may resolve first or after — both are fine.
                    try { await concatPromise; } catch (_) { /* HTTP path already succeeded */ }

                    // Delete the intermediate sidecar/thumb (server already
                    // removed the .mp4 inside /extend-video).
                    try {
                        const filename = generatedAbs.split(/[\\/]/).pop();
                        await fetch(
                            `/project-media/${state.currentProject.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}&itemId=${encodeURIComponent(intermediate.id)}`,
                            { method: 'DELETE' }
                        );
                    } catch (delErr) {
                        clientLogger.warn('generationService', 'extend: intermediate sidecar cleanup failed', delErr);
                    }

                    // Swap intermediate → extended item. Server sidecar shape
                    // maps cleanly through createVideoItem; preserve the new
                    // server-assigned id so future history-group ops resolve.
                    const ext = data.item;
                    const extendedItem = createVideoItem({
                        id:              ext.id,
                        filePath:        ext.filePath,
                        operation:       ext.operation || 'extend',
                        displayName:     truncateCardName(ext.displayName || 'extend'),
                        prompt:          ext.prompt || positive,
                        negativePrompt:  ext.negativePrompt || negative,
                        modelId:         ext.modelId || model.id,
                        seed:            Number.isFinite(ext.seed) ? ext.seed : (exec.seed ?? -1),
                        pixelDimensions: ext.pixelDimensions || resolvedDims,
                        generationMs:    elapsedMs,
                        thumbPath:       ext.thumbPath ?? null,
                        fps:             ext.fps ?? 0,
                        duration:        ext.duration ?? 0,
                        frameCount:      ext.frameCount ?? 0,
                        hasAudio:        ext.hasAudio ?? false,
                        videoMeta:       ext.videoMeta ?? null,
                        extendedFrom:    ext.extendedFrom ?? null,
                    });
                    builtItems[0] = extendedItem;
                } catch (extErr) {
                    clientLogger.error('generationService', 'extend post-step failed; keeping intermediate', extErr);
                    // Surface a short, user-readable summary. ffmpeg dumps its
                    // full stderr into err.message; truncate before showing.
                    const _shortMsg = String(extErr.message || 'unknown error')
                        .split('\n')[0]
                        .slice(0, 160);
                    Events.emit('ui:error', {
                        title: 'Extend failed',
                        message: `${_shortMsg}. Intermediate video kept in history.`,
                    });
                    // Intermediate stays as a regular new history entry.
                }
            }
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
                if (newItem) await _deleteSavedItems([newItem]);
                activeGenerations.end(_regId, { revokePreview: false });
                Events.emit('tool:cancelled', { tool: 'groupHistory' });
                Events.emit('generation:cancelled', { id: _regId });
                callbacks.onCancel?.();
                _emitPromptBoxGenerationEndIfIdle();
                return;
            }
        } else if (opts.existingGroup) {
            // GroupHistory mode: use the latest state snapshot; deletes can land
            // while this job runs.
            const latestGroup = (state.currentProject?.itemGroups || [])
                .find(g => g.id === opts.existingGroup.id);
            if (!latestGroup) {
                clientLogger.warn('generationService', 'groupHistory completion ignored because group no longer exists', {
                    groupId: opts.existingGroup.id,
                    operation,
                });
                await _deleteSavedItems(builtItems);
                activeGenerations.end(_regId, { revokePreview: false });
                Events.emit('tool:cancelled', { tool: 'groupHistory' });
                Events.emit('generation:cancelled', { id: _regId });
                callbacks.onCancel?.();
                _emitPromptBoxGenerationEndIfIdle();
                return;
            }

            let working = latestGroup;
            for (const it of builtItems) {
                working = appendToHistory(working, it);
            }
            const updatedGroup = {
                ...working,
                width:  latestGroup.width  || width,
                height: latestGroup.height || height,
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
            Events.emit('generation:complete', { id: _regId, item: firstItem, group: firstGroup, tempId: _galleryTempId, extraTempIds: _galleryExtraTempIds, scope: 'gallery' });
            callbacks.onComplete?.({ item: firstItem, group: firstGroup });
        }

        Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
        _emitPromptBoxGenerationEndIfIdle();
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
    };

    return { cancel: () => { exec.cancel(); } };
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
