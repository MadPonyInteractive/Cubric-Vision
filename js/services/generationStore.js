/**
 * generationStore.js — Single source of truth for generation lifecycle.
 *
 * One job record per generation:
 *   { jobId, genId, engine, scope, phase, cancel, promptId, lane,
 *     display, loopSeed, timestamps, error, cancelling, interruptCb }
 *
 * Phase state machine (enforced; illegal transitions are no-ops):
 *   queued → preflight → submitting → accepted → loading → sampling → finalizing → done
 *                                                                                 → cancelled
 *                                                                                 → error
 *   'cancelling' is an overlay boolean (not a phase) — interrupt is advisory.
 *
 * Lane accounting: 'local' and 'remote', MAX 1 active each. FIFO pending queue.
 * Loop re-fire: a once-per-lane-drain callback slot (fires exactly once per
 * completion, never in the dispatch pass — INV-5).
 *
 * Factory export for testability; default singleton wired to the real Events bus.
 *
 * Frontend logging: clientLogger — but injected so tests can stub it.
 */

'use strict';

import { Events } from '../events.js';
import { clientLogger } from './clientLogger.js';

// ── Phase enum ────────────────────────────────────────────────────────────────

export const PHASES = Object.freeze({
    QUEUED:      'queued',
    PREFLIGHT:   'preflight',
    SUBMITTING:  'submitting',
    ACCEPTED:    'accepted',
    LOADING:     'loading',
    SAMPLING:    'sampling',
    FINALIZING:  'finalizing',
    DONE:        'done',
    CANCELLED:   'cancelled',
    ERROR:       'error',
});

/** Terminal phases — job is finished; no further transitions allowed. */
const TERMINAL_PHASES = new Set([PHASES.DONE, PHASES.CANCELLED, PHASES.ERROR]);

/** Legal forward-transitions. Terminals map to empty sets (enforced below). */
const LEGAL_TRANSITIONS = new Map([
    [PHASES.QUEUED,     new Set([PHASES.PREFLIGHT,  PHASES.SUBMITTING, PHASES.ACCEPTED, PHASES.CANCELLED, PHASES.ERROR])],
    [PHASES.PREFLIGHT,  new Set([PHASES.SUBMITTING, PHASES.ACCEPTED,   PHASES.CANCELLED, PHASES.ERROR])],
    [PHASES.SUBMITTING, new Set([PHASES.ACCEPTED,   PHASES.CANCELLED,  PHASES.ERROR])],
    [PHASES.ACCEPTED,   new Set([PHASES.LOADING,    PHASES.SAMPLING,   PHASES.FINALIZING, PHASES.DONE, PHASES.CANCELLED, PHASES.ERROR])],
    [PHASES.LOADING,    new Set([PHASES.SAMPLING,   PHASES.FINALIZING, PHASES.DONE, PHASES.CANCELLED, PHASES.ERROR])],
    [PHASES.SAMPLING,   new Set([PHASES.FINALIZING, PHASES.DONE,       PHASES.CANCELLED, PHASES.ERROR])],
    [PHASES.FINALIZING, new Set([PHASES.DONE,       PHASES.CANCELLED,  PHASES.ERROR])],
    [PHASES.DONE,       new Set()],
    [PHASES.CANCELLED,  new Set()],
    [PHASES.ERROR,      new Set()],
]);

// ── Lane config ───────────────────────────────────────────────────────────────

const LANES = ['local', 'remote'];
const MAX_ACTIVE_PER_LANE = 1;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a GenerationStore instance.
 *
 * @param {object} [deps]
 * @param {function} [deps.emit]   - emit(event, data). Defaults to Events.emit.
 * @param {object}  [deps.logger]  - { warn, error }. Defaults to clientLogger.
 * @returns {GenerationStore}
 */
export function createGenerationStore({ emit, logger } = {}) {
    const _emit   = emit   ?? ((event, data) => Events.emit(event, data));
    const _logger = logger ?? clientLogger;

    /** @type {Map<string, object>} jobId → job record */
    const _jobs = new Map();

    /**
     * Lane state — each lane has exactly 0 or 1 active job.
     * Pending queue is a single FIFO array shared across lanes;
     * each job carries its lane assignment.
     */
    const _laneState = {
        local:  { activeJobId: null },
        remote: { activeJobId: null },
    };

    /** FIFO pending queue (jobs not yet assigned to an active lane slot). */
    const _pending = [];

    /**
     * Loop re-fire callbacks — one slot per lane.
     * Invoked exactly once when the lane drains (active job reaches terminal).
     * @type {{ local: function|null, remote: function|null }}
     */
    const _loopCallbacks = { local: null, remote: null };

    // ── Private helpers ────────────────────────────────────────────────────────

    function _laneOf(job) {
        return job.engine === 'local' ? 'local' : 'remote';
    }

    function _snapshot(job) {
        return Object.freeze({
            jobId:      job.jobId,
            genId:      job.genId,
            engine:     job.engine,
            scope:      job.scope,
            phase:      job.phase,
            cancelling: job.cancelling,
            promptId:   job.promptId,
            lane:       job.lane,
            display:    job.display,
            loopSeed:   job.loopSeed,
            timestamps: Object.freeze({ ...job.timestamps }),
            error:      job.error,
        });
    }

    function _storeSnapshot() {
        const jobs  = Array.from(_jobs.values()).map(_snapshot);
        const running = jobs.filter(j => !TERMINAL_PHASES.has(j.phase) && _laneState[j.lane]?.activeJobId === j.jobId);
        const pending = _pending.map(id => _snapshot(_jobs.get(id))).filter(Boolean);
        return { jobs, running, pending, depth: running.length + pending.length };
    }

    function _broadcast() {
        _emit('generation-store:changed', _storeSnapshot());
    }

    /**
     * Attempt to transition a job to a new phase.
     * Returns true on success, false when blocked (illegal/terminal/missing).
     */
    function _transition(jobId, toPhase, extra = {}) {
        const job = _jobs.get(jobId);
        if (!job) {
            _logger.warn('generationStore', `transition: job ${jobId} not found (→${toPhase})`);
            return false;
        }
        const fromPhase = job.phase;
        if (fromPhase === toPhase) return true; // idempotent

        const legal = LEGAL_TRANSITIONS.get(fromPhase);
        if (!legal || !legal.has(toPhase)) {
            _logger.warn('generationStore',
                `illegal transition ${fromPhase}→${toPhase} for job ${jobId} — no-op`);
            return false;
        }

        // Apply transition
        job.phase = toPhase;
        job.timestamps[toPhase] = Date.now();
        if (extra.genId    !== undefined) job.genId    = extra.genId;
        if (extra.promptId !== undefined) job.promptId = extra.promptId;
        if (extra.error    !== undefined) job.error    = extra.error;

        return true;
    }

    /**
     * Release a lane slot for the given job.
     * Only releases if the job currently holds the lane's active slot.
     * Returns true if the slot was released.
     */
    function _releaseLane(job) {
        const lane = job.lane;
        if (_laneState[lane].activeJobId === job.jobId) {
            _laneState[lane].activeJobId = null;
            return true;
        }
        return false;
    }

    /**
     * After a lane active slot is freed, promote the next pending job for that
     * lane (if any) into the active slot.
     * Does NOT trigger the loop re-fire callback — that is the caller's
     * responsibility (INV-5: re-fire never happens in the dispatch pass).
     * Returns the promoted job or null.
     */
    function _promoteNext(lane) {
        const idx = _pending.findIndex(id => {
            const j = _jobs.get(id);
            return j && _laneOf(j) === lane;
        });
        if (idx === -1) return null;
        const [nextJobId] = _pending.splice(idx, 1);
        const nextJob = _jobs.get(nextJobId);
        if (!nextJob) return null;
        _laneState[lane].activeJobId = nextJobId;
        return nextJob;
    }

    /**
     * Called after a terminal phase is set on an active job.
     * Releases the lane; promotes next if any; fires loop re-fire callback
     * ONLY when the lane drains (no successor promoted — INV-5).
     * Broadcasts once at the end.
     */
    function _onTerminal(job) {
        const lane = job.lane;
        const wasActive = _releaseLane(job);

        // Only fire lane-drain callbacks if this job held the lane
        if (!wasActive) {
            _broadcast();
            return;
        }

        const promoted = _promoteNext(lane);
        if (promoted) {
            // Lane still busy — no loop re-fire
            _broadcast();
            return;
        }

        // Lane drained — fire loop callback exactly once
        const cb = _loopCallbacks[lane];
        if (cb) {
            _loopCallbacks[lane] = null; // consume (once-only)
            _broadcast();
            // Fire AFTER broadcast so the snapshot seen by the callback is clean
            try { cb(lane); } catch (e) {
                _logger.error('generationStore', 'loop re-fire callback threw', e);
            }
        } else {
            _broadcast();
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Register a new job. Adds it to the pending queue (or directly to active if
     * the lane is idle). Returns the job record (immutable snapshot).
     *
     * @param {object} opts
     * @param {string}   opts.jobId       - Stable UUID for this job (caller-generated).
     * @param {'local'|'remote'} opts.engine
     * @param {string}  [opts.scope]      - 'gallery' | 'groupHistory' | etc.
     * @param {object}  [opts.display]    - Frozen display snapshot (queue panel use).
     * @param {*}       [opts.loopSeed]   - Opaque loop seed (for loop re-fire).
     * @param {function} [opts.interruptCb] - Engine interrupt callback, FROZEN at registration.
     * @returns {object} snapshot
     */
    function register({ jobId, engine, scope = '', display = null, loopSeed = null, interruptCb = null } = {}) {
        if (!jobId)     throw new Error('generationStore.register: jobId required');
        if (!engine)    throw new Error('generationStore.register: engine required');
        if (_jobs.has(jobId)) {
            _logger.warn('generationStore', `register: jobId ${jobId} already exists — ignoring`);
            return _snapshot(_jobs.get(jobId));
        }

        const abort = new AbortController();
        const lane  = engine === 'local' ? 'local' : 'remote';

        const job = {
            jobId,
            genId:       null,
            engine,
            scope,
            phase:       PHASES.QUEUED,
            cancel:      abort,        // { signal, abort() }
            promptId:    null,
            lane,
            display:     display ? Object.freeze({ ...display }) : null,
            loopSeed,
            timestamps:  { [PHASES.QUEUED]: Date.now() },
            error:       null,
            cancelling:  false,
            interruptCb, // frozen at registration
        };

        _jobs.set(jobId, job);

        // Occupy lane immediately if idle; otherwise queue
        if (_laneState[lane].activeJobId === null) {
            _laneState[lane].activeJobId = jobId;
        } else {
            _pending.push(jobId);
        }

        _broadcast();
        return _snapshot(job);
    }

    /**
     * Advance a job to a new phase.
     * Broadcasts on success; no-ops (with a log warn) on illegal transition.
     *
     * @param {string} jobId
     * @param {string} toPhase  - One of PHASES.*
     * @param {object} [extra]  - { genId?, promptId?, error? } — optional field updates
     * @returns {boolean} true if transition happened
     */
    function advance(jobId, toPhase, extra = {}) {
        const ok = _transition(jobId, toPhase, extra);
        if (!ok) return false;

        const job = _jobs.get(jobId);

        if (TERMINAL_PHASES.has(toPhase)) {
            _onTerminal(job);
        } else {
            _broadcast();
        }
        return true;
    }

    /**
     * Cancel a job:
     * 1. Abort the job's AbortController signal.
     * 2. Call the frozen interruptCb (if any).
     * 3. Transition phase: if already terminal → no-op; else → cancelling overlay + cancelled.
     * 4. Release the lane immediately.
     * Idempotent: cancelling a job twice is safe.
     *
     * @param {string} jobId
     */
    function cancel(jobId) {
        const job = _jobs.get(jobId);
        if (!job) {
            _logger.warn('generationStore', `cancel: job ${jobId} not found`);
            return;
        }

        // Already fully terminal — nothing to do
        if (TERMINAL_PHASES.has(job.phase)) return;

        // Abort the signal (idempotent on AbortController)
        try { job.cancel.abort(); } catch (_) { /* already aborted */ }

        // Invoke frozen engine interrupt callback (fire-and-forget; store never awaits)
        if (job.interruptCb) {
            try { job.interruptCb(jobId); } catch (e) {
                _logger.error('generationStore', 'interruptCb threw during cancel', e);
            }
        }

        // Set cancelling overlay
        job.cancelling = true;

        // Transition to cancelled
        const ok = _transition(jobId, PHASES.CANCELLED);
        if (ok) {
            _onTerminal(job);
        } else {
            // Already terminal (race) — still broadcast the cancelling overlay change
            _broadcast();
        }
    }

    /**
     * Late-settle: called when a real terminal arrives for a job that is already
     * in the `cancelling` state (advisory interrupt was sent but real output came).
     * Contract (R09): the output SAVES — transition to `done` is honored.
     *
     * This is simply `advance()` — the legal-transition table allows
     * cancelling:false jobs to reach done/error via finalizing, and
     * a job in `cancelling` (still in a non-terminal phase) can still advance.
     * If the job already reached `cancelled`, advance() will no-op (illegal → terminal).
     *
     * @param {string} jobId
     * @param {string} toPhase  - 'done' | 'error'
     * @param {object} [extra]
     * @returns {boolean}
     */
    function settle(jobId, toPhase, extra = {}) {
        return advance(jobId, toPhase, extra);
    }

    /**
     * Remove all pending (not-yet-active) jobs from the queue.
     * Running (active) jobs are NOT touched (R07).
     * Returns the jobIds that were removed.
     *
     * @returns {string[]} removed jobIds
     */
    function clearPending() {
        if (_pending.length === 0) return [];
        const removed = [..._pending];
        _pending.length = 0;

        // Transition each removed job to cancelled
        for (const id of removed) {
            const job = _jobs.get(id);
            if (!job) continue;
            // Only pending jobs are in _pending — they are not active, so
            // _releaseLane won't fire (they don't hold a lane slot). Transition directly.
            if (!TERMINAL_PHASES.has(job.phase)) {
                try { job.cancel.abort(); } catch (_) { /* ok */ }
                if (job.interruptCb) {
                    try { job.interruptCb(id); } catch (_) { /* ok */ }
                }
                job.cancelling = true;
                job.phase = PHASES.CANCELLED;
                job.timestamps[PHASES.CANCELLED] = Date.now();
            }
        }

        _broadcast();
        return removed;
    }

    /**
     * Register (or replace) the loop re-fire callback for a lane.
     * The callback is invoked exactly once per lane drain (INV-5).
     * Pass null to clear.
     *
     * @param {'local'|'remote'} lane
     * @param {function|null} cb
     */
    function setLoopCallback(lane, cb) {
        if (!LANES.includes(lane)) {
            _logger.warn('generationStore', `setLoopCallback: unknown lane '${lane}'`);
            return;
        }
        _loopCallbacks[lane] = cb ?? null;
    }

    // ── Snapshot / query API ───────────────────────────────────────────────────

    /** @returns {object[]} frozen snapshots of all jobs */
    function list() {
        return Array.from(_jobs.values()).map(_snapshot);
    }

    /** @returns {object|null} frozen snapshot for one job */
    function byId(jobId) {
        const job = _jobs.get(jobId);
        return job ? _snapshot(job) : null;
    }

    /** @returns {object[]} frozen snapshots of all jobs matching scope */
    function byScope(scope) {
        return Array.from(_jobs.values())
            .filter(j => j.scope === scope)
            .map(_snapshot);
    }

    /** @returns {number} count of running + pending jobs */
    function queueDepth() {
        const running = LANES.filter(l => _laneState[l].activeJobId !== null).length;
        return running + _pending.length;
    }

    /** @returns {object} full store snapshot (same shape as broadcast payload) */
    function getSnapshot() {
        return _storeSnapshot();
    }

    // ── Expose abort signal for executor ──────────────────────────────────────

    /**
     * Return the AbortSignal for a job so the executor can check it at
     * await boundaries.
     * @param {string} jobId
     * @returns {AbortSignal|null}
     */
    function getSignal(jobId) {
        return _jobs.get(jobId)?.cancel?.signal ?? null;
    }

    // ── Test/debug helpers ─────────────────────────────────────────────────────

    /** Clear all state (for tests). */
    function _reset() {
        _jobs.clear();
        _pending.length = 0;
        for (const lane of LANES) {
            _laneState[lane].activeJobId = null;
            _loopCallbacks[lane] = null;
        }
    }

    return {
        // Core
        register,
        advance,
        cancel,
        settle,
        clearPending,
        setLoopCallback,
        // Query
        list,
        byId,
        byScope,
        queueDepth,
        getSnapshot,
        getSignal,
        // Test helper
        _reset,
        // Expose constants
        PHASES,
    };
}

// ── Default singleton (app use) ────────────────────────────────────────────────

/** Singleton wired to the real Events bus and clientLogger. */
export const generationStore = createGenerationStore();
