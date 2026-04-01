/**
 * LEGACY - still used / needs refactoring
 * ratioUtils.js — Shared Aspect Ratio Configuration Module
 * 
 * Centralized store for model-specific aspect ratios (FLUX vs SDXL) and their 
 * corresponding SVG rect icons.
 *
 * RULES FOR AGENTS:
 * - Do NOT hardcode aspect ratios in individual tool files.
 * - Always use `getModelRatios(modelType, orientation)` to fetch the correct array.
 * - `modelType` should be sourced from `dev_configs/comfy_workflows.json`.
 */

import { FLUX_RATIOS, SDXL_RATIOS, VIDEO_RATIOS } from './components/Compounds/MpiRatioSelector/ratios.js';
import { ICONS } from './components/Primitives/MpiIcon/MpiIcon.js';

export { FLUX_RATIOS, SDXL_RATIOS, VIDEO_RATIOS };

export const RATIO_ICONS = Object.keys(ICONS)
    .filter(k => k.startsWith('ratio_'))
    .reduce((acc, k) => {
        acc[k.replace('ratio_', 'rect_')] = ICONS[k];
        return acc;
    }, {});

export function getModelRatios(modelType, orientation) {
    if (modelType?.toLowerCase() === 'video') return VIDEO_RATIOS;
    const isFlux = modelType?.toLowerCase() === 'flux';
    return isFlux ? FLUX_RATIOS[orientation] : SDXL_RATIOS[orientation];
}

/**
 * findClosestRatio
 * Identifies the best-fit preset ratio from a provided list based on dimensions.
 * @param {number} width 
 * @param {number} height 
 * @param {Array} ratioList - Array of objects with .ratio or .w/.h properties
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
