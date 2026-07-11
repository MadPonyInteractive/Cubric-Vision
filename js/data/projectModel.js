/**
 * projectModel.js — Data model definitions and factory functions.
 *
 * Defines the shape of Project, ItemGroup, and MediaItem objects.
 * All objects are plain and serializable — no classes, no methods.
 * Persistence (read/write to disk) is handled by projectManager.js.
 *
 * On disk, a project folder looks like:
 *   /MyProject/
 *     project.json          ← project metadata + itemGroups index
 *     /media/
 *       /<groupId>/
 *         <itemId>.png      ← generated image
 *         <itemId>.mp4      ← generated video
 *
 * MediaItem file paths stored here are relative to the project folder.
 */

'use strict';

import { MODELS } from './modelConstants/models.js';

const generateId = () => crypto.randomUUID();

// ── MediaItem ─────────────────────────────────────────────────────────────────

/**
 * Properties shared by all media items regardless of type.
 *
 * @typedef {Object} MediaItemBase
 * @property {string}   id           - Unique id
 * @property {'image'|'video'} type
 * @property {string}   filePath     - Relative path from project folder, e.g. "media/groupId/itemId.png"
 * @property {string}   createdAt    - ISO timestamp
 * @property {string}   modelId      - Model used to generate this item (from modelRegistry)
 * @property {string}   operation    - Command key used (from commandRegistry), e.g. 't2i', 'upscale'
 * @property {string}   prompt       - Positive prompt text at generation time
 * @property {string}   negativePrompt
 * @property {number}   seed
 * @property {Object|null} [generationSettings] - Snapshot used by Reuse Prompt
 * @property {string}   [name]       - Optional user-assigned name
 * @property {boolean}  uploaded     - True if user-imported rather than generated
 */

/**
 * @typedef {MediaItemBase & {
 *   pixelDimensions: {w: number, h: number},
 * }} ImageItem
 */

/**
 * @typedef {MediaItemBase & {
 *   pixelDimensions: {w: number, h: number},
 *   duration: number,
 *   fps: number,
 *   previewAssets?: Object,
 * }} VideoItem
 */

/** @typedef {ImageItem|VideoItem} MediaItem */

/**
 * Creates a new ImageItem.
 * @param {Partial<ImageItem>} overrides
 * @returns {ImageItem}
 */
export function createImageItem(overrides = {}) {
    return {
        id:               generateId(),
        type:             'image',
        filePath:         '',
        createdAt:        new Date().toISOString(),
        modelId:          null,
        operation:        null,
        displayName:      null,
        prompt:           '',
        negativePrompt:   '',
        seed:             -1,
        generationSettings: null,
        name:             null,
        uploaded:         false,
        appId:            null,   // App provenance (MPI-256); set by App gens only
        appInputs:        null,
        pixelDimensions:  { w: 0, h: 0 },
        generationMs:     null,
        ...overrides,
    };
}

/**
 * Creates a new VideoItem.
 * @param {Partial<VideoItem>} overrides
 * @returns {VideoItem}
 */
export function createVideoItem(overrides = {}) {
    return {
        id:               generateId(),
        type:             'video',
        filePath:         '',
        createdAt:        new Date().toISOString(),
        modelId:          null,
        operation:        null,
        displayName:      null,
        prompt:           '',
        negativePrompt:   '',
        seed:             -1,
        generationSettings: null,
        name:             null,
        uploaded:         false,
        appId:            null,   // App provenance (MPI-256); set by App gens only
        appInputs:        null,
        pixelDimensions:  { w: 0, h: 0 },
        generationMs:     null,
        duration:         0,
        fps:              0,
        ...overrides,
    };
}

/**
 * Creates a new AudioItem. Audio is a first-class imported media type (LTX-2.3
 * input); it has duration but no pixel frame, so the card renders an icon.
 * @param {Partial<object>} overrides
 * @returns {object}
 */
export function createAudioItem(overrides = {}) {
    return {
        id:               generateId(),
        type:             'audio',
        filePath:         '',
        createdAt:        new Date().toISOString(),
        modelId:          null,
        operation:        null,
        displayName:      null,
        prompt:           '',
        negativePrompt:   '',
        seed:             -1,
        generationSettings: null,
        name:             null,
        uploaded:         false,
        appId:            null,   // App provenance (MPI-256); set by App gens only
        appInputs:        null,
        pixelDimensions:  { w: 0, h: 0 },
        generationMs:     null,
        duration:         0,
        ...overrides,
    };
}

// ── ItemGroup ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ItemGroup
 * @property {string}         id           - Unique id
 * @property {'image'|'video'|'audio'} type - Fixed at creation, never changes
 * @property {string}         name         - User-assigned name
 * @property {string}         createdAt    - ISO timestamp
 * @property {number}         selectedIndex - Index into `history` of the current selected entry
 * @property {MediaItem[]}    history      - Append-only stack, index 0 = oldest
 * @property {boolean}        open         - Whether the group is expanded in the gallery (UI hint)
 * @property {boolean}        [favourite=false] - Whether this group is marked as a favourite
 * @property {string|null}    [customName=null] - User-assigned card name; overrides the derived label when set. Null = fall back to derived.
 */

/**
 * Creates a new ItemGroup.
 * @param {'image'|'video'} type
 * @param {Partial<ItemGroup>} overrides
 * @returns {ItemGroup}
 */
export function createItemGroup(type, overrides = {}) {
    return {
        id:            generateId(),
        type,
        name:          'Untitled Group',
        createdAt:     new Date().toISOString(),
        selectedIndex: 0,
        history:       [],
        open:          false,
        favourite:     false,
        customName:    null,
        ...overrides,
    };
}

/**
 * Returns the currently selected MediaItem for a group, or null if empty.
 * @param {ItemGroup} group
 * @returns {MediaItem|null}
 */
export function getSelectedItem(group) {
    return group.history[group.selectedIndex] ?? null;
}

/**
 * Appends a new MediaItem to a group's history and selects it.
 * Returns a new group object — does not mutate the original.
 * @param {ItemGroup} group
 * @param {MediaItem} item
 * @returns {ItemGroup}
 */
export function appendToHistory(group, item) {
    const history = [...group.history, item];
    return { ...group, history, selectedIndex: history.length - 1 };
}

/**
 * Promotes a history entry to be the selected item.
 * Returns a new group object — does not mutate the original.
 * @param {ItemGroup} group
 * @param {number} index
 * @returns {ItemGroup}
 */
export function promoteHistoryEntry(group, index) {
    if (index < 0 || index >= group.history.length) return group;
    return { ...group, selectedIndex: index };
}

/**
 * Replaces a history entry matched by item id. Returns a new group with the
 * matching slot swapped for `nextItem`. selectedIndex is preserved. If no
 * entry matches the id, the group is returned unchanged.
 * @param {ItemGroup} group
 * @param {MediaItem} nextItem
 * @returns {ItemGroup}
 */
export function replaceHistoryItemById(group, nextItem) {
    if (!group?.history?.length || !nextItem?.id) return group;
    const idx = group.history.findIndex(h => h.id === nextItem.id);
    if (idx === -1) return group;
    const history = group.history.slice();
    history[idx] = nextItem;
    return { ...group, history };
}

/**
 * Removes a history entry by index.
 * Adjusts selectedIndex if needed.
 * Returns a new group object — does not mutate the original.
 * @param {ItemGroup} group
 * @param {number} index
 * @returns {ItemGroup}
 */
export function removeHistoryEntry(group, index) {
    if (group.history.length <= 1) return group; // never leave a group empty
    const history = group.history.filter((_, i) => i !== index);
    const selectedIndex = Math.min(group.selectedIndex, history.length - 1);
    return { ...group, history, selectedIndex };
}

// ── Project ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Project
 * @property {string}      id
 * @property {string}      name
 * @property {string}      folderPath   - Absolute path on disk
 * @property {string}      createdAt
 * @property {string}      updatedAt
 * @property {string|null} thumbnail    - Relative path to thumbnail image
 * @property {ItemGroup[]} itemGroups
 * @property {boolean}     tutorialSeen
 * @property {Object}      modelSettings  - Per-model user selections: { [modelId]: { loras, upscaleModel } }
 * @property {Object}      toolSettings   - Per-tool user selections: { [toolKey]: { upscaleModel } }
 */

/**
 * Creates a new Project object (in-memory; persistence is projectManager's job).
 * @param {string} name
 * @param {string} folderPath
 * @returns {Project}
 */
export function createProject(name, folderPath) {
    return {
        id:            generateId(),
        name,
        folderPath,
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        thumbnail:     null,
        schemaVersion: 2,
        itemGroups:    [],
        tutorialSeen:  false,
        modelSettings: {},
        toolSettings:  {},
        shared:        { image: {}, video: {} },
    };
}

/**
 * Replaces a group in a project by id.
 * Returns a new project object — does not mutate the original.
 * @param {Project} project
 * @param {ItemGroup} updatedGroup
 * @returns {Project}
 */
export function updateGroupInProject(project, updatedGroup) {
    return {
        ...project,
        updatedAt:  new Date().toISOString(),
        itemGroups: project.itemGroups.map(g =>
            g.id === updatedGroup.id ? updatedGroup : g
        ),
    };
}

/**
 * Adds a new group to a project.
 * Returns a new project object — does not mutate the original.
 * @param {Project} project
 * @param {ItemGroup} group
 * @returns {Project}
 */
export function addGroupToProject(project, group) {
    return {
        ...project,
        updatedAt:  new Date().toISOString(),
        itemGroups: [...(project.itemGroups || []), group],
    };
}

/**
 * Removes a group from a project by id.
 * Returns a new project object — does not mutate the original.
 * @param {Project} project
 * @param {string} groupId
 * @returns {Project}
 */
export function removeGroupFromProject(project, groupId) {
    return {
        ...project,
        updatedAt:  new Date().toISOString(),
        itemGroups: project.itemGroups.filter(g => g.id !== groupId),
    };
}

// ── Two-Track Settings Helpers ────────────────────────────────────────────────

const _defaultLoraSlots = () => Array.from({ length: 6 }, () => ({
    name: null,
    strengthModel: 1.0,
    strengthClip: 1.0,
    bypass: false,
}));

const _getModelDef = (modelId) => MODELS.find(m => m.id === modelId) ?? null;

export function getLoraStages(modelId) {
    const stages = _getModelDef(modelId)?.loraStages;
    return Array.isArray(stages) && stages.length > 0 ? stages : null;
}

export function createDefaultLoras(modelId) {
    const stages = getLoraStages(modelId);
    if (!stages) return _defaultLoraSlots();

    return Object.fromEntries(
        stages.map(stage => [stage.key, _defaultLoraSlots()])
    );
}

/**
 * Returns the model settings for a given modelId on the project.
 * Returns a default if no entry exists yet (does not mutate the project).
 *
 * Shape:
 *   { loras, upscaleModel, operations: { [opName]: {...} } }
 *
 * `loras` and `upscaleModel` are model-wide. Op-specific state
 * (denoise, useGrid, upscaleFactor) lives under `operations[opName]`.
 * Shared-across-models state (ratioSelector, batch, duration, motionIntensity,
 * previewStage, qualityTier) lives at project.shared[mediaType] — see
 * getSharedSettings/setSharedSettings.
 *
 * @param {Project} project
 * @param {string} modelId
 * @returns {{ loras: Array|Object, upscaleModel: string|null, operations: Object }}
 */
export function getModelSettings(project, modelId) {
    return (project.modelSettings ?? {})[modelId] ?? {
        loras: createDefaultLoras(modelId),
        upscaleModel: null,
        operations: {},
    };
}

/**
 * Returns a new project with updated model settings for the given modelId.
 * Does not mutate the original.
 *
 * Intended for model-wide writes (loras, upscaleModel). For per-op or shared
 * operation state, use `setOpSettings` instead.
 *
 * @param {Project} project
 * @param {string} modelId
 * @param {{ loras?: Array|Object, upscaleModel?: string|null, operations?: Object }} updates
 * @returns {Project}
 */
export function setModelSettings(project, modelId, updates) {
    const current = getModelSettings(project, modelId);
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        modelSettings: {
            ...project.modelSettings,
            [modelId]: {
                ...current,
                ...updates,
            },
        },
    };
}

/**
 * Returns the per-op settings bucket for a given model+op.
 * For cross-model shared values, use getSharedSettings instead.
 * @param {Project} project
 * @param {string}  modelId
 * @param {string}  opName  - Operation key from commandRegistry (e.g. 'upscale', 'detail')
 * @returns {Object}
 */
export function getOpSettings(project, modelId, opName) {
    const model = (project.modelSettings ?? {})[modelId];
    return model?.operations?.[opName] ?? {};
}

/**
 * Returns a new project with the per-op settings bucket merged for a given
 * model+op. Does not mutate the original. Deep-merges sub-objects one level.
 * For cross-model shared values, use setSharedSettings instead.
 * @param {Project} project
 * @param {string}  modelId
 * @param {string}  opName
 * @param {Object}  updates
 * @returns {Project}
 */
export function setOpSettings(project, modelId, opName, updates) {
    const model = getModelSettings(project, modelId);
    const operations = model.operations ?? {};
    const currentOp = operations[opName] ?? {};

    const mergedOp = { ...currentOp };
    for (const [k, v] of Object.entries(updates)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && currentOp[k] && typeof currentOp[k] === 'object') {
            mergedOp[k] = { ...currentOp[k], ...v };
        } else {
            mergedOp[k] = v;
        }
    }

    return {
        ...project,
        updatedAt: new Date().toISOString(),
        modelSettings: {
            ...project.modelSettings,
            [modelId]: {
                ...model,
                operations: {
                    ...operations,
                    [opName]: mergedOp,
                },
            },
        },
    };
}

// ── Shared (cross-model) settings, partitioned by mediaType ──────────────────
//
// project.shared shape:
//   { image: { ratioSelector, batch, ... }, video: { ratioSelector, batch, duration, motionIntensity, previewStage, ... } }
//
// Use these instead of operations.shared. Bucket key is the model's mediaType
// ('image' | 'video'), so all image models share one bucket and all video
// models share another. Op-specific values stay under modelSettings[].operations[].

const _SHARED_TYPES = new Set(['image', 'video']);

/**
 * Returns the shared bucket for a mediaType.
 * @param {Project} project
 * @param {'image'|'video'} mediaType
 * @returns {Object}
 */
export function getSharedSettings(project, mediaType) {
    if (!_SHARED_TYPES.has(mediaType)) return {};
    return (project.shared ?? {})[mediaType] ?? {};
}

/**
 * Returns a new project with the shared bucket merged for a mediaType.
 * Deep-merges sub-objects one level (e.g. ratioSelector field merge).
 * @param {Project} project
 * @param {'image'|'video'} mediaType
 * @param {Object} updates
 * @returns {Project}
 */
export function setSharedSettings(project, mediaType, updates) {
    if (!_SHARED_TYPES.has(mediaType)) return project;
    const shared = project.shared ?? { image: {}, video: {} };
    const current = shared[mediaType] ?? {};

    const merged = { ...current };
    for (const [k, v] of Object.entries(updates)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && current[k] && typeof current[k] === 'object') {
            merged[k] = { ...current[k], ...v };
        } else {
            merged[k] = v;
        }
    }

    return {
        ...project,
        updatedAt: new Date().toISOString(),
        shared: {
            image: shared.image ?? {},
            video: shared.video ?? {},
            [mediaType]: merged,
        },
    };
}

/**
 * Returns the tool settings for a given toolKey on the project.
 * Returns a default if no entry exists yet (does not mutate the project).
 * @param {Project} project
 * @param {string} toolKey  - Command key, e.g. 'videoUpscale'
 * @param {Object} [defaults]
 * @returns {Object}
 */
export function getToolSettings(project, toolKey, defaults = {}) {
    return (project.toolSettings ?? {})[toolKey] ?? defaults;
}

/**
 * Returns a new project with updated tool settings for the given toolKey.
 * Does not mutate the original.
 * @param {Project} project
 * @param {string} toolKey
 * @param {Object} updates
 * @returns {Project}
 */
export function setToolSettings(project, toolKey, updates) {
    const current = getToolSettings(project, toolKey);
    const merged = { ...current, ...updates };
    // Strip legacy `upscaleModel:null` noise that leaked from prior default
    // value of getToolSettings(). Real upscale-model setting lives in
    // modelSettings, not toolSettings.
    if (merged.upscaleModel === null || merged.upscaleModel === undefined) {
        delete merged.upscaleModel;
    }
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        toolSettings: {
            ...project.toolSettings,
            [toolKey]: merged,
        },
    };
}
