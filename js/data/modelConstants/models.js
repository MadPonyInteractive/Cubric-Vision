// ── Model Definitions ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} ModelDef
 * @property {string}   id           - Unique identifier
 * @property {string}   name         - Display name
 * @property {string}   [dropdownMeta] - Short UI category shown in compact model selectors
 * @property {string}   [type]       - Model family (e.g. 'sdxl', 'wan'); also the default Cubric Prompt enhancer-recipe key
 * @property {string}   [enhanceRecipe] - Explicit Cubric Prompt enhancer-recipe id, overriding `type` when they diverge (MPI-5)
 * @property {'image'|'video'} mediaType
 * @property {'low'|'balanced'|'high'} [sizeTier] - Weight-size tier (MPI-168). Shown as a Low/Balanced/High badge + L/B/H marker. A model has ONE tier; siblings ship as separate cards. Absent → treated as 'balanced' by UI.
 * @property {string}   [modelFamily] - Soft grouping key for same-base-model tier variants, e.g. 'LTX-2.3' (MPI-168). Drives tier clustering + the "show L/B/H only when 2+ tiers of a family installed" rule. UI-only; no resolver effect.
 * @property {boolean}  [featured]   - Editorial spotlight flag for the Model Library ("hot / new / best right now"). Featured models sort FIRST within their sub-grid (stable) and carry a gold sparkle star badge. Purely a curation signal — set as many as you like, add/remove freely; no cap, no resolver effect. Consumed only by MpiModelManager (sort + `.mpi-tile__featured` badge).
 * @property {{multiStage?:boolean, audio?:boolean, negativePrompt?:boolean, styleLoras?:boolean, promptEnhance?:boolean}} [capabilities] - Drives capability-gated UI on SHARED ops: multiStage shows the previewStage toggle; audio shows the audio media slot; styleLoras shows the style dropdown + Stylization slider; promptEnhance shows the enhance toggle. Absent → false. EXCEPTION: negativePrompt defaults to TRUE when absent (a model supports negatives unless it opts out) — set `negativePrompt: false` for distilled cfg-1.0 models (Krea2-Turbo) where the negative prompt has no effect and NAG cannot rescue it. Hides the prompt box's positive/negative toggle; the stored negativePrompt value is still persisted. `promptEnhance` requires a text encoder whose CLIP implements `.generate()` (Qwen3-VL, Gemma) — T5/umT5 models (Chroma, Wan) CRASH on the TextGenerate node, so never set it there.
 * @property {string[]} [styleLoraLabels] - Style-LoRA display names, index-aligned with the workflow's MpiMath gates and MpiPromptList trigger lines. Index 0 must be the no-style entry (every gate zeroed); its label is free text. Required when `capabilities.styleLoras` is true.
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
        supportedOps: ['t2i', 'i2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'This image generator uses the famous Juggernaut XL model as its base. It can create different styles but is best suited for realistic images.',
        workflows: {
            t2i: 't2i_sdxl_realistic.json',
            i2i: 't2i_sdxl_realistic.json',   // same graph; Input_Is_i2i flips the latent source
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
        supportedOps: ['t2i', 'i2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'This spicy image generator uses one of the best NSFW models available for SDXL, the famous Lustify model by Coyotte.',
        workflows: {
            t2i: 't2i_sdxl_nsfw.json',
            i2i: 't2i_sdxl_nsfw.json',   // same graph; Input_Is_i2i flips the latent source
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
        supportedOps: ['t2i', 'i2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images with an extra shine using AlchemyMix V176.',
        workflows: {
            t2i: 't2i_ill_anime_beauty.json',
            i2i: 't2i_ill_anime_beauty.json',   // same graph; Input_Is_i2i flips the latent source
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
        supportedOps: ['t2i', 'i2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images using AnimeMix V8.',
        workflows: {
            t2i: 't2i_ill_anime.json',
            i2i: 't2i_ill_anime.json',   // same graph; Input_Is_i2i flips the latent source
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
        supportedOps: ['t2i', 'i2i', 'upscale', 'detail'],
        gen_speed: 'fast',
        description: 'This image generator uses the AnimerJei V3 PONY model. It is a stylized model that can create different animation styles.',
        workflows: {
            t2i: 't2i_pony_mix.json',
            i2i: 't2i_pony_mix.json',   // same graph; Input_Is_i2i flips the latent source
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
        // Chroma (Flash) — Flux-family image model, balanced tier. Same op shape as
        // SDXL (t2i / upscale / detail); upscaler + detailer mirror the SDXL wiring.
        // Extra vs SDXL: RES4LYF custom node (ClownShark sampler + ReChromaPatcher),
        // and its LoRAs take MODEL strength only (loraStrengths: ['model']) — the
        // MpiLoraModel node has no clip input. t2i is a single-step distilled gen.
        // MPI-217.
        id: 'chroma-flash',
        sizeTier: 'balanced',
        name: 'Chroma Flash',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        defaultUpscale: '4x-NMKD-Siax',
        image: 'chroma-flash-01.webp',
        type: 'chroma',
        supportedOps: ['t2i', 'i2i', 'upscale', 'detail'],
        loraStrengths: ['model'],
        gen_speed: 'fast',
        description: 'Chroma is a high-detail Flux-family image generator. This Flash build produces images in a single step for fast, uncensored results.',
        workflows: {
            t2i: 'Chroma_t2i.json',
            i2i: 'Chroma_t2i.json',   // same graph; Input_Is_i2i flips the latent source
            upscale: 'Chroma_upscaler.json',
            detail: 'Chroma_detailer.json',
        },
        dependencies: [
            'chroma1-hd-flash',
            't5xxl-fp16',
            'vae-flux-ae',
            '4x-NMKD-Siax',
            'RES4LYF',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
        ],
    },
    {
        // Krea2 Turbo — SFW (MPI-242). Flux-lineage in ARCHITECTURE ONLY — conditioning +
        // VAE stack is Qwen. Full notes: docs/models/krea2/. The NSFW twin (krea2-turbo-nsfw)
        // ships as a SEPARATE card below: same graphs, only the diffusion weight differs,
        // and a user can install BOTH (NOT mutually-exclusive like LTX's arch variants).
        //
        // SINGLE-STAGE despite a two-pass sampler: both ClownsharKSampler_Beta passes
        // live in ONE workflow file with a direct latent hand-off. `capabilities.
        // multiStage` gates the preview/Continue UI on a shared `_ms` op — t2i/i2i are
        // NOT `_ms` (commandRegistry `isMultiStage:false`), and there is no _stage2
        // file. Setting it true would surface a preview toggle with nothing behind it.
        //
        // ONE t2i graph serves t2i + i2i + pose-reference, switched by two injected
        // booleans (Input_Is_i2i, Input_pose_reference). They COMPOSE.
        //
        // Krea2-Turbo is distilled at cfg 1.0 ⇒ NO working negative prompt, and NAG is
        // a silent no-op that doubles NFE. The t2i graph has no negative node at all
        // (ConditioningZeroOut supplies the uncond) ⇒ capabilities.negativePrompt:false.
        id: 'krea2-turbo',
        sizeTier: 'balanced',
        featured: true,
        modelFamily: 'Krea-2',
        name: 'Krea 2 Turbo',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        image: 'krea2-turbo-sfw.webp',
        defaultUpscale: '4x-NMKD-Siax',
        type: 'krea2',
        enhanceRecipe: 'flux',   // Cubric Prompt has no 'krea2' recipe
        supportedOps: ['t2i', 'i2i', 'poseReference', 'upscale', 'detail'],
        loraStrengths: ['model'],   // style LoRAs are model-only (no CLIP side)
        capabilities: { multiStage: false, audio: false, negativePrompt: false, styleLoras: true, promptEnhance: true },
        // Style-LoRA labels, INDEX-ALIGNED with the workflow's nine MpiMath gates and
        // its MpiPromptList trigger lines (index 0 = no style, so entry N here selects
        // slot N there). Declared on the ModelDef rather than hardcoded in the control,
        // so the next model with a style rack ships its own list. See playbook §9.
        styleLoraLabels: [
            'None', 'Dark Brush', 'Dot Matrix', 'Kids Drawing', 'Neon Drip',
            'Rainy Window', 'Retro Anime', 'Soft Water Color', 'Sunset Blur', 'Vintage Tarot',
            'MidJourney',
        ],
        gen_speed: 'fast',
        description: 'Krea 2 is a high-quality image generator with a distinctive photographic look. Ships ten built-in style LoRAs and a depth-guided pose reference. Renders at up to 2K.',
        workflows: {
            t2i: 'krea2_turbo_t2i_sfw.json',
            i2i: 'krea2_turbo_t2i_sfw.json',   // same graph; Input_Is_i2i flips the latent source
            poseReference: 'krea2_turbo_t2i_sfw.json',   // same graph; Input_pose_reference selects the depth-ControlNet model
            upscale: 'krea2_turbo_upscaler_sfw.json',
            detail: 'krea2_turbo_detailer_sfw.json',
        },
        // Krea2 is keyed by BOTH tier and orientation (RATIO_MODES.krea2 ===
        // 'quality-orientation'), so `1:1` means 1024² at 1k and 1472² at 2k. The
        // TABLE lives in js/utils/ratios.js as KREA2_RATIOS, beside FLUX/SDXL/WAN/LTX —
        // that file answers "what resolutions does model X offer?" for every model.
        // Only the tier LIST is declared here. See docs/models/krea2/resolution.md.
        qualityTiers: ['1k', '2k'],
        dependencies: [
            'krea2-turbo-transformer',
            'krea2-qwen3vl-clip',
            'vae-qwen-image',            // shared — already on R2, zero upload
            'krea2-lora-depth-control',
            'krea2-lora-filterbypass',   // always-on bypass node; strength baked per variant (SFW 1.0 / NSFW 0.0)
            'krea2-style-darkbrush',
            'krea2-style-dotmatrix',
            'krea2-style-kidsdrawing',
            'krea2-style-neondrip',
            'krea2-style-rainywindow',
            'krea2-style-retroanime',
            'krea2-style-softwatercolor',
            'krea2-style-sunsetblur',
            'krea2-style-vintagetarot',
            'krea2-style-midjourney',
            '4x-NMKD-Siax',
            'RES4LYF',                   // ClownsharKSampler_Beta (both stages)
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',           // ImageResizeKJv2, ResizeImageMaskNode
            'ComfyUI-Impact-Pack',       // MaskDetailerPipe, To/FromBasicPipe
            'ComfyUI-UltimateSDUpscale',
            // Both are MANDATORY even for a plain t2i run: ComfyUI validates every
            // node class before MpiIfElse picks a branch.
            'ComfyUI-Krea2-ControlNet',
            'comfyui_controlnet_aux',
        ],
    },
    {
        // Krea2 Turbo — NSFW (MPI-242). "Lustify Krea" — the famous Lustify model by
        // Coyotte, ported to Krea 2. A SEPARATE installable model from the SFW card
        // above (a user can have BOTH), sharing every graph, node, style LoRA, VAE and
        // text encoder — ONLY the diffusion weight differs. The runtime files are the
        // _nsfw twins emitted by generate_krea2.py (int8_convrot weight baked in).
        //
        // WEIGHT DTYPE: int8_convrot. INT8 tensor-core math is native in our ComfyUI
        // (0.27), so no build change — but the SPEED path is NVIDIA RTX only (Turing+
        // tensor cores). Older/non-tensor-core and non-NVIDIA GPUs fall back to a slow
        // path or won't run it; the SFW fp8_scaled card stays the broad-compat option.
        // See the `description` GPU note for the end user, and docs/models/krea2/.
        //
        // Same shape rationale as the SFW card: single-stage two-pass sampler, one graph
        // for t2i + i2i + pose-reference (Input_Is_i2i / Input_pose_reference booleans),
        // cfg 1.0 ⇒ negativePrompt:false, nine style LoRAs.
        id: 'krea2-turbo-nsfw',
        sizeTier: 'balanced',
        featured: true,
        modelFamily: 'Krea-2',
        name: 'Krea 2 Turbo NSFW',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        image: 'krea2-turbo-nsfw.webp',
        defaultUpscale: '4x-NMKD-Siax',
        type: 'krea2',
        enhanceRecipe: 'flux',   // Cubric Prompt has no 'krea2' recipe
        supportedOps: ['t2i', 'i2i', 'poseReference', 'upscale', 'detail'],
        loraStrengths: ['model'],   // style LoRAs are model-only (no CLIP side)
        capabilities: { multiStage: false, audio: false, negativePrompt: false, styleLoras: true, promptEnhance: true },
        styleLoraLabels: [
            'None', 'Dark Brush', 'Dot Matrix', 'Kids Drawing', 'Neon Drip',
            'Rainy Window', 'Retro Anime', 'Soft Water Color', 'Sunset Blur', 'Vintage Tarot',
            'MidJourney',
        ],
        gen_speed: 'fast',
        description: 'This spicy image generator uses the Lustify Krea model weights by Coyotte, built on Krea 2. It keeps the distinctive photographic look and renders at up to 2K. Uses an int8 (int8_convrot) weight: fastest on NVIDIA RTX cards (RTX 20 series and newer); older or non-NVIDIA GPUs may be slow or unsupported.',
        workflows: {
            t2i: 'krea2_turbo_t2i_nsfw.json',
            i2i: 'krea2_turbo_t2i_nsfw.json',   // same graph; Input_Is_i2i flips the latent source
            poseReference: 'krea2_turbo_t2i_nsfw.json',   // same graph; Input_pose_reference selects the depth-ControlNet model
            upscale: 'krea2_turbo_upscaler_nsfw.json',
            detail: 'krea2_turbo_detailer_nsfw.json',
        },
        qualityTiers: ['1k', '2k'],
        dependencies: [
            'krea2-turbo-transformer-nsfw',   // ONLY difference from the SFW card's deps
            'krea2-qwen3vl-clip',
            'vae-qwen-image',            // shared — already on R2, zero upload
            'krea2-lora-depth-control',
            'krea2-lora-filterbypass',   // always-on bypass node; strength baked per variant (SFW 1.0 / NSFW 0.0)
            'krea2-style-darkbrush',
            'krea2-style-dotmatrix',
            'krea2-style-kidsdrawing',
            'krea2-style-neondrip',
            'krea2-style-rainywindow',
            'krea2-style-retroanime',
            'krea2-style-softwatercolor',
            'krea2-style-sunsetblur',
            'krea2-style-vintagetarot',
            'krea2-style-midjourney',
            '4x-NMKD-Siax',
            'RES4LYF',                   // ClownsharKSampler_Beta (both stages)
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',           // ImageResizeKJv2, ResizeImageMaskNode
            'ComfyUI-Impact-Pack',       // MaskDetailerPipe, To/FromBasicPipe
            'ComfyUI-UltimateSDUpscale',
            // Both are MANDATORY even for a plain t2i run: ComfyUI validates every
            // node class before MpiIfElse picks a branch.
            'ComfyUI-Krea2-ControlNet',
            'comfyui_controlnet_aux',
        ],
    },
    {
        // NVIDIA PiD generative upscaler — one model, 4 VAE-locked paths picked at
        // runtime via the pidVariant control (Input_Type switch). Prompt-box driven
        // (needs an image + optional prompt). Only op = `pid`. Research + decisions:
        // docs/models/pid/upscaler.md.
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
    // ── Boogu-Image-Edit (MPI-257) ─────────────────────────────────────────
    // Unified 10B instruction image-edit (Apache-2.0). ONE graph, three quality
    // TIERS shipped as three sibling cards (shared modelFamily + name; the L/B/H
    // badge disambiguates). Each card installs only its tier's transformer; the
    // runtime file (generate_boogu.py) bakes the tier's UNETLoader weight + the
    // Input_Tier int that selects that tier's sampler chain. See
    // docs/playbooks/add-model/03-model-registry.md § "Multi-tier models".
    //
    // Op = the existing `edit` (image+prompt → whole-image edit, dims from source,
    // no ratio picker). `type: 'boogu'` is new → only consumer is `enhanceRecipe ??
    // type` (set below). No ratios/qualityTiers: edit has no size selector, like PiD.
    // User LoRA rack (Input_Lora_1..6) is live → settings gear shown, model-only.
    // High/Balanced run cfg 4/3.5 (negatives fire); Low is turbo cfg 1 (negatives
    // ignored, negativePrompt:false).
    {
        id: 'boogu-edit-high',
        sizeTier: 'high',
        modelFamily: 'Boogu-Image-Edit',
        name: 'Boogu Image Edit',
        dropdownMeta: 'EDIT',
        mediaType: 'image',
        image: 'boogu-edit-high.webp',
        type: 'boogu',
        enhanceRecipe: 'flux',   // Cubric Prompt has no 'boogu' recipe; keep 'boogu' out of the sweep
        supportedOps: ['edit'],
        loraStrengths: ['model'],
        capabilities: { multiStage: false, audio: false, negativePrompt: true },
        gen_speed: 'slow',
        description: 'Boogu Image Edit is a unified 10B instruction image editor (Apache-2.0). Describe the change you want and it edits the whole image while preserving the rest. The High tier uses the full bf16 weights at 30 steps for the best quality; needs the most VRAM.',
        workflows: {
            edit: 'boogu_edit_high.json',
        },
        dependencies: [
            'boogu-edit-transformer-high',
            'boogu-qwen3vl-8b-clip',
            'vae-flux-ae',            // shared — already on R2, zero upload
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',        // ResizeImageMaskNode
            'ComfyUI-Impact-Pack',    // To/FromBasicPipe
        ],
    },
    // Balanced = turbo int8_convrot (promoted from 'low'). fp8_scaled Balanced tier DROPPED
    // — dark/underexposed on Blackwell (sm_120), MPI-266. int8_convrot is Blackwell-safe,
    // faster, and higher quality than fp8_scaled on all NVIDIA (ComfyUI dev consensus). Still
    // a cfg-1 turbo (8-step) ⇒ negatives are a no-op → negativePrompt:false (unchanged).
    {
        id: 'boogu-edit-balanced',
        sizeTier: 'balanced',
        modelFamily: 'Boogu-Image-Edit',
        name: 'Boogu Image Edit',
        dropdownMeta: 'EDIT',
        mediaType: 'image',
        image: 'boogu-edit-balanced.webp',
        type: 'boogu',
        enhanceRecipe: 'flux',
        supportedOps: ['edit'],
        loraStrengths: ['model'],
        capabilities: { multiStage: false, audio: false, negativePrompt: false },
        gen_speed: 'balanced',
        description: 'Boogu Image Edit is a unified 10B instruction image editor (Apache-2.0). Describe the change you want and it edits the whole image while preserving the rest. The Balanced tier uses a distilled turbo (int8) weight at 8 steps — fast, lower VRAM, and consistent across NVIDIA GPUs. Fastest on NVIDIA RTX (Turing+); older or non-NVIDIA GPUs may be slow.',
        workflows: {
            edit: 'boogu_edit_balanced.json',
        },
        dependencies: [
            'boogu-edit-transformer-balanced',
            'boogu-qwen3vl-8b-clip',
            'vae-flux-ae',
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',
            'ComfyUI-Impact-Pack',
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
        featured: true,
        modelFamily: 'LTX-2.3',
        name: 'LTX 2.3',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        // MPI-128: dual-latent (video+audio) stage-2 staging wired, so the
        // previewStage toggle + preview→Finish are unlocked. multiStage:true shows
        // the toggle on the shared _ms ops. NO branchingContinue → Finish-only
        // (Continue button hidden): the refined LTX workflow locks stage-2 to
        // stage-1 and the prompt has no effect on the continuation, so a re-prompted
        // branch is meaningless. audio:true surfaces the audio media slot + the
        // Reference|Original mode UI.
        capabilities: { multiStage: true, audio: true },
        video: 'ltx23_high_preview.mp4',
        type: 'ltx',
        // LTX has 6 flat user LoRA slots (Input_Lora_1..6), no high/low staging →
        // no loraStages. The Input_Lora_* nodes have a live strength_clip input
        // (default 1.0) and some LTX LoRAs use it, so surface both knobs. (MPI-224)
        loraStrengths: ['model', 'clip'],
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
        featured: true,
        modelFamily: 'LTX-2.3',
        name: 'LTX 2.3',
        dropdownMeta: 'VIDEO',
        mediaType: 'video',
        capabilities: { multiStage: true, audio: true },
        video: 'ltx23_balanced_preview.mp4',
        type: 'ltx',
        // Same LoRA node shape as ltx-23 High: live strength_clip input, surface
        // both knobs. (MPI-224)
        loraStrengths: ['model', 'clip'],
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
                // `label`/`size` are for the model-manager arch toggle row (MPI-209):
                // labels are GPU-family names (not the dtype token) so the panel never
                // hardcodes arch strings; `size` is a display hint for the toggle/guard.
                options: {
                    blackwell: { label: 'RTX 50 Series (Blackwell)', size: '24.1GB', extraDeps: ['ltx23-transformer-mxfp8'], workflowSuffix: '_mxfp8' },
                    modern:    { label: 'RTX 40 & Older',            size: '25.2GB', extraDeps: ['ltx23-transformer-fp8'],   workflowSuffix: '_fp8'   },
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
        // Wan 2.2 TI2V-5B: one small transformer serves BOTH t2v + i2v (combined,
        // LTX-shape). SINGLE-STAGE (no ×2 upscaler stage) → multiStage:false, so no
        // previewStage/Continue. audio:false (no audio). NO branchingContinue →
        // Finish-only. motion NOT set: the 5B workflow has no Input_Motion_Intensity
        // node, so the motionIntensity control stays hidden (unlike wan-22 14B).
        capabilities: { multiStage: false, audio: false },
        video: 'wan22_5b_preview.mp4',
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
