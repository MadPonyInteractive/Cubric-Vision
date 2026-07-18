/**
 * appsRegistry.js — Source of truth for Apps (outcome apps, MPI-256).
 *
 * An App is an outcome-oriented workflow surfaced behind the dev-gated App Library
 * overlay: pick an app → open its overlay → collect inputs → Run → the job enters
 * the EXISTING generation queue and lands as a normal gallery card.
 *
 * Unlike modelRegistry, this registry is READ-ONLY over install state — apps own no
 * install-sync machinery (no syncModelInstalled, no remoteEngineClient); they READ
 * caches the model sync already populates. Do not cargo-cult the sync side here.
 *
 * Availability has TWO inputs (MPI-304):
 *   - `requiredModels` → `state.s_installedModelIds` (already isModelUsable-filtered, MPI-122)
 *   - `requiredDeps`   → the per-dep status cache, keyed `app:<id>` (modelRegistry.js)
 * Both gate the SAME badge and the SAME Run guard — a missing dep blocks exactly like a
 * missing model, and surfaces as one extra row in the slide-over's required list.
 *
 * App count is tiny (dev-gated until ≥4 apps exist), so the descriptor array lives
 * inline here rather than in a separate appConstants/ file. Split it out only if the
 * array grows large enough to warrant it.
 *
 * @typedef {Object} AppDef
 * @property {string}   id             - Unique identifier
 * @property {string}   title          - Display name (card + slide-over)
 * @property {string}   preview        - Preview image filename (card + slide-over)
 * @property {string}   description    - Slide-over copy
 * @property {string[]} requiredModels - MODEL ids (NOT dep ids); drives the availability badge
 * @property {string[]} [requiredDeps] - DEP ids (dependencies.js facade) this app needs on top
 *                                       of its models — app-only weights/nodes that no model
 *                                       requires. Filed in the dep file for their KIND, never
 *                                       folded into a model's list (that taxes every user of
 *                                       that model). MPI-304.
 * @property {string}   operation      - Universal-op key (commandRegistry.js)
 * @property {string}   workflow       - ComfyUI workflow filename (universal_workflows.js)
 * @property {string}   uiComponent    - Per-app Organism component name (controls only; hosted by MpiBaseApp)
 * @property {Object}   inputSchema    - What the uiComponent collects → injected into the workflow
 */

'use strict';

import { state } from '../state.js';
import { DEPS } from './modelConstants/dependencies.js';

/**
 * The download-queue / dep-status key for an app's own deps. Namespaced so it can
 * never collide with a model id, and so every consumer that sees a job id can tell
 * app-owned deps from model-owned ones. MPI-304.
 * @param {string} appId
 * @returns {string}
 */
export function appDepKey(appId) {
    return `app:${appId}`;
}

/** @type {AppDef[]} */
export const APPS = [
    // First app (MPI-256 Phase 4): image-in → image-out regen, 1 model.
    // Re-pointed to sdxl-nsfw (sdxl-realistic isn't installed; identical graph).
    {
        id: 'image-regen',
        title: 'Image Regen',
        preview: 'sdxl-real-05.webp',
        description: 'Upload an image and re-imagine it with a prompt. Runs SDXL image-to-image and drops the result into your gallery.',
        requiredModels: ['sdxl-nsfw'],
        operation: 'appImageRegen',
        workflow: 'app_sdxl_regen.json',
        uiComponent: 'MpiAppImageRegen',
        mediaType: 'image',
        inputSchema: { positive: 'string', mediaItems: 'image[1]' },
    },
    // Second app (MPI-259): multi-model test app. Text-to-image (NO source image),
    // exercises the multi-model install flow (sdxl-nsfw + nvidia-pid) + the flexible
    // input seam (no media slot). Reuses MpiAppImageRegen (positive-prompt only).
    {
        id: 'sdxl-4k',
        title: 'SDXL 4K',
        preview: 'chroma-flash-01.webp',
        description: 'Multi-image test app. Takes up to two source images and a prompt, and can produce up to three 4K SDXL outputs — exercises the multi-model install flow, polymorphic media inputs, and multi-output.',
        requiredModels: ['sdxl-nsfw', 'nvidia-pid'],
        operation: 'appSdxl4k',
        workflow: 'app_sdxl_4k.json',
        uiComponent: 'MpiAppImageRegen',
        mediaType: 'image',
        // Polymorphic inputs (MPI-259). `media` = declared media slots; BaseApp renders
        // an upload zone per declared type. `mode:'upto'` = dynamic-until-cap (numbered,
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
    // Third app (MPI-259): NO-MODEL video utility. Loads up to two video PATHS + an
    // optional audio track, stitches the videos side-by-side, carries audio through,
    // and saves. Exercises the model-free path (requiredModels: []; always available,
    // no install gate), video media slots, and video output. No prompt / no uiComponent
    // — MpiBaseApp renders the media slots straight from inputSchema.media.
    {
        id: 'video-stitch',
        title: 'Video Stitch',
        preview: 'sdxl-real-01.webp',   // reuse an existing model preview for the tile
        description: 'Stitch up to two videos side-by-side and carry an audio track through. Needs no model — drop your clips and run.',
        requiredModels: [],
        operation: 'appVideoStitch',
        workflow: 'app_video_test.json',
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
    // Fourth app (MPI-299): 2-image head swap. Takes a TARGET image (body/scene kept)
    // and a SOURCE image (head taken), each with an optional box marking the head
    // region, and swaps one onto the other.
    //
    // First app to use requiredDeps (MPI-304): it needs qwen-edit's weights PLUS a
    // head-swap LoRA no model requires. That LoRA is declared here, not folded into
    // qwen-edit — folding it would push 1.2GB onto every Qwen user for one app.
    //
    // FIXED-PROMPT app: the graph has NO Input_Positive/Input_Negative (both baked),
    // so inputSchema declares no `positive` and the op sets promptRequired:false.
    // Boxes are injectionParams (box1/box2 → headSwapInjector), NOT media slots.
    {
        id: 'head-swap',
        title: 'Head Swap',
        preview: 'sdxl-real-05.webp',   // placeholder — swap for a head-swap sample
        description: 'Swap a head from one image onto another. Upload the image you want to keep, the image with the head you want, mark each head, and run.',
        requiredModels: ['qwen-edit'],
        requiredDeps: ['qwen-lora-headswap'],
        operation: 'appHeadSwap',
        workflow: 'app_head_swap.json',
        // uiComponent: pending — the box gizmo + steps carousel (MPI-299 UI phase).
        // Until it lands MpiBaseApp renders the two media slots with no box control,
        // so a run uses each box node's baked default.
        mediaType: 'image',
        inputSchema: {
            media: [
                { type: 'image', mode: 'upto', max: 2, roles: ['image1', 'image2'] },
            ],
        },
    },
];

/** @returns {AppDef[]} All app descriptors. */
export function listApps() {
    return APPS.slice();
}

/**
 * @param {string} id
 * @returns {AppDef|null}
 */
export function getAppById(id) {
    return APPS.find(a => a.id === id) || null;
}

// ── App dep-status cache (populated by syncModelInstalled, modelRegistry.js) ──
// Map of appId → Map of depId → installed:boolean. Apps run NO sync of their own —
// the model sync stats their deps in the same /comfy/models/check payload (that route
// is id-agnostic: it takes {id, deps} and stats filenames, never touching MODELS) and
// hands the slice back here. Empty until the first sync lands: an app with
// requiredDeps therefore reads NOT-installed until proven present, which fails
// CLOSED (a badge that says "get it" is recoverable; a Run that dies inside ComfyUI
// with "lora not found" is not). MPI-304.
const _appDepStatusCache = new Map();

/**
 * Record a sync's per-dep result for one app. Called by syncModelInstalled only.
 * @param {string} appId
 * @param {Map<string, boolean>} depMap - depId → installed
 */
export function setAppDepStatus(appId, depMap) {
    _appDepStatusCache.set(appId, depMap);
}

/**
 * @param {string} appId
 * @returns {Map<string, boolean>|null}
 */
export function getAppDepStatus(appId) {
    return _appDepStatusCache.get(appId) ?? null;
}

/**
 * Every app's requiredDeps, resolved to dep objects, keyed by appDepKey(). The
 * shape /comfy/models/check wants — used by the sync payload AND by the backend
 * uninstall guards to learn which deps an app still needs. Unknown dep ids are
 * dropped (filter(Boolean)) exactly as the model resolver does.
 * @returns {Array<{id: string, appId: string, deps: Object[]}>}
 */
export function appDepUniverse() {
    return APPS
        .filter(a => (a.requiredDeps || []).length)
        .map(a => ({
            id: appDepKey(a.id),
            appId: a.id,
            deps: (a.requiredDeps || []).map(depId => DEPS[depId]).filter(Boolean),
        }));
}

/**
 * Resolved dep objects for ONE app's requiredDeps (install-side; the app twin of
 * getModelDependencies). Feeds downloadService.start(appDepKey(id), deps).
 * @param {AppDef|string} appOrId
 * @returns {Object[]}
 */
export function getAppDependencies(appOrId) {
    const app = typeof appOrId === 'string' ? getAppById(appOrId) : appOrId;
    if (!app) return [];
    return (app.requiredDeps || []).map(depId => DEPS[depId]).filter(Boolean);
}

/**
 * Availability = every requiredModel id installed AND every requiredDep present.
 *
 * requiredModels are MODEL ids; s_installedModelIds is already partial-aware
 * (populated via isModelUsable, modelRegistry.js) so ≥1-op-installed models count.
 * requiredDeps are DEP ids (MPI-304) — app-only weights/nodes no model requires;
 * their disk status comes from the app dep-status cache above. Both gate the same
 * badge and the same Run guard: the user cannot open an app until it has BOTH.
 *
 * `missing` stays MODEL ids only — every existing caller treats it as such
 * (appService's toast, MpiAppLibrary's _installMissing → getModelDependencies).
 * Missing deps ride alongside in `missingDeps`; `available` accounts for both.
 *
 * @param {AppDef|string} appOrId
 * @returns {{available: boolean, missing: string[], missingDeps: string[]}}
 */
export function appAvailability(appOrId) {
    const app = typeof appOrId === 'string' ? getAppById(appOrId) : appOrId;
    if (!app) return { available: false, missing: [], missingDeps: [] };
    const installed = state.s_installedModelIds || [];
    const missing = (app.requiredModels || []).filter(id => !installed.includes(id));
    const depStatus = _appDepStatusCache.get(app.id);
    const missingDeps = (app.requiredDeps || []).filter(id => depStatus?.get(id) !== true);
    return { available: missing.length === 0 && missingDeps.length === 0, missing, missingDeps };
}
