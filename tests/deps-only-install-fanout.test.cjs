/**
 * deps-only-install-fanout.test.cjs — MPI-681.
 *
 * `models:checked` is the ONLY signal the Flow Library and the plugin panels have that a
 * flow-deps / plugin-deps install landed — flow deps are not models, so they never move
 * `s_installedModelIds`. MPI-326 made that emit diff-gated and keyed the gate on the MODEL
 * set alone, so a deps-only install changed neither key, took the early return, and the
 * drawer sat frozen at 100% with a Cancel button until the app restarted.
 *
 * The gate itself must survive: the remote heartbeat re-syncs every ~5s and a no-change
 * re-emit tore down open op dropdowns and in-progress slider drags.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

// The check route is hit with fetch(); answer from a table the test owns.
// `installedDepIds` is the set every payload entry reports as on disk.
let installedDepIds = new Set();
globalThis.fetch = async (_path, opts) => {
    const { models } = JSON.parse(opts.body);
    const results = {};
    for (const m of models) {
        const deps = (m.deps || []).map(d => ({ id: d.id, installed: installedDepIds.has(d.id) }));
        results[m.id] = { installed: deps.length > 0 && deps.every(d => d.installed), deps };
    }
    return { ok: true, json: async () => ({ results, bakedDrift: [] }) };
};

test('a deps-only install fans out, and a no-change re-sync still stays silent', async () => {
    const { syncModelInstalled } = await import('../js/data/modelRegistry.js');
    const { flowDepUniverse } = await import('../js/data/flowsRegistry.js');
    const { Events } = await import('../js/events.js');

    let emits = 0;
    Events.on('models:checked', () => { emits += 1; });

    // A flow with deps and NO models — the whole audio section is this shape.
    const { getFlowById } = await import('../js/data/flowsRegistry.js');
    const depsOnly = flowDepUniverse().find(f => !(getFlowById(f.flowId)?.requiredModels || []).length);
    assert.ok(depsOnly, 'expected at least one flow whose install is deps-only');

    // 1. First sync of the session always emits (the keys start null).
    assert.strictEqual(await syncModelInstalled(), true);
    assert.strictEqual(emits, 1);

    // 2. Steady state — MPI-326's heartbeat guard. Nothing moved, nothing fires.
    await syncModelInstalled();
    await syncModelInstalled();
    assert.strictEqual(emits, 1, 'a no-change re-sync must not fan out (MPI-326)');

    // 3. The flow's deps land on disk. No model moved, so the installed/drifted keys are
    //    byte-identical — this is the emit MPI-681 was swallowing.
    installedDepIds = new Set(depsOnly.deps.map(d => d.id));
    await syncModelInstalled();
    assert.strictEqual(emits, 2,
        'a flow-deps-only install must fan out — without it the drawer never repaints');

    // 4. …and the widened key is still a key, not a hole: same disk, still silent.
    await syncModelInstalled();
    assert.strictEqual(emits, 2, 'the widened gate must still swallow a redundant re-sync');

    // 5. Deps removed again — the reverse edge has to fan out too.
    installedDepIds = new Set();
    await syncModelInstalled();
    assert.strictEqual(emits, 3, 'a deps uninstall must fan out as well');
});
