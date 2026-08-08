// MPI-442 — heroStats owns its unsubscribe handles.
//
// `initHeroStats` used to call `Events.on(...)` five times and throw every
// unsubscribe away. That is invisible in the app (it runs once at boot and the
// landing page persists), which is exactly why it needs a test: the two ways it
// can break are both silent.
//
//   1. its own docstring claimed "Idempotent" while a second call would have
//      DOUBLED all five subscriptions — every repaint running twice, forever,
//   2. an unsubscribe that is never stored cannot be undone, so there is no
//      teardown for a hot-reload or for the next test in a suite.
//
// Nothing in the app calls destroyHeroStats() today, matching the shell-module
// precedent in notificationService.js ("primarily for hot-reload / tests").
// This IS that test, so the handle is exercised rather than merely declared.
//
// heroStats reaches the DOM only through gid(); a getElementById that returns
// null makes every renderer bail at its own guard, so the whole module runs in
// node with no jsdom and no canvas.

const assert = require('node:assert');
const test = require('node:test');

globalThis.document = { getElementById: () => null };

const HERO_EVENTS = [
    'models:checked',
    'engine:ready',
    'projects:listed',
    'remote:connection',
    'remote:connect-progress',
];

const load = async () => ({
    hero: await import('../js/shell/heroStats.js'),
    Events: (await import('../js/events.js')).Events,
});

/** Listener count per event, straight off the bus's own registry. */
const counts = (Events) => HERO_EVENTS.map(e => Events._listeners.get(e)?.size ?? 0);

test('initHeroStats subscribes exactly once per hero event', async () => {
    const { hero, Events } = await load();
    hero.destroyHeroStats(); // start from a known-clean bus
    const before = counts(Events);

    hero.initHeroStats();
    const after = counts(Events);

    HERO_EVENTS.forEach((e, i) => {
        assert.strictEqual(after[i] - before[i], 1, `${e} should gain exactly one listener`);
    });
    hero.destroyHeroStats();
});

test('a second initHeroStats does NOT double the subscriptions', async () => {
    const { hero, Events } = await load();
    hero.destroyHeroStats();

    hero.initHeroStats();
    const once = counts(Events);
    hero.initHeroStats();
    hero.initHeroStats();
    const thrice = counts(Events);

    assert.deepStrictEqual(thrice, once, 'the idempotence guard must make repeat calls a no-op');
    hero.destroyHeroStats();
});

test('destroyHeroStats removes every listener it added', async () => {
    const { hero, Events } = await load();
    hero.destroyHeroStats();
    const clean = counts(Events);

    hero.initHeroStats();
    assert.notDeepStrictEqual(counts(Events), clean, 'guard: init must actually subscribe');

    hero.destroyHeroStats();
    assert.deepStrictEqual(counts(Events), clean, 'every handle must be called and dropped');
});

test('init is re-armable after destroy', async () => {
    const { hero, Events } = await load();
    hero.destroyHeroStats();

    hero.initHeroStats();
    const first = counts(Events);
    hero.destroyHeroStats();
    hero.initHeroStats();

    assert.deepStrictEqual(counts(Events), first, 'destroy must clear the guard, not wedge it');
    hero.destroyHeroStats();
});

test('a live event still reaches the handler, and stops after destroy', async () => {
    const { hero, Events } = await load();
    hero.destroyHeroStats();

    // gid() returns null so the renderers bail — a throw here would mean the
    // handler ran. Silence plus a listener count is the observable.
    hero.initHeroStats();
    assert.strictEqual(Events._listeners.get('projects:listed').size, 1);
    Events.emit('projects:listed', { projects: [] });

    hero.destroyHeroStats();
    assert.strictEqual(Events._listeners.get('projects:listed')?.size ?? 0, 0);
    Events.emit('projects:listed', { projects: [] }); // must be a no-op, not a throw
});
