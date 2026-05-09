/**
 * generationService.js — Generation lifecycle manager.
 *
 * Encapsulates the full "run generation → save result → update project" flow.
 * Both MpiGalleryBlock and MpiGroupHistoryBlock call startGeneration()
 * and provide UI callbacks for their specific rendering needs.
 */

import { runCommand } from './commandExecutor.js';
import { saveGeneration, addGroup, updateGroup } from './projectService.js';
import { createImageItem, createVideoItem, createItemGroup, appendToHistory } from '../data/projectModel.js';
import { StatusBar } from '../shell/statusBar.js';
import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { truncateCardName } from '../utils/displayHelpers.js';
import { activeGenerations } from './activeGenerations.js';
import { ComfyUIController } from './comfyController.js';

// ── Auto-loop tracking ──────────────────────────────────────────────────────
// Active loops keyed by registration id. Re-submission triggers when a loop's
// own generation completes successfully.
const _activeLoops = new Map(); // regId → { config, opts, callbacks }

// ── Queue depth polling ─────────────────────────────────────────────────────
let _queuePollTimer = null;
async function _refreshQueueDepth() {
    const q = await ComfyUIController.getQueue();
    const depth = (q.running?.length || 0) + (q.pending?.length || 0);
    if (state.generationQueueCount !== depth) {
        state.generationQueueCount = depth;
    }
    console.log('[queue] depth', depth);
}
function _scheduleQueuePoll() {
    clearTimeout(_queuePollTimer);
    _queuePollTimer = setTimeout(_refreshQueueDepth, 200);
}

function _emitPromptBoxGenerationEndIfIdle() {
    if (activeGenerations.list().some(entry => entry.status === 'running')) return;
    if (_activeLoops.size > 0) return;
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
        _scheduleQueuePoll();
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

        // Build one item per output URL. Each item gets its own uuid (first reuses
        // the pre-allocated itemId so existing telemetry stays consistent).
        const builtItems = [];
        let firstDisplayName = operation;

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const thisItemId = i === 0 ? itemId : crypto.randomUUID();
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
            }
            const item = isVideo ? createVideoItem(baseProps) : createImageItem(baseProps);
            builtItems.push(item);
        }

        // Project mutation. MUST await — addGroup/updateGroup are serialized
        // through the mutation chain in projectService; emitting before they
        // resolve makes listeners see stale state.currentProject.
        if (opts.existingGroup) {
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

        _scheduleQueuePoll();

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
        _scheduleQueuePoll();
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
 * Clears all pending jobs from ComfyUI's native queue. The currently running
 * job is not interrupted. After clear, queue depth is re-polled.
 */
export async function clearPendingQueue() {
    const q = await ComfyUIController.getQueue();
    const pendingPromptIds = new Set((q.pending || []).map(item => (
        Array.isArray(item) ? item[1] : (item?.prompt_id || item?.promptId)
    )).filter(Boolean));
    await ComfyUIController.clearQueue();
    for (const entry of activeGenerations.list()) {
        if (!pendingPromptIds.has(entry.promptId)) continue;
        const tempId = entry.tempId ?? null;
        const extraTempIds = entry.extraTempIds ?? [];
        activeGenerations.end(entry.id, { revokePreview: true });
        Events.emit('generation:cancelled', { id: entry.id, tempId, extraTempIds });
    }
    _emitPromptBoxGenerationEndIfIdle();
    _scheduleQueuePoll();
}
