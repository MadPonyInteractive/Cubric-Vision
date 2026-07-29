/**
 * runpod-skip-local-engine.test.cjs — MPI-390.
 *
 * The RunPod escape hatch on the engine-install modal persists a NEW flag,
 * `skipLocalEngine`, which the boot gate reads to skip the local engine
 * install/upgrade check entirely (js/shell.js).
 *
 * What this pins is the one place that fails SILENTLY: `normalizeRunpodConfig`
 * in js/core/storage.js is a WHITELIST — it rebuilds the config object field by
 * field and runs on BOTH read and write. A field that is added to
 * DEFAULT_RUNPOD_CONFIG but not to the normalizer is dropped without an error,
 * on every save and every load, so the hatch would appear to work and then
 * forget itself on the next boot. This is the same trap that cost MPI-370 its
 * `requirementsDrop` field via the `_createDepJob` whitelist.
 *
 * Also pinned: the flag is INDEPENDENT of `autoConnectOnStart`. Conflating them
 * was the rejected design — auto-connect spins a BILLED Pod at every launch, and
 * "don't make me install an engine I'll never use" must not imply that.
 *
 * The boot gate itself (shell.js) and the modal control are renderer-side and
 * verified in the app; see .agents/mpi-kanban/tasks/MPI-390/validation.md.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

// storage.js talks to localStorage through get()/set() wrappers only, so a
// Map-backed stub installed before the dynamic import is enough.
function installLocalStorageStub() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
    };
    return store;
}

test('skipLocalEngine survives the normalizeRunpodConfig whitelist on write AND read', async () => {
    installLocalStorageStub();
    const { Storage } = await import('../js/core/storage.js');

    Storage.setRunpodConfig({ ...Storage.getRunpodConfig(), skipLocalEngine: true });
    assert.strictEqual(
        Storage.getRunpodConfig().skipLocalEngine, true,
        'skipLocalEngine was dropped — add it to normalizeRunpodConfig, not just to DEFAULT_RUNPOD_CONFIG'
    );

    // And it must clear again, or the Settings toggle cannot re-arm the gate.
    Storage.setRunpodConfig({ ...Storage.getRunpodConfig(), skipLocalEngine: false });
    assert.strictEqual(Storage.getRunpodConfig().skipLocalEngine, false);
});

test('skipLocalEngine defaults OFF so an untouched install still gets the engine gate', async () => {
    installLocalStorageStub();
    const { Storage } = await import('../js/core/storage.js');

    assert.strictEqual(Storage.getRunpodConfig().skipLocalEngine, false);
});

test('skipLocalEngine is independent of autoConnectOnStart (no billed Pod implied)', async () => {
    installLocalStorageStub();
    const { Storage } = await import('../js/core/storage.js');

    Storage.setRunpodConfig({ ...Storage.getRunpodConfig(), skipLocalEngine: true });
    const cfg = Storage.getRunpodConfig();
    assert.strictEqual(cfg.skipLocalEngine, true);
    assert.strictEqual(cfg.autoConnectOnStart, false, 'skipping the local engine must NOT arm boot auto-connect');
});

test('a non-boolean skipLocalEngine heals to false rather than becoming truthy', async () => {
    installLocalStorageStub();
    const { Storage } = await import('../js/core/storage.js');

    Storage.setRunpodConfig({ ...Storage.getRunpodConfig(), skipLocalEngine: 'yes' });
    assert.strictEqual(Storage.getRunpodConfig().skipLocalEngine, false);
});
