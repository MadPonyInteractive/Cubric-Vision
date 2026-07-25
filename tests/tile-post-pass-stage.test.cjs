'use strict';
// MPI-350 guard: the Krea2 upscaler runs a refiner sampler AFTER UltimateSDUpscale's
// tiles. phaseProgress' tile mode used to be one-way — once a tile bar reported, every
// later inner bar only refilled the current tile's fill, so the refiner was invisible:
// the bar ran 0→100% a second time while the readout sat on the last tile ("1/1").
//
// THE TRAILING TICK IS THE WHOLE POINT. routes/comfy.js forwards the RAW tqdm value
// from "USDU: t/T", so T tiles produce T+1 events (0/T .. T/T) — the final one fires
// AFTER the last tile's inner bar has already finished. A first cut of this fix
// re-armed on every tile bar, so that trailing tick swallowed the refiner and the app
// still showed "1/1"; these tests model the tick explicitly so that can't come back.
//
// Also asserts tiling itself is UNCHANGED (this is a shared primitive — 9 USDU cards
// use it) and that cards with no post-tile pass behave exactly as before.
const assert = require('node:assert');
const test = require('node:test');

/** Drive one tile: its outer USDU bar, then that tile's inner sampler bar. */
function runTile(p, index, tiles, steps = 20) {
    p.tile(index, tiles);
    for (let v = 0; v <= steps; v++) p.step(v, steps);
}

/** The USDU bar's final T/T tick, fired after the last tile's inner bar. */
function trailingTick(p, tiles) {
    p.tile(tiles, tiles);
}

/** A standalone sampler bar — a post-tile pass, or a pre-tile load bar. */
function runBar(p, steps) {
    for (let v = 0; v <= steps; v++) p.step(v, steps);
}

test('krea2 upscaler, grid off: 1/2 during the tile, 2/2 on the refiner', async () => {
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress({ postTileBars: 1 });

    runTile(p, 0, 1);
    assert.deepStrictEqual([p.stage(), p.total()], [1, 2], 'refiner must be in the total up front');

    trailingTick(p, 1);
    assert.deepStrictEqual([p.stage(), p.total()], [1, 2], 'trailing tick must NOT advance into the refiner slot');

    runBar(p, 2);
    assert.deepStrictEqual([p.stage(), p.total()], [2, 2], 'refiner is stage 2');
});

test('krea2 upscaler, grid on (4 tiles): 1/5..4/5 then 5/5', async () => {
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress({ postTileBars: 1 });

    for (let i = 0; i < 4; i++) {
        runTile(p, i, 4);
        assert.deepStrictEqual(
            [p.stage(), p.total()], [i + 1, 5],
            `tile ${i} must stage as ${i + 1}/5 — tiling must not be disturbed`
        );
    }
    trailingTick(p, 4);
    assert.deepStrictEqual([p.stage(), p.total()], [4, 5], 'still the last tile');

    runBar(p, 2);
    assert.deepStrictEqual([p.stage(), p.total()], [5, 5], 'refiner appends after the tiles');
});

test('a pre-tile load bar keeps its offset', async () => {
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress({ postTileBars: 1 });

    runBar(p, 1);                       // model-load bar, before any tile
    assert.strictEqual(p.stage(), 1);
    for (let i = 0; i < 2; i++) runTile(p, i, 2);
    trailingTick(p, 2);
    assert.deepStrictEqual([p.stage(), p.total()], [3, 4], 'offset + tiles + refiner');
    runBar(p, 2);
    assert.deepStrictEqual([p.stage(), p.total()], [4, 4]);
});

test('no postTileBars (chroma/sdxl/ill/pony upscalers) is unchanged', async () => {
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress();

    for (let i = 0; i < 3; i++) {
        runTile(p, i, 3);
        assert.deepStrictEqual([p.stage(), p.total()], [i + 1, 3]);
    }
    trailingTick(p, 3);
    assert.deepStrictEqual([p.stage(), p.total()], [3, 3], 'no phantom stage advertised');
    p.finish();
    assert.deepStrictEqual([p.stage(), p.total(), p.percent()], [3, 3, 1]);
});

test('an unrecorded post-tile bar still self-corrects the total', async () => {
    // Belt and braces: if a graph grows a post-tile pass and nobody records it,
    // the stage must still tick rather than silently refill the last tile.
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress();

    runTile(p, 0, 1);
    trailingTick(p, 1);
    runBar(p, 2);
    assert.deepStrictEqual([p.stage(), p.total()], [2, 2], 'total self-corrects past the tile count');
});

test('replays a REAL logged 8-tile grid run (Use Grid on, krea2 upscaler)', async () => {
    // Transcribed from logs/app.log 2026-07-25T21:50:43..21:51:53 — the run the user
    // reported as "9/9 twice". Ground truth from that log: total_tiles=8, each tile's
    // inner bar is 0/3..3/3 with tqdm duplicating several lines, the final "USDU: 8/8"
    // is printed TWICE, and the refiner is a single 0/2..2/2 bar afterwards.
    // The two "9/9" the user saw are that refiner's two steps, not a repeated tile.
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress({ postTileBars: 1 });

    for (let i = 0; i < 8; i++) {
        p.tile(i, 8);
        // duplicated 0/3 and 1/3 and 3/3 lines, exactly as tqdm emitted them
        for (const [v, m] of [[0, 3], [0, 3], [0, 3], [1, 3], [1, 3], [2, 3], [3, 3], [3, 3]]) p.step(v, m);
        assert.deepStrictEqual([p.stage(), p.total()], [i + 1, 9], `tile ${i + 1} of 8`);
    }
    p.tile(8, 8);
    p.tile(8, 8);   // the duplicated final USDU line
    assert.deepStrictEqual([p.stage(), p.total()], [8, 9], 'neither trailing tick may enter the refiner slot');

    p.step(0, 2);
    assert.deepStrictEqual([p.stage(), p.total(), Math.round(p.percent() * 100)], [9, 9, 0]);
    p.step(1, 2);
    assert.deepStrictEqual([p.stage(), p.total(), Math.round(p.percent() * 100)], [9, 9, 50]);
    p.step(2, 2);
    p.step(2, 2);   // tqdm's trailing summary line
    assert.deepStrictEqual([p.stage(), p.total(), Math.round(p.percent() * 100)], [9, 9, 100]);
});

test('a repeated tqdm line does not split a tile', async () => {
    // Same max AND non-decreasing value = the SAME bar continuing, not a new one.
    // Guards the exit condition against firing mid-tile on a duplicated line.
    const { createStageProgress } = await import('../js/services/phaseProgress.js');
    const p = createStageProgress({ postTileBars: 1 });

    p.tile(0, 2);
    for (const v of [0, 1, 2, 3, 4, 5, 6, 7, 8, 8]) p.step(v, 8);
    assert.deepStrictEqual([p.stage(), p.total()], [1, 3], 'still tile 1 of 2 (+refiner)');
    runTile(p, 1, 2);
    assert.deepStrictEqual([p.stage(), p.total()], [2, 3]);
});
