'use strict';

/**
 * routes/install/installStore.js — Single source of truth for the install/download
 * lifecycle (MPI-276). Pure: no fs, no express, no NDH. All I/O is injected.
 *
 * Cures the 5 diseases (see tasks/MPI-276/research/04-bug-history-invariants.md):
 *  - one store, one version counter (kills the 6-SOT-no-reconcile disease)
 *  - explicit legal-transition table, illegal moves REJECTED + logged (MPI-208 medicine)
 *  - no refCount anywhere — dep liveness = job STATUS (invariant #2, G5)
 *
 * Two record kinds:
 *   ModelJob  { id, modelId, engine, status, deps[], totalBytes, downloadedBytes,
 *               progress, speed, installCustomNodes, terminalAt }
 *     status: queued → downloading → verifying → installing → done | failed | cancelled
 *   DepJob    { id, depId, modelId, engine, type, status, size, seedBytes,
 *               totalBytes, downloadedBytes, terminalAt }
 *     status: queued → downloading → verifying → complete | failed | cancelled
 *
 * A `done` model job stays in the store (card stays busy — no Install-flash, MPI-241)
 * until a post-complete resync confirms install, then it is pruned. failed/cancelled
 * prune on a shorter TTL. `pending` is a CLIENT-ONLY state (G2) — never here.
 *
 * Factory export for testability; `broadcast` + `now` injected.
 */

// ── State machines (G7) ─────────────────────────────────────────────────────────

const MODEL_STATES = Object.freeze({
    QUEUED: 'queued',
    DOWNLOADING: 'downloading',
    VERIFYING: 'verifying',
    INSTALLING: 'installing',
    DONE: 'done',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const DEP_STATES = Object.freeze({
    QUEUED: 'queued',
    DOWNLOADING: 'downloading',
    VERIFYING: 'verifying',
    COMPLETE: 'complete',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const MODEL_TERMINAL = new Set([MODEL_STATES.DONE, MODEL_STATES.FAILED, MODEL_STATES.CANCELLED]);
const DEP_TERMINAL = new Set([DEP_STATES.COMPLETE, DEP_STATES.FAILED, DEP_STATES.CANCELLED]);

// Legal forward transitions. Terminals map to empty sets. A state may skip forward
// (e.g. a dep that is already-on-disk goes queued→complete; a nodes-only model job
// goes downloading→installing without verifying) but never move backward and never
// out of a terminal state (invariant #3: reconcile heals, it never resurrects).
const MODEL_TRANSITIONS = new Map([
    [MODEL_STATES.QUEUED, new Set([MODEL_STATES.DOWNLOADING, MODEL_STATES.VERIFYING, MODEL_STATES.INSTALLING, MODEL_STATES.DONE, MODEL_STATES.FAILED, MODEL_STATES.CANCELLED])],
    [MODEL_STATES.DOWNLOADING, new Set([MODEL_STATES.VERIFYING, MODEL_STATES.INSTALLING, MODEL_STATES.DONE, MODEL_STATES.FAILED, MODEL_STATES.CANCELLED])],
    [MODEL_STATES.VERIFYING, new Set([MODEL_STATES.INSTALLING, MODEL_STATES.DONE, MODEL_STATES.FAILED, MODEL_STATES.CANCELLED])],
    [MODEL_STATES.INSTALLING, new Set([MODEL_STATES.DONE, MODEL_STATES.FAILED, MODEL_STATES.CANCELLED])],
    [MODEL_STATES.DONE, new Set()],
    [MODEL_STATES.FAILED, new Set()],
    [MODEL_STATES.CANCELLED, new Set()],
]);

const DEP_TRANSITIONS = new Map([
    [DEP_STATES.QUEUED, new Set([DEP_STATES.DOWNLOADING, DEP_STATES.VERIFYING, DEP_STATES.COMPLETE, DEP_STATES.FAILED, DEP_STATES.CANCELLED])],
    [DEP_STATES.DOWNLOADING, new Set([DEP_STATES.VERIFYING, DEP_STATES.COMPLETE, DEP_STATES.FAILED, DEP_STATES.CANCELLED])],
    [DEP_STATES.VERIFYING, new Set([DEP_STATES.COMPLETE, DEP_STATES.FAILED, DEP_STATES.CANCELLED])],
    [DEP_STATES.COMPLETE, new Set()],
    [DEP_STATES.FAILED, new Set()],
    [DEP_STATES.CANCELLED, new Set()],
]);

// TTLs (G10). done stays until resync confirms then prunes; belt is DONE_TTL_MS.
const DONE_TTL_MS = 120_000;
const FAILED_TTL_MS = 30_000;

// ── Factory ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} [deps]
 * @param {function} [deps.broadcast] - broadcast(event, data). No-op if omitted.
 * @param {object}   [deps.logger]    - { info, warn, error }. Console-ish default.
 * @param {function} [deps.now]       - () => epoch ms. Injected so prune/TTL is testable.
 */
function createInstallStore({ broadcast, logger, now } = {}) {
    const _broadcast = broadcast ?? (() => {});
    const _logger = logger ?? { info() {}, warn() {}, error() {} };
    const _now = now ?? (() => 0);

    /** @type {Map<string, object>} modelId → ModelJob */
    const _modelJobs = new Map();
    /** @type {Map<string, object>} depId → DepJob */
    const _depJobs = new Map();

    // Monotonic snapshot version (G9). Bumped on every mutation.
    let _version = 0;
    const _bump = () => { _version += 1; return _version; };

    // ── transition() — the one legal-move gate (G7, MPI-208 pattern) ─────────────

    function _transition(job, table, terminalSet, to, reason) {
        const from = job.status;
        if (from === to) return true; // idempotent no-op, not a bump
        const allowed = table.get(from);
        if (!allowed || !allowed.has(to)) {
            _logger.warn('installStore', `Illegal transition ${job.id}: ${from} → ${to} (${reason || 'no reason'}) — rejected`);
            return false;
        }
        job.status = to;
        if (terminalSet.has(to)) job.terminalAt = _now();
        _bump();
        return true;
    }

    /** Transition a model job. Returns true if applied. */
    function transitionModel(modelId, to, reason) {
        const job = _modelJobs.get(modelId);
        if (!job) { _logger.warn('installStore', `transitionModel: no job ${modelId}`); return false; }
        return _transition(job, MODEL_TRANSITIONS, MODEL_TERMINAL, to, reason);
    }

    /** Transition a dep job. Returns true if applied. */
    function transitionDep(depId, to, reason) {
        const job = _depJobs.get(depId);
        if (!job) { _logger.warn('installStore', `transitionDep: no dep ${depId}`); return false; }
        return _transition(job, DEP_TRANSITIONS, DEP_TERMINAL, to, reason);
    }

    // ── Registration ─────────────────────────────────────────────────────────────

    /**
     * Register (or REPLACE) a model job and its dep jobs. Register-before-respond
     * (G8): the router calls this before returning the /download/start response, so
     * the SSE-open race class (MPI-241) cannot form. A re-POST REPLACES the job —
     * totalBytes is SET from deps, never accumulated (invariant #7, the MPI totalBytes+= bug).
     *
     * @param {object} spec
     * @param {string} spec.modelId
     * @param {string} spec.engine    - 'local' | 'remote'
     * @param {Array}  spec.deps      - [{ depId, type, size, seedBytes?, totalBytes?,
     *                                      downloadedBytes?, alreadyInstalled? }]
     * @returns {object} the created ModelJob (also mirrored into _depJobs)
     */
    function registerModelJob({ modelId, engine, deps = [] }) {
        const depJobs = deps.map(d => {
            const seedBytes = d.seedBytes ?? 0;
            const dep = {
                id: d.depId,
                depId: d.depId,
                modelId,
                engine,
                type: d.type || 'model',
                status: d.alreadyInstalled ? DEP_STATES.COMPLETE : DEP_STATES.QUEUED,
                size: d.size || '',
                seedBytes,
                // Already-installed deps are credited at full size so the denominator
                // counts them (invariant #7). totalBytes is the real byte total once
                // known; until then computeProgress falls back to seedBytes.
                totalBytes: d.alreadyInstalled ? (d.totalBytes || seedBytes) : (d.totalBytes || 0),
                downloadedBytes: d.alreadyInstalled ? (d.totalBytes || seedBytes) : (d.downloadedBytes || 0),
                terminalAt: d.alreadyInstalled ? _now() : null,
            };
            _depJobs.set(dep.id, dep);
            return dep;
        });

        const job = {
            id: modelId,
            modelId,
            engine,
            status: MODEL_STATES.QUEUED,
            deps: depJobs,
            totalBytes: 0,
            downloadedBytes: 0,
            progress: 0,
            speed: '',
            installCustomNodes: deps.some(d => (d.type || 'model') === 'custom_nodes'),
            terminalAt: null,
        };
        _modelJobs.set(modelId, job);
        _bump();
        return job;
    }

    // ── Accessors ──────────────────────────────────────────────────────────────

    const modelJob = (modelId) => _modelJobs.get(modelId);
    const depJob = (depId) => _depJobs.get(depId);
    const allModelJobs = () => [..._modelJobs.values()];
    const allDepJobs = () => [..._depJobs.values()];
    const version = () => _version;

    /** True if any model job is non-terminal — the reconciler poll gate (G11). */
    function hasActiveJobs() {
        for (const j of _modelJobs.values()) if (!MODEL_TERMINAL.has(j.status)) return true;
        return false;
    }

    /** Model jobs (across engines) that own a live (non-terminal) copy of depId.
     *  Replaces the refCount lie for the "is this dep still needed" question (G5). */
    function activeModelsForDep(depId) {
        const out = [];
        for (const j of _modelJobs.values()) {
            if (MODEL_TERMINAL.has(j.status)) continue;
            if (j.deps.some(d => d.id === depId)) out.push(j.modelId);
        }
        return out;
    }

    // ── Snapshot (G9) ─────────────────────────────────────────────────────────────

    /** Serializable snapshot the FE replaces its state.downloadJobs with wholesale. */
    function snapshot() {
        return {
            version: _version,
            jobs: allModelJobs().map(j => ({
                id: j.id,
                modelId: j.modelId,
                engine: j.engine,
                status: j.status,
                totalBytes: j.totalBytes,
                downloadedBytes: j.downloadedBytes,
                progress: j.progress,
                speed: j.speed,
                installCustomNodes: j.installCustomNodes,
                deps: j.deps.map(d => ({
                    id: d.id,
                    type: d.type,
                    status: d.status,
                    size: d.size,
                    totalBytes: d.totalBytes,
                    downloadedBytes: d.downloadedBytes,
                })),
            })),
        };
    }

    /** Broadcast the current snapshot (G9: on SSE connect + after every reconcile). */
    function broadcastSnapshot() {
        _broadcast('download:snapshot', snapshot());
    }

    // ── Prune (G10) ────────────────────────────────────────────────────────────

    /**
     * Remove terminal jobs per the G10 TTL rules. Called after a resync
     * (`confirmedInstalled` set) and on the reconciler tick.
     *  - done: pruned once the model is confirmed installed by resync, or after
     *    DONE_TTL_MS as a belt (kills the immortal-complete-job disease).
     *  - failed/cancelled: pruned after FAILED_TTL_MS.
     * A pruned model job also drops its deps that no other live job references.
     *
     * @param {Set<string>} [confirmedInstalled] - modelIds a resync just confirmed.
     * @returns {string[]} pruned modelIds
     */
    function pruneTerminal(confirmedInstalled = new Set()) {
        const t = _now();
        const pruned = [];
        for (const [modelId, job] of [..._modelJobs.entries()]) {
            if (!MODEL_TERMINAL.has(job.status)) continue;
            const age = job.terminalAt != null ? t - job.terminalAt : Infinity;
            let drop = false;
            if (job.status === MODEL_STATES.DONE) {
                drop = confirmedInstalled.has(modelId) || age >= DONE_TTL_MS;
            } else {
                drop = age >= FAILED_TTL_MS;
            }
            if (drop) { _modelJobs.delete(modelId); pruned.push(modelId); }
        }
        if (pruned.length) {
            // Drop orphaned deps — those no surviving model job references.
            const referenced = new Set();
            for (const j of _modelJobs.values()) for (const d of j.deps) referenced.add(d.id);
            for (const depId of [..._depJobs.keys()]) if (!referenced.has(depId)) _depJobs.delete(depId);
            _bump();
        }
        return pruned;
    }

    /**
     * Mirror live progress/bytes from the transport layer onto the store job so
     * snapshot() (and the broadcast, G9) reflect real download progress, not just
     * lifecycle. Status is owned by transition*(); this touches ONLY the numeric
     * progress fields (no state-machine bump semantics). Per-dep bytes are matched
     * by id. Bumps the version so a snapshot broadcast carries the fresh numbers.
     *
     * @param {string} modelId
     * @param {object} p - { progress?, totalBytes?, downloadedBytes?,
     *                       deps?: [{ id, downloadedBytes?, totalBytes? }] }
     */
    function syncProgress(modelId, p = {}) {
        const job = _modelJobs.get(modelId);
        if (!job) return false;
        if (typeof p.progress === 'number') job.progress = p.progress;
        if (typeof p.totalBytes === 'number') job.totalBytes = p.totalBytes;
        if (typeof p.downloadedBytes === 'number') job.downloadedBytes = p.downloadedBytes;
        if (typeof p.speed === 'string') job.speed = p.speed;
        if (Array.isArray(p.deps)) {
            for (const pd of p.deps) {
                const dep = _depJobs.get(pd.id);
                if (!dep) continue;
                if (typeof pd.downloadedBytes === 'number') dep.downloadedBytes = pd.downloadedBytes;
                if (typeof pd.totalBytes === 'number') dep.totalBytes = pd.totalBytes;
            }
        }
        _bump();
        return true;
    }

    /** Hard reset — cancelAllDownloads() teardown. */
    function clear() {
        _modelJobs.clear();
        _depJobs.clear();
        _bump();
    }

    return {
        MODEL_STATES,
        DEP_STATES,
        MODEL_TERMINAL,
        DEP_TERMINAL,
        // mutation
        registerModelJob,
        transitionModel,
        transitionDep,
        syncProgress,
        pruneTerminal,
        clear,
        // read
        modelJob,
        depJob,
        allModelJobs,
        allDepJobs,
        version,
        hasActiveJobs,
        activeModelsForDep,
        snapshot,
        broadcastSnapshot,
    };
}

module.exports = {
    createInstallStore,
    MODEL_STATES,
    DEP_STATES,
    DONE_TTL_MS,
    FAILED_TTL_MS,
};
