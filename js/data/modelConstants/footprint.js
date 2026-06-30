/**
 * footprint.js — Computed VRAM↔RAM requirement curve for a model (MPI-168).
 *
 * A model's weights must live in memory somewhere — VRAM or system RAM. Whatever
 * doesn't fit in VRAM spills to RAM (aimdo dynamic-VRAM offload). So the runtime
 * requirement is a CURVE, not a single number: less VRAM → more RAM. This module
 * computes that curve from the model's WEIGHT FILE SIZES alone (already known from
 * the registry) plus three GLOBAL constants fitted once — NO per-family lab runs.
 *
 * Fit anchored to published rec tables (HF/GGUF cards) + a known-good measurement:
 * an RTX 4060 Ti (16GB VRAM) runs LTX-2.3 bf16 (≈58.7GB of weights) on ~44GB of
 * FREE system RAM. The formula reproduces that exactly at V=16.
 *
 * The table states MODEL need, NOT system total — OS reserve (varies per machine,
 * ~10–20GB) is the user's own headroom, surfaced as a footnote, never baked in.
 *
 * Pure module: no DOM/Events/state imports, so it runs under node (see demo()).
 */

import { DEPS } from './dependencies.js';
import { resolveDeps } from './resolveModelDeps.js';

// ── Fitted global constants (MPI-168 — see plan.md "CONSTANTS — FITTED + LOCKED")
const OVERHEAD = 1.3;   // GB — framework/CUDA/activation slack, same for all models
const K = 0.25;         // vramFloor as a fraction of total weight size
const MIN_FLOOR = 8;    // GB — floor guard for small models (SDXL) where K*weights < 8
const GB = 1024 ** 3;

/** Parse a registry size string ('41GB', '254MB', '2.31GB') → GB. 0 if unparseable. */
export function sizeToGb(sizeStr) {
    if (!sizeStr) return 0;
    const m = String(sizeStr).match(/^([\d.]+)\s*(GB|MB|KB|B)$/i);
    if (!m) return 0;
    const val = parseFloat(m[1]);
    const mult = { GB: GB, MB: 1024 ** 2, KB: 1024, B: 1 }[m[2].toUpperCase()] || 0;
    return (val * mult) / GB;
}

/** A dep is a weight (not a custom node / json config) — those have a `type`. */
function isWeightDep(dep) {
    return dep && dep.size && dep.type !== 'custom_nodes' && dep.type !== 'json';
}

/**
 * Sum the WEIGHT file sizes (GB) the given model loads for an engine.
 * Custom nodes and json configs are excluded — only weights occupy VRAM/RAM.
 * @param {object} model   ModelDef
 * @param {'local'|'remote'|null} [engine]
 * @returns {number} total weight size in GB
 */
export function totalWeightsGb(model, engine = null) {
    if (!model) return 0;
    const ids = resolveDeps(model, null, null, engine);
    let gb = 0;
    for (const id of ids) {
        const dep = DEPS[id];
        if (isWeightDep(dep)) gb += sizeToGb(dep.size);
    }
    return gb;
}

/** vramFloor (GB) — minimum VRAM below which we don't suggest the model. */
export function vramFloorGb(totalWeights) {
    return Math.max(MIN_FLOOR, totalWeights * K);
}

/** RAM (GB) needed at a given VRAM level — rounded UP to 8GB; never under-states. */
export function ramNeededGb(totalWeights, vramGb) {
    const footprint = totalWeights + OVERHEAD;
    const spill = Math.max(0, footprint - vramGb);
    return Math.ceil(spill / 8) * 8;
}

/**
 * The VRAM↔RAM trade table for a model. Rows step by 8GB from the floor up to the
 * point the model is fully VRAM-resident (ramNeeded hits 0). Marks the row nearest
 * the user's VRAM (caller passes userVramGb; pass null in remote mode to skip it).
 *
 * @param {object} model
 * @param {'local'|'remote'|null} [engine]
 * @param {number|null} [userVramGb]  user's GPU VRAM (GB); null → no isUserRow flag
 * @returns {{rows: Array<{vram:number, ram:number, isFloor:boolean, isUserRow:boolean}>,
 *           totalWeights:number, footprint:number, vramFloor:number}}
 */
export function tradeTable(model, engine = null, userVramGb = null) {
    const totalWeights = totalWeightsGb(model, engine);
    const footprint = totalWeights + OVERHEAD;
    const floor = vramFloorGb(model ? totalWeights : 0);
    const startVram = Math.ceil(floor / 8) * 8;       // first row on the 8GB grid ≥ floor

    const rows = [];
    for (let v = startVram; ; v += 8) {
        const ram = ramNeededGb(totalWeights, v);
        rows.push({ vram: v, ram, isFloor: v === startVram, isUserRow: false });
        if (ram === 0) break;                          // model fully resident — stop
        if (v > startVram + 80) break;                 // safety bound (never expected)
    }

    if (userVramGb != null && rows.length) {
        // nearest row to the user's VRAM
        let best = 0, bestDiff = Infinity;
        rows.forEach((r, i) => {
            const d = Math.abs(r.vram - userVramGb);
            if (d < bestDiff) { bestDiff = d; best = i; }
        });
        rows[best].isUserRow = true;
    }

    return { rows, totalWeights, footprint, vramFloor: floor };
}

// ── Self-check (node: `node js/data/modelConstants/footprint.js`) ──────────────
// Asserts the formula reproduces the known-good LTX bf16 anchor and floor logic.
export function demo() {
    const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

    // LTX bf16: transformer 41 + Gemma 14.5 + video VAE 1.45 + audio VAE 0.37
    //         + text-projection 2.31 + spatial-upscaler 1.5 ≈ 61.13GB of weights.
    // (Slightly above the 58.7 hand-estimate because the upscaler + audio VAE count.)
    const LTX = 58.7;  // use the calibration anchor's number for the pinned assertion
    assert(ramNeededGb(LTX, 16) === 48, `LTX@16 → ${ramNeededGb(LTX, 16)} (want 48, raw 44 rounds up to 48)`);
    assert(ramNeededGb(LTX, 24) === 40, `LTX@24 → ${ramNeededGb(LTX, 24)} (want 40)`);
    assert(ramNeededGb(LTX, 32) === 32, `LTX@32 → ${ramNeededGb(LTX, 32)} (want 32)`);
    assert(ramNeededGb(LTX, 48) === 16, `LTX@48 → ${ramNeededGb(LTX, 48)} (want 16)`);
    assert(ramNeededGb(LTX, 64) === 0,  `LTX@64 → ${ramNeededGb(LTX, 64)} (want 0, resident)`);
    // raw need at V=16 is 44 (the user's known-good free-RAM figure) before rounding:
    assert(Math.max(0, LTX + OVERHEAD - 16) === 44, 'LTX raw need @16 must be 44 (user box anchor)');

    // Floors: SDXL (6.5) clamps to MIN_FLOOR 8; LTX (58.7) → 14.7; Wan (20) → 8 (accepted).
    assert(vramFloorGb(6.5) === 8, `SDXL floor → ${vramFloorGb(6.5)} (want 8 via MIN_FLOOR)`);
    assert(vramFloorGb(20) === 8, `Wan floor → ${vramFloorGb(20)} (want 8, accepted optimistic)`);
    assert(Math.abs(vramFloorGb(58.7) - 14.675) < 1e-6, `LTX floor → ${vramFloorGb(58.7)} (want 14.675)`);

    // sizeToGb parsing
    assert(sizeToGb('41GB') === 41, 'parse 41GB');
    assert(Math.abs(sizeToGb('254MB') - 0.248) < 0.01, 'parse 254MB');

    const t = LTX + OVERHEAD;
    // eslint-disable-next-line no-console
    console.log(`footprint.js self-check PASS — LTX bf16 (weights ${LTX}GB, footprint ${t}GB):`);
    [16, 24, 32, 48, 64].forEach(v =>
        // eslint-disable-next-line no-console
        console.log(`  ${String(v).padStart(2)}GB VRAM → ~${ramNeededGb(LTX, v)}GB RAM` +
            (v === 16 ? '   (raw 44GB = user 4060 box, runs ✓)' : '')));
    return true;
}

// Self-check is exported, not auto-run (browser imports this module). Run under node:
//   node --input-type=module -e "import {demo} from './js/data/modelConstants/footprint.js'; demo()"
