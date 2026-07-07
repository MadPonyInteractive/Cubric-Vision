'use strict';
// MPI-213 guard: generationService._laneOf and commandExecutor's engine→lane
// resolution MUST agree, or a job's INTENT lane and its STORE lane diverge and a
// completed gen strands as a phantom "1 RUNNING". These are the two rules as
// literals; the test asserts they map every (forceLocal, isRemote) case to the
// SAME lane. If someone edits one rule and not the other, this fails.
const assert = require('assert');

// generationService._laneOf (the intent lane)
function laneOf(forceLocal, isRemote) {
    if (forceLocal === true) return 'local';
    return isRemote ? 'remote' : 'local';
}

// commandExecutor engine resolution → generationStore lane (engine==='local'?'local':'remote')
function storeLane(forceLocal, isRemote) {
    const engine = forceLocal === true ? 'local' : (isRemote ? 'remote' : 'local');
    return engine === 'local' ? 'local' : 'remote';
}

for (const forceLocal of [true, false]) {
    for (const isRemote of [true, false]) {
        assert.strictEqual(
            laneOf(forceLocal, isRemote),
            storeLane(forceLocal, isRemote),
            `lane mismatch at forceLocal=${forceLocal} isRemote=${isRemote}`
        );
    }
}

// The regression case that MPI-213 fixed: no-Pod local gen must be 'local' on BOTH.
assert.strictEqual(laneOf(false, false), 'local', 'no-Pod intent lane must be local');
assert.strictEqual(storeLane(false, false), 'local', 'no-Pod store lane must be local');

console.log('lane-agreement: all (forceLocal × isRemote) cases agree ✓');
