/**
 * generationService.js — Generation lifecycle manager.
 *
 * Encapsulates the full "run generation → save result → update project" flow.
 * Both MpiGalleryBlock and MpiGroupHistoryBlock call startGeneration()
 * and provide UI callbacks for their specific rendering needs.
 */

import { runCommand } from './commandExecutor.js';
import { saveGeneration, addGroup, updateGroup } from './projectService.js';
import { createImageItem, createVideoItem, createItemGroup, appendToHistory, getModelSettings, getSharedSettings, getOpSettings, replaceHistoryItemById } from '../data/projectModel.js';
import { Events } from '../events.js';
import { generationStore } from './generationStore.js';
import { remoteEngineClient } from './remoteEngineClient.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { truncateCardName } from '../utils/displayHelpers.js';
import { activeGenerations } from './activeGenerations.js';
import { trackConcatJob } from './concatProgress.js';
import { extractFilenameFromPath } from '../utils/mediaActions.js';
import { getCommand, getCommandMediaInputs } from '../data/commandRegistry.js';
import { getAppById } from '../data/appsRegistry.js';
import { pluginForOperation } from '../data/pluginsRegistry.js';
import { usesOrientation } from '../utils/ratios.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { ce } from '../utils/dom.js';

// ── Cue queue (in-app, TWO-LANE dispatch) ───────────────────────────────────
// We own the pending array. MPI-74 P6: there are now TWO dispatch lanes — a
// 'remote' lane (cloud Pod) and a 'local' lane (local ComfyUI, the per-gen "Run
// locally" toggle). Each lane runs AT MOST one prompt at a time (so neither
// engine's Comfy queue grows past 1, preserving the static-filename + asset-
// upload race protection per engine), but the two lanes run CONCURRENTLY: a
// local gen no longer waits behind a running cloud gen. The pending `_cueQueue`
// is a single array; each job carries a lane tag and the dispatcher fills any
// idle lane with the next pending job for that lane.
//
// Loop mode: when state.loopArmed is true and a lane drains, we ask that lane's
// last-dispatched job's `getNextGeneration` callback for a fresh payload (live
// PromptBox state — model/op/prompt/media at re-fire time) and enqueue it.
// Re-fire triggers on complete, cancel, AND error. Only flipping
// state.loopArmed = false halts re-fire.
/** @type {Array<{ queueJobId: string, config: Object, callbacks: Object, opts: Object, display: Object, source: string, isLoop: boolean }>} */
const _cueQueue = [];

// MPI-208 Phase 3 (Option A): the generationStore is the LANE-ACCOUNTING +
// running-truth authority. `_cueQueue` above stays the PENDING-INTENT holder
// (config/callbacks/display/getNextGeneration — data the store has no record of
// until a job dispatches). Each lane keeps only:
//   • active   — the cue INTENT currently dispatched on this lane (display +
//                callbacks the store doesn't hold). Its store execution is the
//                job registered by commandExecutor at dispatch; the exec handle
//                that reaches it lives in the activeGenerations registry entry
//                (keyed by queueJobId), so Stop routes registry → exec → store.
//   • lastJobForLoop — the last dispatched intent, kept for loop re-fire.
// `inFlight` is DERIVED from the store (`_laneBusy`), never a private mirror —
// the store owns whether a lane's execution is live (INV-6). Lane-drain +
// loop re-fire fire from `store.setLoopCallback(lane, cb)` (INV-5), not a
// hand-rolled dispatch guard.
const _lanes = {
    remote: { active: null, lastJobForLoop: null },
    local:  { active: null, lastJobForLoop: null },
};

/**
 * The lane a job (or its opts) dispatches on. MUST mirror the store's engine→lane
 * rule in commandExecutor (`engine = forceLocal ? 'local' : isRemote() ? 'remote' :
 * 'local'`), because generationStore keys the lane off that resolved `engine`. If
 * this derived the lane from `forceLocal` alone, a NO-POD local gen (forceLocal
 * false, isRemote false) would park its INTENT on the 'remote' lane while its STORE
 * job runs on 'local' — so the store's 'local' drain fires `_loopCallbacks.local`
 * (never set) and `_lanes.remote.active` never clears → a completed gen shows a
 * phantom "1 RUNNING" that never drains (MPI-213). Keying both on the same resolved
 * engine keeps the intent lane and the store lane in agreement.
 *
 * NOTE: `isRemote()` reads the mirror refreshed by remoteEngineClient.refresh(),
 * which the store's own resolution awaits fresh at dispatch. This sync read can lag
 * by one gen on the exact stale-Pod edge (MPI-179), but for the common no-Pod case
 * it is reliably false — which is the case this fixes.
 * @returns {'local'|'remote'}
 */
function _laneOf(jobOrOpts) {
    const opts = jobOrOpts?.opts || jobOrOpts || {};
    if (opts.forceLocal === true) return 'local';
    return remoteEngineClient.isRemote() ? 'remote' : 'local';
}

/** @returns {boolean} true when the store has a live (non-terminal) job on this lane. */
function _laneBusy(lane) {
    return generationStore.getSnapshot().running.some(j => j.lane === lane);
}

/** @returns {number} live store jobs across both lanes (0–2). */
function _runningCount() {
    return generationStore.getSnapshot().running.length;
}

const PROMPT_EXCERPT_MAX = 140;

// Returns the first REQUIRED media slot an op declares that has no matching asset
// in `mediaItems`, or null when every required slot is filled. Shared by the
// enqueue guard (block a no-media job before it ever reaches the queue) and the
// dispatch-time guard in startGeneration (the net for loop re-fire / stage-2
// paths that don't go through enqueueGeneration). An op with only a media-input
// operation (e.g. the PiD upscaler — its ONLY op needs an image) would otherwise
// queue a false job that wedges the lane at dispatch (MPI-212).
function _findMissingMediaSlot(operation, mediaItems = []) {
    return getCommandMediaInputs(operation).find(slot => {
        if (slot.required === false) return false;
        const hasRoleMatch = mediaItems.some(m => m.url && m.role === slot.key && m.mediaType === slot.mediaType);
        const hasTypeMatch = mediaItems.some(m => m.url && m.mediaType === slot.mediaType);
        return !hasRoleMatch && !hasTypeMatch;
    }) || null;
}

// Toast copy for a missing required media slot. Same wording used at enqueue and
// dispatch so the message reads identically wherever the block lands.
function _warnMissingMediaSlot(slot) {
    const noun = slot.mediaType === 'video' ? 'video' : slot.mediaType === 'audio' ? 'audio file' : 'image';
    // sound:false — immediate feedback of pressing Cue; a click must not ring.
    Events.emit('ui:warning', { message: `Add ${noun === 'image' ? 'an' : 'a'} ${noun} before generating — this operation needs one.`, sound: false });
}

function _promptExcerpt(text = '') {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, PROMPT_EXCERPT_MAX);
}

// Keep only the media items whose type the operation actually declares as an
// input slot. The PromptBox may still hold a start-frame chip left over from a
// prior i2v when the user fires a t2i (which declares NO image input) — without
// this filter that stale chip is snapshotted into the t2i sidecar's
// generationSettings.mediaItems, which then (a) lights up "Use Images" on a
// text-to-image card's Reuse dialog and (b) injects the wrong image on reuse,
// and (c) propagates the orphan-prone frame reference into downstream i2v
// preview-assets — the reference that 404s once a card in that lineage is
// deleted (MPI-225). Ops with no declared media input → empty snapshot.
function _opScopedMediaItems(operation, mediaItems = []) {
    const slots = getCommandMediaInputs(operation);
    if (!slots.length) return [];
    return (Array.isArray(mediaItems) ? mediaItems : []).filter(item => {
        const type = item?.mediaType ?? item?.type ?? null;
        return slots.some(slot => slot.mediaType === type);
    });
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
        Number(injectionParams.Input_Batch_Size || injectionParams.Batch_Size || injectionParams.batchSize || opts.batchCount || ((opts.extraTempIds?.length || 0) + 1)) || 1
    );
    const model = config.model || {};
    const command = getCommand(config.operation);
    const ratio = injectionParams.Ratio_Label || injectionParams.ratioLabel || config.ratioLabel || '';
    // App gens (config.appId) show the App's title in the Cue, not the generic
    // "Universal workflow" fallback that model:{id:null} would otherwise pick.
    const appTitle = config.appId ? (getAppById(config.appId)?.title || null) : null;
    // Plugin ops (MPI-310) consume no prompt — the Cue's prompt line would fall
    // back to "No prompt text". Name the capability instead, mirroring appTitle.
    const plugin = pluginForOperation(config.operation);
    return {
        promptExcerpt: _promptExcerpt(config.positive) || plugin?.title || '',
        negativeExcerpt: _promptExcerpt(config.negative),
        modelId: model.id ?? null,
        modelName: model.displayName || model.name || model.label || model.id || appTitle || (command?.universal ? 'Universal workflow' : 'Unknown model'),
        appTitle,
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
        // MPI-74: per-job engine label for the Cue badge. Only meaningful while
        // the app is remote-connected; a force-local run shows 'local'. UI-only
        // until MPI-82's spine reads opts.forceLocal — inert on routing for now.
        engine: opts.forceLocal ? 'local' : 'remote',
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
            || job.config?.injectionParams?.Input_Batch_Size
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
        appTitle: job.display?.appTitle || null,
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
        engine: job.display?.engine || (job.opts?.forceLocal ? 'local' : 'remote'),
    };
}

function _emitQueueChanged() {
    Events.emit('generation-queue:changed', getGenerationQueueSnapshot());
}

// Cue-queue depth = pending intents + live store jobs. The store is the single
// source of running truth (Phase 3), so the running half comes from it, not a
// private lane mirror. Written here AND re-derived on every store change (the
// subscription below) so the count stays honest even when a job settles or is
// cancelled through a path that doesn't route back through this module.
function _updateQueueDepth() {
    const depth = _cueQueue.length + _runningCount();
    if (state.generationQueueCount !== depth) {
        state.generationQueueCount = depth;
    }
    _emitQueueChanged();
}

// MPI-208 Phase 3: `state.generationQueueCount` is written ONLY from store truth
// + `_cueQueue`. Every store transition (register/advance/cancel/settle) re-derives
// the depth, so a terminal reached inside commandExecutor (Stop, error, done)
// updates the Cue xN label and QueuePanel without generationService having to be
// on that code path. Replaces the direct `state.generationQueueCount = 0` writes
// scattered in the blocks (INV-2: derived, not hand-set).
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener (service module singleton)
Events.on('generation-store:changed', () => { _updateQueueDepth(); });

/**
 * A lane just DRAINED (its store execution reached a terminal — done, error, or a
 * Stop-triggered cancelled). This is the single completion point for a lane in the
 * Option-A model: the store fires it via `setLoopCallback(lane, …)` exactly once
 * per drain (INV-5), so a late settle from an already-terminal job can't re-enter
 * it (the store no-ops the illegal transition — its lane ownership IS the identity
 * guard that the old `_lanes[lane].active !== next` check hand-rolled).
 *
 * Clears the lane's active intent, then either loop-re-fires (once) or promotes the
 * lane's next pending intent. The OTHER lane is untouched — draining the cloud lane
 * never disturbs a concurrent local gen, and vice versa (MPI-74 P6).
 *
 * `skipNext` suppresses promotion/re-fire — used on an explicit Stop where the
 * engine isn't accepting work, so the next job would just hang too.
 * @param {'local'|'remote'} lane
 * @param {{ skipNext?: boolean }} [opts]
 */
function _onLaneDrain(lane, { skipNext = false } = {}) {
    const L = _lanes[lane];
    if (!L || !L.active) return; // nothing was dispatched on this lane
    const drained = L.active;
    L.active = null;
    _updateQueueDepth();
    if (skipNext) {
        _emitPromptBoxGenerationEndIfIdle();
        return;
    }
    // Loop re-fire belongs HERE (a lane just drained), NOT in the dispatch pass. If
    // this lane has no real pending job and loop is armed, enqueue ONE fresh
    // iteration from this lane's last job (live PromptBox payload). Once per drain —
    // the store guarantees this callback fires exactly once, so the re-fire storm
    // (re-fire in the dispatch pass re-arming forever) cannot recur.
    const hasPending = _cueQueue.some(job => _laneOf(job) === lane);
    const loopSeed = L.lastJobForLoop || drained;
    if (!hasPending && state.loopArmed && loopSeed) {
        const fresh = loopSeed.callbacks?.getNextGeneration?.();
        if (fresh && fresh.config) {
            // Pin the lane: a re-fire of THIS lane's loop must stay on THIS lane
            // regardless of what getNextGeneration reports, or a stale forceLocal
            // would route it to the other lane and this lane would re-fire again
            // next drain → ping-pong.
            enqueueGeneration(fresh.config, loopSeed.callbacks, {
                ...(fresh.opts || loopSeed.opts),
                forceLocal: lane === 'local',
                source: 'loop',
                isLoop: true,
            });
            return; // enqueueGeneration dispatches; don't double-dispatch below.
        }
    }
    setTimeout(() => _dispatchNextCue(), 0);
}

/**
 * Fills every IDLE lane with the next PENDING intent for that lane. Pure promotion —
 * NO loop re-fire here (that lives in `_onLaneDrain`, fired once per drain by the
 * store). A lane is idle when it has no dispatched intent (`_lanes[lane].active`)
 * AND the store reports no live job on it (`_laneBusy`). The intent flag covers the
 * async gap between `startGeneration` returning and commandExecutor's async head
 * registering the store job; the store flag covers everything after. Because this
 * pass never enqueues, it never recurses: at most one intent per lane per call.
 */
function _dispatchNextCue() {
    for (const lane of ['remote', 'local']) {
        if (_lanes[lane].active || _laneBusy(lane)) continue;

        const idx = _cueQueue.findIndex(job => _laneOf(job) === lane);
        if (idx === -1) continue; // nothing pending for this lane (loop re-fire handled on drain)

        const next = _cueQueue.splice(idx, 1)[0];
        _lanes[lane].active = next;
        _lanes[lane].lastJobForLoop = next;
        _updateQueueDepth();

        // Register the store lane-drain hook for THIS dispatch. The store fires it
        // once when the lane's execution terminates (completion or Stop). The intent's
        // own onComplete/onError/onCancel still fire (block UI rollback) but no longer
        // drive lane accounting — that is entirely store-driven now.
        generationStore.setLoopCallback(lane, () => _onLaneDrain(lane));

        // startGeneration registers the run in activeGenerations (keyed by
        // queueJobId) and, inside commandExecutor, a store job whose lane the store
        // now owns. A null return = startGeneration bailed before dispatch (the
        // missing-media guard); the lane never went busy, so drain it now to free
        // the slot + promote the next intent. A dispatched job's Stop routes through
        // activeGenerations.cancel → exec.cancel → store.cancel; that drains the
        // store lane and fires this lane's setLoopCallback → _onLaneDrain. No exec
        // bridge is kept here — the registry entry owns the exec handle.
        const handle = startGeneration(next.config, next.callbacks, {
            ...next.opts,
            queueJobId: next.queueJobId,
            queueDisplay: next.display,
            queueSource: next.source,
            isLoop: next.isLoop,
        });
        if (!handle) _onLaneDrain(lane, { skipNext: false });
    }

    _updateQueueDepth();
    _emitPromptBoxGenerationEndIfIdle();
}

/**
 * Cue-mode entry point. Queues a generation and dispatches when idle.
 * Returns nothing — callers track via `activeGenerations` events.
 */
export function enqueueGeneration(config, callbacks = {}, opts = {}) {
    // Reject a job whose op needs an input asset it doesn't have BEFORE it ever
    // enters the queue. A false no-image job (e.g. pressing Q on the PiD upscaler,
    // whose only op requires an image) would otherwise queue, then fail its
    // required-slot guard only at dispatch — stranding the lane and disabling
    // Stop/Clear while it sat pending (MPI-212). Toast + no-op instead.
    const missingSlot = _findMissingMediaSlot(config.operation, config.mediaItems || []);
    if (missingSlot) {
        _warnMissingMediaSlot(missingSlot);
        try { callbacks.onCancel?.(); } catch {}
        // The Cue button flips the prompt bar to "generating" (Stop/Clear enabled)
        // the instant it's pressed, before the run reaches here. A rejected enqueue
        // queues nothing, so nudge the idle check to flip it back — otherwise
        // Stop/Clear sit enabled over an empty queue (MPI-212).
        _emitPromptBoxGenerationEndIfIdle();
        return null;
    }

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
    if (!entry) {
        // The generation already died (e.g. ComfyUI rejected the prompt): its
        // `exec.onError` ran `activeGenerations.end()`, deleting the registry entry.
        // The queue panel still renders RUNNING off `_lanes[lane].active`, so the
        // user sees a live STOP whose registry lookup finds nothing and no-ops.
        // Nothing is left to interrupt — drain the orphaned lane so the card clears
        // and the next pending job can promote.
        const orphanLane = _lanes.remote.active?.queueJobId === queueJobId ? 'remote'
            : _lanes.local.active?.queueJobId === queueJobId ? 'local'
            : null;
        if (!orphanLane) return false;
        _onLaneDrain(orphanLane);
        return true;
    }

    // Which lane holds this intent? Resolved from the dispatched intent, not the
    // registry (the intent carries the lane; MPI-74 P6 keeps the OTHER lane clear).
    const lane = _lanes.remote.active?.queueJobId === queueJobId ? 'remote'
        : _lanes.local.active?.queueJobId === queueJobId ? 'local'
        : null;
    // Capture the EXACT intent object we are about to cancel. `activeGenerations.
    // cancel()` below runs the store cancel SYNCHRONOUSLY, which — when the store
    // drains the lane — fires this lane's loop callback → `_onLaneDrain` → a loop
    // re-fire that re-populates `_lanes[lane].active` with a NEW intent, all before
    // cancel() returns. So after cancel we CANNOT tell "store drained" from the raw
    // active flag. We compare identity against this captured object instead (MPI-226).
    const _cancelledIntent = lane ? _lanes[lane].active : null;

    // Interrupt via the registry entry — entry.exec.cancel() delegates to
    // store.cancel(jobId) (Phase 2), which aborts the token, fires the FROZEN
    // engine interrupt, transitions the store job to `cancelled`, and DRAINS the
    // store lane. That drain fires this lane's `setLoopCallback` → `_onLaneDrain`,
    // which promotes the next pending intent or loop-re-fires. So a healthy Stop
    // needs no explicit lane bookkeeping here — the store owns it.
    const _genId = entry.id;
    activeGenerations.cancel(entry.id);

    // Clear the status bar at the SOURCE (R18 / statusBar-strand fix). The bar
    // latches by gen id and only a terminal carrying that SAME id clears it. The
    // Gallery Stop path used to emit a scope-only `tool:cancelled` (null id = latch
    // no-op) so the bar stranded forever. Emit the id-matched terminal here — every
    // Stop, every scope — so whichever surface the bar is latched to releases.
    Events.emit('tool:cancelled', { tool: 'groupHistory', id: _genId });

    // Belt-and-suspenders for the MPI-73 Bug 2 stuck-lane case: a job Stopped so
    // early that commandExecutor never assigned exec.jobId (store never registered)
    // — exec.cancel() then fell back to a bare interrupt() and the store never
    // drained, so `_onLaneDrain` never fired and `_lanes[lane].active` is STILL the
    // intent we cancelled. In that (rare) case, drain it locally to free the lane.
    //
    // In the NORMAL case the store DID drain synchronously inside cancel() above,
    // which already ran `_onLaneDrain` once (promoting the next pending intent or
    // loop-re-firing). Draining AGAIN here double-fired the loop — one Stop spawned
    // two+ overlapping gens, whose placeholders churned (invisible card) and whose
    // tqdm bars bled together in the progress tracker ("5/5" instead of N/2). MPI-226.
    //
    // Guard by identity: only drain if the lane STILL points at the exact intent we
    // cancelled. If the store drained (active is now null OR a fresh re-fired intent),
    // skip — the store already owns the drain.
    if (lane && _lanes[lane].active === _cancelledIntent) {
        _onLaneDrain(lane, { skipNext: false });
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
    // Up to two running jobs (one per lane). Remote first so a mixed queue reads
    // cloud-then-local top-down. The panel renders the flat `items` list and
    // tags each with its LOCAL/REMOTE chip (MPI-74 P5), so two running rows just
    // work — no panel change beyond a 2-running index fix.
    const runningJobs = [_lanes.remote.active, _lanes.local.active].filter(Boolean);
    const running = runningJobs.map(job => _queueSnapshotItem(job, 'running'));
    const pending = _cueQueue.map(job => _queueSnapshotItem(job, 'pending'));
    return {
        running: running[0] || null,
        runningItems: running,
        pending,
        items: [...running, ...pending],
        depth: pending.length + running.length,
        pendingCount: pending.length,
        runningCount: running.length,
        loopArmed: !!state.loopArmed,
    };
}

// R27 idleness contract: fire promptbox:generation-end ONLY when there are no
// running registry entries, no live store jobs (either lane), no pending intents,
// and loop is disarmed. Lane liveness now comes from the store (Phase 3), plus the
// dispatched-but-not-yet-registered intents (`_lanes[lane].active`) that cover the
// async register gap — otherwise a just-dispatched job would read as idle for a tick.
function _emitPromptBoxGenerationEndIfIdle() {
    if (activeGenerations.list().some(entry => entry.status === 'running')) return;
    if (_lanes.remote.active || _lanes.local.active) return;
    if (_runningCount() > 0 || _cueQueue.length > 0) return;
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
 * @property {function(string):void}        [onText]     — called with the caption from an
 *                                                         `outputKind: 'text'` op (MPI-310).
 *                                                         Mutually exclusive with onComplete:
 *                                                         a text op produces no item/group.
 */

/**
 * Start a generation, manage the lifecycle, and persist results.
 *
 * For Gallery: creates a new group with the generated item.
 * For GroupHistory: appends the generated item to an existing group.
 *
 * @param {GenerationConfig} config
 * @param {GenerationCallbacks} callbacks
 * @param {{ existingGroup?: Object, scope?: string, groupId?: string, tempId?: string, placeholderGroup?: Object, deferCommit?: boolean }} [opts]
 * @returns {{ cancel: function }}
 */
export function startGeneration(config, callbacks = {}, opts = {}) {
    const { operation, model, positive, negative, mediaItems = [], maskDataUrl, injectionParams = {} } = config;
    // The prompt as the user typed it. Everything on the SUBMIT path must use this
    // (it is what feeds the graph). Only the SAVE path may substitute what the
    // encoder actually saw — see the `Output_prompt` note in exec.onComplete.
    const _positiveFromBox = positive;

    // Guard: don't dispatch when a REQUIRED media slot has no asset. The Comfy
    // workflow ships baked-in default filenames on its LoadImage/LoadVideo nodes;
    // an empty dispatch leaves those stale names in place. Locally the leftover
    // files happen to exist so the run "works", but a remote Pod has a clean
    // volume and ComfyUI rejects the whole prompt (prompt_outputs_failed_validation
    // → bug-reporter dialog). Empty + user-actionable → warning toast, not a bug.
    const missingSlot = _findMissingMediaSlot(operation, mediaItems);
    if (missingSlot) {
        _warnMissingMediaSlot(missingSlot);
        callbacks.onError?.(new Error(`Missing required ${missingSlot.mediaType} for ${operation}`));
        return null;
    }

    // Job clock anchor — set when ComfyUI ACCEPTS the prompt (prompt_ack), not at
    // dispatch. Anchoring at dispatch counted ComfyUI's cold-start boot (~15s of the
    // server coming up) as generation time. prompt_ack means the server is up and
    // has queued THIS prompt, so the clock, card generationMs, and toast all measure
    // the same span: accepted → done (includes model load, excludes server boot).
    // (MPI-147)
    let samplingStartTime = null;
    const itemId = crypto.randomUUID();
    const isVideo = model.mediaType === 'video';

    // Generate the gen id UP FRONT so it flows into BOTH the store job record
    // (payload.genId → store.register, MPI-208 Phase 4) and the activeGenerations
    // entry below. The store job carries this same genId, letting the derived
    // status bar correlate a store snapshot's driving job to the id-tagged tool:*
    // events (all emitted with id === _regId).
    const _regId = crypto.randomUUID();

    const exec = runCommand({
        genId: _regId,
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
        loadAudioLatentName: config.loadAudioLatentName,
        audioLatentFilePath: config.audioLatentFilePath,
        forceLocal: opts.forceLocal === true, // MPI-74: per-gen local override → runCommand reads payload.forceLocal
    });

    activeGenerations.start({
        id:                _regId,
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

    // Stamp the gen id onto exec so commandExecutor's StatusBar lifecycle emits
    // carry it, and emit tool:running now (moved below _regId so it too is
    // identity-tagged). The status bar tracks the active gen by this id and
    // ignores a terminal (cancelled/idle) from any OTHER gen — a Stopped gen's
    // late settle can no longer reset the bar out from under a promoted
    // successor (MPI-203 status-bar stomp).
    exec.genId = _regId;
    Events.emit('tool:running', { tool: 'groupHistory', id: _regId, type: operation });

    // Stable tempId snapshot. The empty-output / cacheHit branches below emit a
    // late `generation:cancelled` AFTER the registry entry may already be gone
    // (a user Stop ends it first, then the interrupted gen returns empty). Reading
    // tempId from the registry at that point yields null, so the gallery block —
    // which keys placeholder teardown on tempId — swallows the event and the
    // placeholder card is never reconciled (MPI-111). Snapshot from opts, which
    // lives for the whole call regardless of registry state.
    const _stableTempId = opts.tempId ?? null;
    const _stableExtraTempIds = opts.extraTempIds ?? [];

    exec.onPromptAck = (promptId) => {
        activeGenerations.setPromptId(_regId, promptId);
        // Server accepted the prompt → NOW start the clock (past cold-start boot).
        samplingStartTime ??= Date.now();
        Events.emit('tool:accepted', { tool: 'groupHistory', id: _regId });
    };

    // MPI-271: live latents now flow through the preview:frame bus, which writes
    // latestPreviewUrl (activeGenerations). This handler only re-emits the queue
    // snapshot so the queue-panel thumbnail refreshes as new latents land.
    exec.onPreview = () => {
        _emitQueueChanged();
    };

    exec.onPreviewReset = () => {
        activeGenerations.resetPreview(_regId);
    };


    exec.onComplete = async (urls, outputInfo = {}) => {
        // `Output_prompt` contract (MPI-242): when the workflow carries a node of
        // that title, the string IT encoded is the prompt of record — not the text
        // still sitting in the prompt box. The graph may have expanded the prompt
        // (the enhancer toggle) between the box and the encoder, and the box is
        // deliberately left showing the user's own words.
        //
        // Shadowing `positive` here is the whole integration: all five sidecar/history
        // writes below already read this binding, so there is exactly one read path
        // and no "sometimes the box, sometimes the graph" branch to keep in sync.
        // Workflows without the node yield null → the prompt-box text, unchanged.
        //
        // NOTE the tap point is upstream of the style concat, so what lands here has
        // no style trigger appended — that is what lets Reuse Prompt restore the text
        // and still leave the style free to change. See docs/playbooks/add-model/05-prompt-and-styles.md §10.
        const positive = outputInfo.promptText || _positiveFromBox;

        // MPI-310 — a text op (the captioner) legitimately finishes with zero media:
        // its whole product is the Output_prompt string read into `positive` above.
        // This branches on the OP's declared contract, deliberately BEFORE the
        // empty-array check, for two reasons. Emptiness is ambiguous — a Stopped media
        // job is empty too, and only the op knows which case this is; and keeping the
        // branch above leaves the check below owning exactly the job it was written
        // for, instead of teaching the media path (sidecar writes, history item,
        // gallery card) to defend against a case that has no media to write.
        //
        // The shape mirrors the cache-hit terminal below: end the activity, go idle,
        // no history item. Callers get the caption through onText.
        if (getCommand(operation)?.outputKind === 'text') {
            activeGenerations.end(_regId, { revokePreview: true });
            // Not a cancellation — but the gallery/history placeholder this job created
            // must still be torn down, and generation:cancelled is what does that.
            Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
            Events.emit('generation:cancelled', { id: _regId, tempId: _stableTempId, extraTempIds: _stableExtraTempIds });
            Events.emit('tool:idle', { tool: 'groupHistory', id: _regId, type: operation });
            _emitPromptBoxGenerationEndIfIdle();
            const _text = outputInfo.promptText || null;
            if (_text) callbacks.onText?.(_text);
            else {
                clientLogger.warn('generationService', `${operation} returned no text.`);
                Events.emit('ui:warning', { message: 'No description was returned.' });
            }
            return;
        }

        if (!urls.length) {
            // Empty output after an explicit Stop is EXPECTED, not a fault: the
            // interrupt produced a terminal with nothing saved. Only warn when the
            // job was NOT cancelling — a genuinely empty completion is the real
            // (rare) anomaly worth surfacing. Gating on the store phase stops this
            // from flooding the console on every Stopped cue (MPI-208 Phase 3).
            const _wasCancelling = generationStore.byId(exec.jobId)?.cancelling === true;
            if (!_wasCancelling) {
                clientLogger.warn('generationService', 'Generation completed but no output returned.');
            }
            Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
            activeGenerations.end(_regId, { revokePreview: true });
            Events.emit('generation:cancelled', { id: _regId, tempId: _stableTempId, extraTempIds: _stableExtraTempIds });
            _emitPromptBoxGenerationEndIfIdle();
            callbacks.onCancel?.();
            return;
        }

        // ComfyUI cache hit: every output node was served from cache, so the
        // result is byte-identical to a prior run. Skip creating a duplicate
        // history entry / gallery card. Replace mode (preview → final) is
        // explicit user intent and bypasses this guard.
        if (exec.cacheHit === true && !config.replaceItemId) {
            activeGenerations.end(_regId, { revokePreview: true });
            const _toastWrap = ce('div');
            document.body.appendChild(_toastWrap);
            const _toast = MpiToast.mount(_toastWrap, {
                message: 'No changes, skipping...',
                variant: 'info',
                duration: 3000,
            });
            _toast.on('close', () => _toastWrap.remove());
            Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
            Events.emit('generation:cancelled', { id: _regId, tempId: _stableTempId, extraTempIds: _stableExtraTempIds });
            Events.emit('tool:idle', { tool: 'groupHistory', id: _regId, type: operation });
            _emitPromptBoxGenerationEndIfIdle();
            callbacks.onCancel?.();
            return;
        }

        const width  = injectionParams.Width  || injectionParams.width  || 0;
        const height = injectionParams.Height || injectionParams.height || 0;
        const elapsedMs = samplingStartTime ? Date.now() - samplingStartTime : null;
        const generationMediaItems = _cloneMediaItems(_opScopedMediaItems(operation, mediaItems));
        const generationSettings = {
            operation,
            modelId: model.id,
            injectionParams: _clonePlain(injectionParams || {}),
            mediaItems: generationMediaItems,
            previewOnly: config.previewOnly === true,
        };
        // Snapshot the exact PromptBox control state at gen time so Reuse Prompt
        // replays it DIRECTLY (no reverse-derivation from injectionParams). The
        // three buckets mirror applyPromptReuseSettings' input 1:1:
        //   shared = project.shared[mediaType] (ratio/quality/duration/motion/...)
        //   op     = per-op state (denoise/useGrid/upscaleFactor)
        //   model  = model-wide (loras/upscaleModel)
        // Empty buckets are omitted to keep the sidecar clean.
        if (state.currentProject && model.id) {
            const _ms = getModelSettings(state.currentProject, model.id);
            const _shared = _clonePlain(getSharedSettings(state.currentProject, model.mediaType));
            // Reconcile the snapshot's ratio with THIS run's injectionParams.
            // `settings:shared:update` debounces 300ms (projectService), so a
            // change-ratio-then-generate inside that window leaves _shared stale
            // (read from project state). injectionParams.Ratio_Label/Width/Height
            // are synchronous and authoritative — what the render actually used.
            // Without this the sidecar is internally inconsistent and Reuse Prompt
            // replays the stale ratio. Only touch an existing ratioSelector on a
            // ratio-bearing op (Width+Height present); orientation derives from
            // dims for any model with an orientation axis ('orientation' AND
            // 'quality-orientation'), and stays null only for pure-quality models
            // (wan/ltx), which have no such concept.
            if (_shared.ratioSelector && width && height) {
                _shared.ratioSelector = {
                    ..._shared.ratioSelector,
                    selectedRatio: injectionParams.Ratio_Label ?? _shared.ratioSelector.selectedRatio,
                    orientation: usesOrientation(model.type)
                        ? (width > height ? 'landscape' : 'portrait')
                        : null,
                };
            }
            // Same debounce race as ratioSelector above: `batch` is a shared control,
            // so clicking it and generating inside the 300ms window snapshots the
            // stale count while Batch_Size already carries the new one. The rendered
            // value wins, or Reuse Prompt replays a batch the run never used.
            const _batchInj = injectionParams.Input_Batch_Size ?? injectionParams.Batch_Size;
            if ('batch' in _shared && Number.isFinite(_batchInj)) {
                _shared.batch = _batchInj;
            }
            const _op = _clonePlain(getOpSettings(state.currentProject, model.id, operation));
            const _model = {};
            if ('loras' in _ms) _model.loras = _clonePlain(_ms.loras);
            if ('upscaleModel' in _ms) _model.upscaleModel = _ms.upscaleModel ?? null;
            // qualityTier is per-model (MPI-133) — snapshot it into the model
            // bucket so Reuse Prompt replays it to modelSettings[id], and a
            // cross-model reuse clamps it (handled in buildPromptReuseSettings).
            if ('qualityTier' in _ms) _model.qualityTier = _ms.qualityTier;
            // The style rack + enhancer are perModel too (they live in _MODEL_WIDE_KEYS).
            // Snapshot them or Reuse Prompt silently drops the style, its strength, and
            // the enhancer flag — injectionParams carries them, controlState did not.
            for (const _k of ['styleSelect', 'stylization', 'enhancePrompt']) {
                if (_k in _ms) _model[_k] = _ms[_k];
            }
            const controlState = {};
            if (Object.keys(_shared).length) controlState.shared = _shared;
            if (Object.keys(_op).length) controlState.op = _op;
            if (Object.keys(_model).length) controlState.model = _model;
            generationSettings.controlState = controlState;
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
            const _latents = Array.isArray(outputInfo.latents) ? outputInfo.latents : [];
            // Dual-latent (LTX, MPI-128): the video latent is the primary one
            // (back-compat field name); the optional audio latent rides alongside.
            // WAN saves only a video latent → audioLatent stays null.
            const _videoLatent = _latents.find(l => l?.role === 'video') || _latents.find(l => l?.role !== 'audio') || _latents[0] || null;
            const _audioLatent = _latents.find(l => l?.role === 'audio') || null;
            _previewAssets = {
                latent: _videoLatent,
                audioLatent: _audioLatent,
                // MPI-295: snapshot every declared image input, keyed by its own
                // slot-role — not just startFrame/endFrame. Untagged image inputs are
                // skipped (no role → nothing to resurface against on reuse).
                snapshots: _frozenMediaItems
                    .filter(item => item.mediaType === 'image' && item.role)
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
                        // Split video/audio output (B3): the separately-saved
                        // "Output_Audio" file is muxed into THIS video server-side
                        // (video is master). Only on the first/primary video item;
                        // null when the source had no audio. Ignored for images.
                        audioViewUrl: (i === 0 && model.mediaType === 'video') ? (outputInfo.audioUrl || null) : null,
                        itemId: thisItemId,
                        operation,
                        meta: { prompt: positive, negativePrompt: negative, modelId: model.id, seed: exec.seed ?? -1, generationSettings },
                        generationMs: elapsedMs,
                        pixelDimensions: resolvedDims,
                        mediaType: model.mediaType,
                        stage:        _previewStage,
                        frozenParams: _previewFrozen,
                        loraSnapshot: _previewLoraSnapshot,
                        previewAssets: _previewAssets,
                        replaceItemId: (_replaceItemId && i === 0) ? _replaceItemId : undefined,
                        // App provenance (MPI-256) — additive, top-level. Present only for
                        // App gens; null for normal PromptBox gens. Lets Reuse reopen the App
                        // with its inputs restored (survives restart — sidecar > session).
                        appId: config.appId ?? null,
                        appInputs: config.appInputs ?? null,
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
                generationSettings: savedData?.generationSettings ?? generationSettings,
                pixelDimensions: resolvedDims,
                // Server returns aggregated generationMs on preview→final replace
                // (prev stage + this stage). Prefer it over the local timer.
                generationMs: savedData?.generationMs ?? elapsedMs,
                // App provenance (MPI-256) on the LIVE in-memory item too — not just
                // the sidecar (line ~988). Without this, Reuse on a JUST-generated app
                // card reads appId:undefined (the reconciler only hydrates appId from
                // the sidecar on RELOAD), so live reuse fell through to the PromptBox
                // instead of reopening the App. Reload worked; the fresh session didn't.
                appId: config.appId ?? null,
                appInputs: config.appInputs ?? null,
                // Gallery thumb (MPI-319): both images and videos now get one so
                // the grid renders a small JPG, not the full-res output.
                thumbPath: savedData?.thumbPath ?? null,
            };
            if (isVideo) {
                Object.assign(baseProps, {
                    fps:         savedData?.fps ?? 0,
                    duration:    savedData?.duration ?? 0,
                    frameCount:  savedData?.frameCount ?? 0,
                    hasAudio:    savedData?.hasAudio ?? false,
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
                    // silentComplete: the i2v gen already emits one "Generation
                    // finished" toast; the concat is an internal extend sub-step,
                    // so suppress its duplicate completion toast (MPI-112).
                    const concatPromise = trackConcatJob({ jobId, label: 'Concatenating videos', silentComplete: true });
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
                        // Carry the underlying i2v generation snapshot so the extended
                        // sidecar owns Reuse Prompt metadata (Duration param + start-frame
                        // image). Without this the extended item only has the combined
                        // clip length, so Reuse Prompt drifts duration and finds no image.
                        // `operation` here IS the i2v op the extend chunk ran with; the
                        // server uses it to materialize the start-frame snapshot.
                        generationSettings,
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
                        extendedFrom:    ext.extendedFrom ?? null,
                        // Reuse Prompt metadata: server returns the materialized
                        // generationSettings (mediaItems rewritten to project-owned
                        // snapshots) + previewAssets. Falls back to the client-side
                        // snapshot if the server didn't materialize.
                        generationSettings: ext.generationSettings ?? generationSettings,
                        previewAssets:   ext.previewAssets ?? null,
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
                Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
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
                Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
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
            // Fall back to the stable opts snapshot when the registry entry is
            // already gone — a user Stop that landed between LTX stages ends the
            // entry first, then the interrupted gen finishes with real output and
            // reaches this branch. Reading tempId from the dead entry yields null,
            // so the gallery block's placeholder teardown targets nothing (MPI-195,
            // sibling of the empty-output fix in b0d1e0d).
            const _galleryEntry = activeGenerations.get(_regId);
            const _galleryTempId = _galleryEntry?.tempId ?? _stableTempId;
            const _galleryExtraTempIds = _galleryEntry?.extraTempIds ?? _stableExtraTempIds;
            const groups = builtItems.map((it) => {
                const name = truncateCardName(it.displayName || it.operation || firstDisplayName);
                const g = createItemGroup(model.mediaType, { name, width, height });
                return appendToHistory(g, it);
            });
            // HOLD-UNTIL-APPLY (MPI-306): with deferCommit the groups are built but
            // NOT persisted — the media + sidecars are already on disk, only the
            // project record is withheld. The caller (MpiBaseApp) holds them and
            // commits with projectService.addGroup on Apply, or simply drops them.
            // Orphaned files are the existing .preview-assets + Cleanup GC path's
            // job (MPI-277/227), not a new mechanism.
            if (!opts.deferCommit) {
                for (const g of groups) await addGroup(g);
            }
            activeGenerations.end(_regId, { revokePreview: false });
            const firstItem = builtItems[0];
            const firstGroup = groups[0];
            // Single emit — handler reads state.currentProject.itemGroups (already
            // contains all N groups via addGroup) and rebuilds grid with them.
            // `items`/`groups` (all N) are additive for multi-output consumers (Apps,
            // MPI-259) that show every result in-place; existing readers use `item`.
            // `deferred` tells listeners the media exists but is NOT in the project
            // yet. Current listeners are safe either way (stats refetch reads disk;
            // the float-latent bridge only releases its lane), but a future consumer
            // that writes to the project MUST honour it.
            Events.emit('generation:complete', { id: _regId, item: firstItem, group: firstGroup, items: builtItems, groups, tempId: _galleryTempId, extraTempIds: _galleryExtraTempIds, scope: 'gallery', deferred: !!opts.deferCommit });
            // `groups` reaches the caller so a deferCommit consumer can persist them
            // later; committed runs simply ignore it (they are already in the project).
            callbacks.onComplete?.({ item: firstItem, group: firstGroup, items: builtItems, groups });
        }

        Events.emit('tool:idle', { tool: 'groupHistory', id: _regId, type: operation });
        _emitPromptBoxGenerationEndIfIdle();
    };

    exec.onError = (err) => {
        Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
        activeGenerations.end(_regId, { revokePreview: true });
        Events.emit('generation:error', { id: _regId, tempId: _stableTempId, extraTempIds: _stableExtraTempIds });
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
