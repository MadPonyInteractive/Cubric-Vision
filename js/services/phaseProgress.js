'use strict';

/**
 * phaseProgress.js — per-stage progress tracker (MPI-147).
 *
 * Design (after much iteration): DON'T try to aggregate the job's several tqdm
 * bars into one weighted 0-100% — that needs a fragile per-workflow weight map and
 * still hangs on phases that emit no fine signal (VAE). Instead, embrace the reset:
 * the bar runs 0→100% PER tqdm bar, and the status bar shows "Stage N/M" so the
 * reset reads as "next stage" instead of a bug.
 *
 * One LTX job = 3 bars: model-load (0/1), sampler A (0/7), sampler B (0/3). The
 * stage TOTAL can't be guessed from the JSON (the load bar isn't a node), so it's
 * recorded per workflow in a tiny sidecar `{ "stages": N }`. A human counts the
 * 0→100 bars once when authoring/testing the workflow. Unknown total → stages
 * just tick up with no "/M". If runtime exceeds the recorded total, we bump it
 * (never show 4/3).
 *
 * Works identically local + remote — it's just value/max per bar, no map. (Remote
 * still needs the Pod wrapper to emit the step events; that's a wrapper change.)
 *
 * A new bar is detected when `max` changes OR `value` drops below the last value
 * (tqdm restarts each bar at a low value).
 *
 * @module phaseProgress
 */

/**
 * @param {{ stages?: number }} [map]  sidecar contents; `stages` = recorded bar count
 * @returns {{
 *   step: (value:number, max:number) => void,
 *   stage: () => number,
 *   total: () => number,        // 0 = unknown
 *   percent: () => number,      // 0..1 within the CURRENT stage
 *   finish: () => void,
 * }}
 */
export function createStageProgress(map) {
    let _total = Number(map?.stages) > 0 ? Math.floor(map.stages) : 0;
    // Bars this workflow runs AFTER tiling finishes (MPI-350). Tile mode derives the
    // total from the live tile count, so a pass that comes after the tiles is
    // invisible to it — without this the bar reads "1/1" through the whole upscale
    // and only reveals the second stage once that stage has already started.
    const _postTileBars = Number(map?.postTileBars) > 0 ? Math.floor(map.postTileBars) : 0;

    let _stage   = 0;     // 1-based once the first bar arrives; 0 before
    let _lastMax = null;
    let _lastVal = -1;
    let _percent = 0;     // 0..1 within the current stage
    let _tileMode = false; // true once a tile bar reports (UltimateSDUpscale)
    let _tileOffset = 0;   // stages counted BEFORE tiles began (the load/pre-pass)
    let _barsInTile = 0;   // inner step bars seen since the current tile bar (MPI-350)

    return {
        // Inner step bar → drives the 0-1 fill. In normal mode each new bar (max
        // change or value reset) is a new stage. In tile mode the stage is owned by
        // tile() — step() only moves the fill within the current tile.
        step(value, max) {
            if (!(max > 0)) return;
            if (_tileMode) {
                // A pass that runs AFTER tiling (the Krea2 upscaler's refiner sampler,
                // MPI-350) arrives as an inner bar with no tile bar in front of it.
                // USDU emits its tile bar before every tile's inner bar, so during
                // tiling this counter is reset each tile and never reaches 2 — only a
                // post-tile pass gets here. Leave tile mode so the stage counter ticks
                // again; without this the refiner silently refills the last tile's bar.
                // Ceiling: assumes ONE inner bar per tile, true while every USDU card
                // runs seam_fix_mode "None". Enabling seam fix adds a second bar per
                // tile and would false-trigger — count post-tile bars explicitly then.
                if (max !== _lastMax || value < _lastVal) _barsInTile += 1;
                if (_barsInTile <= 1) {
                    _percent = Math.min(1, value / max);
                    _lastMax = max; _lastVal = value;
                    return;
                }
                // Post-tile pass: drop out and let the normal per-bar logic below
                // stage it (which also self-corrects the tile-derived total).
                _tileMode = false;
            }
            const isNewBar = _stage === 0 || max !== _lastMax || value < _lastVal;
            if (isNewBar) {
                _stage += 1;
                if (_total && _stage > _total) _total = _stage;  // self-correct
                _percent = 0;
            }
            _lastMax = max;
            _lastVal = value;
            _percent = Math.min(1, value / max);
        },
        // Outer tile bar (UltimateSDUpscale "USDU: t/T"). The tile index IS the
        // stage, the tile count IS the total — and the USDU bar fires BEFORE the
        // inner step bar, so tile mode is set first and the single inner 8-step pass
        // (model loads during its first steps via the "Initializing" suffix, NOT a
        // separate bar) only drives the fill. Verified: a 1-tile upscale = "Tile 1/1"
        // with one inner step pass. (MPI-147)
        tile(tileIndex, tiles) {
            if (!(tiles > 0)) return;
            if (!_tileMode) { _tileMode = true; _tileOffset = _stage; }
            // Arm the post-tile detector for a tile that will actually run. `tileIndex
            // === tiles` is the bar's FINAL tick, fired after the last tile's inner bar
            // is already done (routes/comfy.js forwards the raw tqdm value, so T tiles
            // produce T+1 events: 0/T .. T/T). Resetting on that trailing tick would
            // re-arm after the last tile and swallow the refiner — the live bug this
            // guard fixes. (MPI-350)
            if (tileIndex < tiles) _barsInTile = 0;
            _total = _tileOffset + tiles + _postTileBars;
            // tqdm tile bar is 0-based at start (0/T) then ticks 1/T..T/T. While
            // processing tile `tileIndex` (0-based) we're on offset+tileIndex+1.
            // Clamp to the LAST TILE, not to _total — _total now includes post-tile
            // bars, and the trailing T/T tick would otherwise advance the stage into
            // the refiner's slot before the refiner has started.
            const next = Math.min(_tileOffset + tiles, _tileOffset + tileIndex + 1);
            if (next > _stage) { _stage = next; _percent = 0; }
        },
        // Set a known total up front (e.g. detailer "# of Detected SEGS: N" — N
        // detail areas, each a step bar = a stage). Each step bar then ticks the
        // stage via the per-bar logic in step(). (MPI-147)
        setTotal(n) { if (n > 0) _total = n; },
        stage() { return _stage; },
        total() { return _total; },
        percent() { return _percent; },
        finish() { _percent = 1; if (_total && _stage < _total) _stage = _total; },
    };
}
