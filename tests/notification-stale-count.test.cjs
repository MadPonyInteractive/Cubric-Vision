// MPI-540 — a finished-gen count must never speak for a batch that is long gone.
//
// `_doneCount` in js/shell/notificationService.js is module-level and was only ever
// flushed when `state.generationQueueCount` reached 0. Nothing expired it. So a batch
// whose queue never cleanly drained — a stranded or errored lane, which MPI-539's
// download-mode incident produced several of — left the count alive indefinitely, and
// it then attached itself to whatever drove the count to 0 NEXT. Fabio saw
// "2 generations finished" on the landing page an hour after the fact, twice.
//
// Nothing downstream defers, which is why the count is the only suspect: main.js's
// `showOsNotification` fires on receipt and returns early when the window is focused,
// and statusBar.js has no focus-deferred replay. Verified in both files 2026-08-11.
//
// This drives the REAL module (it imports clean in bare Node with DOM stubs) rather
// than a mirrored copy, so the guard cannot pass here while being absent in the app.

const assert = require('node:assert');
const test = require('node:test');

// --- minimal DOM/host surface the module graph touches at import + call time ------
globalThis.window = {
    require: undefined,
    addEventListener() {}, removeEventListener() {},
    setTimeout: (...a) => setTimeout(...a),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
};
// hasFocus true → the completion routes to the in-app StatusBar toast, which is the
// observable this test spies on. The OS branch needs ipcRenderer, absent here anyway.
globalThis.document = {
    hasFocus: () => true,
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({
        style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, setAttribute() {}, addEventListener() {},
    }),
    body: { appendChild() {} },
    documentElement: { style: { setProperty() {} } },
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const SRC = 'file:///c:/AI/Mpi/Cubric-Vision/js/';
const REAL_NOW = Date.now;
const settle = () => new Promise(r => setTimeout(r, 250)); // past the 150ms flush defer

/** Fresh service + a captured list of every completion body it emitted. */
async function harness() {
    const [notif, statusBar, events, stateMod] = await Promise.all([
        import(SRC + 'shell/notificationService.js'),
        import(SRC + 'shell/statusBar.js'),
        import(SRC + 'events.js'),
        import(SRC + 'state.js'),
    ]);
    const fired = [];
    statusBar.StatusBar.notify = (msg) => fired.push(msg);
    notif.destroyNotificationService();   // modules are cached across tests — reset the counter
    notif.initNotificationService();
    return { fired, notif, Events: events.Events, state: stateMod.state };
}

test.afterEach(() => { Date.now = REAL_NOW; });

test('a count whose batch never drained is dropped, not announced later', async () => {
    const { fired, notif, Events, state } = await harness();
    let clock = REAL_NOW();
    Date.now = () => clock;

    // A batch runs and one gen finishes, but the queue never reaches 0 — the lane
    // stranded (remote died mid-flight, an errored job never released).
    state.generationQueueCount = 2;
    Events.emit('generation:complete', { cancelled: false });
    await settle();
    assert.deepStrictEqual(fired, [], 'fired while the queue still had items');

    // …an hour passes, then something unrelated drives the count to 0: a navigation
    // re-deriving it, or a later single generation draining.
    clock += 60 * 60 * 1000;
    state.generationQueueCount = 0;
    await settle();

    assert.deepStrictEqual(fired, [],
        'the orphaned count still fired — a completion notification for a batch that ended an hour ago');
    notif.destroyNotificationService();
});

test('a stale count does not inflate the batch that follows it', async () => {
    const { fired, notif, Events, state } = await harness();
    let clock = REAL_NOW();
    Date.now = () => clock;

    // Two gens finish into a queue that never drains — 2 orphaned.
    state.generationQueueCount = 3;
    Events.emit('generation:complete', { cancelled: false });
    Events.emit('generation:complete', { cancelled: false });
    await settle();

    // Much later the user runs ONE generation, which completes normally.
    clock += 60 * 60 * 1000;
    Events.emit('generation:complete', { cancelled: false });
    state.generationQueueCount = 0;
    await settle();

    assert.deepStrictEqual(fired, ['Generation finished.'],
        'the orphans rode along on the fresh completion — the body must report 1, not 3');
    notif.destroyNotificationService();
});

test('a normal batch inside the window still coalesces to one notification', async () => {
    // The guard must not cost the thing it protects: three gens finishing seconds
    // apart are one batch and get exactly one summary toast.
    const { fired, notif, Events, state } = await harness();
    let clock = REAL_NOW();
    Date.now = () => clock;

    state.generationQueueCount = 3;
    for (let i = 0; i < 3; i++) {
        clock += 20 * 1000;                 // 20s between items — well inside the window
        Events.emit('generation:complete', { cancelled: false });
    }
    state.generationQueueCount = 0;
    await settle();

    assert.deepStrictEqual(fired, ['3 generations finished.'],
        'a live batch lost items to the staleness guard');
    notif.destroyNotificationService();
});
