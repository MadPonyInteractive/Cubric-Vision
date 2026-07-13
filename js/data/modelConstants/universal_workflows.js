// ── Universal Workflows (not model-tied) ──────────────────────────────────────
// Available regardless of which model is active.
// Keys must match commandRegistry entries marked universal: true.
//
// Dependencies for universal workflows are the universal DEPS set (dependencies.js):
// every type:'custom_nodes' node + every engineAsset:true weight (MPI-222). They are
// installed automatically with the engine and are never tracked per-workflow.

/**
 * @typedef {Object} UniversalWorkflowDef
 * @property {string} workflow - Workflow filename in comfy_workflows/
 */

/** @type {Record<string, UniversalWorkflowDef>} */
export const UNIVERSAL_WORKFLOWS = {
    interpolate: {
        workflow: 'video_interpolate.json',
    },
    videoUpscale: {
        workflow: 'video_upscale.json',
    },
    imageUpscale: {
        workflow: 'image_upscale.json',
    },
    removeBackground: {
        workflow: 'remove_background.json',
    },
    autoMaskImg: {
        workflow: 'img_auto_mask.json',
    },
    resize: {
        workflow: 'resize.json',
    },
    resizeVideo: {
        workflow: 'resize_video.json',
    },
    appImageRegen: {
        workflow: 'App_sdxl_regen.json',
    },
    appSdxl4k: {
        workflow: 'App_sdxl_4k.json',
    },
    appVideoStitch: {
        workflow: 'app_video_test.json',
    },
};
