// MPI-374 — the UI size must survive a restart.
//
// This matters more in 1.4 than it did before: MPI-432 deleted the Ctrl+wheel
// handler (macOS delivers a trackpad pinch as ctrl+wheel), so Ctrl+plus /
// Ctrl+minus is the ONLY UI-size control left. A user who needs a large UI and
// has to re-set it every launch is worse off than they were in 1.3.1.
//
// `uiZoom.js` captures webFrame from `window.require` at MODULE LOAD, so both
// stand-ins have to exist before the first import — and a second instance is
// reached with a cache-busting query, which is what makes "restart" testable.

const assert = require('node:assert');
const test = require('node:test');

function installStubs() {
    const calls = [];
    let factor = 1;
    const webFrame = {
        getZoomFactor: () => factor,
        setZoomFactor: (f) => { factor = f; calls.push(f); },
    };
    const store = new Map();
    global.window = { require: () => ({ webFrame }) };
    global.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
    return { calls, store, webFrame, reset: () => { factor = 1; calls.length = 0; } };
}

const stubs = installStubs();
// Each import URL is its own module instance — the query stands in for a restart.
const load = (tag) => import(`../js/utils/uiZoom.js${tag ? `?${tag}` : ''}`);

test('a UI-size step is persisted, and a fresh boot re-applies it', async () => {
    const { applyUiZoom } = await load();
    stubs.reset();

    applyUiZoom(1);
    assert.deepStrictEqual(stubs.calls, [1.1], 'one step up applies 1.1');
    assert.strictEqual(
        stubs.store.get('mpi_ui_zoom_factor'), '1.1',
        'the applied factor is written to storage, under the declared key',
    );

    // "Restart": a new module instance, storage untouched.
    const fresh = await load('restart');
    stubs.reset();
    fresh.restoreUiZoom();
    assert.deepStrictEqual(stubs.calls, [1.1], 'boot re-applies the stored factor');
});

test('a corrupt or out-of-range stored factor falls back to 1.0', async () => {
    const { normalizeZoomFactor, ZOOM_MIN, ZOOM_MAX } = await load();

    assert.strictEqual(normalizeZoomFactor(1.4), 1.4);
    assert.strictEqual(normalizeZoomFactor(ZOOM_MIN), ZOOM_MIN);
    assert.strictEqual(normalizeZoomFactor(ZOOM_MAX), ZOOM_MAX);

    // Out of range would wedge the UI at a size whose controls cannot be read.
    assert.strictEqual(normalizeZoomFactor(ZOOM_MAX + 1), 1);
    assert.strictEqual(normalizeZoomFactor(ZOOM_MIN - 0.1), 1);
    assert.strictEqual(normalizeZoomFactor(0), 1);
    assert.strictEqual(normalizeZoomFactor(-2), 1);

    // Corrupt values, i.e. anything a hand-edited localStorage can hold.
    assert.strictEqual(normalizeZoomFactor(null), 1);
    assert.strictEqual(normalizeZoomFactor(undefined), 1);
    assert.strictEqual(normalizeZoomFactor('huge'), 1);
    assert.strictEqual(normalizeZoomFactor(NaN), 1);
    assert.strictEqual(normalizeZoomFactor(Infinity), 1);
    assert.strictEqual(normalizeZoomFactor({}), 1);
});

test('Browser Mode has no webFrame: restore no-ops instead of throwing', async () => {
    const savedWindow = global.window;
    global.window = {};                       // no require() — this is Browser Mode
    try {
        const browser = await load('browser');
        assert.doesNotThrow(() => browser.restoreUiZoom());
        assert.doesNotThrow(() => browser.applyUiZoom(1));
    } finally {
        global.window = savedWindow;
    }
});
