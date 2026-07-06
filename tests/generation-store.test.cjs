'use strict';

// Contract tests for generationStore.js
// Run: node --test tests/generation-store.test.cjs
//
// Covers R05–R10, INV-4/5/6 from requirements-archaeology.md.

const assert = require('node:assert/strict');

// The store is an ES module; Node v24 can require() ES modules
// (typeless package, no `"type":"module"`, module syntax auto-detected).
const {
    createGenerationStore,
    PHASES,
} = require('../js/services/generationStore.js');

// ── Factory helper ─────────────────────────────────────────────────────────────

function makeStore() {
    const events = [];
    const logs   = [];

    const emit   = (event, data) => events.push({ event, data });
    const logger = {
        info:  (cat, msg)      => logs.push({ level: 'info',  cat, msg }),
        warn:  (cat, msg)      => logs.push({ level: 'warn',  cat, msg }),
        error: (cat, msg, err) => logs.push({ level: 'error', cat, msg, err }),
    };

    const store = createGenerationStore({ emit, logger });
    return { store, events, logs };
}

function changedEvents(events) {
    return events.filter(e => e.event === 'generation-store:changed');
}

let _seq = 0;
function uid() { return `job-${++_seq}`; }

function registerJob(store, { engine = 'remote', scope = 'gallery', interruptCb = null, display = null } = {}) {
    const jobId = uid();
    store.register({ jobId, engine, scope, display, interruptCb });
    return jobId;
}

/** Walk a job through legal forward transitions to a terminal or intermediate state. */
function walkTo(store, jobId, targetPhase) {
    const sequence = [
        PHASES.QUEUED, PHASES.PREFLIGHT, PHASES.SUBMITTING, PHASES.ACCEPTED,
        PHASES.LOADING, PHASES.SAMPLING, PHASES.FINALIZING, PHASES.DONE,
    ];
    const terminals = new Set([PHASES.DONE, PHASES.CANCELLED, PHASES.ERROR]);
    if (terminals.has(targetPhase)) {
        // Walk to finalizing then to target, or directly if accepted→done is legal
        // Use the minimal path to reach the target terminal
        const pathToFinalizing = sequence.slice(sequence.indexOf(PHASES.ACCEPTED), sequence.indexOf(PHASES.FINALIZING) + 1);
        const current = store.byId(jobId)?.phase;
        const startIdx = sequence.indexOf(current ?? PHASES.QUEUED);
        // Advance from current to finalizing, then to target
        const target = targetPhase === PHASES.DONE ? sequence : sequence;
        // Simplest: walk from current+1 to one step before target, then apply target
        const endPath = targetPhase === PHASES.DONE
            ? [PHASES.PREFLIGHT, PHASES.ACCEPTED, PHASES.FINALIZING, PHASES.DONE]
            : [PHASES.PREFLIGHT, PHASES.ACCEPTED, targetPhase];
        for (const ph of endPath) {
            const cur = store.byId(jobId)?.phase;
            if (cur !== ph) store.advance(jobId, ph);
        }
    } else {
        const startIdx = sequence.indexOf(store.byId(jobId)?.phase ?? PHASES.QUEUED);
        const endIdx   = sequence.indexOf(targetPhase);
        for (let i = startIdx + 1; i <= endIdx; i++) {
            store.advance(jobId, sequence[i]);
        }
    }
}

/** Advance to a terminal via a valid sequence. */
function completeTo(store, jobId, terminal = PHASES.DONE) {
    if (terminal === PHASES.DONE) {
        walkTo(store, jobId, PHASES.DONE);
    } else {
        // For cancelled/error: go to accepted first, then terminal
        store.advance(jobId, PHASES.ACCEPTED);
        store.advance(jobId, terminal);
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

/**
 * T01 — Legal transitions succeed; illegal transitions log + no-op.
 * State unchanged after illegal attempt; warn is logged.
 */
function testLegalAndIllegalTransitions() {
    const { store, events, logs } = makeStore();
    const jobId = registerJob(store, { engine: 'remote' });

    // Legal forward walk: queued → preflight → submitting → accepted → loading → sampling → finalizing → done
    assert.ok(store.advance(jobId, PHASES.PREFLIGHT),   'queued→preflight');
    assert.ok(store.advance(jobId, PHASES.SUBMITTING),  'preflight→submitting');
    assert.ok(store.advance(jobId, PHASES.ACCEPTED),    'submitting→accepted');
    assert.ok(store.advance(jobId, PHASES.LOADING),     'accepted→loading');
    assert.ok(store.advance(jobId, PHASES.SAMPLING),    'loading→sampling');
    assert.ok(store.advance(jobId, PHASES.FINALIZING),  'sampling→finalizing');
    assert.ok(store.advance(jobId, PHASES.DONE),        'finalizing→done');

    // Illegal: back-transition from terminal
    const logCountBefore = logs.length;
    const eventsBefore   = events.length;
    const res = store.advance(jobId, PHASES.QUEUED);
    assert.strictEqual(res, false,          'done→queued rejected');
    assert.strictEqual(store.byId(jobId).phase, PHASES.DONE, 'state unchanged');
    assert.ok(logs.length > logCountBefore, 'warn logged for illegal transition');
    assert.strictEqual(events.length, eventsBefore, 'no broadcast on no-op');

    // Illegal: terminal→terminal (different)
    const { store: s2 } = makeStore();
    const job2 = registerJob(s2, { engine: 'remote' });
    s2.advance(job2, PHASES.ACCEPTED);
    s2.advance(job2, PHASES.ERROR);
    assert.strictEqual(s2.advance(job2, PHASES.DONE), false, 'error→done rejected');
    assert.strictEqual(s2.byId(job2).phase, PHASES.ERROR, 'stays in error');

    // Idempotent same→same (returns true, no warn)
    const { store: s3, logs: l3 } = makeStore();
    const job3 = registerJob(s3, { engine: 'local' });
    s3.advance(job3, PHASES.PREFLIGHT);
    const warnsBefore = l3.filter(l => l.level === 'warn').length;
    assert.strictEqual(s3.advance(job3, PHASES.PREFLIGHT), true, 'same→same is success');
    assert.strictEqual(l3.filter(l => l.level === 'warn').length, warnsBefore, 'no warn on idempotent');
}

/**
 * T02 — Cancel before accept: job cancelled while queued/preflight → no lane leak.
 * After cancel, successor is promoted and the lane is not double-held.
 */
function testCancelBeforeAccept() {
    const { store } = makeStore();

    const job1 = registerJob(store, { engine: 'remote' });
    const job2 = registerJob(store, { engine: 'remote' }); // goes to pending

    assert.strictEqual(store.queueDepth(), 2, 'depth = 1 active + 1 pending before cancel');

    // job1 in preflight; cancel it
    store.advance(job1, PHASES.PREFLIGHT);
    store.cancel(job1);

    assert.strictEqual(store.byId(job1).phase, PHASES.CANCELLED, 'job1 cancelled');

    // job2 must be promoted to active
    const snap = store.getSnapshot();
    const activeIds = snap.running.map(j => j.jobId);
    assert.ok(activeIds.includes(job2), 'job2 promoted to active after job1 cancel');

    // No lane leak: depth is now 1
    assert.strictEqual(store.queueDepth(), 1, 'no lane leak after cancel-before-accept');
}

/**
 * T03 — Late-settle after cancel.
 *
 * The store's cancel() transitions the job immediately to CANCELLED (terminal).
 * A subsequent settle(done) must be rejected (illegal terminal→done) —
 * this ensures no double-free of the lane (INV-4/R09).
 *
 * This models the real scenario: advisory interrupt fires, real output arrives
 * after the store has already recorded CANCELLED. The terminal is final.
 */
function testLateSettleAfterCancel() {
    const { store } = makeStore();

    const job1 = registerJob(store, { engine: 'remote' });
    const job2 = registerJob(store, { engine: 'remote' });

    // Advance job1 into a mid-flight phase
    store.advance(job1, PHASES.ACCEPTED);
    store.advance(job1, PHASES.LOADING);
    store.advance(job1, PHASES.SAMPLING);

    // Cancel — immediately sets CANCELLED, releases lane, promotes job2
    store.cancel(job1);
    assert.strictEqual(store.byId(job1).phase, PHASES.CANCELLED, 'job1 cancelled');

    // job2 must be active now
    const activeAfterCancel = store.getSnapshot().running.map(j => j.jobId);
    assert.ok(activeAfterCancel.includes(job2), 'job2 active after job1 cancel');

    // Late settle: must be rejected (job1 is already terminal)
    const settled = store.settle(job1, PHASES.DONE);
    assert.strictEqual(settled, false, 'settle after terminal is rejected (no double-free)');
    assert.strictEqual(store.byId(job1).phase, PHASES.CANCELLED, 'phase stays cancelled');

    // job2 lane must be untouched
    assert.ok(store.getSnapshot().running.map(j => j.jobId).includes(job2),
        'job2 still active — no double-free');
}

/**
 * T04 — Double-cancel idempotence: cancel twice → single terminal, no throw, no extra broadcast.
 */
function testDoubleCancelIdempotence() {
    const { store, events, logs } = makeStore();
    const jobId = registerJob(store, { engine: 'remote' });
    store.advance(jobId, PHASES.ACCEPTED);

    store.cancel(jobId);
    const phaseAfter1  = store.byId(jobId).phase;
    const eventCount1  = events.length;

    // Second cancel must not throw and must not broadcast or change state
    assert.doesNotThrow(() => store.cancel(jobId), 'second cancel must not throw');
    assert.strictEqual(store.byId(jobId).phase, phaseAfter1, 'phase unchanged by second cancel');
    assert.strictEqual(events.length, eventCount1, 'no extra broadcast from second cancel');
    assert.ok(!logs.some(l => l.level === 'error'), 'no error logs from double cancel');
}

/**
 * T05 — Two-lane independence: cancelling one lane never touches the other (R08).
 */
function testTwoLaneIndependence() {
    const { store } = makeStore();

    const localJob  = registerJob(store, { engine: 'local' });
    const remoteJob = registerJob(store, { engine: 'remote' });

    // Walk each to mid-flight via valid sequences
    store.advance(localJob,  PHASES.ACCEPTED);
    store.advance(localJob,  PHASES.SAMPLING);
    store.advance(remoteJob, PHASES.ACCEPTED);
    store.advance(remoteJob, PHASES.LOADING);

    assert.strictEqual(store.queueDepth(), 2, 'both lanes active');
    assert.strictEqual(store.byId(localJob).phase,  PHASES.SAMPLING, 'local job in sampling');
    assert.strictEqual(store.byId(remoteJob).phase, PHASES.LOADING,  'remote job in loading');

    // Cancel local — remote must be unaffected
    store.cancel(localJob);
    assert.strictEqual(store.byId(localJob).phase,  PHASES.CANCELLED, 'local job cancelled');
    assert.strictEqual(store.byId(remoteJob).phase, PHASES.LOADING,   'remote job unaffected');
    assert.strictEqual(store.queueDepth(), 1, 'remote still active');

    // Cancel remote
    store.cancel(remoteJob);
    assert.strictEqual(store.byId(remoteJob).phase, PHASES.CANCELLED, 'remote job cancelled');
    assert.strictEqual(store.queueDepth(), 0, 'both lanes idle');
}

/**
 * T06 — Loop re-fire fires exactly ONCE per lane drain, not per dispatch (INV-5).
 *
 * Checks:
 * - Fires once when first job completes and lane drains.
 * - Callback is consumed (one-shot) — doesn't fire on second drain.
 * - Re-registered callback fires once again.
 * - With two queued jobs, callback does NOT fire when first completes (successor
 *   promoted); fires exactly once when second (final) job completes.
 */
function testLoopReFireOncePerDrain() {
    const { store } = makeStore();
    const lane = 'remote';
    let fireCounts = { [lane]: 0 };

    store.setLoopCallback(lane, (l) => { fireCounts[l] = (fireCounts[l] || 0) + 1; });

    // First job — complete it via valid sequence → loop fires once → callback consumed
    const job1 = registerJob(store, { engine: 'remote' });
    store.advance(job1, PHASES.ACCEPTED);
    store.advance(job1, PHASES.FINALIZING);
    store.advance(job1, PHASES.DONE);

    assert.strictEqual(fireCounts[lane], 1, 'loop fired once on first drain');

    // Second job — callback was consumed; must NOT fire again
    const job2 = registerJob(store, { engine: 'remote' });
    store.advance(job2, PHASES.ACCEPTED);
    store.advance(job2, PHASES.DONE);

    assert.strictEqual(fireCounts[lane], 1, 'loop callback consumed — not re-fired on second drain');

    // Re-register; should fire once more on next drain
    store.setLoopCallback(lane, (l) => { fireCounts[l] += 10; });
    const job3 = registerJob(store, { engine: 'remote' });
    store.advance(job3, PHASES.ACCEPTED);
    store.advance(job3, PHASES.DONE);
    assert.strictEqual(fireCounts[lane], 11, 'new callback fires exactly once');

    // Two concurrent jobs on same lane:
    // callback registered; first job done → lane NOT drained (second promoted) → no fire;
    // second done → fire once.
    fireCounts[lane] = 0;
    store.setLoopCallback(lane, (l) => { fireCounts[l]++; });

    const jobA = registerJob(store, { engine: 'remote' });
    const jobB = registerJob(store, { engine: 'remote' }); // goes to pending

    store.advance(jobA, PHASES.ACCEPTED);
    store.advance(jobA, PHASES.DONE); // promotes jobB — lane NOT drained → no fire
    assert.strictEqual(fireCounts[lane], 0, 'no fire while successor promoted (lane not drained)');

    store.advance(jobB, PHASES.ACCEPTED);
    store.advance(jobB, PHASES.DONE); // lane drained → fire once
    assert.strictEqual(fireCounts[lane], 1, 'fires exactly once after real drain');
}

/**
 * T07 — clearPending removes pending only; running job untouched (R07).
 */
function testClearPendingRunningUntouched() {
    const { store } = makeStore();

    const running = registerJob(store, { engine: 'remote' });
    const pend1   = registerJob(store, { engine: 'remote' });
    const pend2   = registerJob(store, { engine: 'remote' });

    // Advance the running job to sampling via valid sequence
    store.advance(running, PHASES.ACCEPTED);
    store.advance(running, PHASES.SAMPLING);

    assert.strictEqual(store.queueDepth(), 3, 'depth = 1 running + 2 pending');

    const removed = store.clearPending();
    assert.strictEqual(removed.length, 2, 'two pending removed');
    assert.ok(removed.includes(pend1), 'pend1 in removed list');
    assert.ok(removed.includes(pend2), 'pend2 in removed list');

    assert.strictEqual(store.byId(pend1).phase, PHASES.CANCELLED, 'pend1 cancelled');
    assert.strictEqual(store.byId(pend2).phase, PHASES.CANCELLED, 'pend2 cancelled');

    // Running job untouched
    assert.strictEqual(store.byId(running).phase, PHASES.SAMPLING, 'running job unaffected by clearPending');
    assert.strictEqual(store.queueDepth(), 1, 'only running job remains');
}

/**
 * T08 — Lane accounting: register fills idle lane; second job queues;
 * cancel of active promotes queued; separate-lane jobs are independent.
 */
function testLaneAccounting() {
    const { store } = makeStore();

    const r1 = registerJob(store, { engine: 'remote' });
    const r2 = registerJob(store, { engine: 'remote' }); // pending (remote lane full)
    const l1 = registerJob(store, { engine: 'local' });  // active (local lane idle)

    const snap = store.getSnapshot();
    const activeIds  = snap.running.map(j => j.jobId);
    const pendingIds = snap.pending.map(j => j.jobId);

    assert.ok(activeIds.includes(r1),  'r1 active on remote lane');
    assert.ok(activeIds.includes(l1),  'l1 active on local lane');
    assert.ok(pendingIds.includes(r2), 'r2 pending on remote lane');
    assert.strictEqual(store.queueDepth(), 3);

    // Cancel r1 — r2 must be promoted
    store.cancel(r1);
    const snap2      = store.getSnapshot();
    const activeIds2 = snap2.running.map(j => j.jobId);
    assert.ok(activeIds2.includes(r2), 'r2 promoted after r1 cancel');
    assert.ok(activeIds2.includes(l1), 'l1 still active (unaffected)');
    assert.strictEqual(store.queueDepth(), 2, 'r2 + l1 active');
}

/**
 * T09 — Snapshot API: list(), byId(), byScope(), queueDepth().
 */
function testSnapshotApi() {
    const { store } = makeStore();

    assert.strictEqual(store.list().length, 0, 'empty store → empty list');
    assert.strictEqual(store.byId('nonexistent'), null, 'byId unknown → null');
    assert.strictEqual(store.queueDepth(), 0, 'empty depth');

    const j1 = registerJob(store, { engine: 'remote', scope: 'gallery' });
    const j2 = registerJob(store, { engine: 'local',  scope: 'groupHistory' });

    assert.strictEqual(store.list().length, 2, 'list returns all jobs');
    assert.strictEqual(store.byId(j1).jobId, j1, 'byId finds job');
    assert.strictEqual(store.byScope('gallery').length,      1, 'byScope gallery');
    assert.strictEqual(store.byScope('groupHistory').length, 1, 'byScope groupHistory');
    assert.strictEqual(store.byScope('unknown').length,      0, 'byScope unknown → 0');
    assert.strictEqual(store.queueDepth(), 2, 'depth = 2 active jobs');

    // Snapshots are frozen
    const snap = store.byId(j1);
    assert.throws(() => { snap.phase = 'hacked'; }, TypeError, 'snapshot is frozen');
}

/**
 * T10 — getSignal returns the AbortSignal; aborting via cancel() activates it.
 */
function testAbortSignal() {
    const { store } = makeStore();
    const jobId = registerJob(store, { engine: 'remote' });

    const signal = store.getSignal(jobId);
    assert.ok(signal instanceof AbortSignal, 'getSignal returns AbortSignal');
    assert.strictEqual(signal.aborted, false, 'signal not aborted initially');

    store.cancel(jobId);
    assert.strictEqual(signal.aborted, true, 'signal aborted after cancel()');

    // Unknown job → null
    assert.strictEqual(store.getSignal('no-such-job'), null, 'unknown job → null signal');
}

/**
 * T11 — generation-store:changed emitted on every mutation.
 */
function testBroadcastOnMutation() {
    const { store, events } = makeStore();
    assert.strictEqual(changedEvents(events).length, 0, 'no events before any mutation');

    const jobId = registerJob(store, { engine: 'remote' });
    assert.strictEqual(changedEvents(events).length, 1, 'broadcast on register');

    store.advance(jobId, PHASES.ACCEPTED);
    assert.strictEqual(changedEvents(events).length, 2, 'broadcast on advance');

    store.cancel(jobId);
    assert.strictEqual(changedEvents(events).length, 3, 'broadcast on cancel');
}

/**
 * T12 — interruptCb is invoked exactly once on cancel, never on double-cancel.
 */
function testInterruptCbOnCancel() {
    const { store } = makeStore();
    const called = [];
    const interruptCb = (id) => called.push(id);

    const jobId = registerJob(store, { engine: 'remote', interruptCb });
    store.advance(jobId, PHASES.ACCEPTED);
    store.cancel(jobId);

    assert.strictEqual(called.length, 1, 'interruptCb called exactly once');
    assert.strictEqual(called[0], jobId, 'interruptCb received jobId');

    // Second cancel — cb must NOT be called again (already terminal)
    store.cancel(jobId);
    assert.strictEqual(called.length, 1, 'interruptCb not called on second cancel');
}

/**
 * T14 — Phase-2 executor contract (MPI-208): a Stop landing BEFORE prompt-ACK aborts
 * the token AND the job is terminal, so the commandExecutor pipeline's `_abortedBail`
 * (checked at every await boundary) sees `getSignal().aborted` and returns before it
 * can POST /prompt. Proves the "no orphan generation after Stop" invariant at the
 * store contract level: a late ACK (advance→ACCEPTED) is rejected once cancelled.
 */
function testCancelBeforeAckBlocksDispatch() {
    const { store } = makeStore();
    const jobId = registerJob(store, { engine: 'local' });

    // Job is QUEUED, mid-preflight (no ACK yet). User hits Stop.
    store.cancel(jobId);

    // 1. The abort token the executor checks at each await boundary is set.
    assert.strictEqual(store.getSignal(jobId).aborted, true,
        'token aborted → _abortedBail returns true → pipeline bails, no /prompt POST');

    // 2. The job is already terminal — a late prompt-ACK (had one been in flight) can
    //    NOT resurrect it to ACCEPTED; the transition is rejected.
    assert.strictEqual(store.byId(jobId).phase, PHASES.CANCELLED, 'job terminal cancelled');
    const advanced = store.advance(jobId, PHASES.ACCEPTED);
    assert.strictEqual(advanced, false, 'ACCEPTED after cancel is a no-op (no ACK honored)');
    assert.strictEqual(store.byId(jobId).phase, PHASES.CANCELLED, 'phase stays cancelled');
}

/**
 * T13 — PHASES constant exported with correct uppercase keys mapping to lowercase values.
 */
function testPhasesConstant() {
    const required = ['queued','preflight','submitting','accepted','loading','sampling','finalizing','done','cancelled','error'];
    for (const lower of required) {
        const key = lower.toUpperCase();
        assert.ok(key in PHASES, `PHASES.${key} exists`);
        assert.strictEqual(PHASES[key], lower, `PHASES.${key} === '${lower}'`);
    }
}

// ── Runner ─────────────────────────────────────────────────────────────────────

const TESTS = {
    testLegalAndIllegalTransitions,
    testCancelBeforeAccept,
    testLateSettleAfterCancel,
    testDoubleCancelIdempotence,
    testTwoLaneIndependence,
    testLoopReFireOncePerDrain,
    testClearPendingRunningUntouched,
    testLaneAccounting,
    testSnapshotApi,
    testAbortSignal,
    testBroadcastOnMutation,
    testInterruptCbOnCancel,
    testCancelBeforeAckBlocksDispatch,
    testPhasesConstant,
};

let failed = 0;
for (const [name, fn] of Object.entries(TESTS)) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed++;
        console.error(`FAIL  ${name}\n      ${err.message}`);
        if (process.env.DEBUG) console.error(err.stack);
    }
}

if (failed) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log(`\nAll ${Object.keys(TESTS).length} generationStore contract tests passed.`);
