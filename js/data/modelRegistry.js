/**
 * modelRegistry.js — Source of truth for all generative models.
 *
 * Each model declares:
 *   - Which media type it produces (image / video)
 *   - Which operations it supports (must match keys in commandRegistry.js)
 *   - Which ComfyUI workflow file handles each operation
 *   - All dependencies (checkpoints, loras, custom nodes, etc.) needed to run
 *
 * The `installed` flag is resolved at runtime by the server checking disk.
 * Do not hardcode it as true here.
 *
 * Adding a new model: add an entry to MODELS, add its workflow .json files
 * to the workflows folder. Nothing else needs changing.
 */

'use strict';

// ── Path Config ───────────────────────────────────────────────────────────────

export const PATHS = Object.freeze({
    models: 'engine/ComfyUI_windows_portable/ComfyUI/models',
    customNodes: 'engine/ComfyUI_windows_portable/ComfyUI/custom_nodes',
    workflows: 'comfy_workflows',
});

// ── Shared Dependencies ───────────────────────────────────────────────────────
// Defined once, referenced by id in model dependency lists to avoid repetition.

const DEPS = {
    // Models
    'lustify-7': {
        id: 'lustify-7',
        name: 'Lustify V7 (SDXL)',
        type: 'checkpoint',
        filename: 'checkpoints/SDXL/lustify_7.safetensors',
        url: 'https://huggingface.co/Kutches/XL/resolve/main/lustifySDXLNSFW_ggwpV7.safetensors',
        size: '6.94GB',
        vram: '8GB',
    },
    'sdxl-refiner-1.0': {
        id: 'sdxl-refiner-1.0',
        name: 'SDXL Refiner 1.0',
        type: 'checkpoint',
        filename: 'checkpoints/SDXL/sd_xl_refiner_1.0_0.9vae.safetensors',
        url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0_0.9vae.safetensors',
        size: '6.08GB',
        vram: '8GB',
    },
    // Loras
    'spo-sdxl-lora': {
        id: 'spo-sdxl-lora',
        name: 'SPO SDXL 10ep Lora',
        type: 'lora',
        filename: 'loras/SDXL/spo_sdxl_10ep_4k-data_lora_webui.safetensors',
        url: 'https://huggingface.co/LyliaEngine/spo_sdxl_10ep_4k-data_lora_webui/resolve/main/spo_sdxl_10ep_4k-data_lora_webui.safetensors',
        size: '364MB',
    },
    'sdxl-lightning-lora': {
        id: 'sdxl-lightning-lora',
        name: 'SDXL Lightning 4-step Lora',
        type: 'lora',
        filename: 'loras/SDXL/sdxl_lightning_4step_lora.safetensors',
        url: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_4step_lora.safetensors',
        size: '385MB',
    },
    // Upscale Models
    '4x-NMKD-Siax': {
        id: '4x-NMKD-Siax',
        name: '4x NMKD-Siax 200k',
        type: 'upscale_model',
        filename: 'upscale_models/4x_NMKD-Siax_200k.pth',
        url: 'https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x_NMKD-Siax_200k.pth',
        size: '67MB',
    },
    // Nodes
    'ComfyUI-MpiNodes': {
        id: 'ComfyUI-MpiNodes',
        name: 'ComfyUI-MpiNodes',
        type: 'custom_nodes',
        filename: 'ComfyUI-MpiNodes',
        url: 'https://github.com/MadPonyInteractive/ComfyUi-MpiNodes',
        installRequirements: false,
        size: '1.76MB',
    },
    'ComfyUI-Impact-Pack': {
        id: 'ComfyUI-Impact-Pack',
        name: 'ComfyUI Impact Pack',
        type: 'custom_nodes',
        filename: 'comfyui-impact-pack',
        url: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack',
        installRequirements: true,
        size: '5MB',
    },
    'ComfyUI-UltimateSDUpscale': {
        id: 'ComfyUI-UltimateSDUpscale',
        name: 'ComfyUI Ultimate SD Upscale',
        type: 'custom_nodes',
        filename: 'comfyui_ultimatesdupscale',
        url: 'https://github.com/ssitu/ComfyUI_UltimateSDUpscale',
        installRequirements: false,
        size: '940KB',
    },
    // Auto Masking — nodes and detection models used by img_auto_mask workflow
    'ComfyUI-Impact-Subpack': {
        id: 'ComfyUI-Impact-Subpack',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'ComfyUI-Impact-Subpack',
        url: 'https://github.com/ltdrdata/ComfyUI-Impact-Subpack',
        installRequirements: true,
        size: '172KB',
    },
    'face-yolov8n': {
        id: 'face-yolov8n',
        name: 'face_yolov8n.pt',
        type: 'ultralytics',
        filename: 'ultralytics/bbox/face_yolov8n.pt',
        url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8n.pt',
        size: '5.9MB',
    },
    'hand-yolov8n': {
        id: 'hand-yolov8n',
        name: 'hand_yolov8n.pt',
        type: 'ultralytics',
        filename: 'ultralytics/bbox/hand_yolov8n.pt',
        url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/hand_yolov8n.pt',
        size: '5.9MB',
    },
    'person-yolov8n-seg': {
        id: 'person-yolov8n-seg',
        name: 'person_yolov8n-seg.pt',
        type: 'ultralytics',
        filename: 'ultralytics/bbox/person_yolov8n-seg.pt',
        url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8n-seg.pt',
        size: '6.9MB',
    },
    'sam-vit-b': {
        id: 'sam-vit-b',
        name: 'SAM ViT-B',
        type: 'sams',
        filename: 'sams/sam_vit_b_01ec64.pth',
        url: 'https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/sams/sam_vit_b_01ec64.pth',
        size: '367MB',
    },
};

// ── Model Definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ModelDef
 * @property {string}   id           - Unique identifier
 * @property {string}   name         - Display name
 * @property {'image'|'video'} mediaType
 * @property {string[]} supportedOps - Operation keys from commandRegistry.js
 * @property {Record<string,string>} workflows - op key → workflow filename
 * @property {string[]} dependencies - Dep ids from DEPS above
 * @property {boolean}  installed    - Resolved at runtime; always false here
 */

/** @type {ModelDef[]} */
export const MODELS = [
    {
        id: 'sdxl-lustify',
        name: 'SDXL Lustify V7',
        mediaType: 'image',
        installed: false,
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        description: 'A NSFW SDXL-based workflow using the Lustify V7 for fast generations and the official SDXL Refiner for higher quality images.',
        workflows: {
            t2i: 'sdxl_t2i_nsfw.json',
            upscale: 'sdxl_upscaler.json',
            detail: 'sdxl_detailer.json',
        },
        dependencies: [
            'lustify-7',
            'sdxl-refiner-1.0',
            'spo-sdxl-lora',
            'sdxl-lightning-lora',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },

    // ── Add new models here ───────────────────────────────────────────────────
    // {
    //     id: 'wan-21',
    //     name: 'Wan 2.1',
    //     mediaType: 'video',
    //     installed: false,
    //     type: 'wan',
    //     supportedOps: ['t2v', 'i2v', 'extend'],
    //     workflows: {
    //         t2v: 'wan21_t2v.json',
    //         i2v: 'wan21_i2v.json',
    //         extend: null,
    //     },
    //     dependencies: [ ... ],
    // },
];

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
 * @property {boolean}  installed    - Resolved at runtime; always false here
 */

/** @type {Record<string, UniversalWorkflowDef>} */
export const UNIVERSAL_WORKFLOWS = {
    interpolate: {
        workflow: 'video_interpolate.json',
        dependencies: [],   // TODO: add interpolation model dep when workflow is ready
        installed: false,
    },
    videoUpscale: {
        workflow: 'video_upscale.json',
        dependencies: [],   // TODO: add video upscale model dep when workflow is ready
        installed: false,
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
        installed: false,
    },
};

// ── Runtime Installed Sync ────────────────────────────────────────────────────

/**
 * Fetches disk-presence status for all models from the server and patches
 * the `installed` flag on each entry in MODELS in-place.
 *
 * Sends pre-resolved dep filenames so the server only needs to stat paths —
 * modelRegistry.js remains the single source of truth for all model data.
 *
 * @returns {Promise<boolean>} true if the sync succeeded
 */
export async function syncModelInstalled() {
    try {
        // Build payload for model-tied workflows
        const modelPayload = MODELS.map(model => ({
            id: model.id,
            deps: model.dependencies.map(depId => {
                const dep = DEPS[depId];
                return dep ? { type: dep.type, filename: dep.filename } : null;
            }).filter(Boolean),
        }));

        // Build payload for universal workflows — namespaced to avoid id collisions
        const universalPayload = Object.entries(UNIVERSAL_WORKFLOWS).map(([key, uw]) => ({
            id: `universal:${key}`,
            deps: uw.dependencies.map(depId => {
                const dep = DEPS[depId];
                return dep ? { type: dep.type, filename: dep.filename } : null;
            }).filter(Boolean),
        }));

        const res = await fetch('/comfy/models/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models: [...modelPayload, ...universalPayload] }),
        });

        if (!res.ok) return false;
        const { results } = await res.json();

        for (const model of MODELS) {
            if (Object.prototype.hasOwnProperty.call(results, model.id)) {
                model.installed = results[model.id];
            }
        }

        for (const [key, uw] of Object.entries(UNIVERSAL_WORKFLOWS)) {
            const resultKey = `universal:${key}`;
            if (Object.prototype.hasOwnProperty.call(results, resultKey)) {
                uw.installed = results[resultKey];
            }
        }

        return true;
    } catch (err) {
        console.error('[modelRegistry] syncModelInstalled failed:', err);
        return false;
    }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all models for a given media type.
 * @param {'image'|'video'} mediaType
 * @returns {ModelDef[]}
 */
export function getModelsByType(mediaType) {
    return MODELS.filter(m => m.mediaType === mediaType);
}

/**
 * Returns a model by id.
 * @param {string} id
 * @returns {ModelDef|null}
 */
export function getModelById(id) {
    return MODELS.find(m => m.id === id) ?? null;
}

/**
 * Returns the workflow filename for a model+operation pair.
 * Returns null if the operation is not yet implemented for this model.
 * @param {string} modelId
 * @param {string} operation
 * @returns {string|null}
 */
export function getWorkflowFile(modelId, operation) {
    const model = getModelById(modelId);
    return model?.workflows?.[operation] ?? null;
}

/**
 * Returns the workflow filename for a universal (non-model-tied) operation.
 * Returns null if the key does not exist in UNIVERSAL_WORKFLOWS.
 * @param {string} key - Command key (must have universal: true in commandRegistry)
 * @returns {string|null}
 */
export function getUniversalWorkflow(key) {
    return UNIVERSAL_WORKFLOWS[key]?.workflow ?? null;
}

/**
 * Resolves a dependency id to its full definition.
 * @param {string} depId
 * @returns {Object|null}
 */
export function resolveDep(depId) {
    return DEPS[depId] ?? null;
}

/**
 * Returns all resolved dependencies for a model.
 * @param {string} modelId
 * @returns {Object[]}
 */
export function getModelDependencies(modelId) {
    const model = getModelById(modelId);
    if (!model) return [];
    return model.dependencies.map(id => DEPS[id]).filter(Boolean);
}
