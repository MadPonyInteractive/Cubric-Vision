// ── Universal Workflows (not model-tied) ──────────────────────────────────────
// Available regardless of which model is active.
// Keys must match commandRegistry entries marked universal: true.
//
// Unlike MODELS these workflows never need checkpoint / lora / safetensor files —
// only custom nodes, detection models, and upscale models.
// The `installed` flag is resolved at runtime by syncModelInstalled().

/**
 * @typedef {Object} UniversalWorkflowDef
 * @property {string}   workflow     - Workflow filename in comfy_workflows/
 * @property {string[]} dependencies - Dep ids from DEPS (no checkpoints/loras)
 * @property {boolean}  installed    - Resolved at runtime by syncModelInstalled(); not set here
 */

/** @type {Record<string, UniversalWorkflowDef>} */
export const UNIVERSAL_WORKFLOWS = {
    interpolate: {
        workflow: 'video_interpolate.json',
        dependencies: [],   // TODO: add interpolation model dep when workflow is ready
    },
    videoUpscale: {
        workflow: 'video_upscale.json',
        dependencies: [],   // TODO: add video upscale model dep when workflow is ready
    },
    autoMaskImg: {
        workflow: 'img_auto_mask.json',
        dependencies: [
            'ComfyUI-Impact-Pack',
            'ComfyUI-Impact-Subpack',
            'face-yolov8n',
            'hand-yolov8n',
            'person-yolov8n-seg',
            'sam-vit-b',
        ],
    },
};