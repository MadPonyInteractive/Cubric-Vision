// ── Model Definitions ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} ModelDef
 * @property {string}   id           - Unique identifier
 * @property {string}   name         - Display name
 * @property {string}   [dropdownMeta] - Short UI category shown in compact model selectors
 * @property {string}   [type]       - Model family (e.g. 'sdxl', 'wan'); also the default Cubric Prompt enhancer-recipe key
 * @property {string}   [enhanceRecipe] - Explicit Cubric Prompt enhancer-recipe id, overriding `type` when they diverge (MPI-5)
 * @property {'image'|'video'} mediaType
 * @property {number}   [tier]       - Workflow node-title generation: 1 = legacy bare titles, 2 = Input_ / Output_ prefixed titles. Video models are tier 2.
 * @property {{multiStage?:boolean, audio?:boolean}} [capabilities] - Drives capability-gated UI on SHARED ops: multiStage shows the previewStage toggle; audio shows the audio media slot. Absent → both false.
 * @property {string}   [image]      - Preview still filename in comfy_workflows/display/ (image models)
 * @property {string}   [video]      - Preview clip filename in comfy_workflows/display/; card plays it muted+looping on hover (video models)
 * @property {string}   [defaultUpscale]  - Dep id of the default upscale model for this model (image models only)
 * @property {string[]} supportedOps - Operation keys from commandRegistry.js
 * @property {Record<string,string>} workflows - op key → workflow filename
 * @property {string[]} [dependencies] - Flat dep ids (models whose ops are NOT separably installable). Treated as commonDeps with no operations by the resolver.
 * @property {string[]} [commonDeps] - Always-required dep ids (operations-keyed models only): VAE, encoder, shared nodes.
 * @property {Record<string,{deps:string[]}>} [operations] - Per-operation unique dep ids (operations-keyed models only). Resolved into a flat list by resolveModelDeps.js before download.
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
        image: 'sdxl-real-01.webp',
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
        image: 'sdxl-real-05.webp',
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
        image: 'sdxl-anime-08.webp',
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
        image: 'sdxl-anime-06.webp',
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
        image: 'sdxl-pony-13.webp',
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
        tier: 2,
        capabilities: { multiStage: true, audio: false },
        video: 'wan22_preview.mp4',
        type: 'wan',
        // Which LoRA strength knobs the settings UI shows for this model. Wan
        // workflows read strength_model only — strength_clip is inert — so we
        // surface just the Model slider. Omit → both (default). Future models
        // that are clip-only can set ['clip'].
        loraStrengths: ['model'],
        loraStages: [
            { key: 'high', label: 'HIGH NOISE', injectionPrefix: 'Lora_High' },
            { key: 'low', label: 'LOW NOISE', injectionPrefix: 'Lora_Low' },
        ],
        supportedOps: ['t2v_ms', 'i2v_ms'],
        gen_speed: 'fast',
        description: 'Wan 2.2 text-to-video and image-to-video, for anime and realism using the SmoothMix models.',
        workflows: {
            t2v_ms: 'Wan22_t2v.json',
            i2v_ms: 'Wan22_i2v.json',
        },
        // Always-installed shared payload (VAE, text encoder, shared custom nodes).
        commonDeps: [
            'wan_2.1_vae',
            'umt5_xxl_fp8_e4m3fn_scaled',
            'ComfyUI-MpiNodes',
            'ComfyUI-VideoHelperSuite',
            'comfyui-kjnodes',
        ],
        // Per-operation weights the user can opt in/out of. Resolved + unioned with
        // commonDeps by resolveModelDeps.js before the download lifecycle.
        operations: {
            t2v_ms: {
                deps: ['wan-22-t2v-high', 'wan-22-t2v-low'],
            },
            i2v_ms: {
                deps: ['wan-22-i2v-high', 'wan-22-i2v-low', 'ComfyUI-PainterI2Vadvanced'],
            },
        },
    },
    {
        id: 'ltx-23',
        name: 'LTX 2.3',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        tier: 2,
        // Single-stage this release: multiStage:false hides the previewStage toggle
        // on the shared _ms ops (preview→continue is carded to MPI-128). audio:true
        // surfaces the audio media slot + (Phase 5) the Reference|Original mode UI.
        capabilities: { multiStage: false, audio: true },
        // No preview clip yet — must NOT reuse wan22_preview.mp4 (that's WAN
        // footage; showing it on the LTX card misrepresents the model). Leave the
        // media slot empty until a real LTX-2.3 clip exists, then add `video:`.
        type: 'ltx',
        // LTX has 6 flat user LoRA slots (Input_Lora_1..6), no high/low staging →
        // no loraStages. Model-strength only.
        loraStrengths: ['model'],
        supportedOps: ['t2v_ms', 'i2v_ms'],
        gen_speed: 'fast',
        description: 'LTX 2.3 text-to-video and image-to-video with synchronized audio — reference-voice and direct-audio modes.',
        workflows: {
            t2v_ms: 'LTX_t2v.json',
            i2v_ms: 'LTX_i2v.json',
        },
        // FLAT model: one transformer serves both t2v and i2v, so there is no
        // separable install unit — both ops ship together (like an image model).
        // `dependencies` (not commonDeps/operations) ⇒ no per-op install toggle in
        // the manager; install once, both ops work. When a future op needs its OWN
        // weights, split it into operations{} then and a toggle appears.
        // First model with non-merged baked LoRAs (transition/soft/talkvid) shipped
        // as deps, NOT user slots — see [[project-ltx-transition-lora-enables-lipsync]].
        dependencies: [
            'ltx23-transformer',
            'ltx23-video-vae',
            'ltx23-audio-vae',
            'ltx23-text-projection',
            'ltx23-gemma-clip',
            'ltx23-spatial-upscaler',
            'ltx23-lora-soft-enhance',
            'ltx23-lora-transition',
            'ltx23-lora-talkvid',
            'ComfyUI-LTXVideo',
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',
        ],
    },
];
