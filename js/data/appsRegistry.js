/**
 * appsRegistry.js — Source of truth for Apps (outcome apps, MPI-256).
 *
 * An App is an outcome-oriented workflow surfaced behind the dev-gated App Library
 * overlay: pick an app → open its overlay → collect inputs → Run → the job enters
 * the EXISTING generation queue and lands as a normal gallery card.
 *
 * Unlike modelRegistry, this registry is READ-ONLY over install state — apps have no
 * disk-presence concept of their own. Availability is derived entirely from
 * `state.s_installedModelIds` (already isModelUsable-filtered, MPI-122). There is
 * deliberately NO install-sync machinery here (no syncModelInstalled, no dep-status
 * cache, no remoteEngineClient) — do not cargo-cult it from modelRegistry.
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
 * @property {string}   operation      - Universal-op key (commandRegistry.js)
 * @property {string}   workflow       - ComfyUI workflow filename (universal_workflows.js)
 * @property {string}   uiComponent    - Per-app Organism component name (controls only; hosted by MpiBaseApp)
 * @property {Object}   inputSchema    - What the uiComponent collects → injected into the workflow
 */

'use strict';

import { state } from '../state.js';

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
        workflow: 'App_sdxl_regen.json',
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
        workflow: 'App_sdxl_4k.json',
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

/**
 * Availability = every requiredModel id is present in the installed set.
 * requiredModels are MODEL ids; s_installedModelIds is already partial-aware
 * (populated via isModelUsable, modelRegistry.js) so ≥1-op-installed models count.
 *
 * @param {AppDef|string} appOrId
 * @returns {{available: boolean, missing: string[]}}
 */
export function appAvailability(appOrId) {
    const app = typeof appOrId === 'string' ? getAppById(appOrId) : appOrId;
    if (!app) return { available: false, missing: [] };
    const installed = state.s_installedModelIds || [];
    const missing = (app.requiredModels || []).filter(id => !installed.includes(id));
    return { available: missing.length === 0, missing };
}
