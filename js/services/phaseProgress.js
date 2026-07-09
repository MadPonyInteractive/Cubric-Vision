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

    let _stage   = 0;     // 1-based once the first bar arrives; 0 before
    let _lastMax = null;
    let _lastVal = -1;
    let _percent = 0;     // 0..1 within the current stage
    let _tileMode = false; // true once a tile bar reports (UltimateSDUpscale)
    let _tileOffset = 0;   // stages counted BEFORE tiles began (the load/pre-pass)

    return {
        // Inner step bar → drives the 0-1 fill. In normal mode each new bar (max
        // change or value reset) is a new stage. In tile mode the stage is owned by
        // tile() — step() only moves the fill within the current tile.
        step(value, max) {
            if (!(max > 0)) return;
            if (_tileMode) {
                _percent = Math.min(1, value / max);
                _lastMax = max; _lastVal = value;
                return;
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
            _total = _tileOffset + tiles;
            // tqdm tile bar is 0-based at start (0/T) then ticks 1/T..T/T. While
            // processing tile `tileIndex` (0-based) we're on offset+tileIndex+1.
            const next = Math.min(_total, _tileOffset + tileIndex + 1);
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
