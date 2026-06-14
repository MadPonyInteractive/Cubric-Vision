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
import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { truncateCardName } from '../utils/displayHelpers.js';
import { activeGenerations } from './activeGenerations.js';
import { trackConcatJob } from './concatProgress.js';
import { extractFilenameFromPath } from '../utils/mediaActions.js';
import { getCommand } from '../data/commandRegistry.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { ce } from '../utils/dom.js';

// TEMP-DEBUG gate (MPI-64 Bug B). OFF by default; flip on while hunting:
//   localStorage.setItem('MPI_DEBUG_BUGB','1')  then reload. REMOVE with Bug B.
let _BUGB_DEBUG = false;
try { _BUGB_DEBUG = localStorage.getItem('MPI_DEBUG_BUGB') === '1'; } catch (_) { /* no-op */ }

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
let _activeCueJob = null;
let _cueDispatchInFlight = false;
/** Most-recent dispatched job — used by loop re-fire to fetch fresh payloads. */
let _lastJobForLoop = null;

const PROMPT_EXCERPT_MAX = 140;

function _promptExcerpt(text = '') {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, PROMPT_EXCERPT_MAX);
}

function _cloneMediaItems(mediaItems = []) {
    return (Array.isArray(mediaItems) ? mediaItems : [])
        .filter(item => item && (item.url || item.filePath))
        .map(item => ({
            id:        item.id ?? null,
            url:       item.url ?? item.filePath ?? '',
            filePath:  item.filePath ?? item.url ?? '',
            mediaType: item.mediaType ?? item.type ?? null,
            source:    item.source ?? null,
            role:      item.role ?? null,
            thumbPath:  item.thumbPath ?? null,
            trim:      item.trim && Number.isFinite(+item.trim.in) && Number.isFinite(+item.trim.out)
                ? { in: +item.trim.in, out: +item.trim.out }
                : null,
        }));
}

function _clonePlain(value) {
    if (value == null) return value;
    try {
        return structuredClone(value);
    } catch (_) {
        return JSON.parse(JSON.stringify(value));
    }
}

function _buildQueueDisplay(config = {}, opts = {}, source = 'manual', isLoop = false) {
    const injectionParams = config.injectionParams || {};
    const width = Number(injectionParams.Width || injectionParams.width || opts.placeholderGroup?.width || 0) || 0;
    const height = Number(injectionParams.Height || injectionParams.height || opts.placeholderGroup?.height || 0) || 0;
    const batchCount = Math.max(
        1,
        Number(injectionParams.Batch_Size || injectionParams.batchSize || opts.batchCount || ((opts.extraTempIds?.length || 0) + 1)) || 1
    );
    const model = config.model || {};
    const command = getCommand(config.operation);
    const ratio = injectionParams.Ratio_Label || injectionParams.ratioLabel || config.ratioLabel || '';
    return {
        promptExcerpt: _promptExcerpt(config.positive),
        negativeExcerpt: _promptExcerpt(config.negative),
        modelId: model.id ?? null,
        modelName: model.displayName || model.name || model.label || model.id || (command?.universal ? 'Universal workflow' : 'Unknown model'),
        operation: config.operation || '',
        ratio,
        width,
        height,
        batchCount,
        mediaItems: _cloneMediaItems(config.mediaItems),
        previewKind: config.previewOnly === true ? 'preview' : (config.isStage2 === true ? 'final' : ''),
        source,
        isLoop,
        scope: opts.scope ?? (opts.existingGroup ? 'groupHistory' : 'gallery'),
        replaceItemId: config.replaceItemId ?? null,
        sourceGroupId: opts.sourceGroupId ?? null,
    };
}

function _queueSnapshotItem(job, status) {
    const activeEntry = status === 'running' && job.queueJobId
        ? activeGenerations.list().find(entry => entry.queueJobId === job.queueJobId)
        : null;
    const batchCount = Math.max(
        1,
        Number(
            job.display?.batchCount
            || job.config?.injectionParams?.Batch_Size
            || job.config?.injectionParams?.batchSize
            || ((job.opts?.extraTempIds?.length || 0) + 1)
        ) || 1
    );
    return {
        queueJobId: job.queueJobId,
        status,
        isLoop: !!job.isLoop,
        source: job.source || 'manual',
        promptExcerpt: job.display?.promptExcerpt || '',
        negativeExcerpt: job.display?.negativeExcerpt || '',
        modelId: job.display?.modelId ?? job.config?.model?.id ?? null,
        modelName: job.display?.modelName || job.config?.model?.name || job.config?.model?.id || 'Unknown model',
        operation: job.display?.operation || job.config?.operation || '',
        ratio: job.display?.ratio
            || job.config?.injectionParams?.Ratio_Label
            || job.config?.injectionParams?.ratioLabel
            || job.config?.ratioLabel
            || '',
        width: job.display?.width || 0,
        height: job.display?.height || 0,
        batchCount,
        mediaItems: job.display?.mediaItems || [],
        previewKind: job.display?.previewKind || '',
        previewUrl: activeEntry?.latestPreviewUrl || null,
        activeGenerationId: activeEntry?.id || null,
        canCancel: status === 'pending',
        canStop: status === 'running',
        scope: job.display?.scope || job.opts?.scope || 'gallery',
        replaceItemId: job.display?.replaceItemId ?? job.config?.replaceItemId ?? null,
        sourceGroupId: job.display?.sourceGroupId ?? job.opts?.sourceGroupId ?? null,
    };
}

function _emitQueueChanged() {
    Events.emit('generation-queue:changed', getGenerationQueueSnapshot());
}

function _updateQueueDepth() {
    const depth = _cueQueue.length + (_cueDispatchInFlight ? 1 : 0);
    if (state.generationQueueCount !== depth) {
        state.generationQueueCount = depth;
    }
    _emitQueueChanged();
}

/**
 * Frees the in-flight CUE dispatch slot and schedules the next job. The normal
 * exit for the active job (its wrapped onComplete/onError/onCancel call this).
 * Also callable directly to settle a job whose exec promise will NEVER resolve
 * — e.g. a remote job Stopped before it ever got a prompt_id, where the
 * interrupt POST is a no-op and ComfyUI never sends a terminal event (MPI-73
 * Bug 2). `skipNext` suppresses auto-promoting the next queued job, used when
 * the engine is not accepting work so the next job would just hang too.
 * @param {{ skipNext?: boolean }} [opts]
 */
function _finishActiveCueDispatch({ skipNext = false } = {}) {
    if (!_cueDispatchInFlight && !_activeCueJob) return;
    _cueDispatchInFlight = false;
    _activeCueJob = null;
    _updateQueueDepth();
    if (skipNext) {
        _emitPromptBoxGenerationEndIfIdle();
        return;
    }
    setTimeout(() => _dispatchNextCue(), 0);
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
                enqueueGeneration(fresh.config, _lastJobForLoop.callbacks, {
                    ...(fresh.opts || _lastJobForLoop.opts),
                    source: 'loop',
                    isLoop: true,
                });
                return;
            }
        }
        _emitPromptBoxGenerationEndIfIdle();
        return;
    }
    _cueDispatchInFlight = true;
    _activeCueJob = next;
    _lastJobForLoop = next;
    _updateQueueDepth();

    const finishCueDispatch = () => _finishActiveCueDispatch();

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
    startGeneration(next.config, wrappedCallbacks, {
        ...next.opts,
        queueJobId: next.queueJobId,
        queueDisplay: next.display,
        queueSource: next.source,
        isLoop: next.isLoop,
    });
}

/**
 * Cue-mode entry point. Queues a generation and dispatches when idle.
 * Returns nothing — callers track via `activeGenerations` events.
 */
export function enqueueGeneration(config, callbacks = {}, opts = {}) {
    const queueJobId = opts.queueJobId || crypto.randomUUID();
    const source = opts.source || (state.loopArmed ? 'loop' : 'manual');
    const isLoop = opts.isLoop === true || source === 'loop';
    const display = opts.queueDisplay || _buildQueueDisplay(config, opts, source, isLoop);
    _cueQueue.push({ queueJobId, config, callbacks, opts: { ...opts, queueJobId, queueDisplay: display, source, isLoop }, display, source, isLoop });
    _updateQueueDepth();
    _dispatchNextCue();
    return { queueJobId };
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

/** Removes one pending Cue job by stable queue id. Does not stop the running job. */
export function cancelPendingCueJob(queueJobId) {
    if (!queueJobId) return [];
    return removeCueJob(job => job.queueJobId === queueJobId);
}

/** Stops a running Cue job by stable queue id. */
export function cancelRunningCueJob(queueJobId) {
    if (!queueJobId) return false;
    const entry = activeGenerations.list().find(e => e.queueJobId === queueJobId && e.status === 'running');
    if (!entry) return false;
    // A job that never received a prompt_id never reached the engine (e.g. the
    // remote preview WS was down — MPI-73). Its exec promise will NEVER settle,
    // so the interrupt POST is a no-op and the wrapped onComplete/onCancel that
    // frees the dispatcher never fires → the queue stays stuck on a dead
    // "running" slot and repeated Stop does nothing. Detect that case and settle
    // the CUE state locally: end the gen, free the dispatch slot WITHOUT
    // auto-promoting the next job (the engine isn't accepting work, so the next
    // would hang too), and drop any pending jobs.
    const neverStarted = !entry.promptId;
    activeGenerations.cancel(entry.id);
    if (neverStarted) {
        clearCueQueue();
        _finishActiveCueDispatch({ skipNext: true });
    }
    _emitQueueChanged();
    return true;
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

/** Read-only snapshot for user-facing queue panels. */
export function getGenerationQueueSnapshot() {
    const running = _activeCueJob ? _queueSnapshotItem(_activeCueJob, 'running') : null;
    const pending = _cueQueue.map(job => _queueSnapshotItem(job, 'pending'));
    return {
        running,
        pending,
        items: [...(running ? [running] : []), ...pending],
        depth: pending.length + (running ? 1 : 0),
        pendingCount: pending.length,
        runningCount: running ? 1 : 0,
        loopArmed: !!state.loopArmed,
    };
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
        queueJobId:        opts.queueJobId ?? null,
        queueDisplay:      opts.queueDisplay ?? null,
        queueSource:       opts.queueSource ?? null,
        isLoop:            opts.isLoop === true,
    });

    exec.onPromptAck = (promptId) => {
        activeGenerations.setPromptId(_regId, promptId);
    };

    exec.onPreview = (url) => {
        activeGenerations.setPreview(_regId, url);
        _emitQueueChanged();
        callbacks.onPreview?.(url);
    };

    exec.onSamplingStart = () => {
        samplingStartTime ??= Date.now();
    };

    exec.onComplete = async (urls, outputInfo = {}) => {
        // TEMP-DEBUG (MPI-64 Bug B — intermittent: fresh Generate with preview
        // toggle ON sometimes saved a FINISHED card duplicating the prior result
        // instead of a stage1 preview. Could not repro in-session. Gated OFF by
        // default — enable with localStorage.setItem('MPI_DEBUG_BUGB','1') when
        // hunting it. REMOVE once caught + fixed.)
        if (_BUGB_DEBUG && operation && String(operation).endsWith('_ms')) {
            // clientLogger.warn is (category, message) only — a 3rd arg is dropped,
            // so inline the state into the message string.
            clientLogger.warn('generationService',
                `TEMP-DEBUG ms-run op=${operation} model=${model?.id}` +
                ` previewOnly=${config.previewOnly === true} isStage2=${config.isStage2 === true}` +
                ` historyMode=${config.historyMode === true} replaceItemId=${config.replaceItemId ?? null}` +
                ` cacheHit=${exec.cacheHit === true}` +
                ` latents=${Array.isArray(outputInfo.latents) ? outputInfo.latents.length : 0}` +
                ` urls=${Array.isArray(urls) ? urls.length : 0}`);
        }
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

        // ComfyUI cache hit: every output node was served from cache, so the
        // result is byte-identical to a prior run. Skip creating a duplicate
        // history entry / gallery card. Replace mode (preview → final) is
        // explicit user intent and bypasses this guard.
        if (exec.cacheHit === true && !config.replaceItemId) {
            const _cacheEntry = activeGenerations.get(_regId);
            const _cacheTempId = _cacheEntry?.tempId ?? null;
            const _cacheExtraTempIds = _cacheEntry?.extraTempIds ?? [];
            activeGenerations.end(_regId, { revokePreview: true });
            const _toastWrap = ce('div');
            document.body.appendChild(_toastWrap);
            const _toast = MpiToast.mount(_toastWrap, {
                message: 'No changes, skipping...',
                variant: 'info',
                duration: 3000,
            });
            _toast.on('close', () => _toastWrap.remove());
            Events.emit('tool:cancelled', { tool: 'groupHistory' });
            Events.emit('generation:cancelled', { id: _regId, tempId: _cacheTempId, extraTempIds: _cacheExtraTempIds });
            Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
            _emitPromptBoxGenerationEndIfIdle();
            callbacks.onCancel?.();
            return;
        }

        const width  = injectionParams.Width  || injectionParams.width  || 0;
        const height = injectionParams.Height || injectionParams.height || 0;
        const ratioLabel = injectionParams.Ratio_Label || injectionParams.ratioLabel || null;
        const elapsedMs = samplingStartTime ? Date.now() - samplingStartTime : null;
        const generationMediaItems = _cloneMediaItems(mediaItems);
        const generationSettings = {
            operation,
            modelId: model.id,
            injectionParams: _clonePlain(injectionParams || {}),
            mediaItems: generationMediaItems,
            previewOnly: config.previewOnly === true,
        };
        if (state.currentProject && model.id) {
            generationSettings.modelSettings = _clonePlain(getModelSettings(state.currentProject, model.id));
        }

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
                        meta: { prompt: positive, negativePrompt: negative, modelId: model.id, seed: exec.seed ?? -1, ratioLabel, generationSettings },
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
                ratioLabel,
                generationSettings: savedData?.generationSettings ?? generationSettings,
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
