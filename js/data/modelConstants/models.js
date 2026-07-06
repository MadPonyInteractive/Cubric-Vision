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
        description: 'This image generator uses the famous Juggernaut XL model as its base. It can create different styles but is best suited for realistic images.',
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
        description: 'This spicy image generator uses one of the best NSFW models available for SDXL, the famous Lustify model by Coyotte.',
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
        description: 'This image generator uses the AnimerJei V3 PONY model. It is a stylized model that can create different animation styles.',
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
        image: 'nvidia-pid.webp',
        type: 'pid',
        // Reuse the sdxl prompt-enhance recipe — PiD has no 'pid' recipe in Cubric
        // Prompt, and the prompt is optional guidance for an image upscale (§6 sweep).
        enhanceRecipe: 'sdxl',
        // No model-settings gear: PiD takes no upscale model and no LoRAs.
        showSettings: false,
        supportedOps: ['pid'],
        gen_speed: 'fast',
        description: 'NVIDIA PiD generative 4x image upscaler. This upscaler offers you 4 different models. (Flux/SD3/Qwen/SDXL) Each providing you different results. Like with any other model, you should reuse the prompt that generated the initial image or describe the image for better results. ',
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
        description: 'This video generator uses the Wan 2.2 SmoothMix models. Providing semi-realistic and stylized video generation. It can generate videos from text or images. Completely uncensored and with a spicy tendency. It creates videos at 16 fps, so it is advisable to interpolate them later.',
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
        // MPI-200: this is now the HIGH (quality-ceiling) tier — the bf16 transformer.
        // The balanced tier ships as the separate `ltx-23-balanced` card below (same
        // modelFamily), per the sizeTier contract "one tier per card". The L/B/H badge
        // + dropdown letter surface only when 2+ tiers of LTX-2.3 are installed.
        sizeTier: 'high',
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
        gen_speed: 'medium',
        description: 'This video generator is one of the best open source models available. It comes with synchronized audio — reference-voice and direct-audio modes.',
        workflows: {
            t2v_ms: 'LTX_t2v.json',
            i2v_ms: 'LTX_i2v.json',
        },
        // MPI-190: engine split REVERTED, GGUF fully removed. cu130 (MPI-187/189)
        // collapsed the aimdo cold-fault tax that was the GGUF transformer's only
        // justification, so both engines now run the SAME bf16 transformer + the SAME
        // workflow files — no `engines:` block, no `_gguf` suffix. The bf16 also removes
        // the ComfyUI-GGUF dequant upcast spike that OOM'd LTX i2v on the 24GB 4090
        // (MPI-185). bf16 i2v proven CLEAN on the 4090; the Q8 weights + GGUF deps are
        // deleted (R2 + registry).
        // FLAT model: one transformer serves both t2v and i2v, so there is no
        // separable install unit — both ops ship together (like an image model).
        // `dependencies` (not commonDeps/operations) ⇒ no per-op install toggle in
        // the manager; install once, both ops work. When a future op needs its OWN
        // weights, split it into operations{} then and a toggle appears.
        // First model with non-merged baked LoRAs (transition/soft/talkvid) shipped
        // as deps, NOT user slots — see [[project-ltx-transition-lora-enables-lipsync]].
        //
        // NO engine split (MPI-190): the bf16 transformer runs on BOTH engines now, so
        // it sits in `dependencies` with the rest — no `engines:` block. The Gemma CLIP
        // (fp4_mixed) is likewise shared. The baked LoRA is the merged
        // soft+abliterated+detailer file. (MPI-168)
        dependencies: [
            'ltx23-transformer-bf16',
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
    },
    {
        // MPI-200: LTX-2.3 BALANCED tier. Same base as `ltx-23` HIGH, but the 42GB
        // bf16 transformer is replaced by a ~24-25GB arch-gated transformer that
        // FITS 32GB — which kills the aimdo stage-2 eviction thrash MPI-197 traced
        // (bf16-never-fits → 48s@10s / 116s@20s stage boundary). Same modelFamily so
        // the two cluster under one L/B/H badge.
        id: 'ltx-23-balanced',
        sizeTier: 'balanced',
        modelFamily: 'LTX-2.3',
        name: 'LTX 2.3',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        tier: 2,
        capabilities: { multiStage: true, audio: true },
        type: 'ltx',
        loraStrengths: ['model'],
        supportedOps: ['t2v_ms', 'i2v_ms'],
        gen_speed: 'fast',
        description: 'This video generator is one of the best open source models available. It comes with synchronized audio — reference-voice and direct-audio modes. A faster tier that trades a little quality for speed and lighter VRAM use.',
        // Base filenames — the resolver appends the arch suffix from the `variants`
        // block (blackwell → `_mxfp8`, modern → `_fp8`), yielding LTX_t2v_mxfp8.json
        // etc. (all emitted by generate_ltx.py).
        workflows: {
            t2v_ms: 'LTX_t2v.json',
            i2v_ms: 'LTX_i2v.json',
        },
        // Shared deps = the High card's set MINUS the bf16 transformer. The
        // arch-specific transformer comes from the `variants.arch` block: only the
        // ONE weight matching this machine's GPU installs (mxfp8 on Blackwell,
        // fp8_scaled on Ada/Ampere/Turing). See resolveModelDeps.js § variant axis.
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
        variants: {
            arch: {
                options: {
                    blackwell: { extraDeps: ['ltx23-transformer-mxfp8'], workflowSuffix: '_mxfp8' },
                    modern:    { extraDeps: ['ltx23-transformer-fp8'],   workflowSuffix: '_fp8'   },
                },
            },
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
        description: 'This fast low-tier video generator is a lightweight version of Wan 2.2.',
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
