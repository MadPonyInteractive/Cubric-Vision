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
 * @typedef {Object} CommandDef
 * @property {string}          label          - Display name shown in UI
 * @property {string}          [info]         - One-line description shown in the status bar on hover in the op dropdown.
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
 *                                              poseReference all run krea2_turbo_t2i.json). Merged in
 *                                              commandExecutor._buildParams BEFORE the user's control
 *                                              params, so a control can still override. Titles follow
 *                                              the tier-2 naming law and are matched case-insensitively;
 *                                              an unmatched title is silently skipped by the injector.
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
 */

/** @type {Record<string, CommandDef>} */
export const commands = {

    // ── Image — Model Operations ──────────────────────────────────────────────
    // These are tied to specific models via modelRegistry.workflows

    t2i: {
        label: 'Text to Image',
        info: 'Text to Image — generate a new image from your prompt alone',
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
        // ratio + batch, so Krea2's panel matches LTX/Wan/SDXL.
        components: ['qualityTier', 'styleSelect', 'stylization', 'ratio', 'batch', 'enhancePrompt'],
    },
    i2i: {
        label: 'Image to Image',
        info: 'Image to Image — reshape an input image toward your prompt',
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
        components: ['qualityTier', 'styleSelect', 'stylization', 'denoise', 'ratio', 'batch', 'enhancePrompt'],
        defaults: { denoise: 0.30 },
    },
    // Depth-ControlNet pose transfer. Third op on the SAME krea2_turbo_t2i.json graph:
    // Input_Image → AIO_Preprocessor → Krea2ControlImageEncode → Krea2ControlApply,
    // selected by the Input_pose_reference MpiIfElse. Composes with Input_Is_i2i
    // (left false here: pose conditions the MODEL, i2i swaps the LATENT source).
    poseReference: {
        label: 'Pose Reference',
        info: 'Pose Reference — copy the pose/composition of an input image',
        progressLabel: 'Generating',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: true,
        injectParams: { Input_pose_reference: true },
        components: ['qualityTier', 'styleSelect', 'stylization', 'ratio', 'batch', 'enhancePrompt'],
    },
    upscale: {
        label: 'Upscale',
        info: 'Upscale — raise resolution while adding fine detail',
        progressLabel: 'Upscaling',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: false,
        components: ['useGrid', 'upscaleFactor', 'denoise'],
        defaults: { denoise: 0.20 },
    },
    edit: {
        label: 'Edit',
        info: 'Edit — change the whole image following your prompt',
        progressLabel: 'Editing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        promptRequired: true,
        components: [],
    },
    detail: {
        label: 'Detail',
        info: 'Detail — refine only the masked area with more detail',
        progressLabel: 'Detailing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        requiresMask: true,
        promptRequired: true,
        components: ['denoise'],
        defaults: { denoise: 0.30 },
    },
    change: {
        label: 'Change',
        info: 'Change — replace the masked area to match your prompt',
        progressLabel: 'Changing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        requiresMask: true,
        promptRequired: true,
        components: [],
    },
    remove: {
        label: 'Remove',
        info: 'Remove — erase the masked area and fill the background',
        progressLabel: 'Removing',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        mediaInputs: [
            { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
        ],
        requiresMask: true,
        promptRequired: true,
        components: [],
    },
    // NVIDIA PiD generative upscaler. One workflow, internal 4-path VAE selector
    // (pidVariant → Input_Type) + output-size selector (pidResolution → Input_Resolution),
    // both 1-indexed MpiAnySwitch. denoise slider maps to PiD's degrade_sigma (Input_Denoise);
    // default 0.0 = faithful. Prompt optional (empty works).
    pid: {
        label: 'Upscale',
        info: 'Upscale — raise resolution while adding fine detail',
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
        info: 'Text to Video — generate a video clip from your prompt alone',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        promptRequired: true,
        components: ['qualityTier', 'duration', 'ratio'],
    },
    i2v: {
        label: 'Image to Video',
        info: 'Image to Video — animate an input image into a video clip',
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
        info: 'Text to Video — generate a video clip from your prompt alone',
        icon: 'text',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        // Audio slot is model-capability-gated: only models with
        // capabilities.audio (LTX) surface/accept it. WAN filters it out at the
        // slot read points (MpiPromptBox._mediaSlotsForOperation, commandExecutor).
        mediaInputs: [
            { key: 'inputAudio', mediaType: 'audio', title: 'Input_Audio_File', required: false },
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
        info: 'Image to Video — animate an input image into a video clip',
        icon: 'image',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 1,
        // Audio slot is model-capability-gated (see t2v_ms note). WAN gets only
        // the two image frame slots; LTX additionally accepts the audio slot.
        mediaInputs: [
            { key: 'startFrame', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Start_Frame', required: true },
            { key: 'endFrame', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_End_Frame', required: false },
            { key: 'inputAudio', mediaType: 'audio', title: 'Input_Audio_File', required: false },
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
        info: 'Extend — continue an input video with more footage',
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
        universal: true,   // first Apps op (MPI-256) — App_sdxl_regen.json, i2i baked true.
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
        universal: true,            // 2nd Apps op — App_sdxl_4k.json, multi-model (sdxl-nsfw + nvidia-pid).
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

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all non-stub commands for a given media type, filtered by the
 * active model's supported ops and the current runtime context.
 *
 * The returned list is what the PromptBox and radial menu render.
 * Commands whose input requirements aren't met are included but marked
 * `available: false` so the UI can grey them out rather than hide them.
 *
 * @param {'image'|'video'}              mediaType
 * @param {import('./modelRegistry.js').ModelDef|null} model
 * @param {CommandContext}               [ctx]
 * @returns {Array<{key: string, available: boolean} & CommandDef>}
 */
export function getAvailableCommands(mediaType, model = null, ctx = {}) {
    const { imageCount = 0, videoCount = 0, hasMask = false, installedOps = null } = ctx;

    // When the caller supplies the model's physically-installed op set (MPI-122),
    // a selectable op the user did NOT install is hidden — so a T2V-only install
    // never offers I2V in the PromptBox. Absent installedOps (image models, or
    // status not yet known) → fall back to static supportedOps, no behaviour change.
    const installedSet = Array.isArray(installedOps) ? new Set(installedOps) : null;

    return Object.entries(commands)
        .filter(([, cmd]) => !cmd.stub && cmd.mediaType === mediaType)
        .filter(([key, cmd]) => {
            if (cmd.universal) return false;
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
            const available =
                imageCount >= (cmd.requiresImages ?? 0) &&
                videoCount >= (cmd.requiresVideo ?? 0) &&
                (!cmd.requiresMask || hasMask);
            return { key, available, ...cmd };
        });
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
    if (model?.capabilities?.audio === true) return slots;
    return slots.filter(slot => slot.mediaType !== 'audio');
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
 * Present-participle verb for the status bar while this op runs.
 * Falls back to 'Generating' when the command omits `progressLabel`
 * or when the key is unknown.
 * @param {string} key
 * @returns {string}
 */
export function getCommandProgressLabel(key) {
    return commands[key]?.progressLabel || 'Generating';
}
