// ── Model Definitions ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} ModelDef
 * @property {string}   id           - Unique identifier
 * @property {string}   name         - Display name
 * @property {string}   [dropdownMeta] - Short UI category shown in compact model selectors
 * @property {'image'|'video'} mediaType
 * @property {string}   [defaultUpscale]  - Dep id of the default upscale model for this model (image models only)
 * @property {string[]} supportedOps - Operation keys from commandRegistry.js
 * @property {Record<string,string>} workflows - op key → workflow filename
 * @property {string[]} dependencies - Dep ids from DEPS above
 * @property {boolean}  installed    - Resolved at runtime by syncModelInstalled(); not set here
 */

/** @type {ModelDef[]} */
export const MODELS = [
    {
        id: 'sdxl-realistic',
        name: 'SDXL Realistic',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        defaultUpscale: '4x-NMKD-Siax',
        image: 'Lustify7.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'SDXL workflows for realism using the famous Juggernaut XL model.',
        workflows: {
            t2i: 't2i_sdxl_realistic.json',
            upscale: 'upscaler_sdxl_realistic.json',
            detail: 'detailer_sdxl_realistic.json',
        },
        dependencies: [
            'sdxl-realistic',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'sdxl-nsfw',
        name: 'SDXL NSFW',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        defaultUpscale: '4x-NMKD-Siax',
        image: 'Lustify7.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'SDXL workflows for nsfw content using the famous Lustify model by Coyotte.',
        workflows: {
            t2i: 't2i_sdxl_nsfw.json',
            upscale: 'upscaler_sdxl_nsfw.json',
            detail: 'detailer_sdxl_nsfw.json',
        },
        dependencies: [
            'sdxl-nsfw',
            '4x-NMKD-Siax',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'ill-anime-beauty',
        name: 'ILL Anime Beauty',
        dropdownMeta: 'ANIME',
        mediaType: 'image',
        defaultUpscale: '4x-AnimeSharp',
        image: 'AlchemyMix176.png',
        type: 'sdxl',
        supportedOps: ['t2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images with an extra shine using AlchemyMix V176.',
        workflows: {
            t2i: 't2i_ill_anime_beauty.json',
            upscale: 'upscaler_ill_anime_beauty.json',
            detail: 'detailer_ill_anime_beauty.json',
        },
        dependencies: [
            'ill-anime-beauty',
            '4x-AnimeSharp',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'ill-anime',
        name: 'ILL Anime',
        dropdownMeta: 'ANIME',
        mediaType: 'image',
        defaultUpscale: '4x-AnimeSharp',
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
            '4x-AnimeSharp',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        id: 'pony-mix',
        name: 'PONY Mix',
        dropdownMeta: 'STYLIZED',
        mediaType: 'image',
        defaultUpscale: '4x-AnimeSharp',
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
            '4x-AnimeSharp',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    // ── Video Models ───────────────────────────────────────────────────
    {
        id: 'wan-22',
        name: 'Wan 2.2 Smooth',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        type: 'wan',
        loraStages: [
            { key: 'high', label: 'HIGH NOISE', injectionPrefix: 'Lora_High' },
            { key: 'low', label: 'LOW NOISE', injectionPrefix: 'Lora_Low' },
        ],
        supportedOps: ['t2v_ms', 'i2v_ms'],
        gen_speed: 'fast',
        description: 'Wan 2.2 workflows for both anime and realism using the SmoothMix models.',
        workflows: {
            t2v_ms: 'Wan22_t2v.json',
            i2v_ms: 'Wan22_i2v.json',
        },
        dependencies: [
            'wan-22-t2v-high',
            'wan-22-t2v-low',
            'wan-22-i2v-high',
            'wan-22-i2v-low',
            'wan_2.1_vae',
            'umt5_xxl_fp8_e4m3fn_scaled',
            'ComfyUI-MpiNodes',
            'ComfyUI-VideoHelperSuite',
            'comfyui-kjnodes',
            'ComfyUI-PainterI2Vadvanced'
        ],
    },
];
