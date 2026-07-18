/**
 * injector-consumes.test.cjs — MPI-306 regression.
 *
 * A custom injector must consume ONLY the params it declares. The executor used
 * to delete every injectionParams key after running an injector, which swallowed
 * Head Swap's Input_Tier (the injector only handles boxes) — the graph kept its
 * baked tier and Quality/Turbo/Hyper all ran the same speed.
 *
 * This asserts the delete-set, which is the actual defect. It mirrors the
 * executor's deletion loop rather than importing it (commandExecutor pulls in the
 * whole app graph); the loop is 4 lines and reproduced verbatim below.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

/** Verbatim mirror of commandExecutor's post-injector cleanup. */
function applyCleanup(params, consumes) {
    (consumes || []).forEach(key => {
        delete params[key];
        delete params[`Input_${key}`];
    });
    return params;
}

test('headSwap consumes its boxes and NOTHING else', async () => {
    const { HEAD_SWAP_CONSUMES } = await import('../js/services/workflowInjectors/headSwapInjector.js');
    assert.deepStrictEqual([...HEAD_SWAP_CONSUMES].sort(), ['box1', 'box2']);
});

test('Input_Tier survives the headSwap injector cleanup', async () => {
    const { HEAD_SWAP_CONSUMES } = await import('../js/services/workflowInjectors/headSwapInjector.js');
    const params = { box1: {}, box2: {}, Input_Tier: 1, Input_Box: 'x' };
    applyCleanup(params, HEAD_SWAP_CONSUMES);
    // The regression: Input_Tier deleted here → node 95 keeps its baked 3 (Hyper).
    assert.strictEqual(params.Input_Tier, 1, 'Input_Tier must reach the generic injector');
    assert.ok(!('box1' in params) && !('box2' in params), 'boxes must be consumed');
});

test('resize still consumes flip (its Input_flip alias must not survive)', async () => {
    const { RESIZE_CONSUMES } = await import('../js/services/workflowInjectors/resizeInjector.js');
    const params = { flip: 'x', Input_flip: 'x', width: 512, unrelated: 7 };
    applyCleanup(params, RESIZE_CONSUMES);
    assert.ok(!('flip' in params) && !('Input_flip' in params), 'flip alias would no-op the flip node');
    assert.ok(!('width' in params));
    assert.strictEqual(params.unrelated, 7, 'undeclared params must survive');
});

test('every registered injector declares consumes', async () => {
    const { INJECTORS } = await import('../js/services/workflowInjectors/index.js');
    for (const [name, entry] of Object.entries(INJECTORS)) {
        assert.strictEqual(typeof entry.inject, 'function', `${name}.inject`);
        assert.ok(Array.isArray(entry.consumes) && entry.consumes.length, `${name}.consumes`);
    }
});
