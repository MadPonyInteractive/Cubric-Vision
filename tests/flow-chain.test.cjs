/**
 * flow-chain.test.cjs — MPI-623. A Flow that runs as TWO dispatches.
 *
 * The 3D Scene flow cannot run as one prompt: ComfyUI never evicts what the CURRENT
 * prompt produced, and the bake's second stage spikes to ~43 GB on its own, so it needs
 * the machine otherwise empty. Only a NEW prompt bumps the cache generation that frees
 * the first stage. So a `chain: { operation }` flow becomes leg 1, then leg 2 dispatched
 * from leg 1's completion — two ordinary jobs, NOT a two-prompt job inside
 * commandExecutor's lane machinery.
 *
 * The branching lives in `chainCallbacks`, which takes the leg-2 dispatch as an argument
 * precisely so it can be executed here: importing flowService is cheap, reaching
 * `enqueueGeneration` is not. The rest is asserted against the source, because the config
 * build sits behind that enqueue.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'js/services/flowService.js');
const read = () => fs.readFileSync(SRC, 'utf8');
const load = () => import('file://' + SRC.replace(/\\/g, '/'));

const CHAINED = { id: 'scene', title: 'Scene', operation: 'a', chain: { operation: 'b' } };
const PLAIN = { id: 'plain', title: 'Plain', operation: 'a' };

test('a flow with no chain gets its callbacks back untouched', async () => {
    const { chainCallbacks } = await load();
    const callbacks = { onComplete() {}, onError() {} };
    assert.strictEqual(chainCallbacks(PLAIN, callbacks, () => {
        throw new Error('a flow with no chain must never dispatch a second leg');
    }), callbacks);
});

test('leg 1 completing dispatches leg 2 and does NOT report the flow done', async () => {
    const { chainCallbacks } = await load();
    let dispatched = 0;
    let reported = 0;
    const wrapped = chainCallbacks(CHAINED, { onComplete: () => { reported++; } }, () => {
        dispatched++;
        return { queueJobId: 'job-2' };
    });
    wrapped.onComplete({ item: {} });
    assert.strictEqual(dispatched, 1, 'leg 1 completing must dispatch leg 2');
    assert.strictEqual(reported, 0,
        'the flow is not done until leg 2 is — the caller must see ONE completion, on leg 2');
});

test('leg 2 failing to enqueue forwards leg 1 rather than hanging the pane', async () => {
    const { chainCallbacks } = await load();
    // submitFlowGeneration returns null when its model/dep guard aborts. Swallowing that
    // would leave MpiBaseFlow spinning on a job that never entered the queue.
    let got = null;
    const wrapped = chainCallbacks(CHAINED, { onComplete: (r) => { got = r; } }, () => null);
    const result = { item: { id: 'leg-1' } };
    wrapped.onComplete(result);
    assert.strictEqual(got, result, 'leg 1 completion must be forwarded when leg 2 cannot run');
});

test('the non-onComplete callbacks pass straight through', async () => {
    const { chainCallbacks } = await load();
    const onError = () => {};
    const onCancel = () => {};
    const wrapped = chainCallbacks(CHAINED, { onError, onCancel }, () => ({ queueJobId: 'x' }));
    assert.strictEqual(wrapped.onError, onError);
    assert.strictEqual(wrapped.onCancel, onCancel);
    // No onComplete declared → forwarding a null-guard result must not throw.
    assert.doesNotThrow(() => wrapped.onComplete({}));
});

test('leg 2 runs the CHAINED op, and no second `workflow` field was invented', () => {
    const src = read();
    assert.match(src, /operation: _leg\.operation \|\| flow\.operation/,
        'the op is what picks the graph — one op per leg is how the second workflow is named');
    assert.ok(!/chain\.workflow/.test(src),
        'a second workflow name on FlowDef would bypass universal_workflows.js');
});

test('leg 2 carries no media, and never chains a third leg', () => {
    const src = read();
    assert.match(src, /const mediaItems = _leg\.operation \? \[\]/,
        'the chained leg reads leg 1 output off disk by name; re-sending media stages a dead file');
    assert.match(src, /_leg\.operation \? callbacks : chainCallbacks\(/,
        'leg 2 must not wrap its own callbacks — one chain, two legs');
});

test('leg 2 reuses leg 1 tempId so Cancel and live previews keep working', () => {
    const src = read();
    assert.match(src, /const tempId = _leg\.tempId \|\| crypto\.randomUUID\(\)/);
    assert.match(src, /\{ operation: flow\.chain\.operation, tempId \}/,
        'MpiBaseFlow holds ONE _myTempId per run — a fresh id on leg 2 orphans the pane');
});
