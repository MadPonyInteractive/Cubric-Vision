'use strict';

// MPI-243: the first-boot parallel node install raced its own extraction —
// comfyui-frame-interpolation's `python install.py` failed (Errno 2, exit 2)
// and the `throw err` in _runCustomNodeInstall unwound the whole for-loop, so
// every LATER dep (Impact-Subpack, RES4LYF) was left un-installed until the
// user pressed Retry. Fix: a per-dep requirements failure sets anyFailure and
// `continue`s instead of throwing, so the batch finishes the remaining deps and
// only the failed one is re-installed on the next repair pass.
//
// This mirrors the failure-handling shape of the loop in
// routes/downloadManager.js::_runCustomNodeInstall (throw -> continue).

const assert = require('node:assert/strict');
const test = require('node:test');

// Faithful reduction of the loop's control flow: each dep runs a reqs step that
// may reject; a rejection must NOT abort the remaining deps.
async function runBatch(deps, runReqs) {
    let anyFailure = false;
    const installed = [];
    for (const dep of deps) {
        try {
            await runReqs(dep);
        } catch (_) {
            anyFailure = true;
            continue; // <- the fix: skip THIS dep, keep going
        }
        installed.push(dep.id); // marker stamped only on full success
    }
    return { anyFailure, installed };
}

test('one dep reqs failure does not abort the batch', async () => {
    const deps = [
        { id: 'comfyui-frame-interpolation' }, // fails (install.py race)
        { id: 'comfyui-impact-subpack' },
        { id: 'res4lyf' },
    ];
    const runReqs = async (dep) => {
        if (dep.id === 'comfyui-frame-interpolation') {
            throw new Error("can't open file 'install.py': [Errno 2]");
        }
    };

    const { anyFailure, installed } = await runBatch(deps, runReqs);

    // The two deps AFTER the failing one still install — the pre-fix `throw`
    // would have left `installed` empty except nothing (loop unwound at dep 0).
    assert.equal(anyFailure, true, 'the failed dep is flagged for repair');
    assert.deepEqual(
        installed,
        ['comfyui-impact-subpack', 'res4lyf'],
        'later deps install despite the earlier failure',
    );
    // The failed dep is NOT marked installed → no commit marker → repair re-runs it.
    assert.ok(!installed.includes('comfyui-frame-interpolation'));
});

test('all-success batch installs everything', async () => {
    const deps = [{ id: 'a' }, { id: 'b' }];
    const { anyFailure, installed } = await runBatch(deps, async () => {});
    assert.equal(anyFailure, false);
    assert.deepEqual(installed, ['a', 'b']);
});
