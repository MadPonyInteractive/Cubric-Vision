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

export const WAN_RATIOS = {
    very_low: [
        { label: "1:1", w: 320, h: 320, icon: "rect_1_1" },
        { label: "9:16", w: 176, h: 320, icon: "rect_9_16" },
        { label: "16:9", w: 320, h: 176, icon: "rect_16_9" }
    ],
    low: [
        { label: "1:1", w: 624, h: 624, icon: "rect_1_1" },
        { label: "9:16", w: 368, h: 640, icon: "rect_9_16" },
        { label: "16:9", w: 640, h: 368, icon: "rect_16_9" }
    ],
    medium: [
        { label: "1:1", w: 720, h: 720, icon: "rect_1_1" },
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
};// Future reference [4:3 = 1088x832 | 704x544]

// LTX 2.3 video. Sizes are multiples of 64 (NOT just 32): the multi-stage
// pipeline downscales x0.5 then upscales x2, so a value must stay on the /32
// latent grid AFTER halving -> /64 at the input. /32 sizes like 736 silently
// collapse (736 -> 704). 9:16 is exact only where the short edge is /576
// (medium 576x1024, the 1088x1920 case); other tiers drift ~2-4% and would
// need a crop for pixel-exact 9:16. Tiers map motion, not just detail: motion
// peaks at low (~448) and decays as resolution climbs, while audio coherence
// improves with size. 2K/4K dropped — motion dies and needs upscalers (TODO).
export const LTX_RATIOS = {
    very_low: [
        { label: "1:1", w: 384, h: 384, icon: "rect_1_1" },
        { label: "9:16", w: 384, h: 640, icon: "rect_9_16" },
        { label: "16:9", w: 640, h: 384, icon: "rect_16_9" }
    ],
    low: [
        { label: "1:1", w: 448, h: 448, icon: "rect_1_1" },
        { label: "9:16", w: 448, h: 768, icon: "rect_9_16" },
        { label: "16:9", w: 768, h: 448, icon: "rect_16_9" }
    ],
    medium: [
        { label: "1:1", w: 640, h: 640, icon: "rect_1_1" },
        { label: "9:16", w: 576, h: 1024, icon: "rect_9_16" },
        { label: "16:9", w: 1024, h: 576, icon: "rect_16_9" }
    ],
    high: [
        { label: "1:1", w: 704, h: 704, icon: "rect_1_1" },
        { label: "9:16", w: 704, h: 1280, icon: "rect_9_16" },
        { label: "16:9", w: 1280, h: 704, icon: "rect_16_9" }
    ],
    very_high: [
        { label: "1:1", w: 1088, h: 1088, icon: "rect_1_1" },
        { label: "9:16", w: 1088, h: 1920, icon: "rect_9_16" },
        { label: "16:9", w: 1920, h: 1088, icon: "rect_16_9" }
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
export const RATIO_MODES = {
    flux: 'orientation',
    sdxl: 'orientation',
    wan:  'quality',
    ltx:  'quality',
};

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
    switch (modelType?.toLowerCase()) {
        case 'flux': return FLUX_RATIOS[orientation] ?? FLUX_RATIOS.portrait;
        case 'social': return SOCIAL_RATIOS;
        case 'wan': return WAN_RATIOS[qualityTier] ?? WAN_RATIOS.medium;
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
