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
 * @property {'image'|'video'} mediaType      - Which group type this applies to
 * @property {number}          requiresImages - Min number of input images needed (0 = none)
 * @property {number}          [requiresVideo]- Min number of input videos needed (0 = none)
 * @property {boolean}         [requiresMask] - Requires an active mask from the Mask Tool
 * @property {boolean}         [promptRequired] - Whether a text prompt is mandatory
 * @property {boolean}         [universal]    - Not model-tied; uses universalWorkflows in modelRegistry
 * @property {boolean}         [stub]         - Not yet implemented; registered but disabled in UI
 * @property {string}          [component]    - Optional key for an operation-specific sub-control
 *                                              injected into MpiPromptBox's operation slot.
 *                                              Values: 'upscale' | 'motion' | 'maskStrength' | null
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
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 0,
        promptRequired: true,
    },
    i2i: {
        label: 'Image to Image',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        promptRequired: true,
    },
    upscale: {
        label: 'Upscale',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        promptRequired: false,
        component: 'upscale',
    },
    edit: {
        label: 'Edit',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        promptRequired: true,
    },
    detail: {
        label: 'Detail',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        requiresMask: true,
        promptRequired: true,
        component: 'maskStrength',
    },
    change: {
        label: 'Change',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        requiresMask: true,
        promptRequired: true,
        component: 'maskStrength',
    },
    remove: {
        label: 'Remove',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        requiresMask: true,
        promptRequired: true,
        component: 'maskStrength',
    },

    // ── Video — Model Operations ──────────────────────────────────────────────

    t2v: {
        label: 'Text to Video',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        promptRequired: true,
    },
    i2v: {
        label: 'Image to Video',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 1,
        promptRequired: false,
        component: 'motion',
    },
    extend: {
        label: 'Extend',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        requiresVideo: 1,
        promptRequired: false,
    },

    // ── Universal Workflows (not model-tied) ──────────────────────────
    // These appear regardless of active model; they have their own workflow files.

    interpolate: {
        label: 'Interpolate',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        promptRequired: false,
        universal: true,     // not model-tied; uses universalWorkflows in modelRegistry
    },
    videoUpscale: {
        label: 'Video Upscale',
        mediaType: MEDIA_TYPE.VIDEO,
        requiresImages: 0,
        promptRequired: false,
        universal: true,
    },
    autoMaskImg: {
        label: 'Auto Masking',
        mediaType: MEDIA_TYPE.IMAGE,
        requiresImages: 1,
        promptRequired: false,
        universal: true,
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
    const { imageCount = 0, videoCount = 0, hasMask = false } = ctx;

    return Object.entries(commands)
        .filter(([, cmd]) => !cmd.stub && cmd.mediaType === mediaType)
        .filter(([key, cmd]) => {
            if (cmd.universal) return false;
            if (!model) return true;
            return model.supportedOps.includes(key);
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
 * Returns the component key for an operation-specific sub-control injected
 * into MpiPromptBox's operation slot.
 * @param {string} key
 * @returns {'upscale'|'motion'|'maskStrength'|null}
 */
export function getCommandComponent(key) {
    return commands[key]?.component ?? null;
}
