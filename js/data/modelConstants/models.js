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
 * @property {{multiStage?:boolean, audio?:boolean, negativePrompt?:boolean, styleLoras?:boolean, promptEnhance?:boolean, tierSelect?:boolean}} [capabilities] - Drives capability-gated UI on SHARED ops: multiStage shows the previewStage toggle; audio shows the audio media slot; styleLoras shows the style picker + Stylization slider; promptEnhance shows the enhance toggle; tierSelect shows the runtime speed/quality tier radio (Qwen-Image-Edit's qwenTier → Input_Tier, MPI-300) for models whose tiers share one weight set instead of shipping as sibling cards. Absent → false. EXCEPTION: negativePrompt defaults to TRUE when absent (a model supports negatives unless it opts out) — set `negativePrompt: false` for distilled cfg-1.0 models (Krea2-Turbo) where the negative prompt has no effect and NAG cannot rescue it. Hides the prompt box's positive/negative toggle; the stored negativePrompt value is still persisted. `promptEnhance` requires a text encoder whose CLIP implements `.generate()` (Qwen3-VL, Gemma) — T5/umT5 models (Chroma, Wan) CRASH on the TextGenerate node, so never set it there.
 * @property {string[]} [styleLoraLabels] - Style-LoRA display names, index-aligned with the workflow's MpiMath gates and MpiPromptList trigger lines. Index 0 must be the no-style entry (every gate zeroed); its label is free text. Required when `capabilities.styleLoras` is true.
 * @property {string[]} [styleLoraImages] - Style card images for the picker, filenames in comfy_workflows/display/, INDEX-ALIGNED with styleLoraLabels. Index 0 is the no-style baseline (the same prompt with the rack off) — ship every card from the SAME prompt so the grid reads as a comparison. Optional: a missing entry (or the whole array) renders a placeholder card, so a model can ship styles before its art exists. See docs/playbooks/add-model/05-prompt-and-styles.md §9.
 * @property {Record<string, Array<{label:string,w:number,h:number,icon:string}>>} [ratios] - Per-type ratio table (MPI-174), keyed by quality tier (quality-mode models) or 'portrait'/'landscape' (orientation-mode). First model declaring it for a NEW `type` wins; existing types (flux/sdxl/wan/wan5b/ltx) keep their built-in tables in js/utils/ratios.js — do not redeclare them here.
 * @property {string[]} [qualityTiers] - Ordered quality-tier ids for a NEW `type` (MPI-174), e.g. ['low','medium','high']. Presence ⇒ quality UI mode (tier radio); absent + `ratios` present ⇒ orientation mode. Consumed via qualityTiersFor() in js/utils/ratios.js and the v3 project migration.
 * @property {Record<string, Object>} [opInject] - Per-OP constant workflow params THIS model always injects, keyed by operation id then node title (MPI-354). For a model whose ops are branches of ONE master graph selected by a value private to that model — FLUX.2 Klein maps each op to an `Input_wf_type` int, a numbering no shared op could own. Merged in commandExecutor._buildParams AFTER the op's own `injectParams` and BEFORE the user's controls. A model that declares this MUST cover every op in `supportedOps`: a missing entry does not error, it runs the graph's default branch and returns the wrong operation's output, so the executor warns on a gap. Prefer the op's `injectParams` when the constant is a property of the OP rather than of this model.
 * @property {string[]} [styleOps] - Operations where this model's style rack is live (MPI-354). REQUIRED for any model with `capabilities.styleLoras` — the old DEFAULT_STYLE_OPS fallback was deleted in MPI-365 once all six style models declared their own, so an undeclared model now shows no rack anywhere (loud and one line to fix, rather than silently inheriting a reach wrong for its graph). Only consulted when `capabilities.styleLoras` is true; the op's `components` still decides whether the control exists at all.
 * @property {string[]} [imageSizedOps] - Operations whose OUTPUT SHAPE comes from the input image rather than from `Input_Width`/`Input_Height` (MPI-354) — typically because the graph scales the input to a megapixel target. The ratio picker is hidden on these ops (see modelShowsRatio in commandRegistry.js); everything else about them is unchanged. Defaults to none, so every model that does not declare it keeps the picker on every op exactly as before. This is a property of the MODEL's graph, not of the op: every model's `control` now derives its size from the input, but each does so through a different node and SDXL's did NOT until the MPI-365 master template swapped its ControlNet branch onto ImageScaleToTotalPixels. VERIFY IN THE GRAPH, never from the op name — Chroma's depth was mis-declared for exactly that reason until 2026-08-02, and the symptom was a padded gallery card, not an error.
 * @property {Record<string, *>} [controlDefaults] - Per-MODEL starting values for PromptBox controls, keyed by control id (MPI-365) — e.g. `{ stylization: 0.6 }`. Resolved in PromptBoxControls._resolveDefault AFTER an op default and BEFORE the global PROMPT_CONTROL_DEFAULTS, so an op-specific default still wins and every undeclared model is unaffected. Use this when the right starting value is a property of the MODEL's weights rather than of the op: a heavily distilled checkpoint whose style LoRAs artefact at full strength wants one number across its whole rack, which an op default (shared by every model running that op) cannot express. This sets only the STARTING value; where an edited value is stored is still the control's `scope`.
 * @property {string[]} [controlTypes] - Which structures this model's `control` op can copy, as CONTROL_TYPES ids, in PICKER ORDER (MPI-365). The value injected into `Input_Control_Net` comes from CONTROL_TYPES in commandRegistry.js, NOT from this list's order, so display order is free — SDXL lists depth first while its graph numbers pose first. A list of ONE (Klein/Krea2/Chroma, depth-only) hides the picker entirely, which is correct: those graphs have no `Input_Control_Net` node to switch. Declaring a type the graph cannot run is the silent failure this field exists to prevent — the switch falls through to its baked branch and returns a plausible image made the wrong way, so VERIFY against the graph's own Control note before adding one.
 * @property {string[]} [batchOps] - Operations where the batch control is REAL (MPI-365). `Input_Batch_Size` reaches only `EmptyLatentImage` in every graph we ship, so an op sampling a VAE-encoded latent silently returns one image while the control claims N. Defaults to every op, so a model that stays silent behaves exactly as before. Distinct from `capabilities.batch: false`, which is the model-WIDE off switch — use that when batch works nowhere (Krea2/Klein/Qwen), and this when it works on some ops and not others (Chroma `['t2i']`, SDXL `['t2i']` since the master template). See modelShowsBatch in commandRegistry.js.
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
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        // Batch multiplies EmptyLatentImage only, and t2i is now the ONLY branch that
        // samples it. This CHANGED with the master template (MPI-365): the old graph
        // gated depth with Input_depth_reference and kept the empty latent; control now
        // VAE-encodes the input (KSampler.latent_image <- MpiAnySwitch on wf_type,
        // any_3 = VAEEncode), so a batch > 1 there would claim N and return one.
        batchOps: ['t2i'],
        // Same graph change, same class of lie on the other axis: control scales the
        // INPUT image to a megapixel target (ImageScaleToTotalPixels) instead of reading
        // Input_Width/Height, so the ratio picker cannot describe its output. i2i still
        // resizes to our dimensions (ImageResizeKJv2) and keeps the picker.
        imageSizedOps: ['control', 'detail', 'upscale'],
        // SDXL is the only model whose control switch offers more than depth: ONE
        // ControlNet-Union checkpoint behind four SetUnionControlNetType nodes and four
        // AIO_Preprocessor annotators, both switched by Input_Control_Net.
        controlTypes: ['depth', 'pose', 'scribble', 'canny'],
        // Input_Control_strength -> MpiNormalizeValue -> ControlNetApplyAdvanced.strength.
        capabilities: { controlStrength: true },
        // Op -> the Input_wf_type value selecting its branch. MUST cover every entry in
        // supportedOps: a gap does not error, it runs the graph default and returns a
        // plausible image from the WRONG op. 4 and 5 are dead slots, numbered to match
        // Klein/Krea2/Chroma.
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        gen_speed: 'fast',
        description: 'This image generator uses the famous Juggernaut XL model as its base. It can create different styles but is best suited for realistic images.',
        workflows: {
            // MPI-365: ONE file for all five ops — the branch is chosen by opInject's
            // Input_wf_type and lazy evaluation prunes the rest at run time. The old
            // upscaler_sdxl_realistic.json / detailer_sdxl_realistic.json are deleted.
            t2i:     't2i_sdxl_realistic.json',
            i2i:     't2i_sdxl_realistic.json',
            control: 't2i_sdxl_realistic.json',
            upscale: 't2i_sdxl_realistic.json',
            detail:  't2i_sdxl_realistic.json',
        },
        dependencies: [
            'sdxl-realistic',
            '4x-NMKD-Siax',
            'controlnet-union-sdxl',   // the ONE ControlNet behind all four control types
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            // MPI-365: MaskDetailerPipe/To-FromBasicPipe were always needed by the detail
            // op and were never declared — latent until the master template made every
            // node submit-validated on EVERY run, which turns the gap fatal.
            'ComfyUI-Impact-Pack',
            'comfyui-kjnodes',          // ImageResizeKJv2 — the i2i resize
            // AIO_Preprocessor x4: DepthAnythingV2 / Openpose / Scribble / CannyEdge.
            // Canny and Scribble are weightless filters; OpenPose auto-downloads its
            // body/hand/face annotators on first use, DepthAnythingV2 its own.
            'comfyui_controlnet_aux',
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
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        // Batch multiplies EmptyLatentImage only, and t2i is now the ONLY branch that
        // samples it. This CHANGED with the master template (MPI-365): the old graph
        // gated depth with Input_depth_reference and kept the empty latent; control now
        // VAE-encodes the input (KSampler.latent_image <- MpiAnySwitch on wf_type,
        // any_3 = VAEEncode), so a batch > 1 there would claim N and return one.
        batchOps: ['t2i'],
        // Same graph change, same class of lie on the other axis: control scales the
        // INPUT image to a megapixel target (ImageScaleToTotalPixels) instead of reading
        // Input_Width/Height, so the ratio picker cannot describe its output. i2i still
        // resizes to our dimensions (ImageResizeKJv2) and keeps the picker.
        imageSizedOps: ['control', 'detail', 'upscale'],
        // SDXL is the only model whose control switch offers more than depth: ONE
        // ControlNet-Union checkpoint behind four SetUnionControlNetType nodes and four
        // AIO_Preprocessor annotators, both switched by Input_Control_Net.
        controlTypes: ['depth', 'pose', 'scribble', 'canny'],
        // Input_Control_strength -> MpiNormalizeValue -> ControlNetApplyAdvanced.strength.
        capabilities: { controlStrength: true },
        // Op -> the Input_wf_type value selecting its branch. MUST cover every entry in
        // supportedOps: a gap does not error, it runs the graph default and returns a
        // plausible image from the WRONG op. 4 and 5 are dead slots, numbered to match
        // Klein/Krea2/Chroma.
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        gen_speed: 'fast',
        description: 'This spicy image generator uses one of the best NSFW models available for SDXL, the famous Lustify model by Coyotte.',
        workflows: {
            // MPI-365: ONE file for all five ops — the branch is chosen by opInject's
            // Input_wf_type and lazy evaluation prunes the rest at run time. The old
            // upscaler_sdxl_nsfw.json / detailer_sdxl_nsfw.json are deleted.
            t2i:     't2i_sdxl_nsfw.json',
            i2i:     't2i_sdxl_nsfw.json',
            control: 't2i_sdxl_nsfw.json',
            upscale: 't2i_sdxl_nsfw.json',
            detail:  't2i_sdxl_nsfw.json',
        },
        dependencies: [
            'sdxl-nsfw',
            '4x-NMKD-Siax',
            'controlnet-union-sdxl',   // the ONE ControlNet behind all four control types
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            // MPI-365: MaskDetailerPipe/To-FromBasicPipe were always needed by the detail
            // op and were never declared — latent until the master template made every
            // node submit-validated on EVERY run, which turns the gap fatal.
            'ComfyUI-Impact-Pack',
            'comfyui-kjnodes',          // ImageResizeKJv2 — the i2i resize
            // AIO_Preprocessor x4: DepthAnythingV2 / Openpose / Scribble / CannyEdge.
            // Canny and Scribble are weightless filters; OpenPose auto-downloads its
            // body/hand/face annotators on first use, DepthAnythingV2 its own.
            'comfyui_controlnet_aux',
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
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        // Batch multiplies EmptyLatentImage only, and t2i is now the ONLY branch that
        // samples it. This CHANGED with the master template (MPI-365): the old graph
        // gated depth with Input_depth_reference and kept the empty latent; control now
        // VAE-encodes the input (KSampler.latent_image <- MpiAnySwitch on wf_type,
        // any_3 = VAEEncode), so a batch > 1 there would claim N and return one.
        batchOps: ['t2i'],
        // Same graph change, same class of lie on the other axis: control scales the
        // INPUT image to a megapixel target (ImageScaleToTotalPixels) instead of reading
        // Input_Width/Height, so the ratio picker cannot describe its output. i2i still
        // resizes to our dimensions (ImageResizeKJv2) and keeps the picker.
        imageSizedOps: ['control', 'detail', 'upscale'],
        // SDXL is the only model whose control switch offers more than depth: ONE
        // ControlNet-Union checkpoint behind four SetUnionControlNetType nodes and four
        // AIO_Preprocessor annotators, both switched by Input_Control_Net.
        controlTypes: ['depth', 'pose', 'scribble', 'canny'],
        // Input_Control_strength -> MpiNormalizeValue -> ControlNetApplyAdvanced.strength.
        capabilities: { controlStrength: true },
        // Op -> the Input_wf_type value selecting its branch. MUST cover every entry in
        // supportedOps: a gap does not error, it runs the graph default and returns a
        // plausible image from the WRONG op. 4 and 5 are dead slots, numbered to match
        // Klein/Krea2/Chroma.
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images with an extra shine using AlchemyMix V176.',
        workflows: {
            // MPI-365: ONE file for all five ops — the branch is chosen by opInject's
            // Input_wf_type and lazy evaluation prunes the rest at run time. The old
            // upscaler_ill_anime_beauty.json / detailer_ill_anime_beauty.json are deleted.
            t2i:     't2i_ill_anime_beauty.json',
            i2i:     't2i_ill_anime_beauty.json',
            control: 't2i_ill_anime_beauty.json',
            upscale: 't2i_ill_anime_beauty.json',
            detail:  't2i_ill_anime_beauty.json',
        },
        dependencies: [
            'ill-anime-beauty',
            '4x-AnimeSharp',
            'controlnet-union-sdxl',   // the ONE ControlNet behind all four control types
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            // MPI-365: MaskDetailerPipe/To-FromBasicPipe were always needed by the detail
            // op and were never declared — latent until the master template made every
            // node submit-validated on EVERY run, which turns the gap fatal.
            'ComfyUI-Impact-Pack',
            'comfyui-kjnodes',          // ImageResizeKJv2 — the i2i resize
            // AIO_Preprocessor x4: DepthAnythingV2 / Openpose / Scribble / CannyEdge.
            // Canny and Scribble are weightless filters; OpenPose auto-downloads its
            // body/hand/face annotators on first use, DepthAnythingV2 its own.
            'comfyui_controlnet_aux',
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
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        // Batch multiplies EmptyLatentImage only, and t2i is now the ONLY branch that
        // samples it. This CHANGED with the master template (MPI-365): the old graph
        // gated depth with Input_depth_reference and kept the empty latent; control now
        // VAE-encodes the input (KSampler.latent_image <- MpiAnySwitch on wf_type,
        // any_3 = VAEEncode), so a batch > 1 there would claim N and return one.
        batchOps: ['t2i'],
        // Same graph change, same class of lie on the other axis: control scales the
        // INPUT image to a megapixel target (ImageScaleToTotalPixels) instead of reading
        // Input_Width/Height, so the ratio picker cannot describe its output. i2i still
        // resizes to our dimensions (ImageResizeKJv2) and keeps the picker.
        imageSizedOps: ['control', 'detail', 'upscale'],
        // SDXL is the only model whose control switch offers more than depth: ONE
        // ControlNet-Union checkpoint behind four SetUnionControlNetType nodes and four
        // AIO_Preprocessor annotators, both switched by Input_Control_Net.
        controlTypes: ['depth', 'pose', 'scribble', 'canny'],
        // Input_Control_strength -> MpiNormalizeValue -> ControlNetApplyAdvanced.strength.
        capabilities: { controlStrength: true },
        // Op -> the Input_wf_type value selecting its branch. MUST cover every entry in
        // supportedOps: a gap does not error, it runs the graph default and returns a
        // plausible image from the WRONG op. 4 and 5 are dead slots, numbered to match
        // Klein/Krea2/Chroma.
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        gen_speed: 'fast',
        description: 'Illustrous workflows for Anime style images using AnimeMix V8.',
        workflows: {
            // MPI-365: ONE file for all five ops — the branch is chosen by opInject's
            // Input_wf_type and lazy evaluation prunes the rest at run time. The old
            // upscaler_ill_anime.json / detailer_ill_anime.json are deleted.
            t2i:     't2i_ill_anime.json',
            i2i:     't2i_ill_anime.json',
            control: 't2i_ill_anime.json',
            upscale: 't2i_ill_anime.json',
            detail:  't2i_ill_anime.json',
        },
        dependencies: [
            'ill-anime',
            '4x-AnimeSharp',
            'controlnet-union-sdxl',   // the ONE ControlNet behind all four control types
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            // MPI-365: MaskDetailerPipe/To-FromBasicPipe were always needed by the detail
            // op and were never declared — latent until the master template made every
            // node submit-validated on EVERY run, which turns the gap fatal.
            'ComfyUI-Impact-Pack',
            'comfyui-kjnodes',          // ImageResizeKJv2 — the i2i resize
            // AIO_Preprocessor x4: DepthAnythingV2 / Openpose / Scribble / CannyEdge.
            // Canny and Scribble are weightless filters; OpenPose auto-downloads its
            // body/hand/face annotators on first use, DepthAnythingV2 its own.
            'comfyui_controlnet_aux',
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
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        // Batch multiplies EmptyLatentImage only, and t2i is now the ONLY branch that
        // samples it. This CHANGED with the master template (MPI-365): the old graph
        // gated depth with Input_depth_reference and kept the empty latent; control now
        // VAE-encodes the input (KSampler.latent_image <- MpiAnySwitch on wf_type,
        // any_3 = VAEEncode), so a batch > 1 there would claim N and return one.
        batchOps: ['t2i'],
        // Same graph change, same class of lie on the other axis: control scales the
        // INPUT image to a megapixel target (ImageScaleToTotalPixels) instead of reading
        // Input_Width/Height, so the ratio picker cannot describe its output. i2i still
        // resizes to our dimensions (ImageResizeKJv2) and keeps the picker.
        imageSizedOps: ['control', 'detail', 'upscale'],
        // SDXL is the only model whose control switch offers more than depth: ONE
        // ControlNet-Union checkpoint behind four SetUnionControlNetType nodes and four
        // AIO_Preprocessor annotators, both switched by Input_Control_Net.
        controlTypes: ['depth', 'pose', 'scribble', 'canny'],
        // Input_Control_strength -> MpiNormalizeValue -> ControlNetApplyAdvanced.strength.
        capabilities: { controlStrength: true },
        // Op -> the Input_wf_type value selecting its branch. MUST cover every entry in
        // supportedOps: a gap does not error, it runs the graph default and returns a
        // plausible image from the WRONG op. 4 and 5 are dead slots, numbered to match
        // Klein/Krea2/Chroma.
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        gen_speed: 'fast',
        description: 'This image generator uses the AnimerJei V3 PONY model. It is a stylized model that can create different animation styles.',
        workflows: {
            // MPI-365: ONE file for all five ops — the branch is chosen by opInject's
            // Input_wf_type and lazy evaluation prunes the rest at run time. The old
            // upscaler_pony_mix.json / detailer_pony_mix.json are deleted.
            t2i:     't2i_pony_mix.json',
            i2i:     't2i_pony_mix.json',
            control: 't2i_pony_mix.json',
            upscale: 't2i_pony_mix.json',
            detail:  't2i_pony_mix.json',
        },
        dependencies: [
            'pony-mix',
            '4x-AnimeSharp',
            'controlnet-union-sdxl',   // the ONE ControlNet behind all four control types
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            // MPI-365: MaskDetailerPipe/To-FromBasicPipe were always needed by the detail
            // op and were never declared — latent until the master template made every
            // node submit-validated on EVERY run, which turns the gap fatal.
            'ComfyUI-Impact-Pack',
            'comfyui-kjnodes',          // ImageResizeKJv2 — the i2i resize
            // AIO_Preprocessor x4: DepthAnythingV2 / Openpose / Scribble / CannyEdge.
            // Canny and Scribble are weightless filters; OpenPose auto-downloads its
            // body/hand/face annotators on first use, DepthAnythingV2 its own.
            'comfyui_controlnet_aux',
        ],
    },
    {
        // Chroma (Flash) — Flux-family image model, balanced tier. Extra vs SDXL:
        // RES4LYF custom node (ClownShark sampler + ReChromaPatcher), and its LoRAs take
        // MODEL strength only (loraStrengths: ['model']) — the MpiLoraModel node has no
        // clip input. MPI-217.
        //
        // MPI-365: collapsed from three runtime files to ONE master graph; the branch is
        // the injected `Input_wf_type` (see opInject). The Flash/Hyper split is NOT a
        // runtime tier — they are two separate checkpoints, so generate_chroma.py bakes
        // one file per tier and each card names its own.
        id: 'chroma-flash',
        sizeTier: 'balanced',
        modelFamily: 'Chroma',
        name: 'Chroma Flash',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        defaultUpscale: '4x-NMKD-Siax',
        image: 'chroma-flash-01.webp',
        type: 'chroma',
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        loraStrengths: ['model'],
        gen_speed: 'fast',
        capabilities: {
            // Five style LoRAs on one MpiStyleLoras bank (MPI-365).
            styleLoras: true,
            // Chroma reaches control through a FLUX ControlNet (depth is its only type),
            // so it has a strength to expose: Input_Control_strength → MpiNormalizeValue
            // → ControlNetApplyAdvanced.strength. The normalize node remaps the slider's
            // 0-1 to 0-0.5 in-graph, because measured on this model anything past ~0.5
            // starts producing artefacts. No promptEnhance — Chroma has no enhancer node
            // and no Output_prompt capture.
            controlStrength: true,
        },
        // One master graph ⇒ the rack reaches every op, detail and upscale included.
        // Depth is the only structure this graph can copy, so the type picker stays
        // hidden and the op reads exactly as the old single-purpose one did.
        controlTypes: ['depth'],
        styleOps: ['t2i', 'i2i', 'control', 'detail', 'upscale'],
        // depth/detail/upscale inherit their shape from the input image, so the ratio
        // picker is hidden there. depth was WRONGLY excluded until 2026-08-02 on the
        // belief that it read Input_Width/Input_Height through MpiCrop. Traced in the
        // graph: MpiCrop feeds the *i2i* latent (VAEEncode 2616); depth's latent is
        // VAEEncode 2762 <- ImageScaleToTotalPixels(megapixels: 1) <- Input_Image, so
        // depth never reads them. Only t2i's EmptyLatentImage does.
        //
        // That one omission caused THREE user-visible symptoms, all one bug: the picker
        // claimed a shape the user would not get (8:5 picked, 1280x768 produced), the
        // `ratio` control injected Width/Height it had no right to, and the gallery
        // placeholder — sized `injectionParams.Width || 0` — reserved a cell of the
        // requested shape and padded the real image inside it. Hiding the picker fixes
        // all three, because a control that is not mounted contributes no injection.
        imageSizedOps: ['control', 'detail', 'upscale'],
        // Batch reaches ONLY EmptyLatentImage, which only t2i samples from here — depth
        // and i2i both start from a VAE-encoded latent, so a batch > 1 there returned one
        // image while the control claimed N. Narrower than SDXL's list, which keeps depth
        // because its depth switches the conditioning pipe rather than the latent.
        batchOps: ['t2i'],
        // Style strength starts at 0.6, not the global 1.0. BOTH Chroma checkpoints are
        // heavily distilled, and at 0.8 or 1.0 the style LoRAs stop styling and start
        // producing artefacts (user-measured). 0.6 is also what the graph's
        // Input_Style_Selector.strength_model is baked to, so the UI now agrees with the
        // template instead of overriding it on every fresh prompt. Applies across the
        // whole rack (styleOps) — which is why it is a MODEL default and not an op one.
        controlDefaults: { stylization: 0.6 },
        // Op → the `Input_wf_type` value that selects its branch. MUST cover every entry
        // in supportedOps; commandExecutor warns loudly if one is missing, because the
        // failure mode is a plausible image from the WRONG op rather than an error.
        // 4 and 5 are dead slots, kept so the numbering matches Klein and Krea2.
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        styleLoraLabels: ['None', 'B&W Sketch', 'Lenovo', 'Brushwork', 'Anime'],
        // Index-aligned with styleLoraLabels; index 0 is the no-style baseline. Both
        // Chroma cards share the rack, so the same set applies to Hyper.
        styleLoraImages: [
            'chroma-style-none.webp', 'chroma-style-bwsketch.webp', 'chroma-style-lenovo.webp',
            'chroma-style-brushwork.webp', 'chroma-style-anime.webp',
        ],
        description: 'Chroma is a high-detail Flux-family image generator. It can produce some really hardcore high quality NSFW but can sometimes struggle with hands.',
        workflows: {
            // MPI-365: ONE file for all five ops — the branch is chosen by opInject's
            // Input_wf_type and lazy evaluation prunes the rest at run time.
            t2i: 'chroma_t2i.json',
            i2i: 'chroma_t2i.json',
            control: 'chroma_t2i.json',
            upscale: 'chroma_t2i.json',
            detail: 'chroma_t2i.json',
        },
        dependencies: [
            'chroma1-hd-flash',
            't5xxl-fp16',
            'vae-flux-ae',
            '4x-NMKD-Siax',
            'controlnet-union-flux',         // depth op — the only FLUX.1-dev-licensed weight
            'chroma-style-bwsketch',
            'chroma-style-lenovo',
            'chroma-style-brushwork',
            'chroma-style-anime',
            'RES4LYF',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            'ComfyUI-Impact-Pack',           // MaskDetailerPipe (detail op)
            'comfyui_controlnet_aux',        // DepthAnythingV2Preprocessor (+ its own weight)
        ],
    },
    {
        // Chroma (Hyper) — LOW-tier sibling of Chroma Flash. Same op shape, same support
        // stack (RES4LYF/MpiNodes/UltimateSDUpscale, t5xxl-fp16, vae-flux-ae, Siax); only
        // the diffusion weight differs (int8 Danrisi mix + Hyper/Turbo distill → faster,
        // ~9.2GB vs Flash's 17GB). Clustered with Flash via modelFamily:'Chroma'; the L/B
        // badge disambiguates. Separately installable alongside Flash (NOT mutually
        // exclusive).
        //
        // MPI-365: shares Flash's master graph — same template, different bake. Hyper is
        // tier 3 and Flash is tier 2, and generate_chroma.py stamps ClownModelLoader plus
        // Input_Tier into each output file. Two loaders in ONE graph would force BOTH
        // downloads (ComfyUI validates every combo widget at submit time, even on a
        // lazily-skipped branch), which is exactly what the per-tier bake avoids.
        id: 'chroma-hyper',
        sizeTier: 'low',
        modelFamily: 'Chroma',
        name: 'Chroma Hyper',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        defaultUpscale: '4x-NMKD-Siax',
        image: 'chroma-hyper-01.webp',
        type: 'chroma',
        supportedOps: ['t2i', 'i2i', 'control', 'upscale', 'detail'],
        loraStrengths: ['model'],
        gen_speed: 'fast',
        // Identical rack + branch shape to Flash — see that card for the reasoning.
        capabilities: {
            styleLoras: true,
            controlStrength: true,
        },
        // Depth is the only structure this graph can copy, so the type picker stays
        // hidden and the op reads exactly as the old single-purpose one did.
        controlTypes: ['depth'],
        styleOps: ['t2i', 'i2i', 'control', 'detail', 'upscale'],
        // Shares Flash's master graph, so it shares the depth-is-image-sized fix too —
        // and the same batch reality: only t2i samples an EmptyLatentImage. Hyper is the
        // MORE distilled of the two, so the 0.6 style strength matters at least as much.
        imageSizedOps: ['control', 'detail', 'upscale'],
        batchOps: ['t2i'],
        controlDefaults: { stylization: 0.6 },
        opInject: {
            t2i:     { Input_wf_type: 1 },
            i2i:     { Input_wf_type: 2 },
            control: { Input_wf_type: 3 },
            detail:  { Input_wf_type: 6 },
            upscale: { Input_wf_type: 7 },
        },
        styleLoraLabels: ['None', 'B&W Sketch', 'Lenovo', 'Brushwork', 'Anime'],
        styleLoraImages: [
            'chroma-style-none.webp', 'chroma-style-bwsketch.webp', 'chroma-style-lenovo.webp',
            'chroma-style-brushwork.webp', 'chroma-style-anime.webp',
        ],
        description: 'A faster, lighter Chroma — the same high-detail Flux-family image generator distilled to run quicker at low VRAM. Great for realistic, hardcore NSFW; hands can still struggle.',
        workflows: {
            t2i: 'chroma_hyper_t2i.json',
            i2i: 'chroma_hyper_t2i.json',
            control: 'chroma_hyper_t2i.json',
            upscale: 'chroma_hyper_t2i.json',
            detail: 'chroma_hyper_t2i.json',
        },
        dependencies: [
            'chroma1-hd-hyper',
            't5xxl-fp16',
            'vae-flux-ae',
            '4x-NMKD-Siax',
            'controlnet-union-flux',         // depth op — the only FLUX.1-dev-licensed weight
            'chroma-style-bwsketch',
            'chroma-style-lenovo',
            'chroma-style-brushwork',
            'chroma-style-anime',
            'RES4LYF',
            'ComfyUI-MpiNodes',
            'ComfyUI-UltimateSDUpscale',
            'ComfyUI-Impact-Pack',           // MaskDetailerPipe (detail op)
            'comfyui_controlnet_aux',        // DepthAnythingV2Preprocessor (+ its own weight)
        ],
    },
    {
        // ── Krea 2 — MPI-282, collapsed to a single card in MPI-316 ────────────────
        // ONE Krea2 SFW card, BOTH speed tiers. The Raw (un-distilled) weight gives a
        // working cfg + negative prompt, which drives the identity-edit LoRA cleanly.
        // The old separate Turbo card is GONE: the `Accelerator Lora` (turbo-distill,
        // an SVD delta extracted FROM Raw) reconstructs the Turbo transformer at
        // strength 1.0, so the fast tier is now a runtime toggle on this same weight
        // rather than a second ~12GB download. capabilities.turboToggle drives it.
        //
        // One universal graph serves t2i/i2i/depth/edit (switched at runtime), and the
        // krea2Turbo control injects Input_is_Turbo (MPI-365, was the Input_Tier int):
        // false = quality (cfg 3, 40 steps, working negative), true = fast (cfg 1, 12+6
        // steps, accelerator LoRA at 1.0 — the negative is computed then discarded, so
        // the PromptBox hides the negative toggle).
        // See docs/models/krea2/README.md "Krea2 as an EDITOR".
        id: 'krea2',
        // 'balanced', not 'high': the accelerator LoRA means one install now covers both
        // speeds, so this is no longer the heavyweight half of a tier pair (MPI-316).
        sizeTier: 'balanced',
        featured: true,
        // NO modelFamily (MPI-316). The family field drives the H/B/L tier letter, which
        // only makes sense when siblings are TIERS of the same model. Krea2's two cards
        // are CONTENT variants (SFW / NSFW) that a user can install side by side — the
        // tier split they used to represent is now a runtime toggle. Keeping the family
        // rendered "Krea 2 H" / "Krea 2 NSFW H": a tier letter on a content distinction,
        // and the same letter on both, so it disambiguated nothing.
        name: 'Krea 2',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        image: 'krea2-turbo-sfw.webp',
        defaultUpscale: '4x-NMKD-Siax',
        type: 'krea2',
        enhanceRecipe: 'krea-2',   // Prompt's own Krea 2 recipe (MPI-16). Note the id is
                                   // 'krea-2', NOT 'krea2' — Prompt matches on its exact
                                   // modelId and silently falls back to the FLUX recipe on a miss.
        supportedOps: ['t2i', 'i2i', 'control', 'krea2Edit', 'upscale', 'detail'],
        loraStrengths: ['model'],   // style LoRAs are model-only (no CLIP side)
        capabilities: {
            multiStage: false, audio: false, negativePrompt: true, styleLoras: true,
            promptEnhance: true, batch: false, turboToggle: true,
            // MPI-365: the depth branch became a LINE — image 1 is the depth map, image 2
            // the subject posed into it. Krea2 stops at TWO: its Input_Image_3 was
            // bypassed out of the graph, so it does NOT declare `depthSubject3`.
            depthSubject: true,
            // Krea2 reaches control through a control-LoRA (Krea2ControlLoRALoader), so it
            // has a strength to expose — the `controlStrength` slider drives its
            // Input_Control_strength. Qwen conditions on the control image directly and
            // has no equivalent knob.
            controlStrength: true,
        },
        // Op → the `Input_wf_type` value that selects its branch in the ONE master graph
        // (MPI-365). MUST cover every entry in supportedOps — a gap does not error, it
        // runs the graph's DEFAULT branch (wf_type 1 = t2i) and returns a plausible image
        // from the wrong op; commandExecutor warns on the gap for exactly that reason.
        // 1 t2i · 2 i2i · 3 depth · 4 edit · 5 unused · 6 detail · 7 upscale. Slot 5 is
        // deliberately dead: edit now takes an optional Input_Mask, so Krea2 needs no
        // separate inpaint branch.
        //
        // Declaring opInject makes commandExecutor REPLACE the op's own injectParams
        // rather than merge them. That mattered while the shared ops still carried
        // Input_Is_i2i / Input_Is_Edit / Input_depth_reference; all three are gone now,
        // so REPLACE and merge would agree — the branch is dead weight (MPI-365 GC).
        opInject: {
            t2i:       { Input_wf_type: 1 },
            i2i:       { Input_wf_type: 2 },
            control:   { Input_wf_type: 3 },
            krea2Edit: { Input_wf_type: 4 },
            detail:    { Input_wf_type: 6 },
            upscale:   { Input_wf_type: 7 },
        },
        // The rack lives in the ONE graph, so it reaches every op — including detail and
        // upscale, which the pre-migration default (DEFAULT_STYLE_OPS) excludes and which
        // the old rack-less krea2_detailer/upscaler files could not offer.
        // Depth is the only structure this graph can copy, so the type picker stays
        // hidden and the op reads exactly as the old single-purpose one did.
        controlTypes: ['depth'],
        styleOps: ['t2i', 'i2i', 'control', 'krea2Edit', 'detail', 'upscale'],
        // MPI-365: every op EXCEPT t2i/i2i now derives its output shape from the input
        // image (ImageScaleToTotalPixels replaced ImageResizeKJv2), so the ratio picker
        // is hidden there. t2i/i2i still generate at our Input_Width/Height.
        imageSizedOps: ['control', 'krea2Edit', 'detail', 'upscale'],
        styleLoraLabels: [
            'None', 'Dark Brush', 'Dot Matrix', 'Kids Drawing', 'Neon Drip',
            'Rainy Window', 'Retro Anime', 'Soft Water Color', 'Sunset Blur', 'Vintage Tarot',
            'MidJourney',
        ],
        // Style card images for the picker (index-aligned with styleLoraLabels;
        // comfy_workflows/display/). Index 0 = the no-style baseline gen. All four
        // Krea2 variants share the same style rack, so the same set applies.
        styleLoraImages: [
            'krea2-style-none.webp', 'krea2-style-darkbrush.webp', 'krea2-style-dotmatrix.webp',
            'krea2-style-kidsdrawing.webp', 'krea2-style-neondrip.webp', 'krea2-style-rainywindow.webp',
            'krea2-style-retroanime.webp', 'krea2-style-softwatercolor.webp', 'krea2-style-sunsetblur.webp',
            'krea2-style-vintagetarot.webp', 'krea2-style-midjourney.webp',
        ],
        gen_speed: 'balanced',
        description: 'Krea 2 at full quality — the un-distilled Raw weight with a working negative prompt. Edit an image with a prompt (changes only what you ask; add a second reference image to pull from both), plus the distinctive photographic look, ten style LoRAs, depth reference, up to 2K. Uses the most VRAM and is slower than Turbo — best on a high-end NVIDIA card.',
        workflows: {
            // MPI-365: ONE file for all six ops — the branch is chosen by opInject's
            // Input_wf_type above. The separate krea2_detailer_* / krea2_upscaler_*
            // runtime files are GONE; their nodes (MaskDetailerPipe, UltimateSDUpscale,
            // UpscaleModelLoader) now live in this master graph.
            // Tier is NOT a file axis either (MPI-316) — krea2Turbo injects
            // Input_is_Turbo to pick the sampler chain at runtime.
            t2i:       'krea2_t2i_sfw.json',
            i2i:       'krea2_t2i_sfw.json',
            control:   'krea2_t2i_sfw.json',
            krea2Edit: 'krea2_t2i_sfw.json',
            upscale:   'krea2_t2i_sfw.json',
            detail:    'krea2_t2i_sfw.json',
        },
        qualityTiers: ['1k', '2k'],
        dependencies: [
            'krea2-raw-transformer',     // ONLY difference from the NSFW card's deps
            'krea2-lora-accelerator',    // turbo-distill delta — REQUIRED: it IS the fast tier (MPI-316)
            'qwen3vl-abliterated-clip',   // shared with the image-describer plugin
            'vae-qwen-image',            // shared — already on R2, zero upload
            'krea2-lora-depth-control',
            'krea2-lora-identity-edit',  // instruct-edit LoRA (baked into the edit path); dep of both Krea2 cards
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
            'ComfyUI-Krea2-ControlNet',
            'comfyui_controlnet_aux',
            'comfyui-krea2edit',         // dual-conditioning edit nodes (Krea2EditModelPatch + GroundedEncode)
        ],
    },
    {
        // ── Krea 2 NSFW — MPI-282, collapsed to a single card in MPI-316 ───────────
        // Lustify-Krea Raw int8 weight. Same rationale as the SFW card above: one card,
        // both tiers, the accelerator LoRA standing in for the deleted Turbo weight.
        id: 'krea2-nsfw',
        sizeTier: 'balanced',   // see the SFW card
        featured: true,
        // NO modelFamily — see the SFW card above.
        name: 'Krea 2 NSFW',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        image: 'krea2-turbo-nsfw.webp',
        defaultUpscale: '4x-NMKD-Siax',
        type: 'krea2',
        enhanceRecipe: 'krea-2',   // see the SFW card
        supportedOps: ['t2i', 'i2i', 'control', 'krea2Edit', 'upscale', 'detail'],
        loraStrengths: ['model'],
        capabilities: {
            multiStage: false, audio: false, negativePrompt: true, styleLoras: true,
            promptEnhance: true, batch: false, turboToggle: true,
            // MPI-365: the depth branch became a LINE — image 1 is the depth map, image 2
            // the subject posed into it. Krea2 stops at TWO: its Input_Image_3 was
            // bypassed out of the graph, so it does NOT declare `depthSubject3`.
            depthSubject: true,
            // Krea2 reaches control through a control-LoRA (Krea2ControlLoRALoader), so it
            // has a strength to expose — the `controlStrength` slider drives its
            // Input_Control_strength. Qwen conditions on the control image directly and
            // has no equivalent knob.
            controlStrength: true,
        },
        // Op → the `Input_wf_type` value that selects its branch in the ONE master graph
        // (MPI-365). MUST cover every entry in supportedOps — a gap does not error, it
        // runs the graph's DEFAULT branch (wf_type 1 = t2i) and returns a plausible image
        // from the wrong op; commandExecutor warns on the gap for exactly that reason.
        // 1 t2i · 2 i2i · 3 depth · 4 edit · 5 unused · 6 detail · 7 upscale. Slot 5 is
        // deliberately dead: edit now takes an optional Input_Mask, so Krea2 needs no
        // separate inpaint branch.
        //
        // Declaring opInject makes commandExecutor REPLACE the op's own injectParams
        // rather than merge them. That mattered while the shared ops still carried
        // Input_Is_i2i / Input_Is_Edit / Input_depth_reference; all three are gone now,
        // so REPLACE and merge would agree — the branch is dead weight (MPI-365 GC).
        opInject: {
            t2i:       { Input_wf_type: 1 },
            i2i:       { Input_wf_type: 2 },
            control:   { Input_wf_type: 3 },
            krea2Edit: { Input_wf_type: 4 },
            detail:    { Input_wf_type: 6 },
            upscale:   { Input_wf_type: 7 },
        },
        // The rack lives in the ONE graph, so it reaches every op — including detail and
        // upscale, which the pre-migration default (DEFAULT_STYLE_OPS) excludes and which
        // the old rack-less krea2_detailer/upscaler files could not offer.
        // Depth is the only structure this graph can copy, so the type picker stays
        // hidden and the op reads exactly as the old single-purpose one did.
        controlTypes: ['depth'],
        styleOps: ['t2i', 'i2i', 'control', 'krea2Edit', 'detail', 'upscale'],
        // MPI-365: every op EXCEPT t2i/i2i now derives its output shape from the input
        // image (ImageScaleToTotalPixels replaced ImageResizeKJv2), so the ratio picker
        // is hidden there. t2i/i2i still generate at our Input_Width/Height.
        imageSizedOps: ['control', 'krea2Edit', 'detail', 'upscale'],
        styleLoraLabels: [
            'None', 'Dark Brush', 'Dot Matrix', 'Kids Drawing', 'Neon Drip',
            'Rainy Window', 'Retro Anime', 'Soft Water Color', 'Sunset Blur', 'Vintage Tarot',
            'MidJourney',
        ],
        // Style card images for the picker (index-aligned with styleLoraLabels;
        // comfy_workflows/display/). Index 0 = the no-style baseline gen. All four
        // Krea2 variants share the same style rack, so the same set applies.
        styleLoraImages: [
            'krea2-style-none.webp', 'krea2-style-darkbrush.webp', 'krea2-style-dotmatrix.webp',
            'krea2-style-kidsdrawing.webp', 'krea2-style-neondrip.webp', 'krea2-style-rainywindow.webp',
            'krea2-style-retroanime.webp', 'krea2-style-softwatercolor.webp', 'krea2-style-sunsetblur.webp',
            'krea2-style-vintagetarot.webp', 'krea2-style-midjourney.webp',
        ],
        gen_speed: 'balanced',
        description: 'The spicy Lustify Krea weights at full quality — the un-distilled Raw weight with a working negative prompt. Edit an image with a prompt (changes only what you ask; add a second reference image to pull from both), plus the photographic look, ten style LoRAs, depth reference, up to 2K. int8 weight: fastest on NVIDIA RTX (Turing+); uses the most VRAM and is slower than Turbo.',
        workflows: {
            // ONE file for all six ops (MPI-365) — see the SFW card above.
            t2i:       'krea2_t2i_nsfw.json',
            i2i:       'krea2_t2i_nsfw.json',
            control:   'krea2_t2i_nsfw.json',
            krea2Edit: 'krea2_t2i_nsfw.json',
            upscale:   'krea2_t2i_nsfw.json',
            detail:    'krea2_t2i_nsfw.json',
        },
        qualityTiers: ['1k', '2k'],
        dependencies: [
            'krea2-raw-transformer-nsfw',   // ONLY difference from the SFW card's deps
            'krea2-lora-accelerator',    // turbo-distill delta — REQUIRED: it IS the fast tier (MPI-316)
            'qwen3vl-abliterated-clip',   // shared with the image-describer plugin
            'vae-qwen-image',
            'krea2-lora-depth-control',
            'krea2-lora-identity-edit',
            'krea2-lora-filterbypass',
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
            'RES4LYF',
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',
            'ComfyUI-Impact-Pack',
            'ComfyUI-UltimateSDUpscale',
            'ComfyUI-Krea2-ControlNet',
            'comfyui_controlnet_aux',
            'comfyui-krea2edit',
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
            pid: 'nvidia_pid.json',
        },
        dependencies: [
            'pid-flux1', 'pid-sdxl', 'pid-sd3', 'pid-qwenimage',
            'vae-flux-ae', 'vae-sdxl', 'vae-sd3', 'vae-qwen-image',
            'pid-gemma',
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',
        ],
    },
    // ── FLUX.2 Klein 4B (MPI-354) ──────────────────────────────────────────────
    // Apache-2.0, 4B, the FASTEST image model we ship — and the only path to object
    // REMOVAL. Research: docs/models/klein/ (README + removal + refcontrol + licences).
    //
    // FIRST MODEL ON THE ONE-MASTER-TEMPLATE SHAPE. Every op is a branch of a single
    // graph (klein_t2i.json) selected at run time by an injected `Input_wf_type` int —
    // see `opInject` below. ComfyUI's lazy evaluation prunes the unselected branches, so
    // one file costs nothing (t2i 4.03 s vs depth 7.46 s on the same 196-node graph).
    // Consequences that differ from every earlier model:
    //   * the STYLE RACK reaches every op, including detail and upscale — hence
    //     `styleOps`. Krea2's detailer/upscaler are separate rack-less files.
    //   * `opInject` is mandatory, not decorative: a missing entry silently runs the
    //     graph's default branch and returns the wrong operation's image.
    //
    // ONE tier: the distilled int8 checkpoint already runs at cfg 1.0 / 4 steps, so the
    // base+turbo pair was dropped (2026-07-27). turboToggle FALSE, and negativePrompt
    // FALSE because at cfg 1.0 the negative is bit-identical (max diff 0).
    // Orientation-mode ratios (type 'klein' → FLUX_RATIOS): one output class, so a
    // quality-tier radio would offer a single choice. Bigger output is the upscale op.
    {
        id: 'klein-4b',
        // 4.07GB int8 transformer. Rough 2026-07-28 readings: ~5GB for most ops, low teens
        // for a multi-reference edit — estimates, not measurements. 'low' is right and then
        // some: every op was verified with only ~6GB of the card free, spilling to system RAM
        // and completing. The minimum card is NOT set here — the Model Library derives it
        // from the weights via tradeTable() (footprint.js), labelled an estimate.
        sizeTier: 'low',
        featured: true,
        name: 'FLUX.2 Klein',
        dropdownMeta: 'PHOTO',
        mediaType: 'image',
        image: 'klein-4b.webp',
        defaultUpscale: '4x-NMKD-Siax',
        type: 'klein',
        enhanceRecipe: 'flux',   // Cubric Prompt has no 'klein' recipe
        supportedOps: ['t2i', 'i2i', 'control', 'kleinEdit', 'inpaint', 'detail', 'upscale'],
        loraStrengths: ['model'],   // MpiLoraModel is model-only; no CLIP side
        capabilities: {
            multiStage: false, audio: false, negativePrompt: false, styleLoras: true,
            promptEnhance: true, batch: false, turboToggle: false,
            // Klein's depth branch shares the edit branch's ReferenceLatent chain, so
            // further images are meaningful there: image 1 supplies the depth, images 2
            // and 3 the subject(s) posed into it. Unlocks depth's optional `inputImage2`
            // / `inputImage3` slots (capability-gated in filterMediaInputsForModel).
            // MPI-365: the depth line now runs to TWO references, matching the graph's
            // Input_Image_2/_3. SDXL/Chroma declare neither and stay 1-image.
            depthSubject: true,
            depthSubject3: true,
            // Klein reaches control through `flux2_klein_4b_refcontrol_depth` on a
            // LoraLoaderModelOnly, so the same Control Strength slider drives it
            // (Input_Control_strength → node 143's strength_model). Klein's LoRA bites
            // SOFTER than Krea2's: usable around 0.2-0.3 where Krea2 wants 0.6-0.8.
            controlStrength: true,
        },
        // Op → the `Input_wf_type` value that selects its branch. MUST cover every entry
        // in supportedOps; commandExecutor warns loudly if one is missing, because the
        // failure mode is a plausible image from the WRONG op rather than an error.
        // 1 t2i · 2 i2i · 3 depth · 4 edit · 5 inpaint/remove · 6 detail · 7 upscale.
        opInject: {
            t2i:           { Input_wf_type: 1 },
            i2i:           { Input_wf_type: 2 },
            control:       { Input_wf_type: 3 },
            kleinEdit:     { Input_wf_type: 4 },
            inpaint:       { Input_wf_type: 5 },
            detail:        { Input_wf_type: 6 },
            upscale:       { Input_wf_type: 7 },
        },
        // The rack is in the ONE graph, so it is live on every op — including detail and
        // upscale, which the pre-Klein default (DEFAULT_STYLE_OPS) excludes.
        // Depth is the only structure this graph can copy, so the type picker stays
        // hidden and the op reads exactly as the old single-purpose one did.
        controlTypes: ['depth'],
        styleOps: ['t2i', 'i2i', 'control', 'kleinEdit', 'inpaint', 'detail', 'upscale'],
        // Ops whose output shape comes from the INPUT image (scaled to a megapixel
        // target), not from Input_Width/Height — so the ratio picker is hidden there.
        // Klein's depth and edit branches both do this; t2i/i2i still take our ratio.
        imageSizedOps: ['control', 'kleinEdit'],
        // Index-aligned with the MpiStyleSelector's trigger lines and its MpiStyleLoras
        // banks (verified against the baked graph: bank 1 = muppets/cartoon/jojo/anime/
        // chibi, bank 2 = doodle/vintage/aesthetic). Index 0 = no style, selector 0.
        styleLoraLabels: [
            'None', 'Muppets', 'Cartoon', 'Jojo', 'Anime',
            'Chibi', 'Doodle', 'Vintage', 'Aesthetic',
        ],
        styleLoraImages: [
            'klein-style-none.webp', 'klein-style-muppets.webp', 'klein-style-cartoon.webp',
            'klein-style-jojo.webp', 'klein-style-anime.webp', 'klein-style-chibi.webp',
            'klein-style-doodle.webp', 'klein-style-vintage.webp', 'klein-style-aesthetic.webp',
        ],
        gen_speed: 'fast',
        description: 'The fastest image model in Cubric Vision, and the only one that can REMOVE things — mask an object, run Inpaint with the prompt left empty, and it is gone in about four seconds. Apache-2.0 and only 4B, so it runs where the big models will not. Generate from text, reshape an image, follow a depth reference, edit with up to three reference images, detail and upscale — all with eight style LoRAs available on every operation. Quality is modest next to Krea 2; this one is built for speed and for cleaning images up.',
        workflows: {
            // ONE file for all seven ops — the branch is chosen by opInject above.
            t2i:           'klein_t2i.json',
            i2i:           'klein_t2i.json',
            control: 'klein_t2i.json',
            kleinEdit:     'klein_t2i.json',
            inpaint:       'klein_t2i.json',
            detail:        'klein_t2i.json',
            upscale:       'klein_t2i.json',
        },
        dependencies: [
            'klein-4b-transformer',
            'qwen3-4b-clip',                 // Qwen3-4B TEXT-ONLY — not any Qwen-VL we host
            'vae-flux2',                     // FLUX.2 VAE — not FLUX.1's ae.safetensors
            'klein-lora-outpaint',           // baked; mandatory for the fill/removal path
            'klein-lora-refcontrol-depth',   // baked on the depth branch; IS the depth op
            'klein-lora-nsfw',               // baked + PROMPT-gated; never loads on a clean prompt
            'klein-style-muppets',
            'klein-style-cartoon',
            'klein-style-jojo',
            'klein-style-anime',
            'klein-style-chibi',
            'klein-style-doodle',
            'klein-style-vintage',
            'klein-style-aesthetic',
            '4x-NMKD-Siax',                  // shared engineAsset (upscale op)
            'ComfyUI-MpiNodes',              // 20 Mpi* classes incl. MpiStyleSelector/Loras
            'comfyui-kjnodes',               // ImageResizeKJv2, GrowMaskWithBlur
            'ComfyUI-Impact-Pack',           // MaskDetailerPipe, ToBasicPipe
            'ComfyUI-UltimateSDUpscale',     // UltimateSDUpscale (upscale op)
            'comfyui-inpaint-cropandstitch', // InpaintCropImproved/StitchImproved (removal)
            'comfyui_controlnet_aux',        // DepthAnythingV2Preprocessor (+ its own weight)
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
        description: 'Boogu Image Edit is a unified 10B instruction image editor. Describe the change you want and it edits the image while preserving the rest. The High tier uses the full bf16 weights at 30 steps for the best quality; needs the most VRAM.',
        workflows: {
            edit: 'boogu_edit_high.json',
        },
        dependencies: [
            'boogu-edit-transformer-high',
            'boogu-qwen3vl-8b-clip',
            'vae-flux-ae',            // shared — already on R2, zero upload
            'ComfyUI-MpiNodes',
            'comfyui-kjnodes',        // SetNode/GetNode
            'ComfyUI-Impact-Pack',    // To/FromBasicPipe
            'comfyui-inpaint-cropandstitch', // InpaintCropImproved/StitchImproved (localised edit)
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
        description: 'Boogu Image Edit is a unified 10B instruction image editor. Describe the change you want and it edits the whole image while preserving the rest. The Balanced tier uses a distilled turbo (int8) weight at 8 steps — fast, lower VRAM, and consistent across NVIDIA GPUs. Fastest on NVIDIA RTX (Turing+); older or non-NVIDIA GPUs may be slow. Its understanding is not as deep as the High tier, but it is still a capable image editor.',
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
            'comfyui-inpaint-cropandstitch', // localised edit — MPI-428
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
        description: "This video generator uses the Wan 2.2 SmoothMix models. Providing semi-realistic and stylized video generation in it's text to video version and any style in image to video. It's fast and completely uncensored. It creates videos at 16 fps, so it is advisable to interpolate them later.",
        workflows: {
            t2v_ms: 'wan22_t2v.json',
            i2v_ms: 'wan22_i2v.json',
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
            t2v_ms: 'ltx_t2v.json',
            i2v_ms: 'ltx_i2v.json',
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
        // block (blackwell → `_mxfp8`, modern → `_fp8`), yielding ltx_t2v_mxfp8.json
        // etc. (all emitted by generate_ltx.py).
        workflows: {
            t2v_ms: 'ltx_t2v.json',
            i2v_ms: 'ltx_i2v.json',
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
            t2v: 'wan5b_t2v.json',
            i2v: 'wan5b_i2v.json',
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
    // Qwen-Image-Edit-2511 (MPI-300) — ONE card, not three.
    //
    // All three speed tiers share the SAME int8 transformer + TE + VAE; only the
    // accelerator Lightning LoRA differs. Three sibling cards would therefore have
    // pollute the library and make the user install ~20GB three times. Instead the
    // tier is a RUNTIME radio (`qwenTier` → Input_Tier, an MpiInt driving the graph's
    // MpiAnySwitch model path + step count): 1=Quality (raw ~20-step, no accelerator),
    // 2=Turbo (8-step LoRA), 3=Hyper (4-step LoRA). PiD's pidResolution is the
    // precedent for a runtime selector standing in for card variants.
    //
    // Op = qwenEdit (its own, NOT Boogu's shared `edit`) — three image slots, the tier
    // radio, and its own style rack. Output follows the source image dimensions
    // (ImageScaleToTotalPixels off the input), so there is no ratio picker, like PiD.
    {
        id: 'qwen-edit',
        sizeTier: 'balanced',
        modelFamily: 'Qwen-Image-Edit',
        name: 'Qwen Image Edit',
        dropdownMeta: 'EDIT',
        mediaType: 'image',
        image: 'qwen-edit.webp',
        type: 'qwen',
        enhanceRecipe: 'flux',   // Cubric Prompt has no 'qwen' recipe; keep 'qwen' out of the sweep
        // MPI-365: TWO ops now, both branches of the one master graph. Pose and depth
        // are not separate ops — they are the two `controlTypes` below.
        supportedOps: ['qwenEdit', 'control'],
        loraStrengths: ['model'],   // style LoRAs are model-only (no CLIP side)
        // tierSelect gates the qwenTier radio in MpiPromptBox._refreshOpSlot(). No prompt
        // enhancer in this graph (no TextGenerate node) ⇒ promptEnhance stays default
        // false — deliberate, confirmed 2026-08-02, NOT an oversight to "fix".
        capabilities: {
            multiStage: false, audio: false, negativePrompt: true, styleLoras: true,
            tierSelect: true, batch: false,
            // Qwen takes three images natively, so the control LINE runs to two
            // references: image 1 is the control map, images 2-3 the subject(s). Same
            // slots the edit op already used.
            depthSubject: true,
            depthSubject3: true,
            // NO controlStrength: Qwen conditions on the control IMAGE directly — there
            // is no ControlNet and no control LoRA, so nothing has a strength to scale.
            // Its graph has no Input_Control_strength node; the slider stays hidden.
        },
        // Op → the `Input_wf_type` value selecting its branch. Qwen's numbering is its
        // OWN (1 edit · 2 control) — it shares nothing with Klein's or Krea2's, which is
        // exactly why the value is model-private and lives here rather than on the
        // shared op. MUST cover every entry in supportedOps.
        //
        // NOTE the graph's baked Input_wf_type default is 2, so a missing entry here
        // would silently run CONTROL and return a plausible wrong image — the reason
        // commandExecutor warns on a gap and generate_qwen.py asserts the node exists.
        opInject: {
            qwenEdit: { Input_wf_type: 1 },
            control:  { Input_wf_type: 2 },
        },
        // Which structures this graph can copy, in picker order. Index into the control
        // switch comes from CONTROL_TYPES, not from this list — see commandRegistry.js.
        // Depth first because it is the one users reach for; the graph's own numbering
        // (1 = pose) is unaffected by the display order.
        controlTypes: ['depth', 'pose'],
        // One graph ⇒ the rack reaches both ops.
        styleOps: ['qwenEdit', 'control'],
        // Every Qwen op keeps the SOURCE image dimensions (ImageScaleToTotalPixels off
        // the input; Input_Width/Height were bypassed out of the graph), so the ratio
        // picker is hidden on all of them.
        imageSizedOps: ['qwenEdit', 'control'],
        // INDEX-ALIGNED with the workflow's seven MpiMath gates (`b if a == N`) and its
        // MpiPromptList trigger lines; index 0 = no style (every gate zeroed). NOTE the
        // two anime entries: slot 2 is Qwen-Anime-V2 (3D) and slot 3 is animal_style.
        // which is an anime-2D LoRA despite the filename. Confirmed by the user — do not
        // "correct" this pair to match the filenames.
        styleLoraLabels: [
            'None', 'Illustration', 'Anime 3D', 'Anime 2D',
            'Anime Zankuro', '3D', 'Caricature', 'SnapShot',
        ],
        // Style card images for the picker (index-aligned with styleLoraLabels;
        // comfy_workflows/display/). Index 0 = the no-style baseline gen.
        styleLoraImages: [
            'qwen-style-none.webp', 'qwen-style-illustration.webp', 'qwen-style-anime3d.webp',
            'qwen-style-anime2d.webp', 'qwen-style-zankuro.webp', 'qwen-style-3d.webp',
            'qwen-style-caricature.webp', 'qwen-style-snapshot.webp',
        ],
        gen_speed: 'fast',
        description: 'Qwen Image Edit 2511 is an instruction image editor: give it an image and describe the change, and it edits while preserving the rest. Takes up to three reference images at once, ships seven built-in style LoRAs, and keeps the source image dimensions. Pick a tier per run — Quality for the best result, Turbo or Hyper when you want it fast. It is at its best COMBINING images: take a character, face, garment, or object from one image and place it into another, and it keeps the reference recognisable. Refer to your images BY NUMBER in the prompt — "place the man and the woman from image 2 into the scene from image 1" — in the order you added them. (This is the opposite of Krea 2, which wants images described in natural language instead.) Single-image instruction edits are its weak side — simple attribute changes like recolouring a shirt work, but bigger rewrites tend to be ignored or come back with the framing and faces degraded. For those, try Boogu Image Edit or Krea 2.',
        workflows: {
            // ONE file for all three ops — branch chosen by opInject above (MPI-365).
            qwenEdit: 'qwen_edit.json',
            control:  'qwen_edit.json',
        },
        dependencies: [
            'qwen-edit-transformer',
            'qwen-edit-qwen25vl-7b-clip',
            'vae-qwen-image',            // shared with Krea2 — already on R2, zero upload
            'qwen-edit-lightning-4step', // Hyper tier accelerator
            'qwen-edit-lightning-8step', // Turbo tier accelerator
            'qwen-edit-style-illustration',
            'qwen-edit-style-anime3d',
            'qwen-edit-style-anime2d',
            'qwen-edit-style-zankuro',
            'qwen-edit-style-3d',
            'qwen-edit-style-caricature',
            'qwen-edit-style-snapshot',
            'ComfyUI-MpiNodes',
            // MPI-365: AIO_Preprocessor (DepthAnythingV2) + OpenposePreprocessor feed the
            // new depth/pose branches. There is NO ControlNet checkpoint — the maps go
            // into Qwen's own image conditioning — so this is a NODE dependency only.
            // It pulls its annotator weights itself on first use; DepthAnythingV2's are
            // already cached by Klein, the OpenPose ones (body/hand/face) are new.
            'comfyui_controlnet_aux',
        ],
    },
];
