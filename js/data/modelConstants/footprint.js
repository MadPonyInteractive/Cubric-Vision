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

// The VRAM sizes cards are actually SOLD in. The table's job is to name hardware the
// user can go and buy, so the rows step through this ladder rather than a bare
// multiple of 8 — the difference is 12GB, which is missing from the 8GB grid and is
// the most common mid-range size there is (3060/4070). Rounding a floor up to a grid
// without it turned a 8.29GB fit into "needs 16GB" on wan-22, ltx-23-balanced and
// qwen-edit: nearly 2x overstated, on three of the library's cheapest models to run,
// and a floor is a "don't bother" signal. Above 16 the real ladder IS 8s.
const CARD_SIZES = [8, 12, 16, 24, 32, 40, 48, 56, 64, 80, 96];

/** Smallest real card size ≥ gb (falls back to the 8GB grid above the list). */
function nextCardSize(gb) {
    return CARD_SIZES.find(v => v >= gb) ?? Math.ceil(gb / 8) * 8;
}

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
export function totalWeightsGb(model, engine = null, variantTokens = {}) {
    if (!model) return 0;
    const ids = resolveDeps(model, null, null, engine, variantTokens);
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
export function tradeTable(model, engine = null, userVramGb = null, variantTokens = {}) {
    const totalWeights = totalWeightsGb(model, engine, variantTokens);
    const footprint = totalWeights + OVERHEAD;
    // `minVramGb` on the ModelDef overrides the computed floor, for when a model is
    // MEASURED to run below what the fit says — H3 at 12 against a 13.29 fit. The
    // raw fit is never a row: printing "8.29GB VRAM" answers a question nobody asked,
    // so it is lifted onto the card ladder, which is also what the footnote quotes.
    const override = Number.isFinite(model?.minVramGb) ? model.minVramGb : null;
    const floor = override ?? nextCardSize(vramFloorGb(model ? totalWeights : 0));

    // The floor row, then the 8GB grid above it. Only the FLOOR moves onto the card
    // ladder: `ramNeededGb` rounds up to 8GB, so a 4GB step through the body would put
    // two adjacent rows in the same bucket (12→24 then 16→24), which reads as "16GB
    // buys you nothing" — true of the rounding, useless as advice.
    const gridStart = Math.ceil(floor / 8) * 8;
    const steps = floor < gridStart ? [floor] : [];
    for (let v = gridStart; v <= gridStart + 80; v += 8) steps.push(v);   // bound never expected

    const rows = [];
    for (const v of steps) {
        const ram = ramNeededGb(totalWeights, v);
        rows.push({ vram: v, ram, isFloor: rows.length === 0, isUserRow: false });
        if (ram === 0) break;                          // model fully resident — stop
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

    // minVramGb override: an explicit floor starts the table, and the ladder resumes
    // above it. The override never moves the RAM figures, only which rows show.
    const H3 = { dependencies: [], minVramGb: 12 };          // weights 0 → floor would be 8
    assert(tradeTable(H3).rows[0].vram === 12, 'minVramGb must start the table at 12');
    assert(tradeTable(H3).rows[0].isFloor === true, 'the override row carries the min flag');
    assert(tradeTable({ dependencies: [] }).rows[0].vram === 8, 'no override → the computed floor');
    // A model that fits entirely in its floor row stops there. The old grid loop always
    // ran once more and printed a second row for a model already fully resident.
    assert(tradeTable(H3).rows.length === 1, 'resident at the floor → exactly one row');
    // The ladder itself: real card sizes, and 12 is on it. An override off the ladder
    // (10) draws its own row and the ladder resumes at 12.
    assert(nextCardSize(9) === 12 && nextCardSize(12) === 12 && nextCardSize(13) === 16,
        'the ladder steps 8 → 12 → 16, not 8 → 16');
    assert(nextCardSize(10 + 1) === 12, 'an off-ladder floor of 10 resumes at 12');
    assert(nextCardSize(100) === 104, 'above the list the ladder falls back to 8s');
    // The three the 8GB grid used to catapult to 16: a fit just over 8 must land on 12,
    // which is a card that exists, not on the next multiple of 8.
    assert(nextCardSize(vramFloorGb(33.2)) === 12, 'wan-22 (8.29 fit) floors at 12, not 16');
    assert(nextCardSize(vramFloorGb(40.4)) === 12, 'ltx-23-balanced (10.10 fit) floors at 12');
    assert(nextCardSize(vramFloorGb(32.1)) === 12, 'qwen-edit (8.02 fit) floors at 12');
    assert(nextCardSize(vramFloorGb(61.4)) === 16, 'ltx-23 (15.35 fit) still floors at 16');

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
