// MPI-501 — a ComfyUI restart must NEVER land on a running queue.
//
// `POST /wrapper/restart-comfy` calls proc.terminate(), so firing it while a prompt is
// sampling destroys that work with no error, no toast and no log line. It orphaned the
// same smoke op (minimax-h3/t2v_ms) in two separate GPU matrices before anyone could
// tell it from a model bug.
//
// This drives the REAL `waitForIdleQueue` off js/services/comfyController.js (it imports
// clean in bare node) with a stubbed fetch, because the contract that matters is not
// "does it poll" but WHICH ANSWER means "safe to restart":
//   queue empty          -> true
//   queue busy           -> false, and the caller must refuse rather than restart
//   read failed ONCE     -> unknown, keep waiting (a blip may not green-light a restart)
//   read failed 3x       -> ComfyUI is not answering at all; nothing left to protect

const assert = require('node:assert');
const test = require('node:test');

const IDLE = { queue_running: [], queue_pending: [] };
const BUSY = { queue_running: [['prompt', 'abc123']], queue_pending: [] };
const PENDING = { queue_running: [], queue_pending: [['prompt', 'def456']] };

/**
 * Replaces global fetch with a scripted sequence; `null` = a failed read.
 * Records the /queue reads only — clientLogger ships its lines over the same fetch.
 */
function stubFetch(sequence) {
    const calls = [];
    globalThis.fetch = async (url) => {
        if (String(url).endsWith('/queue')) calls.push(String(url));
        else return { ok: true, status: 200, json: async () => ({}) };   // clientLogger → /log
        const next = sequence.shift();
        if (next == null) return { ok: false, status: 502, json: async () => ({ error: 'relay_failed' }) };
        return { ok: true, status: 200, json: async () => next };
    };
    return calls;
}

test('waitForIdleQueue gates a restart on the real queue', async () => {
    const { remoteEngine } = await import('../js/services/comfyController.js');
    const realFetch = globalThis.fetch;
    try {
        // 1. Empty queue -> safe, on the first read, no waiting.
        let calls = stubFetch([IDLE]);
        assert.strictEqual(await remoteEngine.waitForIdleQueue({ timeoutMs: 0 }), true,
            'an empty queue is safe to restart');
        assert.strictEqual(calls.length, 1, 'an idle engine costs exactly one read');
        assert.ok(calls[0].endsWith('/queue'), `must read the engine queue, got ${calls[0]}`);

        // 2. A RUNNING prompt past the deadline -> refuse. This is the whole card.
        calls = stubFetch([BUSY]);
        assert.strictEqual(await remoteEngine.waitForIdleQueue({ timeoutMs: 0 }), false,
            'a running prompt must REFUSE the restart, never be terminated under');

        // 3. A PENDING prompt counts as busy too — restarting drops the queue.
        stubFetch([PENDING]);
        assert.strictEqual(await remoteEngine.waitForIdleQueue({ timeoutMs: 0 }), false,
            'a pending prompt must refuse the restart');

        // 4. Busy, then drained -> safe. The wait is what makes refusing rare.
        calls = stubFetch([BUSY, IDLE]);
        assert.strictEqual(await remoteEngine.waitForIdleQueue({ timeoutMs: 30000 }), true,
            'a queue that drains within the budget lets the restart through');
        assert.strictEqual(calls.length, 2, 'it polls until the queue drains');

        // 5. ONE failed read is UNKNOWN, not idle. getQueue() folds an error into
        //    `{running: [], pending: []}`, which for this gate would read as "safe" and
        //    green-light exactly the restart it exists to block — hence the separate poll.
        calls = stubFetch([null, BUSY, IDLE]);
        assert.strictEqual(await remoteEngine.waitForIdleQueue({ timeoutMs: 30000 }), true,
            'a blip then a drain still ends safe');
        assert.strictEqual(calls.length, 3, 'a failed read must not short-circuit to idle');

        // 6. Three consecutive failed reads. This assertion used to be unconditional
        //    (`true` — a wedged engine must stay repairable), and that is why the guard
        //    read as proven while `minimax-h3/t2v_ms` kept being orphaned: /queue crosses
        //    the RunPod proxy on the remote engine, and six seconds of misses under a
        //    heavy op is not evidence of idle. It now splits by caller.
        //
        // 6a. DEFAULT (every app-initiated restart — node installs, both engines):
        //     unreadable is UNKNOWN, so REFUSE. Nobody asked for this restart, and the
        //     cost of being wrong is destroying a generation someone is waiting on.
        calls = stubFetch([null, null, null]);
        assert.strictEqual(await remoteEngine.waitForIdleQueue({ timeoutMs: 30000 }), false,
            'an unreadable queue must not green-light an app-initiated restart');
        assert.strictEqual(calls.length, 3, 'it takes three misses, not one');

        // 6b. OPT-IN (the dev radial only): a human asked to repair the engine, so an
        //     unreadable queue must not lock them out of fixing a wedged ComfyUI.
        calls = stubFetch([null, null, null]);
        assert.strictEqual(
            await remoteEngine.waitForIdleQueue({ timeoutMs: 30000, unreachableMeansIdle: true }), true,
            'the human repair path still treats a dead engine as idle');
        assert.strictEqual(calls.length, 3, 'the opt-in still takes three misses, not one');
    } finally {
        globalThis.fetch = realFetch;
    }
});
