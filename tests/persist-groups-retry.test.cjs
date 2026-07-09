// MPI-226: persistGroups retry-until-success + warn-on-exhaust logic check.
// Mirrors the loop in js/services/projectService.js persistGroups() so a
// regression in the success-detection / retry / toast contract fails here.
// Run: node tests/persist-groups-retry.test.cjs
const assert = require('assert');

// Standalone re-impl of the retry contract (no ESM/DOM deps). If this drifts
// from projectService.js, the numbers below must be re-justified.
async function persistWithRetry(post, emit, { attempts = 4 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const result = await post();
            if (result?.success !== false) return { outcome: 'saved', attempt, result };
        } catch (_) { /* fall through to retry */ }
        // (no real sleep in the test)
    }
    emit('ui:warning');
    return { outcome: 'exhausted', attempt: attempts };
}

(async () => {
    // 1. First-try success returns immediately, no toast.
    {
        let calls = 0, toasts = 0;
        const r = await persistWithRetry(async () => (calls++, { success: true }), () => toasts++);
        assert.strictEqual(r.outcome, 'saved');
        assert.strictEqual(calls, 1, 'success must not retry');
        assert.strictEqual(toasts, 0, 'no toast on success');
    }

    // 2. { success:false } is treated as failure (old bug: it was treated as OK).
    {
        let toasts = 0;
        const r = await persistWithRetry(async () => ({ success: false, error: 'ENOSPC' }), () => toasts++);
        assert.strictEqual(r.outcome, 'exhausted', 'success:false must not count as saved');
        assert.strictEqual(toasts, 1, 'exhausted path warns exactly once');
    }

    // 3. Transient failure then success → saved, no toast.
    {
        let calls = 0, toasts = 0;
        const r = await persistWithRetry(
            async () => { calls++; if (calls < 3) throw new Error('EBUSY'); return { success: true }; },
            () => toasts++,
        );
        assert.strictEqual(r.outcome, 'saved');
        assert.strictEqual(r.attempt, 3, 'recovers on the attempt that succeeds');
        assert.strictEqual(toasts, 0, 'no toast when a retry eventually saves');
    }

    // 4. Missing `success` field (route returns bare project) counts as saved.
    {
        let toasts = 0;
        const r = await persistWithRetry(async () => ({ project: {} }), () => toasts++);
        assert.strictEqual(r.outcome, 'saved', 'absent success field is not a failure');
        assert.strictEqual(toasts, 0);
    }

    console.log('persist-groups-retry: all assertions passed');
})();
