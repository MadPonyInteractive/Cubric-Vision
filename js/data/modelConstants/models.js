// ── Model Definitions ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} ModelDef
 * @property {string}   id           - Unique identifier
 * @property {string}   name         - Display name
 * @property {string}   [dropdownMeta] - Short UI category shown in compact model selectors
 * @property {string}   [type]       - Model family (e.g. 'sdxl', 'wan'); also the default Cubric Prompt enhancer-recipe key
 * @property {string}   [enhanceRecipe] - Explicit Cubric Prompt enhancer-recipe id, overriding `type` when they diverge (MPI-5)
 * @property {'image'|'video'} mediaType
 * @property {number}   [tier]       - Workflow node-title generation: 1 = legacy bare titles, 2 = Input_ / Output_ prefixed titles. Video models are tier 2. (NOT the size tier — see sizeTier.)
 * @property {'low'|'balanced'|'high'} [sizeTier] - Weight-size tier (MPI-168). Shown as a Low/Balanced/High badge + L/B/H marker. A model has ONE tier; siblings ship as separate cards. Absent → treated as 'balanced' by UI.
 * @property {string}   [modelFamily] - Soft grouping key for same-base-model tier variants, e.g. 'LTX-2.3' (MPI-168). Drives tier clustering + the "show L/B/H only when 2+ tiers of a family installed" rule. UI-only; no resolver effect.
 * @property {{multiStage?:boolean, audio?:boolean}} [capabilities] - Drives capability-gated UI on SHARED ops: multiStage shows the previewStage toggle; audio shows the audio media slot. Absent → both false.
 * @property {Record<string, Array<{label:string,w:number,h:number,icon:string}>>} [ratios] - Per-type ratio table (MPI-174), keyed by quality tier (quality-mode models) or 'portrait'/'landscape' (orientation-mode). First model declaring it for a NEW `type` wins; existing types (flux/sdxl/wan/wan5b/ltx) keep their built-in tables in js/utils/ratios.js — do not redeclare them here.
 * @property {string[]} [qualityTiers] - Ordered quality-tier ids for a NEW `type` (MPI-174), e.g. ['low','medium','high']. Presence ⇒ quality UI mode (tier radio); absent + `ratios` present ⇒ orientation mode. Consumed via qualityTiersFor() in js/utils/ratios.js and the v3 project migration.
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
        sizeTier: 'low',
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
        sizeTier: 'low',
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
        sizeTier: 'low',
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
        sizeTier: 'low',
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
        sizeTier: 'low',
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
    {
        // NVIDIA PiD generative upscaler — one model, 4 VAE-locked paths picked at
        // runtime via the pidVariant control (Input_Type switch). Prompt-box driven
        // (needs an image + optional prompt). Only op = `pid`. Research + decisions:
        // docs/builder/research/pid-upscaler.md.
        id: 'nvidia-pid',
        sizeTier: 'low',
        name: 'NVIDIA PiD Upscaler',
        dropdownMeta: 'UPSCALE',
        mediaType: 'image',
        image: 'sdxl-real-01.webp',
        type: 'pid',
        // Reuse the sdxl prompt-enhance recipe — PiD has no 'pid' recipe in Cubric
        // Prompt, and the prompt is optional guidance for an image upscale (§6 sweep).
        enhanceRecipe: 'sdxl',
        // No model-settings gear: PiD takes no upscale model and no LoRAs.
        showSettings: false,
        supportedOps: ['pid'],
        gen_speed: 'fast',
        description: 'NVIDIA PiD generative 4x upscaler. Pick a model per look (Flux/SD3/Qwen/SDXL) and drive detail with the denoise slider.',
        workflows: {
            pid: 'NVIDIA_PID.json',
        },
        dependencies: [
            'pid-flux1', 'pid-sdxl', 'pid-sd3', 'pid-qwenimage',
            'vae-flux-ae', 'vae-sdxl', 'vae-sd3', 'vae-qwen-image',
            'pid-gemma',
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',
        ],
    },
    // ── Video Models ───────────────────────────────────────────────────
    {
        id: 'wan-22',
        sizeTier: 'balanced',
        modelFamily: 'Wan-2.2',
        name: 'Wan 2.2 Smooth',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        tier: 2,
        // branchingContinue: per-stage LoRAs vary the stage-2 result, so WAN
        // previews expose Continue (branch a new card) + Finish. LTX omits it
        // (no per-stage LoRA variance → Finish-only). See commandRegistry
        // commandAllowsBranchingContinue.
        // motion: WAN's i2v workflow has an Input_Motion_Intensity node, so the
        // motion control is live. LTX has no such node → omits motion → the
        // MpiPromptBox motionIntensity control is hidden for it.
        capabilities: { multiStage: true, audio: false, branchingContinue: true, motion: true },
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
        sizeTier: 'balanced',
        modelFamily: 'LTX-2.3',
        name: 'LTX 2.3',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        tier: 2,
        // MPI-128: dual-latent (video+audio) stage-2 staging wired, so the
        // previewStage toggle + preview→Finish are unlocked. multiStage:true shows
        // the toggle on the shared _ms ops. NO branchingContinue → Finish-only
        // (Continue button hidden): the refined LTX workflow locks stage-2 to
        // stage-1 and the prompt has no effect on the continuation, so a re-prompted
        // branch is meaningless. audio:true surfaces the audio media slot + the
        // Reference|Original mode UI.
        capabilities: { multiStage: true, audio: true },
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
        // bf16-local / GGUF-Pod split: the `workflows` above name the bf16 files
        // (local default). The `engines:` block below carries each engine's
        // workflowSuffix — remote runs resolve `LTX_t2v.json → LTX_t2v_gguf.json`
        // (applied AFTER any _stage2 suffix → ..._stage2_gguf.json) via
        // resolveWorkflowFile(). GGUF wins ONLY on a Pod — it sidesteps the aimdo
        // cold tax; locally bf16 is faster per-step at high res. (MPI-165)
        // FLAT model: one transformer serves both t2v and i2v, so there is no
        // separable install unit — both ops ship together (like an image model).
        // `dependencies` (not commonDeps/operations) ⇒ no per-op install toggle in
        // the manager; install once, both ops work. When a future op needs its OWN
        // weights, split it into operations{} then and a toggle appears.
        // First model with non-merged baked LoRAs (transition/soft/talkvid) shipped
        // as deps, NOT user slots — see [[project-ltx-transition-lora-enables-lipsync]].
        //
        // ENGINE SPLIT (MPI-163, consolidated MPI-165): shared deps in `dependencies`;
        // engine-only weights in the `engines:` block below. The resolver adds the
        // engine-correct extraDeps at resolution time, so EVERY consumer (download,
        // status gate, prompt box) derives the right set — no per-dep `engine` tag to
        // forget to filter.
        // The Gemma CLIP (fp4_mixed) is SHARED across engines — NOT split — so it
        // lives here, not in the engines block. Only the transformer is engine-split
        // (bf16 local / Q8 GGUF Pod). The baked LoRA is the merged
        // soft+abliterated+detailer file. (MPI-168)
        dependencies: [
            'ltx23-video-vae',
            'ltx23-audio-vae',
            'ltx23-text-projection',
            'ltx23-gemma-clip',
            'ltx23-spatial-upscaler',
            'ltx23-lora-merged',
            'ltx23-lora-transition',
            'ltx23-lora-talkvid',
            'ComfyUI-LTXVideo',
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',
        ],
        // ENGINE axis (MPI-165) — ONE block. Each engine declares its extra deps +
        // the workflow-filename suffix the build script (generate_ltx.py) emits.
        // resolveModelDeps.js reads this for BOTH dep resolution (extraDeps) and
        // workflow selection (workflowSuffix). local: bf16 transformer (faster
        // per-step at high res), no suffix → the bf16 files verbatim. remote: the Q8
        // GGUF transformer (sidesteps the aimdo cold tax) + the ComfyUI-GGUF node that
        // loads it (Pod-only — no local use); '_gguf' suffix, applied AFTER any
        // _stage2 → ..._stage2_gguf.json.
        engines: {
            local:  { extraDeps: ['ltx23-transformer-bf16'],                  workflowSuffix: '' },
            remote: { extraDeps: ['ltx23-transformer-gguf', 'ComfyUI-GGUF'],  workflowSuffix: '_gguf' },
        },
    },
    {
        id: 'wan22-5b',
        sizeTier: 'low',
        modelFamily: 'Wan-2.2',
        name: 'Wan 2.2 5B',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        tier: 1,
        // Wan 2.2 TI2V-5B: one small transformer serves BOTH t2v + i2v (combined,
        // LTX-shape). SINGLE-STAGE (no ×2 upscaler stage) → multiStage:false, so no
        // previewStage/Continue. audio:false (no audio). NO branchingContinue →
        // Finish-only. motion NOT set: the 5B workflow has no Input_Motion_Intensity
        // node, so the motionIntensity control stays hidden (unlike wan-22 14B).
        capabilities: { multiStage: false, audio: false },
        // No preview clip yet — do NOT reuse wan22_preview.mp4 (14B footage). Add a
        // real 5B clip later, then set `video:`.
        type: 'wan5b',
        // Ships the quanhaol 4-step Turbo distill as a MODEL-ONLY LoRA (str 0.8,
        // baked in the workflow). No high/low staging (5B is dense, not MoE) → no
        // loraStages; user LoRA slots are flat model-strength only.
        loraStrengths: ['model'],
        // Reuse the wan enhance recipe (Cubric Prompt has no 'wan5b' recipe).
        enhanceRecipe: 'wan',
        // SINGLE-STAGE ops (t2v/i2v, NOT the multi-stage t2v_ms/i2v_ms) — matches
        // capabilities.multiStage:false. First video model to use the non-_ms ops.
        supportedOps: ['t2v', 'i2v'],
        gen_speed: 'fast',
        description: 'Wan 2.2 5B (TI2V) — fast, low-tier text-to-video and image-to-video in one compact model. Draft-speed via the 4-step Turbo distill.',
        // Combined transformer: both ops ship together (LTX pattern). generate_wan5b.py
        // bakes Input_Text_to_video from the template into the two runtime files.
        workflows: {
            t2v: 'Wan5B_t2v.json',
            i2v: 'Wan5B_i2v.json',
        },
        // FLAT deps (like LTX) — no per-op install toggle. clip (umt5) is SHARED with
        // the 14B card (already hosted); vae + model + turbo-lora are 5B-specific.
        dependencies: [
            'wan22-5b-model',
            'wan22-5b-turbo-lora',
            'wan2.2_vae',
            'umt5_xxl_fp8_e4m3fn_scaled',
            'ComfyUI-MpiNodes',
            'ComfyUI-VideoHelperSuite',
            'comfyui-kjnodes',
        ],
    },
];
