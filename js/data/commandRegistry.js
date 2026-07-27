/**
 * commandRegistry.js — Source of truth for all generative operations.
 *
 * Every operation the PromptBox, toolbar, and radial menu can trigger is
 * defined here. Components query this registry — they never hardcode
 * operation names or input requirements.
 *
 * Adding a new operation: add an entry here, add the workflow to the model
 * in modelRegistry.js. Nothing else needs changing.
 */

'use strict';

// ── Media Types ───────────────────────────────────────────────────────────────

export const MEDIA_TYPE = Object.freeze({
    IMAGE: 'image',
    VIDEO: 'video',
});

// ── Command Definitions ───────────────────────────────────────────────────────

/**
 * Long-form prompting guide for one operation (MPI-360). Rendered by
 * MpiOpHelpDialog behind the "?" in the parameters popup.
 *
 * @typedef {Object} OpHelp
 * @property {string}   [title]     - Heading. Defaults to the command's `label`.
 * @property {string[]} [body]      - Paragraphs, plain text. Defaults to `[info]`.
 * @property {Array<{prompt:string, note?:string, bad?:boolean}>} [examples]
 *                                    Prompt samples. `bad:true` renders as the
 *                                    common-mistake entry, struck through in red.
 * @property {string[]} [media]     - Static paths under `assets/` served from the app
 *                                    root (`assets/help/inpaint.gif`). Extension picks
 *                                    the element: mp4/webm/mov → <video>, everything
 *                                    else (png/jpg/webp/gif/apng) → <img>. GIFs need no
 *                                    special handling — the browser animates them.
 * @property {Object<string, OpHelp>} [byModel]
 *                                    Per-model overrides, keyed by model **id**
 *                                    (`krea2-nsfw`) or model **type** (`sdxl`). id wins.
 *                                    Shallow-merged over the base: supply only the keys
 *                                    that differ. Add an entry ONLY where prompting
 *                                    genuinely differs (LLM text encoders want sentences,
 *                                    SDXL-era models want keyword soup) — this is not a
 *                                    per-model help matrix.
 */

/** Shared video help — t2v/i2v and their `_ms` twins prompt identically. */
const T2V_HELP = {
    body: [
        'Generates a video clip from your prompt alone — there is no input frame, so the prompt carries both the look and the movement.',
        'Describe the SCENE first, then the MOTION: what moves, and how the camera behaves.',
    ],
    examples: [
        { prompt: 'a paper boat drifting down a rain gutter, slow dolly follow, overcast afternoon', note: 'Scene, subject motion, camera move.' },
        { prompt: 'beautiful, 4k, masterpiece', bad: true, note: 'Quality words describe nothing that can move.' },
    ],
};

/** Shared video help — the staged image owns the look, the prompt owns the motion. */
const I2V_HELP = {
    body: [
        'Animates the staged image. The image already decides the look, the framing and the identity — the prompt only decides the MOTION.',
        'Leave it empty for subtle ambient movement. Re-describing the picture fights the input and drifts the first frame.',
    ],
    examples: [
        { prompt: 'she turns her head toward the camera and smiles', note: 'Motion only.' },
        { prompt: 'a woman in a red jacket standing in a field', bad: true, note: 'Describes the input image instead of what should happen.' },
    ],
};

/**
 * @typedef {Object} CommandDef
 * @property {string}          label          - Display name shown in UI
 * @property {string}          [short]        - Short code shown on the op strip (`i2i`, `depth`, `edit`).
 *                                              Doubles as the canonical-order key (see OP_ORDER): ops that
 *                                              share a verb across models (edit/krea2Edit/qwenEdit) share a
 *                                              `short` and therefore a strip position. Only ops the strip can
 *                                              render carry one — universal/tool ops live on the History rail.
 * @property {string}          [info]         - One-line description shown in the status bar on hover in the op dropdown.
 * @property {OpHelp}          [help]         - Long-form prompting guide shown by the "?" button beside the op
 *                                              strip (MPI-360). The `info` one-liner stays the short form; this is
 *                                              the teaching form. Omit it and `getOpHelp` synthesises a guide from
 *                                              `label` + `info` rather than opening an empty popup.
 * @property {string}          [icon]         - MpiIcon registry key for op selectors (model-manager operation toggles). Optional.
 * @property {'image'|'video'} mediaType      - Which group type this applies to
 * @property {number}          requiresImages - Min number of input images needed (0 = none)
 * @property {number}          [requiresVideo]- Min number of input videos needed (0 = none)
 * @property {boolean}         [requiresMask] - Requires an active mask from the Mask Tool
 * @property {boolean}         [promptRequired] - Whether a text prompt is mandatory
 * @property {boolean}         [universal]    - Not model-tied; uses universalWorkflows in modelRegistry
 * @property {boolean}         [stub]         - Not yet implemented; registered but disabled in UI
 * @property {Array<{
 *   key:string,
 *   mediaType:'image'|'video'|'audio',
 *   title:string,
 *   required?:boolean
 * }>}                         [mediaInputs] - Named media slots injected by Comfy node title.
 * @property {string[]}        [components]   - IDs of operation-specific sub-controls injected
 *                                              into MpiPromptBox's operation slot.
 *                                              Each ID maps to a component in js/components/.
 *                                              e.g. ['upscale'] or ['maskStrength'] or [] (none)
 * @property {Object}          [defaults]     - Per-control default override map, keyed by control id.
 *                                              Controls with scope:'perOp' look here first, then fall
 *                                              back to their own `defaultValue`. e.g. { denoise: 0.30 }
 * @property {Object}          [injectParams] - Constant workflow params this op ALWAYS injects, keyed by
 *                                              node title. For ops that share one graph and select a
 *                                              branch with a baked-false boolean (Krea2's t2i / i2i /
 *                                              poseReference all run krea2_t2i_<sfw|nsfw>.json). Merged in
 *                                              commandExecutor._buildParams BEFORE the user's control
 *                                              params, so a control can still override. Titles follow
 *                                              the tier-2 naming law and are matched case-insensitively;
 *                                              an unmatched title is silently skipped by the injector.
 * @property {'media'|'text'}  [outputKind]   - What a completed run PRODUCES. Defaults to 'media'.
 *                                              'text' declares the workflow returns a caption/string via
 *                                              the Output_prompt contract and saves no file, so the
 *                                              completion path must not treat its empty output-URL list
 *                                              as a cancelled run. Declared on the OP rather than
 *                                              inferred from an empty array because emptiness is
 *                                              ambiguous — a Stopped media job is also empty, and only
 *                                              the op knows which case it is. See generationService's
 *                                              onComplete.
 * @property {string}          [progressLabel] - Present-participle verb shown in the status bar while
 *                                              this op is running (e.g. 'Upscaling', 'Detailing').
 *                                              Defaults to 'Generating' when omitted. NEW OPS should
 *                                              set this if the default verb doesn't fit.
 */

/**
 * Runtime context passed to getAvailableCommands to filter by what's currently present.
 * All fields are optional — omitting one means "don't filter on that requirement".
 *
 * @typedef {Object} CommandContext
 * @property {number}  [imageCount] - Number of images currently in the PromptBox drop zone
 * @property {number}  [videoCount] - Number of videos currently available as input
 * @property {boolean} [hasMask]    - Whether the Mask Tool has produced an active mask
 * @property {boolean} [canMask]    - Whether the WORKSPACE offers a mask tool at all. This is the third
 *                                    availability dimension beside (model x media counts): `hasMask` says
 *                                    "no mask painted yet" (dim, the user can fix it), `canMask:false` says
 *                                    "no mask tool here" (absent — the Gallery has no canvas, so a dimmed
 *                                    Detail there can never light up). Defaults to true: omitting it keeps
 *                                    mask ops listed, so only a workspace that KNOWS it lacks the tool
 *                                    has to say so.
 */

/** @type {Record<string, CommandDef>} */
export const commands = {

    // ── Image — Model Operations ──────────────────────────────────────────────
    // These are tied to specific models via modelRegistry.workflows

    t2i: {
        label: 'Text to Image',
        short: 't2i',
        info: 'Text to Image — generate a new image from your prompt alone',
        help: {
            body: [
                'Generates a brand-new image from your prompt alone. Nothing is carried over from the gallery — what you write IS the whole picture.',
                'Describe the scene: subject, setting, lighting, framing. Look and medium belong in the style rack, not in the prompt.',
            ],
            examples: [
                { prompt: 'a rain-slick alley at night, neon signs reflected in the puddles, low camera angle', note: 'A scene the model can picture end to end.' },
                { prompt: 'make it better', bad: true, note: 'There is no "it" — this op has no input image to change.' },
            ],
            byModel: {
                // SDXL-family text encoders (CLIP) were trained on tag soup, not prose.
                // Krea2/Chroma/Flux read sentences; these read commas.
                sdxl: {
                    body: [
                        'Generates a brand-new image from your prompt alone.',
                        'This model family reads KEYWORDS, not sentences. Comma-separated tags land far better than prose, and the first tags weigh the most.',
                    ],
                    examples: [
                        { prompt: '1girl, red leather jacket, rain, neon, night, cinematic lighting, sharp focus', note: 'Comma-separated tags, most important first.' },
                        { prompt: 'I would like a picture of a woman standing in the rain at night', bad: true, note: 'Prose dilutes every tag in it.' },
                    ],
                },
            },
        },
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 0,
        promptRequired: true,
        // styleSelect/stylization/enhancePrompt are ALSO capability-gated per model
        // (MpiPromptBox._refreshOpSlot) — listing them here only says "this op's graph
        // has the nodes", not "every model shows them". Krea2's detailer/upscaler
        // graphs carry no style rack and no enhancer, so those ops omit all three.
        // qualityTier is gated the same way, on usesQualityTier(model.type): only a
        // tier-keyed model (Krea2) mounts it; SDXL/Chroma/Flux never see it.
        // Array order IS mount order (MpiPromptBox._refreshOpSlot appends in sequence):
        // the full-width tier block leads, the enhancer rides the bottom row beside
        // ratio + batch, so Krea2's panel matches LTX/Wan/SDXL. The turbo bolt sits
        // beside the enhancer — both are bare icon toggles, so they share that row.
        components: ['qualityTier', 'styleSelect', 'stylization', 'ratio', 'batch', 'krea2Turbo', 'enhancePrompt'],
    },
    i2i: {
        label: 'Image to Image',
        short: 'i2i',
        info: 'Image to Image — reshape an input image toward your prompt',
        help: {
            body: [
                'Redraws the input image toward your prompt. Composition survives; how far the result drifts is the Denoise slider — around 0.2 nudges, 0.6 and up reinvents.',
                'Describe the FINAL image you want, not the change you want made. This op does not follow instructions — that is Edit.',
            ],
            examples: [
                { prompt: 'the same portrait as an oil painting, thick visible brush strokes', note: 'Describes the destination, not the delta.' },
                { prompt: 'add a hat', bad: true, note: 'An instruction. Use Edit for that.' },
            ],
        },
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: true,
        // i2i shares the t2i graph (Input_Is_i2i flips the latent source), so it has
        // the same style rack + enhancer nodes. Capability-gated per model as above.
        // The boolean is baked FALSE in the graph and nothing else sets it, so without
        // this the op silently runs as t2i and ignores the input image.
        injectParams: { Input_Is_i2i: true },
        // denoise (`Input_denoise`, MpiFloat node 228) reaches the sampler ONLY through
        // the Input_Is_i2i gate (MpiIfElse 230), so it is live here and inert on t2i /
        // poseReference. Default matches the graph's baked 0.3. The bare `Denoise` key's
        // tier-2 alias `Input_Denoise` matches the node case-insensitively.
        components: ['qualityTier', 'styleSelect', 'stylization', 'denoise', 'ratio', 'batch', 'krea2Turbo', 'enhancePrompt'],
        defaults: { denoise: 0.30 },
    },
    // Depth-ControlNet pose transfer. Third op on the SAME krea2_t2i_<sfw|nsfw>.json graph:
    // Input_Image → AIO_Preprocessor → Krea2ControlImageEncode → Krea2ControlApply,
    // selected by the Input_depth_reference MpiIfElse. Composes with Input_Is_i2i
    // (left false here: pose conditions the MODEL, i2i swaps the LATENT source).
    poseReference: {
        label: 'Depth',
        short: 'depth',
        info: 'Depth Reference — copy the pose/composition of an input image',
        help: {
            body: [
                'Copies the pose and composition of the input image, then paints your prompt into that shape. The input is a skeleton — none of its colour, style or identity comes across.',
                'Describe the subject and the scene. Do NOT describe the pose: the depth map already carries it, and words spent on it are words not spent on the subject.',
            ],
            examples: [
                { prompt: 'a knight in tarnished silver armour, castle courtyard, overcast light', note: 'Subject and scene; the pose arrives from the image.' },
                { prompt: 'standing with both arms raised', bad: true, note: 'Re-states what the depth map already provides.' },
            ],
        },
        progressLabel: 'Generating',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: true,
        injectParams: { Input_depth_reference: true },
        components: ['qualityTier', 'styleSelect', 'stylization', 'ratio', 'batch', 'krea2Turbo', 'enhancePrompt'],
    },
    // FLUX.2 Klein's instruction edit (MPI-354). A separate op from `edit` and
    // `krea2Edit` for one reason: THREE reference images. `ReferenceLatent` sets
    // `reference_latents` with append=True, so chaining the node stacks references —
    // verified on the bench with a fox from ref-2 composited beside the woman from
    // ref-1 at correct scale, lighting and floor contact.
    //
    // Slots 2 and 3 are optional; empty leaves their MpiLoadImageFromPath self-gating,
    // so a 1-image edit runs unchanged. THREE is a deliberate cap, not a limit of the
    // node: each extra reference costs ~14 s (1/2/3 refs = 20/30/44 s), so an unlimited
    // slot list would let a user build a job whose cost they cannot see.
    //
    // Takes ratio (Klein's editor uses OUR dimensions, like krea2Edit) and the style
    // rack. No qualityTier — Klein is orientation-mode, one output class.
    kleinEdit: {
        label: 'Edit',
        short: 'edit',
        info: 'Edit — change the image following your prompt, with up to 3 reference images',
        help: {
            body: [
                'Edits the first image following your instruction. Add a second or third reference image to pull a subject, a style or an object from them into the result.',
                'Say what should CHANGE, not what the picture already is. With extra references, name which one you mean: "put the animal from Image 2 next to her".',
            ],
            examples: [
                { prompt: 'put the fox from Image 2 sitting beside her on the bench', note: 'Names the reference and the placement.' },
                { prompt: 'a woman on a bench with a fox', bad: true, note: 'Describes a scene instead of an edit; ignores which image is which.' },
            ],
        },
        progressLabel: 'Editing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage',  mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image',   required: true,  ordinal: true },
            { key: 'inputImage2', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_2', required: false, ordinal: true },
            { key: 'inputImage3', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_3', required: false, ordinal: true },
        ],
        promptRequired: true,
        components: ['styleSelect', 'stylization', 'ratio', 'enhancePrompt'],
    },
    upscale: {
        label: 'Upscale',
        short: 'upscale',
        info: 'Upscale — raise resolution while adding fine detail',
        help: {
            body: [
                'Raises resolution and invents the fine detail that was never in the pixels. The prompt is OPTIONAL and empty is the normal choice — detail follows the source image.',
                'Write a few words only to hint at what the picture is when the upscaler guesses wrong. A full new scene description will fight the source.',
            ],
            examples: [
                { prompt: '', note: 'Empty. What you want almost every time.' },
                { prompt: 'close-up portrait, skin texture, fabric weave', note: 'A hint about the subject, not a new scene.' },
            ],
        },
        progressLabel: 'Upscaling',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        // styleSelect/stylization mount only for a model carrying the rack on this op
        // (modelShowsStyleRack) — Klein's master graph, not Krea2's upscaler file.
        components: ['useGrid', 'upscaleFactor', 'denoise', 'krea2Turbo', 'styleSelect', 'stylization'],
        defaults: { denoise: 0.20 },
    },
    edit: {
        label: 'Edit',
        short: 'edit',
        info: 'Edit — change the whole image following your prompt',
        help: {
            body: [
                'Changes the image by following an INSTRUCTION. The model sees your picture and applies what you ask, leaving everything you did not mention alone.',
                'Write a command, not a description. The verb sets how hard it pushes: "replace" and "convert" are drastic, "change" and "make" are gentle.',
            ],
            examples: [
                { prompt: 'change her jacket to red leather', note: 'One clear instruction, one target.' },
                { prompt: 'a woman in a red leather jacket, studio light', bad: true, note: 'A description re-generates the picture instead of editing it.' },
            ],
        },
        progressLabel: 'Editing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: true,
        // Boogu-Image-Edit's op: a whole-image instruction edit that follows the SOURCE
        // image dimensions (no size picker) and exposes no controls. Krea2's edit is a
        // separate op (krea2Edit) — it uses OUR provided dims and needs ratio + style.
        components: [],
    },
    krea2Edit: {
        label: 'Edit',
        short: 'edit',
        info: 'Edit — change the whole image following your prompt',
        help: {
            body: [
                'Changes the image by following an INSTRUCTION. Everything you do not mention is preserved.',
                'Write only the DELTA — the part that changes. The look, the identity and the framing all come from the source image, so a long standalone description fights the edit rather than steering it.',
                'The verb is load-bearing: "replace" and "convert" push hard, "change" and "make" push softly. Stage a second image to bring in a reference the instruction can point at.',
            ],
            examples: [
                { prompt: 'change the jacket to red leather', note: 'Short, one target, everything else untouched.' },
                { prompt: 'convert the whole scene to winter, snow on every surface', note: 'A drastic verb when you mean drastic.' },
                { prompt: 'a woman in a red leather jacket standing on a city street at dusk', bad: true, note: 'A full scene description. Adherence comes from brevity here, not length.' },
            ],
        },
        progressLabel: 'Editing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage',  mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image',   required: true,  ordinal: true },
            // 2nd reference image (MPI-292): optional. Empty → Input_Image_2's
            // MpiLoadImageFromPath self-gates → 1-image edit runs fine. Only this op
            // declares two image slots, so PromptBox shows the 2nd chip in edit only.
            { key: 'inputImage2', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_2', required: false, ordinal: true },
        ],
        promptRequired: true,
        // Krea2's edit shares the t2i graph (Input_Is_Edit routes the identity-edit LoRA
        // path; baked FALSE, so this inject flips it on — same contract as i2i's
        // Input_Is_i2i). Localized/masked edit was removed (inconsistent results) — no
        // Input_Mask node in the graph anymore. The editor takes OUR provided dimensions
        // (not the source image size), so it needs ratio + qualityTier. Styles + the style
        // slider help the edit path, so they stay. No batch: Krea2's second sampler
        // produces artifacts on batched follow-ups.
        injectParams: { Input_Is_Edit: true },
        // NO enhancePrompt (MPI-310 session): the enhancer actively harms this op.
        // Krea2EditGroundedEncode feeds the instruction to Qwen3-VL *together with the
        // source image* (KREA2_EDIT_TEMPLATE in comfyui-krea2edit/__init__.py), so the
        // text carries only the DELTA — appearance comes from the frame=1 source latent.
        // An enhancer expands that delta into a standalone scene paragraph, which fights
        // the grounding, and edit verbs are load-bearing ("replace"/"convert" = drastic,
        // "change" = soft), so paraphrasing silently flips edit strength. Edit adherence
        // is tuned by grounding_px, not prompt length. Tried and failed: a "clarify, don't
        // expand" enhancer prompt.
        components: ['qualityTier', 'styleSelect', 'stylization', 'ratio', 'krea2Turbo'],
    },
    qwenEdit: {
        label: 'Edit',
        short: 'edit',
        info: 'Edit — change the image following your prompt',
        help: {
            body: [
                'Changes the image by following an INSTRUCTION. Everything you do not mention is preserved, and the output keeps the source image dimensions.',
                'Up to three reference images can be staged. Point at them by number — "image 1", "image 2" — and the model will pull from the right one.',
                'Two people in one edit is where this model is least reliable. Edit one subject at a time when the result matters.',
            ],
            examples: [
                { prompt: 'put the jacket from image 2 on the person in image 1', note: 'Numbered references when more than one image is staged.' },
                { prompt: 'change the background to a beach at sunset', note: 'One target; the subject is left alone.' },
                { prompt: 'swap both of their outfits and change the background', bad: true, note: 'Multi-subject plus scene change — split it into separate edits.' },
            ],
        },
        progressLabel: 'Editing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        // THREE image slots (MPI-300). Qwen-Image-Edit-2511 takes up to three
        // references natively (TextEncodeQwenImageEditPlus image1..3). Slots 2 and 3
        // are optional: an empty path makes Input_Image_2/_3's MpiLoadImageFromPath
        // self-gate, so a 1- or 2-image edit runs unchanged.
        mediaInputs: [
            { key: 'inputImage',  mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image',   required: true,  ordinal: true },
            { key: 'inputImage2', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_2', required: false, ordinal: true },
            { key: 'inputImage3', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_3', required: false, ordinal: true },
        ],
        promptRequired: true,
        // Its own op, NOT the shared 'edit' (that one is Boogu's: no controls, one image).
        // Qwen needs the tier radio + its own style rack. Output follows the SOURCE image
        // dimensions (ImageScaleToTotalPixels off the input), so there is no ratio picker.
        components: ['qwenTier', 'styleSelect', 'stylization'],
        // Qwen's style LoRAs overpower the edit at full strength — 0.8 is the usable
        // default. Krea2's ops keep the global 1.0. `stylization` stores per MODEL, but
        // defaults resolve per OP (_resolveDefault), and qwenEdit is Qwen's alone, so a
        // per-op default is the per-model default here without new machinery.
        defaults: { stylization: 0.8 },
    },
    detail: {
        label: 'Detail',
        short: 'detail',
        info: 'Detail — refine only the masked area with more detail',
        help: {
            body: [
                'Refines ONLY the masked area. The model can see what is under your mask and works from it, so this improves what is already there rather than replacing it.',
                'Name what the masked area IS. A short noun phrase is enough — the op already knows its job is "more detail".',
            ],
            examples: [
                { prompt: 'her face', note: 'Names the region so the refiner stays on target.' },
                { prompt: 'make it sharper and higher quality', bad: true, note: 'That is the op, not the subject. Say what is in the mask.' },
            ],
        },
        progressLabel: 'Detailing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        requiresMask: true,
        promptRequired: true,
        // styleSelect/stylization are listed but only mount for a model whose graph
        // carries the rack on THIS op — see modelShowsStyleRack. Klein's one master
        // graph does; Krea2's separate detailer file does not.
        components: ['denoise', 'krea2Turbo', 'styleSelect', 'stylization'],
        defaults: { denoise: 0.30 },
    },
    // Masked regeneration. Replaces the old `change` + `remove` pair, which were
    // never wired to a workflow or a model's supportedOps (deprecated in
    // operationRegistry rather than deleted, so a legacy history item still
    // validates). One op covers both jobs: with a prompt it replaces the masked
    // area, with an EMPTY prompt it erases and fills from the surroundings — hence
    // promptRequired:false. First wired by FLUX.2 Klein 4B; the other flux editors
    // plug into the same op.
    inpaint: {
        label: 'Inpaint',
        short: 'inpaint',
        info: 'Inpaint — regenerate the masked area; leave the prompt empty to erase it',
        // The prompt is the ROUTER for this op, not a flavour knob: an empty prompt runs
        // the erase path, any text runs the fill path. That makes this guide load-bearing
        // — a user who never reads it can still paint-and-go (empty = erase), but the
        // "never write an instruction to delete" line is the one that stops the classic
        // failure of "remove the tattoo" painting a tattoo. If a model ever routes on
        // trigger WORDS rather than emptiness (Klein's MpiTextContains plan), the word
        // list belongs in a `byModel` override here, beside the behaviour it describes.
        help: {
            body: [
                'The model can NOT see what is under your mask. It generates that area from scratch, using only the pixels around it for context.',
                'Leave the prompt EMPTY to remove the masked object, or write what you would like to see there instead.',
                'Never write an instruction to delete something. The model reads your words as things to DRAW — "remove the tattoo" risks painting a tattoo.',
            ],
            examples: [
                { prompt: '', note: 'Removes the masked object, filling from the surrounding area.' },
                { prompt: 'hat', note: 'Generates a hat in the masked area.' },
                { prompt: 'remove the tattoo', bad: true, note: 'Reads as "draw a tattoo". Use an empty prompt to erase.' },
            ],
        },
        progressLabel: 'Inpainting',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        requiresMask: true,
        promptRequired: false,
        // Style rack, gated per model as everywhere else (modelShowsStyleRack). Klein's
        // master graph carries it on this branch too. NOTE it styles the PATCH, not the
        // picture: useful when inpainting new content, unhelpful on a plain erase where
        // the fill should match its surroundings — so leave it on None to remove.
        components: ['styleSelect', 'stylization'],
    },
    // NVIDIA PiD generative upscaler. One workflow, internal 4-path VAE selector
    // (pidVariant → Input_Type) + output-size selector (pidResolution → Input_Resolution),
    // both 1-indexed MpiAnySwitch. denoise slider maps to PiD's degrade_sigma (Input_Denoise);
    // default 0.0 = faithful. Prompt optional (empty works).
    pid: {
        label: 'Upscale',
        short: 'upscale',
        info: 'Upscale — raise resolution while adding fine detail',
        help: {
            body: [
                'A generative upscaler: it rebuilds detail rather than interpolating it. The prompt is OPTIONAL and empty keeps the result faithful to the source.',
                'Denoise decides how much licence it takes — 0.0 is faithful, higher lets it invent.',
            ],
            examples: [
                { prompt: '', note: 'Empty. Faithful to what is already there.' },
                { prompt: 'weathered stone wall, moss', note: 'A hint when the source is ambiguous at low resolution.' },
            ],
        },
        progressLabel: 'Upscaling',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        components: ['pidVariant', 'pidResolution', 'denoise'],
        defaults: { denoise: 0.0 },
    },

    // ── Video — Model Operations ──────────────────────────────────────────────

    t2v: {
        label: 'Text to Video',
        short: 't2v',
        info: 'Text to Video — generate a video clip from your prompt alone',
        help: T2V_HELP,
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        promptRequired: true,
        components: ['qualityTier', 'duration', 'ratio'],
    },
    i2v: {
        label: 'Image to Video',
        short: 'i2v',
        info: 'Image to Video — animate an input image into a video clip',
        help: I2V_HELP,
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 1,
        mediaInputs: [
            { key: 'startFrame', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Start_Frame', required: true },
            { key: 'endFrame', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_End_Frame', required: false },
        ],
        promptRequired: false,
        components: ['qualityTier', 'duration', 'motionIntensity', 'ratio'],
    },
    t2v_ms: {
        label: 'Text to Video',
        short: 't2v',
        info: 'Text to Video — generate a video clip from your prompt alone',
        help: T2V_HELP,
        icon: 'text',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        // Audio slot is model-capability-gated: only models with
        // capabilities.audio (LTX) surface/accept it. WAN filters it out at the
        // slot read points (MpiPromptBox._mediaSlotsForOperation, commandExecutor).
        mediaInputs: [
            { key: 'inputAudio', mediaType: 'audio', title: 'Input_audio', required: false },
        ],
        promptRequired: true,
        // audioMode is capability-gated (only models with capabilities.audio mount
        // it — MpiPromptBox skips it for WAN). Ordered first in the op slot.
        components: ['audioMode', 'useAudio', 'qualityTier', 'duration', 'ratio', 'previewStage'],
        // Two-stage (preview→stage-2) op. Drives the preview/latent-staging path
        // in commandExecutor. Replaces the old `operation.endsWith('_ms')` magic
        // (MPI-128). Whether a given MODEL exposes it is still gated by
        // capabilities.multiStage.
        isMultiStage: true,
        // Preview cards from this op show a Continue button (branch stage-2 to
        // a NEW card) in addition to Finish (replace preview with final).
        // WAN supports branching because its low-stage LoRAs vary the stage-2
        // result; future models without per-stage LoRA variance (LTX, image-_ms)
        // should leave this false and surface only the Finish button.
        allowsBranchingContinue: true,
    },
    i2v_ms: {
        label: 'Image to Video',
        short: 'i2v',
        info: 'Image to Video — animate an input image into a video clip',
        help: I2V_HELP,
        icon: 'image',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 1,
        // Audio slot is model-capability-gated (see t2v_ms note). WAN gets only
        // the two image frame slots; LTX additionally accepts the audio slot.
        mediaInputs: [
            { key: 'startFrame', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Start_Frame', required: true },
            { key: 'endFrame', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_End_Frame', required: false },
            { key: 'inputAudio', mediaType: 'audio', title: 'Input_audio', required: false },
        ],
        promptRequired: false,
        // audioMode capability-gated (see t2v_ms note); ordered first.
        components: ['audioMode', 'useAudio', 'qualityTier', 'duration', 'motionIntensity', 'ratio', 'previewStage'],
        // Two-stage op (see t2v_ms note). MPI-128.
        isMultiStage: true,
        allowsBranchingContinue: true,
    },
    extend: {
        label: 'Extend',
        short: 'extend',
        info: 'Extend — continue an input video with more footage',
        help: {
            body: [
                'Continues an input video from its last frame. The clip you staged decides the look; the prompt decides only what happens NEXT.',
                'Leave it empty to let the motion carry on by itself.',
            ],
            examples: [
                { prompt: '', note: 'Continues the existing motion.' },
                { prompt: 'he walks out of frame to the left', note: 'What should happen next, not what already happened.' },
            ],
        },
        progressLabel: 'Extending',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        requiresVideo: 1,
        mediaInputs: [
            { key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true },
        ],
        promptRequired: false,
        components: [],
    },

    // ── Universal Workflows (not model-tied) ──────────────────────────
    // These appear regardless of active model; they have their own workflow files.

    interpolate: {
        label: 'Interpolate',
        progressLabel: 'Interpolating',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        requiresVideo: 1,
        mediaInputs: [
            { key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true },
        ],
        promptRequired: false,
        universal: true,     // not model-tied; uses universalWorkflows in modelRegistry
    },
    videoUpscale: {
        label: 'Video Upscale',
        progressLabel: 'Upscaling',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        requiresVideo: 1,
        mediaInputs: [
            { key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true },
        ],
        promptRequired: false,
        universal: true,
    },
    imageUpscale: {
        label: 'Image Upscale',
        progressLabel: 'Upscaling',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        universal: true,
    },
    // MPI-310 — the captioner. Produces a caption string via Output_prompt and writes
    // no file, hence outputKind: 'text'. Owned by the image-describer PLUGIN (see
    // js/data/pluginsRegistry.js), which owns its encoder weight.
    imageDescribe: {
        label: 'Describe Image',
        info: 'Describe Image — write a detailed prompt from the picture',
        progressLabel: 'Describing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        outputKind: 'text',
        universal: true,
    },
    removeBackground: {
        label: 'Remove Background',
        progressLabel: 'Removing background',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        universal: true,
    },
    autoMaskImg: {
        label: 'Auto Masking',
        progressLabel: 'Masking',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        universal: true,
    },
    resize: {
        label: 'Resize',
        progressLabel: 'Resizing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        universal: true,
        injector: 'resize',
    },
    resizeVideo: {
        label: 'Resize Video',
        progressLabel: 'Resizing',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresVideo: 1,
        mediaInputs: [
            { key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true },
        ],
        promptRequired: false,
        universal: true,
        injector: 'resize',
    },
    appImageRegen: {
        label: 'App: Image Regen',
        progressLabel: 'Generating',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: true,
        universal: true,   // first Apps op (MPI-256) — app_sdxl_regen.json, i2i baked true.
    },
    appSdxl4k: {
        label: 'App: SDXL 4K',
        progressLabel: 'Generating',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 0,          // all image inputs optional — runs t2i with none (MPI-259).
        // Up to 2 optional image slots → Input_Image / Input_Image_2 (MpiLoadImageFromPath
        // nodes — take a filesystem PATH in their `string` input; empty path self-gates its
        // Output_Image* branch via ExecutionBlocker, no card). role keys match the app's
        // inputSchema. Injector routes these class='MpiLoadImageFromPath' slots through the
        // media path-resolve branch (local path / Pod-uploaded path), not an upload-name.
        mediaInputs: [
            { key: 'image1', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image',   required: false },
            { key: 'image2', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_2', required: false },
        ],
        promptRequired: true,
        universal: true,            // 2nd Apps op — app_sdxl_4k.json, multi-model (sdxl-nsfw + nvidia-pid).
    },
    appVideoStitch: {
        label: 'App: Video Stitch',
        progressLabel: 'Stitching',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,          // no image inputs — video utility, NO generation model.
        // Video utility (app_video_test.json): up to 2 video PATHS (MpiString Input_video /
        // Input_video_2 — VHS_LoadVideoPath reads the string) stitched side-by-side, plus an
        // optional audio track. Empty video paths self-gate their branch via MpiAnyChecker/
        // MpiBlockIfEmpty/MpiIfElse; empty audio keeps the baked LoadAudio placeholder.
        // Titles are LOWERCASE/numbered to match the authored nodes; the injector matches
        // case-insensitively and the media-kind sweep pattern-forces input_video*/input_audio*.
        mediaInputs: [
            { key: 'video1', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_video',   required: false },
            { key: 'video2', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_video_2', required: false },
            // Audio slot: mediaType is the string 'audio' (MEDIA_TYPE only enumerates
            // image/video). The app's audio item carries mediaType 'audio' too, so the
            // role-first match in _buildParams lines up — with VIDEO here it never matched
            // and Input_audio was never injected (output kept the source's own audio).
            { key: 'audio1', mediaType: 'audio', title: 'Input_audio', required: false },
        ],
        promptRequired: false,      // pure media utility — no prompt.
        universal: true,            // 3rd Apps op — app_video_test.json, NO model.
    },
    appHeadSwap: {
        label: 'App: Head Swap',
        progressLabel: 'Swapping',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 0,          // media never a hard requirement at the op layer (the
                                    // app's own UI walks the user through supplying both).
        // Two image slots: the TARGET (the body/scene kept) and the SOURCE (the head taken).
        // MpiLoadImageFromPath nodes — full path into their `string` input, self-gating on
        // empty. Each slot has an OPTIONAL companion Mpi Box (Input_Box / Input_Box_2,
        // suffix matches the image slot) carrying the head region in top-left SOURCE pixels;
        // boxes are injectionParams, not media, so they are not declared here.
        mediaInputs: [
            { key: 'image1', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image',   required: false },
            { key: 'image2', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image_2', required: false },
        ],
        // Fixed-prompt outcome app: the graph has NO Input_Positive/Input_Negative — both
        // prompts are BAKED. Do not add a prompt box for this app.
        promptRequired: false,
        universal: true,            // 4th Apps op — app_head_swap.json, qwen-edit + app LoRA.
        // MpiBox carries FOUR widgets (x/y/width/height); the generic title injector
        // writes a single value into one widget name and would match the node but
        // silently write nothing. headSwapInjector is the only path a box takes.
        injector: 'headSwap',
    },

    // ── Future Stubs ──────────────────────────────────────────────────────────
    // Registered so the registry is complete; disabled in UI until implemented.

    createGroupFromSelection: {
        label: 'Create Group from Selection',
        mediaType: null,
        requiresImages: 0,
        stub: true,
    },
    promoteToNewGroup: {
        label: 'Promote to New Group',
        mediaType: null,
        requiresImages: 0,
        stub: true,
    },
};

export const COMMANDS = commands;

/**
 * Ops where a style-LoRA model shows the style rack WHEN IT DOES NOT SAY OTHERWISE.
 *
 * Historically the rack's reach was implied by which ops happened to list
 * `styleSelect` in `components`. That stopped working once a model shipped ONE master
 * graph for every op (FLUX.2 Klein, MPI-354): its detail and upscale branches carry the
 * same rack as t2i, but Krea2's detailer/upscaler are SEPARATE files with no rack at
 * all. So `detail`/`upscale` must offer the control to one model and not the other,
 * which a per-op `components` list cannot express.
 *
 * The op's `components` still decides whether the control EXISTS for that op; this
 * decides whether a given MODEL may show it. A model opts out of the default by
 * declaring `styleOps` (see ModelDef) — Klein declares all seven.
 *
 * This list is exactly the set that mounted the rack before the mechanism existed, so
 * every pre-Klein model behaves identically. Do NOT add to it: a new model that wants
 * the rack somewhere else declares `styleOps`.
 */
export const DEFAULT_STYLE_OPS = Object.freeze(['t2i', 'i2i', 'poseReference', 'krea2Edit', 'qwenEdit']);

/**
 * May `model` show the style rack on `operation`?
 *
 * Returns false for a model with no style LoRAs at all. Otherwise honours the model's
 * own `styleOps` when declared, else `DEFAULT_STYLE_OPS`.
 */
export function modelShowsStyleRack(model, operation) {
    if (model?.capabilities?.styleLoras !== true) return false;
    const allowed = Array.isArray(model?.styleOps) ? model.styleOps : DEFAULT_STYLE_OPS;
    return allowed.includes(operation);
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all non-stub commands for a given media type, filtered by the
 * active model's supported ops and the current runtime context.
 *
 * The returned list is what the PromptBox and radial menu render, in canonical
 * OP_ORDER (never registry or supportedOps order) so an op holds its position
 * across models.
 *
 * Two kinds of unavailable, and they are NOT interchangeable: a command the
 * model+workspace can run but whose inputs aren't staged yet is returned with
 * `available: false` (the UI dims it). A command that can never run here — the
 * model doesn't declare it, the user didn't install it, or the workspace has no
 * mask tool — is not returned at all.
 *
 * @param {'image'|'video'}              mediaType
 * @param {import('./modelRegistry.js').ModelDef|null} model
 * @param {CommandContext}               [ctx]
 * @returns {Array<{key: string, available: boolean} & CommandDef>}
 */
// MPI-337: max media of a type an op accepts = number of declared input slots of
// that type. Falls back to the requires* minimum for ops with no mediaInputs, so
// a legacy op degenerates to "count must equal its minimum" rather than uncapped.
function _maxMediaSlots(cmd, mediaType, minFallback) {
    const slots = Array.isArray(cmd.mediaInputs)
        ? cmd.mediaInputs.filter(s => s.mediaType === mediaType).length
        : 0;
    return slots || Math.max(0, Number(minFallback) || 0);
}

/**
 * MPI-356: canonical strip order, keyed on `short` (not op key), so a verb keeps
 * roughly the same slot across models — Krea2's `krea2Edit` and Qwen's `qwenEdit`
 * both sit where `edit` sits. Image and video ops share one list because
 * getAvailableCommands never mixes media types in a single result.
 * Ops with no `short` (or an unlisted one) sort to the end keeping their registry
 * order — Array.prototype.sort is stable.
 */
export const OP_ORDER = Object.freeze([
    't2i', 'i2i', 'depth', 'edit', 'upscale', 'detail', 'inpaint',
    't2v', 'i2v', 'extend',
]);

function _orderIndex(cmd) {
    const i = OP_ORDER.indexOf(cmd.short);
    return i === -1 ? OP_ORDER.length : i;
}

export function getAvailableCommands(mediaType, model = null, ctx = {}) {
    const { imageCount = 0, videoCount = 0, hasMask = false, canMask = true, installedOps = null } = ctx;

    // When the caller supplies the model's physically-installed op set (MPI-122),
    // a selectable op the user did NOT install is hidden — so a T2V-only install
    // never offers I2V in the PromptBox. Absent installedOps (image models, or
    // status not yet known) → fall back to static supportedOps, no behaviour change.
    const installedSet = Array.isArray(installedOps) ? new Set(installedOps) : null;

    return Object.entries(commands)
        .filter(([, cmd]) => !cmd.stub && cmd.mediaType === mediaType)
        .filter(([key, cmd]) => {
            if (cmd.universal) return false;
            // MPI-356: workspace capability. A mask op in a workspace with no mask
            // tool is ABSENT, not dimmed — the Gallery has no canvas, so its Detail
            // entry could never light up no matter what the user did.
            if (cmd.requiresMask && !canMask) return false;
            if (!model) return true;
            if (!model.supportedOps.includes(key)) return false;
            // Only gate ops the model declares as selectable operation groups; ops
            // that always ship with the model (no `operations` entry) stay visible.
            if (installedSet && model.operations && model.operations[key]) {
                return installedSet.has(key);
            }
            return true;
        })
        .map(([key, cmd]) => {
            // MPI-337: gate on BOTH bounds. The min (requires*) was always here;
            // the max = number of declared input slots of that type. i2i/depth/
            // upscale have 1 image slot so they can't run on 2 chips — only
            // krea2Edit (2 slots) / qwen (3) can. Without the upper bound those
            // ops showed selectable/enabled with 2 chips staged.
            const maxImages = _maxMediaSlots(cmd, MEDIA_TYPE.IMAGE, cmd.requiresImages);
            const maxVideos = _maxMediaSlots(cmd, MEDIA_TYPE.VIDEO, cmd.requiresVideo);
            const available =
                imageCount >= (cmd.requiresImages ?? 0) &&
                imageCount <= maxImages &&
                videoCount >= (cmd.requiresVideo ?? 0) &&
                videoCount <= maxVideos &&
                (!cmd.requiresMask || hasMask);
            return { key, available, ...cmd };
        })
        .sort((a, b) => _orderIndex(a) - _orderIndex(b));
}

/**
 * Returns all universal (tool-panel) commands for a given media type.
 * These are NOT shown in the PromptBox — they are wired to toolbar buttons
 * in the history workspace, each with its own activation behaviour.
 *
 * @param {'image'|'video'} mediaType
 * @returns {Array<{key: string} & CommandDef>}
 */
export function getToolCommands(mediaType) {
    return Object.entries(commands)
        .filter(([, cmd]) => cmd.universal && cmd.mediaType === mediaType)
        .map(([key, cmd]) => ({ key, ...cmd }));
}

/**
 * Returns a single command definition by key.
 * @param {string} key
 * @returns {CommandDef|null}
 */
export function getCommand(key) {
    return commands[key] ?? null;
}

/**
 * Returns a command's declared media input slots, falling back to the legacy
 * requiresImages/requiresVideo counters for operations not yet migrated.
 * @param {string} key
 * @returns {Array<{key:string, mediaType:'image'|'video'|'audio', title:string, required:boolean}>}
 */
export function getCommandMediaInputs(key) {
    const cmd = commands[key];
    if (!cmd) return [];
    if (Array.isArray(cmd.mediaInputs)) {
        return cmd.mediaInputs.map(slot => ({ required: true, ...slot }));
    }

    const slots = [];
    const imageCount = Math.max(0, Number(cmd.requiresImages) || 0);
    const videoCount = Math.max(0, Number(cmd.requiresVideo) || 0);
    for (let i = 0; i < imageCount; i++) {
        slots.push({
            key: i === 0 ? 'inputImage' : `inputImage${i + 1}`,
            mediaType: MEDIA_TYPE.IMAGE,
            title: i === 0 ? 'Input_Image' : `Input_Image_${i + 1}`,
            required: true,
        });
    }
    for (let i = 0; i < videoCount; i++) {
        slots.push({
            key: i === 0 ? 'inputVideo' : `inputVideo${i + 1}`,
            mediaType: MEDIA_TYPE.VIDEO,
            title: i === 0 ? 'Input_Video' : `Input_Video_${i + 1}`,
            required: true,
        });
    }
    return slots;
}

/**
 * Capability-gates a slot list for a given model. The shared video ops
 * (i2v_ms/t2v_ms) declare an audio slot, but only models with
 * `capabilities.audio` (LTX) may surface/accept it; WAN must not. Call this at
 * every read point where the slot list drives UI acceptance or injection.
 * @param {Array<{mediaType:string}>} slots
 * @param {import('./modelRegistry.js').ModelDef|null} [model]
 * @returns {Array<{mediaType:string}>}
 */
export function filterMediaInputsForModel(slots, model = null) {
    // No model = a universal/App op (model.id === null). Its declared slots ARE the
    // contract — there's no per-model audio capability to gate against, so keep them
    // all (an App that declares an audio slot must inject it). The capability gate below
    // only exists to drop LTX's audio slot on WAN, which has no capabilities.audio.
    if (!model) return slots;
    if (model.capabilities?.audio === true) return slots;
    return slots.filter(slot => slot.mediaType !== 'audio');
}

/**
 * Drops explicit role tags that point at ORDINAL slots (slots marked
 * `ordinal: true` — positional aliases like "image 1/2/3" where the chip's
 * strip order IS the meaning). Sticky ordinal roles go stale: removing chip 1
 * left the survivors tagged inputImage2/inputImage3, so the role-first slot
 * assignment stranded the REQUIRED inputImage — Qwen-Edit's block_if_empty
 * Input_Image then ExecutionBlocked the whole graph into a silent zero-output
 * (MPI-330). With the tags dropped, the positional fill assigns ordinal slots
 * by item order, which always matches the numbered chip badges. Non-ordinal
 * roles (startFrame/endFrame, Head Swap's image1/image2) stay sticky — those
 * slots are semantic, never positional (MPI-306: never repack).
 * Call at EVERY slot-assignment point (PromptBox + commandExecutor).
 * @param {Array<{key:string, ordinal?:boolean}>} slots
 * @param {Array<{role?:string}>} items
 * @returns {Array<Object>} copies of items with stale ordinal roles removed
 */
export function stripOrdinalMediaRoles(slots, items) {
    const ordinalKeys = new Set(slots.filter(s => s.ordinal === true).map(s => s.key));
    if (!ordinalKeys.size) return items;
    return items.map(item =>
        ordinalKeys.has(item.role) ? { ...item, role: undefined } : item
    );
}

/**
 * Returns the component IDs for an operation's sub-controls injected into
 * MpiPromptBox's operation slot.
 * @param {string} key
 * @returns {string[]}
 */
export function getCommandComponents(key) {
    return commands[key]?.components ?? [];
}

/**
 * Returns the per-control default-override value for an op. Used by controls
 * with scope:'perOp' so the same control (e.g. denoise) can ship different
 * defaults across ops (upscale=0.20, detail=0.30) without per-op control
 * definitions.
 * @param {string} key
 * @param {string} controlId
 * @returns {*|undefined}
 */
export function getCommandDefault(key, controlId) {
    return commands[key]?.defaults?.[controlId];
}

/**
 * Whether an `_ms` operation's preview card should expose a branching Continue
 * button (creates a NEW final card per click, preview stays). When false, the
 * preview card only exposes Finish (preview→final replacement). WAN sets this
 * true because per-stage LoRAs make branching meaningful; LTX and future
 * single-LoRA models leave it false.
 * @param {string} key
 * @returns {boolean}
 */
/**
 * Whether an operation is a two-stage (preview → stage-2) command. Replaces the
 * legacy `String(operation).endsWith('_ms')` suffix magic (MPI-128). Note this
 * is op-level; whether a given MODEL exposes the multi-stage UI is separately
 * gated by `model.capabilities.multiStage`.
 * @param {string} key
 * @returns {boolean}
 */
export function commandIsMultiStage(key) {
    return commands[key]?.isMultiStage === true;
}

export function commandAllowsBranchingContinue(key, model = null) {
    if (commands[key]?.allowsBranchingContinue !== true) return false;
    // The op-level flag is the ceiling (this op CAN branch). On a SHARED _ms op
    // (WAN + LTX both use t2v_ms/i2v_ms), branching is additionally gated per
    // model: only models whose stage-2 result varies (per-stage LoRAs) expose
    // Continue. WAN declares capabilities.branchingContinue; LTX omits it →
    // Finish-only. When no model is supplied, fall back to the op flag (callers
    // that don't have a model in scope, e.g. WAN-era single-model checks).
    if (model && model.capabilities) return model.capabilities.branchingContinue === true;
    return true;
}

/**
 * Resolves the prompting guide for an op against the active model (MPI-360).
 *
 * Three layers, cheapest first: the op's own `help`, a `byModel` override picked
 * by model **id** then model **type**, and a synthesised fallback built from
 * `label` + `info` so an op with no authored guide still opens something useful
 * instead of an empty popup.
 *
 * The override is a SHALLOW merge — an entry supplies only the keys that differ,
 * so an `sdxl` override that changes `body` and `examples` still inherits the
 * base `title` and `media`.
 *
 * @param {string} key                       Operation key (`inpaint`, `krea2Edit`, …)
 * @param {{id?:string, type?:string}|null} [model]
 * @returns {{title:string, body:string[], examples:Array<{prompt:string,note?:string,bad?:boolean}>, media:string[]}|null}
 *          null only when the key is unknown.
 */
export function getOpHelp(key, model = null) {
    const cmd = commands[key];
    if (!cmd) return null;

    const base = cmd.help || {};
    const override = model
        ? (base.byModel?.[model.id] ?? base.byModel?.[model.type])
        : undefined;
    const help = override ? { ...base, ...override } : base;

    return {
        title: help.title || cmd.label || key,
        // No authored body → the one-liner already shown on hover. Strip the
        // "Label — " prefix the info strings carry; the title says it already.
        body: help.body?.length
            ? help.body
            : (cmd.info ? [String(cmd.info).replace(/^[^—]+—\s*/, '')] : []),
        examples: help.examples || [],
        media: help.media || [],
    };
}

/**
 * Present-participle verb for the status bar while this op runs.
 * Falls back to 'Generating' when the command omits `progressLabel`
 * or when the key is unknown.
 * @param {string} key
 * @returns {string}
 */
export function getCommandProgressLabel(key) {
    return commands[key]?.progressLabel || 'Generating';
}
