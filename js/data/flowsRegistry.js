/**
 * flowsRegistry.js — Source of truth for Flows (outcome flows, MPI-256).
 *
 * A Flow is an outcome-oriented workflow surfaced behind the dev-gated Flow Library
 * overlay: pick a flow → open its overlay → collect inputs → Run → the job enters
 * the EXISTING generation queue and lands as a normal gallery card.
 *
 * Unlike modelRegistry, this registry is READ-ONLY over install state — flows own no
 * install-sync machinery (no syncModelInstalled, no remoteEngineClient); they READ
 * caches the model sync already populates. Do not cargo-cult the sync side here.
 *
 * Availability has TWO inputs (MPI-304):
 *   - `requiredModels` → `state.s_installedModelIds` (already isModelUsable-filtered, MPI-122)
 *   - `requiredDeps`   → the per-dep status cache, keyed `flow:<id>` (modelRegistry.js)
 * Both gate the SAME badge and the SAME Run guard — a missing dep blocks exactly like a
 * missing model, and surfaces as one extra row in the slide-over's required list.
 *
 * Flow count is tiny (dev-gated until ≥4 flows exist), so the descriptor array lives
 * inline here rather than in a separate flowConstants/ file. Split it out only if the
 * array grows large enough to warrant it.
 *
 * @typedef {Object} FlowDef
 * @property {string}   id             - Unique identifier
 * @property {string}   title          - Display name (card + slide-over)
 * @property {string}   preview        - Preview image filename (card + slide-over)
 * @property {string}   description    - Slide-over copy
 * @property {string[]} requiredModels - MODEL ids (NOT dep ids); drives the availability badge
 * @property {string[]} [requiredDeps] - DEP ids (dependencies.js facade) this flow needs on top
 *                                       of its models — flow-only weights/nodes that no model
 *                                       requires. Filed in the dep file for their KIND, never
 *                                       folded into a model's list (that taxes every user of
 *                                       that model). MPI-304.
 * @property {string}   operation      - Universal-op key (commandRegistry.js)
 * @property {string}   workflow       - ComfyUI workflow filename (universal_workflows.js)
 * @property {string}   uiComponent    - Per-flow Organism component name (controls only; hosted by MpiBaseFlow)
 * @property {Object}   inputSchema    - What the uiComponent collects → injected into the workflow
 * @property {FlowStep[]} [steps]       - Declared MIDDLE steps of the flow's carousel (MPI-306).
 *                                       Step 0 (inputs) and the last step (run) are IMPLICIT —
 *                                       the frame renders them from inputSchema + the flow's
 *                                       controls. Omit or `[]` for a 2-step carousel. A flow writes
 *                                       NO layout code: MpiBaseFlow renders every declared step.
 *
 * @typedef {Object} FlowStep
 * @property {string}  kind    - STEP_KINDS registry key (MpiBaseFlow/stepKinds.js), e.g. 'box'.
 *                               A new gizmo = one component + one registry line.
 * @property {string}  role    - The MEDIA ROLE this step operates on ('image1', 'image2'…) —
 *                               the same vocabulary the op's mediaInputs uses, so a box for
 *                               `image1` reaches `Input_Box` with no new mapping.
 * @property {string}  title   - Shown above the canvas.
 * @property {string}  [hint]  - Guidance shown below the canvas (and below any fields row).
 * @property {string}  [tickerLabel] - Short label for the step ticker; falls back to `title`.
 * @property {number}  [ratio] - Aspect lock for the gizmo (UI-only; the graph's width/height
 *                               are independent). Omit for a free box.
 * @property {FlowStepField[]} [fields] - ONE row of controls between canvas and hint, rendered
 *                               BY THE FRAME so every gizmo's controls match for free. HARD CAP:
 *                               one row, no nesting/panels/accordions — a gizmo wanting more
 *                               means the step should SPLIT.
 *
 * @typedef {Object} FlowStepField
 * @property {string}  id      - Key the value lands under in the step's `fields` object.
 * @property {'select'|'button'|'toggle'} type
 * @property {string}  [label]
 * @property {Array<{v:string|number, label:string}>} [options] - For `select`.
 * @property {*}       [default]
 */

'use strict';

import { state } from '../state.js';
import { DEPS } from './modelConstants/dependencies.js';

/**
 * The download-queue / dep-status key for a flow's own deps. Namespaced so it can
 * never collide with a model id, and so every consumer that sees a job id can tell
 * flow-owned deps from model-owned ones. MPI-304.
 * @param {string} flowId
 * @returns {string}
 */
export function flowDepKey(flowId) {
    return `flow:${flowId}`;
}

/** @type {FlowDef[]} */
export const FLOWS = [
    // First flow (MPI-256 Phase 4): image-in → image-out regen, 1 model.
    // Re-pointed to sdxl-nsfw (sdxl-realistic isn't installed; identical graph).
    {
        id: 'image-regen',
        title: 'Image Regen',
        preview: 'sdxl-real-05.webp',
        description: 'Upload an image and re-imagine it with a prompt. Runs SDXL image-to-image and drops the result into your gallery.',
        requiredModels: ['sdxl-nsfw'],
        operation: 'flowImageRegen',
        workflow: 'flow_sdxl_regen.json',
        uiComponent: 'MpiFlowImageRegen',
        mediaType: 'image',
        inputSchema: { positive: 'string', mediaItems: 'image[1]' },
    },
    // Second flow (MPI-259): multi-model test flow. Text-to-image (NO source image),
    // exercises the multi-model install path (sdxl-nsfw + nvidia-pid) + the flexible
    // input seam (no media slot). Reuses MpiFlowImageRegen (positive-prompt only).
    {
        id: 'sdxl-4k',
        title: 'SDXL 4K',
        preview: 'chroma-flash-01.webp',
        description: 'Multi-image test Flow. Takes up to two source images and a prompt, and can produce up to three 4K SDXL outputs — exercises the multi-model install path, polymorphic media inputs, and multi-output.',
        requiredModels: ['sdxl-nsfw', 'nvidia-pid'],
        operation: 'flowSdxl4k',
        workflow: 'flow_sdxl_4k.json',
        uiComponent: 'MpiFlowImageRegen',
        mediaType: 'image',
        // Polymorphic inputs (MPI-259). `media` = declared media slots; BaseFlow renders
        // an upload zone per declared type. A group MAY also declare
        // `labels: ['Original', 'Face Reference']` (index-aligned with roles) — slot
        // copy is the APP's to name, and the carousel frame shows it above each slot;
        // without it the frame falls back to a numbered noun (MPI-306).
        // `mode:'upto'` = dynamic-until-cap (numbered,
        // an empty zone appears until `max` slots are filled). `role` matches the op's
        // mediaInputs key so the injector maps each item to its Input_* node.
        inputSchema: {
            positive: 'string',
            media: [
                { type: 'image', mode: 'upto', max: 2, roles: ['image1', 'image2'] },
            ],
        },
        // Multi-output: up to 3 image capture nodes (Output_Image / _2 / _3), each
        // self-gated in the workflow by input presence. The KEPT count is only known
        // at completion (capture-what-ran) — no fixed count is declared here; the run
        // shows ONE "Generating…" card and lands the real 1..N cards on complete.
    },
    // Third flow (MPI-259): NO-MODEL video utility. Loads up to two video PATHS + an
    // optional audio track, stitches the videos side-by-side, carries audio through,
    // and saves. Exercises the model-free path (requiredModels: []; always available,
    // no install gate), video media slots, and video output. No prompt / no uiComponent
    // — MpiBaseFlow renders the media slots straight from inputSchema.media.
    {
        id: 'video-stitch',
        title: 'Video Stitch',
        preview: 'sdxl-real-01.webp',   // reuse an existing model preview for the tile
        description: 'Stitch up to two videos side-by-side and carry an audio track through. Needs no model — drop your clips and run.',
        requiredModels: [],
        operation: 'flowVideoStitch',
        workflow: 'flow_video_test.json',
        mediaType: 'video',
        // Two video slots (Input_video / Input_video_2) + one audio slot (Input_audio).
        // roles match the op's mediaInputs keys so the injector maps each item to its node.
        inputSchema: {
            media: [
                { type: 'video', mode: 'upto', max: 2, roles: ['video1', 'video2'] },
                { type: 'audio', mode: 'upto', max: 1, roles: ['audio1'] },
            ],
        },
    },
    // Fourth flow (MPI-299): 2-image head swap. Takes a TARGET image (body/scene kept)
    // and a SOURCE image (head taken), each with an optional box marking the head
    // region, and swaps one onto the other.
    //
    // First flow to use requiredDeps (MPI-304): it needs qwen-edit's weights PLUS a
    // head-swap LoRA no model requires. That LoRA is declared here, not folded into
    // qwen-edit — folding it would push 1.2GB onto every Qwen user for one flow.
    //
    // `comfyui-inpaint-cropandstitch` is declared here for the same reason: the graph
    // calls InpaintCropImproved -> InpaintStitchImproved, and NOTHING on the qwen-edit
    // path declared the pack. It only ever installed because the Krea2 cards happened
    // to list it, so a qwen-edit-only install would fail ComfyUI class validation at
    // dispatch. Krea2 no longer uses those classes (b3f9a018 dropped its masked-crop
    // path), so that listing was removed and this flow is now the sole declarer.
    //
    // FIXED-PROMPT flow: the graph has NO Input_Positive/Input_Negative (both baked),
    // so inputSchema declares no `positive` and the op sets promptRequired:false.
    // Boxes are injectionParams (box1/box2 → headSwapInjector), NOT media slots.
    {
        id: 'head-swap',
        title: 'Head Swap',
        preview: 'sdxl-real-05.webp',   // placeholder — swap for a head-swap sample
        description: 'Swap a head from one image onto another. Upload the image you want to keep, the image with the head you want, mark each head, and run.',
        requiredModels: ['qwen-edit'],
        requiredDeps: ['qwen-lora-headswap', 'comfyui-inpaint-cropandstitch'],
        operation: 'flowHeadSwap',
        workflow: 'flow_head_swap.json',
        // Controls = the tier radio ONLY. It also owns the box→injectionParams
        // translation (which role feeds which node is flow knowledge, not the
        // frame's) — see MpiFlowHeadSwap.js.
        uiComponent: 'MpiFlowHeadSwap',
        mediaType: 'image',
        inputSchema: {
            media: [
                // `labels` are index-aligned with roles. Slot copy is the APP's to
                // name — without this the frame falls back to "Image 1 / Image 2",
                // which says nothing about which image plays which part.
                {
                    type: 'image', mode: 'upto', max: 2,
                    roles: ['image1', 'image2'],
                    labels: ['Original', 'Face Reference'],
                },
            ],
        },
        // The two boxes look identical but MEAN different things, so their copy
        // carries the whole distinction: step 1 marks WHERE the head goes (mask),
        // step 2 marks WHICH head to take (crop). ratio 1 because the pipeline
        // crops a square — a non-square selection would clip the result.
        steps: [
            {
                kind: 'box', role: 'image1', ratio: 1,
                tickerLabel: 'Target head',
                title: 'Mark where the new head goes',
                hint: 'Box the head you want replaced. Include the hair and jaw.',
            },
            {
                kind: 'box', role: 'image2', ratio: 1,
                tickerLabel: 'Reference head',
                title: 'Mark which head to take',
                hint: 'Box the head to use. A close-up portrait works best.',
            },
        ],
    },
];

/** @returns {FlowDef[]} All flow descriptors. */
export function listFlows() {
    return FLOWS.slice();
}

/**
 * @param {string} id
 * @returns {FlowDef|null}
 */
export function getFlowById(id) {
    return FLOWS.find(a => a.id === id) || null;
}

// ── Flow dep-status cache (populated by syncModelInstalled, modelRegistry.js) ──
// Map of flowId → Map of depId → installed:boolean. Flows run NO sync of their own —
// the model sync stats their deps in the same /comfy/models/check payload (that route
// is id-agnostic: it takes {id, deps} and stats filenames, never touching MODELS) and
// hands the slice back here. Empty until the first sync lands: a flow with
// requiredDeps therefore reads NOT-installed until proven present, which fails
// CLOSED (a badge that says "get it" is recoverable; a Run that dies inside ComfyUI
// with "lora not found" is not). MPI-304.
const _flowDepStatusCache = new Map();

/**
 * Record a sync's per-dep result for one flow. Called by syncModelInstalled only.
 * @param {string} flowId
 * @param {Map<string, boolean>} depMap - depId → installed
 */
export function setFlowDepStatus(flowId, depMap) {
    _flowDepStatusCache.set(flowId, depMap);
}

/**
 * @param {string} flowId
 * @returns {Map<string, boolean>|null}
 */
export function getFlowDepStatus(flowId) {
    return _flowDepStatusCache.get(flowId) ?? null;
}

/**
 * Every flow's requiredDeps, resolved to dep objects, keyed by flowDepKey(). The
 * shape /comfy/models/check wants — used by the sync payload AND by the backend
 * uninstall guards to learn which deps a flow still needs. Unknown dep ids are
 * dropped (filter(Boolean)) exactly as the model resolver does.
 * @returns {Array<{id: string, flowId: string, deps: Object[]}>}
 */
export function flowDepUniverse() {
    return FLOWS
        .filter(a => (a.requiredDeps || []).length)
        .map(a => ({
            id: flowDepKey(a.id),
            flowId: a.id,
            deps: (a.requiredDeps || []).map(depId => DEPS[depId]).filter(Boolean),
        }));
}

/**
 * Resolved dep objects for ONE flow's requiredDeps (install-side; the flow twin of
 * getModelDependencies). Feeds downloadService.start(flowDepKey(id), deps).
 * @param {FlowDef|string} flowOrId
 * @returns {Object[]}
 */
export function getFlowDependencies(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return [];
    return (flow.requiredDeps || []).map(depId => DEPS[depId]).filter(Boolean);
}

/**
 * Availability = every requiredModel id installed AND every requiredDep present.
 *
 * requiredModels are MODEL ids; s_installedModelIds is already partial-aware
 * (populated via isModelUsable, modelRegistry.js) so ≥1-op-installed models count.
 * requiredDeps are DEP ids (MPI-304) — flow-only weights/nodes no model requires;
 * their disk status comes from the flow dep-status cache above. Both gate the same
 * badge and the same Run guard: the user cannot open a flow until it has BOTH.
 *
 * `missing` stays MODEL ids only — every existing caller treats it as such
 * (flowService's toast, MpiFlowLibrary's _installMissing → getModelDependencies).
 * Missing deps ride alongside in `missingDeps`; `available` accounts for both.
 *
 * @param {FlowDef|string} flowOrId
 * @returns {{available: boolean, missing: string[], missingDeps: string[]}}
 */
export function flowAvailability(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return { available: false, missing: [], missingDeps: [] };
    const installed = state.s_installedModelIds || [];
    const missing = (flow.requiredModels || []).filter(id => !installed.includes(id));
    const depStatus = _flowDepStatusCache.get(flow.id);
    const missingDeps = (flow.requiredDeps || []).filter(id => depStatus?.get(id) !== true);
    return { available: missing.length === 0 && missingDeps.length === 0, missing, missingDeps };
}
