/**
 * ratios.js — Shared Aspect Ratio Configuration & Utilities Module
 *
 * Centralized store for model-specific aspect ratios (FLUX vs SDXL, VIDEO) and utility
 * functions for working with aspect ratios across the application.
 *
 * RULES FOR AGENTS:
 * - Do NOT hardcode aspect ratios in individual tool files.
 * - Always use `getModelRatios(modelType, orientation)` to fetch the correct array.
 * - `modelType` comes from model.type in `js/data/modelRegistry.js`
 */

import { ICONS } from './icons.js';
import { MODELS } from '../data/modelConstants/models.js';

// ── Aspect Ratio Configuration ───────────────────────────────────────────

export const FLUX_RATIOS = {
    portrait: [
        { label: "1:1", w: 1024, h: 1024, icon: "rect_1_1" },
        { label: "3:4", w: 896, h: 1152, icon: "rect_3_4" },
        { label: "4:5", w: 896, h: 1088, icon: "rect_4_5" },
        { label: "5:8", w: 768, h: 1280, icon: "rect_5_8" },
        { label: "9:16", w: 768, h: 1344, icon: "rect_9_16" }
    ],
    landscape: [
        { label: "1:1", w: 1024, h: 1024, icon: "rect_1_1" },
        { label: "4:3", w: 1152, h: 896, icon: "rect_4_3" },
        { label: "5:4", w: 1088, h: 896, icon: "rect_5_4" },
        { label: "8:5", w: 1280, h: 768, icon: "rect_8_5" },
        { label: "16:9", w: 1344, h: 768, icon: "rect_16_9" }
    ]
};

export const SDXL_RATIOS = {
    portrait: [
        { label: "1:1", w: 1024, h: 1024, icon: "rect_1_1" },
        { label: "3:4", w: 896, h: 1152, icon: "rect_3_4" },
        { label: "4:5", w: 832, h: 1024, icon: "rect_4_5" },
        { label: "5:8", w: 768, h: 1216, icon: "rect_5_8" },
        { label: "9:16", w: 768, h: 1344, icon: "rect_9_16" }
    ],
    landscape: [
        { label: "1:1", w: 1024, h: 1024, icon: "rect_1_1" },
        { label: "4:3", w: 1152, h: 896, icon: "rect_4_3" },
        { label: "5:4", w: 1024, h: 832, icon: "rect_5_4" },
        { label: "8:5", w: 1216, h: 768, icon: "rect_8_5" },
        { label: "16:9", w: 1344, h: 768, icon: "rect_16_9" }
    ]
};

// Wan 2.2 14B (T2V/I2V-A14B). Grid = /16 (Wan2.1-VAE, 4x16x16). Wan's two-sampler
// multi-stage is NOT LTX's ÷2/×2 — both samplers run at the SAME target res
// (sampler-1 = motion + initial detail, sampler-2 = refine), so there is NO
// half-clean /64 constraint; /16 is the whole rule. Frame rule: 4n+1 (81 @ 16fps
// ≈ 5s). Official native band = 480p (832×480) + 720p (1280×720); 720p is the
// documented CEILING — very_high (1920×1088) is ABOVE native (works, but
// extrapolated → detail tier, expect artifacts). very_low raised from the old
// 320×176 (unusably small). Wan 2.2 has NO native 2K/4K (that's Wan 2.5, a
// different model). Square + mid ratios follow the community WanResolutionSelector
// (624×624, 960×960). Future ref [4:3 = 1088×832 | 704×544].
export const WAN_RATIOS = {
    very_low: [
        { label: "1:1", w: 384, h: 384, icon: "rect_1_1" },
        { label: "9:16", w: 288, h: 512, icon: "rect_9_16" },
        { label: "16:9", w: 512, h: 288, icon: "rect_16_9" }
    ],
    low: [
        { label: "1:1", w: 512, h: 512, icon: "rect_1_1" },
        { label: "9:16", w: 368, h: 640, icon: "rect_9_16" },
        { label: "16:9", w: 640, h: 368, icon: "rect_16_9" }
    ],
    medium: [
        { label: "1:1", w: 624, h: 624, icon: "rect_1_1" },
        { label: "9:16", w: 480, h: 832, icon: "rect_9_16" },
        { label: "16:9", w: 832, h: 480, icon: "rect_16_9" }
    ],
    high: [
        { label: "1:1", w: 960, h: 960, icon: "rect_1_1" },
        { label: "9:16", w: 720, h: 1280, icon: "rect_9_16" },
        { label: "16:9", w: 1280, h: 720, icon: "rect_16_9" }
    ],
    very_high: [
        { label: "1:1", w: 1088, h: 1088, icon: "rect_1_1" },
        { label: "9:16", w: 1088, h: 1920, icon: "rect_9_16" },
        { label: "16:9", w: 1920, h: 1088, icon: "rect_16_9" }
    ]
};

// Wan 2.2 TI2V-5B. SEPARATE table: the 5B is 720p-ONLY (no native 480p) and its
// new Wan2.2-VAE (4x32x32) puts the sane grid at /32 (UI step=32; /16 is the hard
// floor but /32 avoids odd latents after patchify). Official native = 1280×704
// (NOT 1280×720 — 720 is off the /32 grid). Frame rule: 4n+1 (121 @ 24fps ≈ 5s).
// Three tiers spread the single 720p band into draft/mid/final. No 2K/4K.
// NOTE: not yet wired to a shipped model card — add a 'wan5b' model.type (or map
// the 5B card here) when the 5B workflow lands. getModelRatios already routes it.
export const WAN_5B_RATIOS = {
    low: [
        { label: "1:1", w: 704, h: 704, icon: "rect_1_1" },
        { label: "9:16", w: 544, h: 960, icon: "rect_9_16" },
        { label: "16:9", w: 960, h: 544, icon: "rect_16_9" }
    ],
    medium: [
        { label: "1:1", w: 832, h: 832, icon: "rect_1_1" },
        { label: "9:16", w: 640, h: 1152, icon: "rect_9_16" },
        { label: "16:9", w: 1152, h: 640, icon: "rect_16_9" }
    ],
    high: [
        { label: "1:1", w: 960, h: 960, icon: "rect_1_1" },
        { label: "9:16", w: 704, h: 1280, icon: "rect_9_16" },
        { label: "16:9", w: 1280, h: 704, icon: "rect_16_9" }
    ]
};

// LTX 2.3 video. The 2-stage pipeline makes the EFFECTIVE grid /64, NOT /32.
// LTX's VAE is 32x spatial, but stage-1 halves the input (MpiMath floor(a/2))
// and stage-2 x2-upscales, so the half must itself land on the /32 latent grid:
// a /32-but-not-/64 size does NOT "pad up and drift a few %" — the pipeline
// FLOORS it. Live-proven (2026-07-04): 960x544 in → 960x512 out (544 -> half
// 272 -> rounds DOWN to 256 -> x2 = 512), silently mismatching the picked size
// and confusing the user. So EVERY value here is /64-clean. Only two tiers ever
// broke this: very_low 352 (floored to 320) and medium 544 (floored to 512) —
// both now snapped down to /64. 2K/4K were already pinned /64 for the same
// half-clean reason. Tiers 16:9/9:16 track Lightricks-blessed resolutions where
// those are already /64: low 768x448 = official training res; medium 960x512
// (was Lightricks' 960x544, but 544 is /32-only so unreachable in our local
// 2-stage — Lightricks' cloud pads internally, we can't); high 1216x704 =
// inference.py default; very_high
// 1920x1088 = official 1080p. 2K/4K = official 1440p (2560x1440) and 4K-UHD
// (3840x2160) snapped up to /64 (heights 1440->1472, 2160->2176 — Lightricks'
// cloud API pads internally, our pipeline can't, so we snap). 1:1 = the short
// edge of the tier's landscape/portrait pair. Tiers map motion, not just detail:
// motion peaks low and decays as resolution climbs, while audio coherence
// improves with size (in-distribution sizes give the best audio). 2K/4K are
// detail-focused native tiers, NOT an upscale pass. (17:9 cinema — 2048x1088,
// 4096x2176 — is a documented Lightricks option but not in our ratio set; see
// docs/builder/research/ltx-2.3-tiers.md.)
export const LTX_RATIOS = {
    very_low: [
        { label: "1:1", w: 384, h: 384, icon: "rect_1_1" },
        { label: "9:16", w: 320, h: 640, icon: "rect_9_16" },
        { label: "16:9", w: 640, h: 320, icon: "rect_16_9" }
    ],
    low: [
        { label: "1:1", w: 448, h: 448, icon: "rect_1_1" },
        { label: "9:16", w: 448, h: 768, icon: "rect_9_16" },
        { label: "16:9", w: 768, h: 448, icon: "rect_16_9" }
    ],
    medium: [
        { label: "1:1", w: 512, h: 512, icon: "rect_1_1" },
        { label: "9:16", w: 512, h: 960, icon: "rect_9_16" },
        { label: "16:9", w: 960, h: 512, icon: "rect_16_9" }
    ],
    high: [
        { label: "1:1", w: 704, h: 704, icon: "rect_1_1" },
        { label: "9:16", w: 704, h: 1216, icon: "rect_9_16" },
        { label: "16:9", w: 1216, h: 704, icon: "rect_16_9" }
    ],
    very_high: [
        { label: "1:1", w: 1088, h: 1088, icon: "rect_1_1" },
        { label: "9:16", w: 1088, h: 1920, icon: "rect_9_16" },
        { label: "16:9", w: 1920, h: 1088, icon: "rect_16_9" }
    ],
    '2k': [
        { label: "1:1", w: 1472, h: 1472, icon: "rect_1_1" },
        { label: "9:16", w: 1472, h: 2560, icon: "rect_9_16" },
        { label: "16:9", w: 2560, h: 1472, icon: "rect_16_9" }
    ],
    '4k': [
        { label: "1:1", w: 2176, h: 2176, icon: "rect_1_1" },
        { label: "9:16", w: 2176, h: 3840, icon: "rect_9_16" },
        { label: "16:9", w: 3840, h: 2176, icon: "rect_16_9" }
    ]
};

// Ratios for social media image and video
export const SOCIAL_RATIOS = [
    { label: "1:1", ratio: 1 / 1, icon: "rect_1_1" },
    { label: "4:5", ratio: 4 / 5, icon: "rect_4_5" },
    { label: "5:4", ratio: 5 / 4, icon: "rect_5_4" },
    { label: "16:9", ratio: 16 / 9, icon: "rect_16_9" },
    { label: "9:16", ratio: 9 / 16, icon: "rect_9_16" }
];

// ── UI Mode Mapping ────────────────────────────────────────────────────────

// Maps model.type → which UI mode MpiRatioSelector should use.
// 'orientation' = portrait/landscape toggle. 'quality' = quality-tier radio.
// Augmented below with types whose ModelDef declares ratios/qualityTiers (MPI-174).
export const RATIO_MODES = {
    flux:  'orientation',
    sdxl:  'orientation',
    wan:   'quality',
    wan5b: 'quality',
    ltx:   'quality',
};

// ── Model-declared behavior (MPI-174) ───────────────────────────────────────
//
// A NEW model.type can declare its `ratios` table + `qualityTiers` list on its
// ModelDef in js/data/modelConstants/models.js instead of editing this file,
// MpiOptionSelector, and projectMigrations. Built-in types above stay in the
// hardcoded tables; declared fields only fill types unknown to them.

// Quality-tier lists per built-in model family (MPI-133): LTX adds native 2K/4K
// broadcast tiers that Wan must NOT gain. wan5b is 720p-only → just 3 tiers.
const BUILTIN_QUALITY_TIERS = {
    wan: ['very_low', 'low', 'medium', 'high', 'very_high'],
    wan5b: ['low', 'medium', 'high'],
    ltx: ['very_low', 'low', 'medium', 'high', 'very_high', '2k', '4k'],
};

const DECLARED_RATIOS_BY_TYPE = {};
const DECLARED_TIERS_BY_TYPE = {};
for (const m of MODELS) {
    const t = m.type?.toLowerCase();
    if (!t) continue;
    if (m.ratios && !DECLARED_RATIOS_BY_TYPE[t]) DECLARED_RATIOS_BY_TYPE[t] = m.ratios;
    if (m.qualityTiers && !DECLARED_TIERS_BY_TYPE[t]) DECLARED_TIERS_BY_TYPE[t] = m.qualityTiers;
    if (!(t in RATIO_MODES) && (m.ratios || m.qualityTiers)) {
        RATIO_MODES[t] = m.qualityTiers ? 'quality' : 'orientation';
    }
}

/**
 * Ordered quality-tier ids for a model type. Declared ModelDef.qualityTiers
 * wins, then the built-in family table, then the 5-tier wan base — same
 * fallback the old per-consumer copies used, so unknown types keep behaving
 * identically.
 * @param {string} modelType
 * @returns {string[]}
 */
export function qualityTiersFor(modelType) {
    const t = String(modelType || '').toLowerCase();
    return DECLARED_TIERS_BY_TYPE[t] ?? BUILTIN_QUALITY_TIERS[t] ?? BUILTIN_QUALITY_TIERS.wan;
}

// ── Derived Icon Mapping ────────────────────────────────────────────────────

/**
 * Remapped ratio icon identifiers from ICONS, converting 'ratio_*' keys to 'rect_*' keys.
 * @type {Object<string, *>}
 */
export const RATIO_ICONS = Object.keys(ICONS)
    .filter(k => k.startsWith('ratio_'))
    .reduce((acc, k) => {
        acc[k.replace('ratio_', 'rect_')] = ICONS[k];
        return acc;
    }, {});

// ── Utility Functions ──────────────────────────────────────────────────

/**
 * Retrieve aspect ratio presets for a given model type and orientation.
 *
 * For generation (t2i / i2i): modelType comes from model.type in modelRegistry.js
 *   'flux'   → FLUX_RATIOS[orientation]
 *   'sdxl'   → SDXL_RATIOS[orientation]
 *   'wan'    → WAN_RATIOS[qualityTier]
 *   'wan5b'  → WAN_5B_RATIOS[qualityTier]  (720p-only, low/medium/high)
 *   'ltx'    → LTX_RATIOS[qualityTier]
 *   others   → falls back to SDXL_RATIOS[orientation]
 *
 * For crop / social export: pass modelType = 'social' — returns SOCIAL_RATIOS (flat, no orientation).
 *
 * @param {string} modelType
 * @param {'portrait'|'landscape'} [orientation]
 * @param {'very_low'|'low'|'medium'|'high'|'very_high'} [qualityTier='medium']
 * @returns {Array}
 */
export function getModelRatios(modelType, orientation, qualityTier = 'medium') {
    const type = modelType?.toLowerCase();
    const declared = DECLARED_RATIOS_BY_TYPE[type];
    if (declared) {
        const key = RATIO_MODES[type] === 'quality' ? qualityTier : orientation;
        // Unknown key → first table entry (declared tables carry their own default order).
        return declared[key] ?? declared[Object.keys(declared)[0]];
    }
    switch (type) {
        case 'flux': return FLUX_RATIOS[orientation] ?? FLUX_RATIOS.portrait;
        case 'social': return SOCIAL_RATIOS;
        case 'wan': return WAN_RATIOS[qualityTier] ?? WAN_RATIOS.medium;
        case 'wan5b': return WAN_5B_RATIOS[qualityTier] ?? WAN_5B_RATIOS.medium;
        case 'ltx': return LTX_RATIOS[qualityTier] ?? LTX_RATIOS.medium;
        case 'sdxl':
        default: return SDXL_RATIOS[orientation] ?? SDXL_RATIOS.portrait;
    }
}

/**
 * Identifies the best-fit preset ratio from a provided list based on dimensions.
 * @param {number} width - The width value.
 * @param {number} height - The height value.
 * @param {Array} ratioList - Array of objects with .ratio or .w/.h properties.
 * @returns {Object|null} The closest matching ratio object, or null if inputs are invalid.
 */
export function findClosestRatio(width, height, ratioList) {
    if (!width || !height || !ratioList || ratioList.length === 0) return null;
    const target = width / height;
    let closest = ratioList[0];
    let minDiff = Infinity;

    ratioList.forEach(r => {
        const val = r.ratio || (r.w / r.h);
        const diff = Math.abs(target - val);
        if (diff < minDiff) {
            minDiff = diff;
            closest = r;
        }
    });

    return closest;
}
