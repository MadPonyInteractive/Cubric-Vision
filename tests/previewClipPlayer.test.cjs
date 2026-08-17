'use strict';

/**
 * previewClipPlayer — the ONE latent-preview consumer (MPI-571).
 *
 * Four surfaces used to re-implement this ring and three got it wrong. The three
 * failures were all silent — a clip replayed at burst speed, a video branch that
 * returned early, a single frozen frame — so nothing threw and nothing logged.
 * These tests pin the behaviours that distinguish a working ring from those:
 * still-vs-clip mode, the announced rate, the announced ring length, the
 * marker-miss self-heal (MPI-535), and who frees the blob (MPI-508).
 *
 * Timers are mocked: the whole point of the module is WHEN it paints.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

/** Build a player with recording hooks. `canPaint` defaults to always. */
async function makePlayer(opts = {}) {
    const { createPreviewClipPlayer } = await import('../js/services/previewClipPlayer.js');
    const painted = [];
    const evicted = [];
    const player = createPreviewClipPlayer({
        paint: (url) => painted.push(url),
        onEvict: (url) => evicted.push(url),
        // Most of these tests assert who frees the blob, so they need the owning
        // player. The non-owning DEFAULT gets its own test at the bottom.
        ownsFrames: true,
        ...opts,
    });
    return { player, painted, evicted };
}

/**
 * Blob URLs, and a stub for the global revoke. Node's real URL.revokeObjectURL
 * would reject these strings; recording the calls is also the only direct proof
 * the player frees what it retains.
 */
function stubRevoke() {
    const revoked = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => { revoked.push(url); };
    return { revoked, restore: () => { URL.revokeObjectURL = original; } };
}

const b = (n) => `blob:frame-${n}`;

test('STILL mode: each frame replaces the last and frees the one it replaced', async () => {
    const { revoked, restore } = stubRevoke();
    try {
        const { player, painted } = await makePlayer();

        player.push(b(1), null);
        player.push(b(2), null);
        player.push(b(3), null);

        // Painted on arrival — no timer, nothing to loop.
        assert.deepEqual(painted, [b(1), b(2), b(3)]);
        // Each replaced frame is freed; the current one is still retained.
        assert.deepEqual(revoked, [b(1), b(2)]);
        assert.equal(player.isClip(), false);
    } finally { restore(); }
});

test('CLIP mode: frames accumulate and LOOP at the rate the clip announced', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { restore } = stubRevoke();
    try {
        const { player, painted } = await makePlayer();
        const clip = { rate: 4, length: 8 }; // 4fps = one frame per 250ms

        // Every frame carries the clip meta — that is the contract, not a one-shot.
        player.push(b(1), clip);
        player.push(b(2), clip);
        player.push(b(3), clip);

        // Arming paints frame 1 immediately; the rest wait for the timer.
        assert.deepEqual(painted, [b(1)]);
        assert.equal(player.isClip(), true);

        t.mock.timers.tick(250);
        t.mock.timers.tick(250);
        assert.deepEqual(painted, [b(1), b(2), b(3)]);

        // ...and LOOPS rather than freezing on the last frame. Freezing is exactly
        // what the Flow result pane did.
        t.mock.timers.tick(250);
        assert.deepEqual(painted, [b(1), b(2), b(3), b(1)]);
    } finally { restore(); t.mock.timers.reset(); }
});

test('the ring is sized by the clip\'s announced length, and eviction frees the head', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { revoked, restore } = stubRevoke();
    try {
        const { player, painted, evicted } = await makePlayer();
        const clip = { rate: 4, length: 2 };

        player.push(b(1), clip);   // paints 1, cursor -> 1
        player.push(b(2), clip);
        player.push(b(3), clip);   // ring full -> evict frame 1

        assert.deepEqual(evicted, [b(1)], 'the evicted head is announced before it is freed');
        assert.deepEqual(revoked, [b(1)], 'and the player frees it — the retainer owns the blob');

        // The cursor tracked the eviction. It pointed at frame 2 (not yet painted);
        // after the head was dropped frame 2 sits at index 0, so the cursor follows
        // it down and frame 2 is still shown exactly once. A cursor left where it
        // was would have skipped it.
        t.mock.timers.tick(250);
        t.mock.timers.tick(250);
        assert.deepEqual(painted, [b(1), b(2), b(3)]);
    } finally { restore(); t.mock.timers.reset(); }
});

test('a MISSED marker self-heals: still frames first, then clip meta takes over (MPI-535)', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { revoked, restore } = stubRevoke();
    try {
        const { player, painted } = await makePlayer();

        // The VHS_latentpreview marker fires ONCE per run and can be missed — the
        // surface not mounted yet, or a re-render between marker and first frame.
        // Those frames arrive with no clip meta and play as stills.
        player.push(b(1), null);
        assert.equal(player.isClip(), false);

        // The next frame carries the run's own word and the player recovers.
        player.push(b(2), { rate: 4, length: 8 });
        assert.equal(player.isClip(), true);
        // The orphan still frame is dropped rather than left sitting in the loop
        // as frame 0.
        assert.ok(revoked.includes(b(1)));

        player.push(b(3), { rate: 4, length: 8 });
        t.mock.timers.tick(250);
        assert.deepEqual(painted, [b(1), b(2), b(3)]);
    } finally { restore(); t.mock.timers.reset(); }
});

test('an announced rate CHANGE re-arms the timer; an unchanged one does not restart it', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { restore } = stubRevoke();
    try {
        const { player, painted } = await makePlayer();

        player.push(b(1), { rate: 4, length: 8 });   // 250ms
        player.push(b(2), { rate: 4, length: 8 });   // same rate -> no re-arm, no extra paint
        assert.deepEqual(painted, [b(1)]);

        // A new rate re-arms, which paints immediately at the new pace.
        player.push(b(3), { rate: 20, length: 8 });  // 50ms
        assert.deepEqual(painted, [b(1), b(2)]);
        t.mock.timers.tick(50);
        assert.deepEqual(painted, [b(1), b(2), b(3)]);
    } finally { restore(); t.mock.timers.reset(); }
});

test('reset() drops the stage window but keeps playing (MPI-167)', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { revoked, restore } = stubRevoke();
    try {
        const { player, painted } = await makePlayer();
        const clip = { rate: 4, length: 8 };

        player.push(b(1), clip);
        player.push(b(2), clip);

        // A second sampler stage: the old stage's frames must not concatenate into
        // one growing loop.
        player.reset(clip);
        assert.ok(revoked.includes(b(1)) && revoked.includes(b(2)));

        player.push(b(3), clip);
        t.mock.timers.tick(250);
        // Only the new stage's frame is in the loop.
        assert.deepEqual(painted.slice(1), [b(3)]);
    } finally { restore(); t.mock.timers.reset(); }
});

test('stop() kills the timer and frees every retained frame', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { revoked, restore } = stubRevoke();
    try {
        const { player, painted } = await makePlayer();
        const clip = { rate: 4, length: 8 };

        player.push(b(1), clip);
        player.push(b(2), clip);
        player.stop();

        assert.ok(revoked.includes(b(1)) && revoked.includes(b(2)));
        assert.equal(player.isClip(), false);

        // A detached surface whose timer kept running repainted blobs its own
        // generation had revoked — forever, one stream per removed card.
        const before = painted.length;
        t.mock.timers.tick(5000);
        assert.equal(painted.length, before);
    } finally { restore(); t.mock.timers.reset(); }
});

test('canPaint() gates the timer without dropping the buffered clip', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { restore } = stubRevoke();
    try {
        let generating = false;
        const { player, painted } = await makePlayer({ canPaint: () => generating });
        const clip = { rate: 4, length: 8 };

        player.push(b(1), clip);
        player.push(b(2), clip);
        t.mock.timers.tick(250);
        assert.deepEqual(painted, [], 'gated shut, nothing paints');

        generating = true;
        t.mock.timers.tick(250);
        assert.deepEqual(painted, [b(1)], 'frames were kept, not discarded');
    } finally { restore(); t.mock.timers.reset(); }
});

test('ownsFrames DEFAULTS to false: a non-owning player evicts but never revokes', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { revoked, restore } = stubRevoke();
    try {
        // The float bridge forwards EVERY run regardless of scope, so it overlaps
        // the gallery card / History viewer / Flow pane on the same generation. If
        // it freed frames it would revoke blobs those surfaces are still looping —
        // the ERR_FILE_NOT_FOUND storm of MPI-508, self-inflicted.
        const { player, evicted } = await makePlayer({ ownsFrames: false });
        const clip = { rate: 4, length: 2 };

        player.push(b(1), clip);
        player.push(b(2), clip);
        player.push(b(3), clip);   // evicts the head
        player.stop();             // drops the rest

        assert.deepEqual(evicted, [b(1), b(2), b(3)], 'still announces every drop');
        assert.deepEqual(revoked, [], 'but frees nothing — another surface may hold these');
    } finally { restore(); t.mock.timers.reset(); }
});
