/**
 * ratios.js — Shared Aspect Ratio Configuration Module
 * 
 * Centralized store for model-specific aspect ratios.
 *
 * RULES FOR AGENTS:
 * - Do NOT hardcode aspect ratios in individual tool files.
 * - This is the source of thruth for all app ratios
 */

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

export const VIDEO_RATIOS = [
    { label: "16:9", ratio: 16 / 9, icon: "rect_16_9" },
    { label: "9:16", ratio: 9 / 16, icon: "rect_9_16" },
    { label: "1:1", ratio: 1 / 1, icon: "rect_1_1" }
];

