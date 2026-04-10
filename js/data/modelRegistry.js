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
    'sdxl-realistic': {
        id: 'sdxl-realistic',
        name: 'SDXL Realistic',
        type: 'checkpoint',
        origin: 'lustify_7',
        filename: 'checkpoints/SDXL/SDXL_Realistic.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/SDXL_Realistic.safetensors',
        size: '6.94GB',
        vram: '8GB',
    },
    'ill-anime': {
        id: 'ill-anime',
        name: 'ILL Anime',
        type: 'checkpoint',
        origin: 'animemix_v80',
        filename: 'checkpoints/ILL/ILL_Anime.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/ILL_Anime.safetensors',
        size: '6.8GB',
        vram: '8GB',
    },
    'ill-anime-beauty': {
        id: 'ill-anime-beauty',
        name: 'ILL Anime Beauty',
        type: 'checkpoint',
        origin: 'ramthrustsNSFWPINK_alchemyMix176',
        filename: 'checkpoints/ILL/ILL_Anime_Beauty.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/ILL_Anime_Beauty.safetensors',
        size: '6.8GB',
        vram: '8GB',
    },
    'pony-mix': {
        id: 'pony-mix',
        name: 'PONY Mix',
        type: 'checkpoint',
        origin: 'animergemeij_v30VAE',
        filename: 'checkpoints/PONY/PONY_Mix.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/PONY_Mix.safetensors',
        size: '6.8GB',
        vram: '8GB',
    },
    // Video Models
    'wan-22-t2v-high': {
        id: 'wan-22-t2v-high',
        name: 'Wan 2.2 t2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_t2vHighV30',
        filename: 'diffusion_models/Wan_22_t2v_High.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_i2v_High.safetensors',
        size: '21GB',
        vram: '12GB',
    },
    'wan-22-t2v-low': {
        id: 'wan-22-t2v-low',
        name: 'Wan 2.2 t2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_t2vLowV30',
        filename: 'diffusion_models/Wan_22_t2v_Low.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_i2v_Low.safetensors',
        size: '21GB',
        vram: '12GB',
    },
    'wan-22-i2v-high': {
        id: 'wan-22-i2v-high',
        name: 'Wan 2.2 i2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_i2vV20High',
        filename: 'diffusion_models/Wan_22_i2v_High.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_t2v_High.safetensors',
        size: '15GB',
        vram: '12GB',
    },
    'wan-22-i2v-low': {
        id: 'wan-22-i2v-low',
        name: 'Wan 2.2 i2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_i2vV20Low',
        filename: 'diffusion_models/Wan_22_i2v_Low.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_t2v_Low.safetensors',
        size: '15GB',
        vram: '12GB',
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
    'dmd2_sdxl_4step_lora': {
        id: 'dmd2_sdxl_4step_lora',
        name: 'DMD2 SDXL 4 step Lora',
        type: 'lora',
        filename: 'loras/SDXL/dmd2_sdxl_4step_lora.safetensors',
        url: 'https://huggingface.co/tianweiy/DMD2/resolve/main/dmd2_sdxl_4step_lora.safetensors',
        size: '787MB',
    },
    // video loras
    'Wan2.2-Lightning_I2V-A14B-4steps-lora_HIGH_fp16': {
        id: 'Wan22-4steps-lora-HIGH',
        name: 'Wan22-4steps-lora-HIGH',
        type: 'lora',
        filename: 'loras/Wan2.2/Wan2.2-Lightning_I2V-A14B-4steps-lora_HIGH_fp16.safetensors',
        url: 'https://huggingface.co/tianweiy/DMD2/resolve/main/dmd2_sdxl_4step_lora.safetensors',
        size: '600MB',
    },
    'Wan2.2-Lightning_I2V-A14B-4steps-lora_LOW_fp16': {
        id: 'Wan22-4steps-lora-LOW',
        name: 'Wan22-4steps-lora-LOW',
        type: 'lora',
        filename: 'loras/Wan2.2/Wan2.2-Lightning_I2V-A14B-4steps-lora_LOW_fp16.safetensors',
        url: 'https://huggingface.co/tianweiy/DMD2/resolve/main/dmd2_sdxl_4step_lora.safetensors',
        size: '600MB',
    },
    // VAE
    'wan_2.1_vae': {
        id: 'wan_2.1_vae',
        name: 'wan_2.1_vae',
        type: 'vae',
        filename: 'vae/wan_2.1_vae.safetensors',
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
        size: '254MB',
    },
    // CLIP
    'umt5_xxl_fp8_e4m3fn_scaled': {
        id: 'umt5_xxl_fp8_e4m3fn_scaled',
        name: 'umt5_xxl_fp8_e4m3fn_scaled',
        type: 'text_encoders',
        filename: 'vae/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        size: '6.27GB',
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
    'ComfyUI-PainterI2Vadvanced': {
        id: 'ComfyUI-PainterI2Vadvanced',
        name: 'ComfyUI-PainterI2Vadvanced',
        type: 'custom_nodes',
        filename: 'ComfyUI-PainterI2Vadvanced',
        url: 'https://github.com/princepainter/ComfyUI-PainterI2Vadvanced',
        installRequirements: false,
        size: '144KB',
    },
    'ComfyUI-VideoHelperSuite': {
        id: 'ComfyUI-VideoHelperSuite',
        name: 'ComfyUI-VideoHelperSuite',
        type: 'custom_nodes',
        filename: 'comfyui-videohelpersuite',
        url: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite',
        installRequirements: false,
        size: '806KB',
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
    'comfyui-kjnodes': {
        id: 'comfyui-kjnodes',
        name: 'ComfyUI KJNodes',
        type: 'custom_nodes',
        filename: 'comfyui-kjnodes',
        url: 'https://github.com/kijai/ComfyUI-KJNodes',
        installRequirements: true,
        size: '28MB',
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
// TODO: Install size on disk needs to be calculated based on each model dependecies
// TODO: VRAM comes from the highest VRAM of all model dependencies
// TODO: Consider allowing user to select model capabilities due to filesize
// ex: wan t2v is about 40GB, so is wan i2v, maybe user only wants to use i2v, 
// so user could select workflows/operations to unlock for each model
// TODO: consider upscale model working as loras, selected and injected
// TODO: Consider an workflow feature that chains multiple operations 
// with different settings and runs them in sequence, like: 
// i2v -> video_upscale -> video_interpolate -> crop video
/** @type {ModelDef[]} */
export const MODELS = [
    {
        id: 'sdxl-realistic',
        name: 'SDXL Realistic',
        mediaType: 'image',
        installed: false,
        image: 'Lustify7.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'SDXL workflows for realism using the famous Lustify model by Coyotte.',
        workflows: {
            t2i: 't2i_sdxl_realistic.json',
            upscale: 'upscaler_sdxl_realistic.json',
            detail: 'detailer_sdxl_realistic.json',
        },
        dependencies: [
            'sdxl-realistic',
            'spo-sdxl-lora',
            'dmd2_sdxl_4step_lora',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'ill-anime-beauty',
        name: 'ILL Anime Beauty',
        mediaType: 'image',
        installed: false,
        image: 'AlchemyMix176.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images with an extra shine using AlchemyMix V176.',
        workflows: {
            t2i: 't2i__ill_anime_beauty.json',
            upscale: 'upscaler__ill_anime_beauty.json',
            detail: 'detailer__ill_anime_beauty.json',
        },
        dependencies: [
            'ill-anime-beauty',
            'spo-sdxl-lora',
            'dmd2_sdxl_4step_lora',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'ill-anime',
        name: 'ILL Anime',
        mediaType: 'image',
        installed: false,
        image: 'AnimeMixV80.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images using AnimeMix V8.',
        workflows: {
            t2i: 't2i_ill_anime.json',
            upscale: 'upscaler_ill_anime.json',
            detail: 'detailer_ill_anime.json',
        },
        dependencies: [
            'ill-anime',
            'spo-sdxl-lora',
            'dmd2_sdxl_4step_lora',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'pony-mix',
        name: 'PONY Mix',
        mediaType: 'image',
        installed: false,
        image: 'AnimerJeiV30.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'PONY workflows for a mix of anime and realism using AnimerJei V3.',
        workflows: {
            t2i: 't2i_pony_mix.json',
            upscale: 'upscaler_pony_mix.json',
            detail: 'detailer_pony_mix.json',
        },
        dependencies: [
            'pony-mix',
            'spo-sdxl-lora',
            'dmd2_sdxl_4step_lora',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },

    // ── Video Models ───────────────────────────────────────────────────
    {
        id: 'wan-22',
        name: 'Wan 2.2 Smooth',
        mediaType: 'video',
        installed: false,
        type: 'wan',
        supportedOps: ['t2v', 'i2v'],
        gen_speed: 'fast',
        description: 'Wan 2.2 workflows for both anime and realism using the SmoothMix models.',
        workflows: {
            t2v: 'Wan22_t2v.json',
            i2v: 'Wan22_i2v.json',
        },
        dependencies: [
            'wan-22-t2v-high',
            'wan-22-t2v-low',
            'wan-22-i2v-high',
            'wan-22-i2v-low',
            'Wan22-4steps-lora-HIGH',
            'Wan22-4steps-lora-LOW',
            'wan_2.1_vae',
            'umt5_xxl_fp8_e4m3fn_scaled',
            'ComfyUI-MpiNodes',
            'ComfyUI-VideoHelperSuite',
            'comfyui-kjnodes',
            'ComfyUI-PainterI2Vadvanced'
        ],
    },
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
