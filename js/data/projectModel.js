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
        prompt:           '',
        negativePrompt:   '',
        seed:             -1,
        name:             null,
        uploaded:         false,
        pixelDimensions:  { w: 0, h: 0 },
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
        prompt:           '',
        negativePrompt:   '',
        seed:             -1,
        name:             null,
        uploaded:         false,
        pixelDimensions:  { w: 0, h: 0 },
        duration:         0,
        fps:              0,
        ...overrides,
    };
}

// ── ItemGroup ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ItemGroup
 * @property {string}         id           - Unique id
 * @property {'image'|'video'} type        - Fixed at creation, never changes
 * @property {string}         name         - User-assigned name
 * @property {string}         createdAt    - ISO timestamp
 * @property {number}         selectedIndex - Index into `history` of the current selected entry
 * @property {MediaItem[]}    history      - Append-only stack, index 0 = oldest
 * @property {boolean}        open         - Whether the group is expanded in the gallery (UI hint)
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
        itemGroups:    [],
        tutorialSeen:  false,
        modelSettings: {},
        toolSettings:  {},
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
}));

/**
 * Returns the model settings for a given modelId on the project.
 * Creates a default entry if none exists yet.
 * @param {Project} project
 * @param {string} modelId
 * @returns {{ loras: Array, upscaleModel: string|null }}
 */
export function getModelSettings(project, modelId) {
    if (!project.modelSettings[modelId]) {
        project.modelSettings[modelId] = {
            loras: _defaultLoraSlots(),
            upscaleModel: null,
        };
    }
    return project.modelSettings[modelId];
}

/**
 * Returns a new project with updated model settings for the given modelId.
 * Does not mutate the original.
 * @param {Project} project
 * @param {string} modelId
 * @param {{ loras?: Array, upscaleModel?: string|null }} updates
 * @returns {Project}
 */
export function setModelSettings(project, modelId, updates) {
    const current = getModelSettings(project, modelId);
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        modelSettings: {
            ...project.modelSettings,
            [modelId]: { ...current, ...updates },
        },
    };
}

/**
 * Returns the tool settings for a given toolKey on the project.
 * Creates a default entry if none exists yet.
 * @param {Project} project
 * @param {string} toolKey  - Command key, e.g. 'videoUpscale'
 * @returns {{ upscaleModel: string|null }}
 */
export function getToolSettings(project, toolKey) {
    if (!project.toolSettings[toolKey]) {
        project.toolSettings[toolKey] = { upscaleModel: null };
    }
    return project.toolSettings[toolKey];
}

/**
 * Returns a new project with updated tool settings for the given toolKey.
 * Does not mutate the original.
 * @param {Project} project
 * @param {string} toolKey
 * @param {{ upscaleModel?: string|null }} updates
 * @returns {Project}
 */
export function setToolSettings(project, toolKey, updates) {
    const current = getToolSettings(project, toolKey);
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        toolSettings: {
            ...project.toolSettings,
            [toolKey]: { ...current, ...updates },
        },
    };
}
