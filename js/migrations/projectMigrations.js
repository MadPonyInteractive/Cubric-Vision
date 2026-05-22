/**
 * js/migrations/projectMigrations.js
 *
 * Server-side migration runner for project.json schema changes.
 * Each migration function upgrades a project from schema N to N+1.
 *
 * Migrations run client-triggered via POST /migrate-project route
 * (projectManager.openProject -> /migrate-project -> migrateProject()).
 *
 * This file runs in Node.js (server-side), so it can use `fs` directly.
 */

'use strict';

const fs   = require('fs-extra');
const path = require('path');

/** Current schema version — must match SCHEMA_VERSION in js/core/appVersion.js */
const SCHEMA_VERSION = 2;

const MIGRATIONS = {
    /**
     * v0 → v1: Convert inline history objects to UUID-only arrays.
     *
     * Legacy projects stored full MediaItem objects directly in group.history[].
     * v1 stores only UUID strings in history[] and keeps full objects in
     * Media/.meta/<uuid>.json sidecar files.
     *
     * This migration:
     *  1. For each group, maps each inline item to a .meta/<uuid>.json sidecar
     *     (written only if one doesn't already exist)
     *  2. Rewrites group.history[] as an array of UUID strings
     *  3. Adds schemaVersion: 1 to the project
     */
    0: async (project, folderPath) => {
        const mediaMetaDir = path.join(folderPath, 'Media', '.meta');
        fs.mkdirSync(mediaMetaDir, { recursive: true });

        const migratedGroups = await Promise.all((project.itemGroups || []).map(async (group) => {
            // Handle legacy 'history' field (inline objects) and 'generationHistory' (if any)
            const legacyHistory = group.history || group.generationHistory || [];

            const migratedHistory = await Promise.all(legacyHistory.map(async (item) => {
                if (typeof item === 'string') return item; // Already a UUID

                // Write .meta/<uuid>.json for legacy inline item
                const metaPath = path.join(mediaMetaDir, `${item.id}.json`);
                if (!fs.existsSync(metaPath)) {
                    const metaContent = {
                        id:              item.id,
                        type:            item.type            || 'image',
                        filePath:        item.filePath        || '',
                        operation:       item.operation       || null,
                        prompt:          item.prompt          || '',
                        negativePrompt:  item.negativePrompt  || '',
                        seed:            item.seed            ?? -1,
                        modelId:         item.modelId         || null,
                        createdAt:       item.createdAt       || new Date().toISOString(),
                        name:            item.name            ?? null,
                        uploaded:        item.uploaded        ?? false,
                        pixelDimensions: item.pixelDimensions  || { w: 0, h: 0 },
                    };
                    fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2));
                }
                return item.id; // Replace object with UUID string
            }));

            return {
                ...group,
                history: migratedHistory,
                // Remove legacy generationHistory if present
                generationHistory: undefined,
            };
        }));

        return {
            ...project,
            itemGroups:   migratedGroups,
            schemaVersion: 1,
        };
    },

    /**
     * v1 → v2: Lift `modelSettings[*].operations.shared` to `project.shared[mediaType]`.
     *
     * Pre-v2 stored cross-model state (ratioSelector, batch, duration,
     * motionIntensity, previewStage) under each model's `operations.shared`.
     * v2 partitions by mediaType so image models share one bucket and video
     * models share another. Last-write wins per mediaType; iteration order is
     * Object.entries on modelSettings.
     */
    1: async (project) => {
        const { MODELS } = require('../data/modelConstants/models.js');
        const mediaTypeById = new Map(MODELS.map(m => [m.id, m.mediaType]));

        const sharedOut = {
            image: { ...(project.shared?.image ?? {}) },
            video: { ...(project.shared?.video ?? {}) },
        };

        const nextModelSettings = {};
        for (const [modelId, model] of Object.entries(project.modelSettings ?? {})) {
            const mediaType = mediaTypeById.get(modelId) ?? 'image';
            const ops = model?.operations ?? {};
            const { shared: legacyShared, ...restOps } = ops;
            if (legacyShared && sharedOut[mediaType]) {
                Object.assign(sharedOut[mediaType], legacyShared);
            }
            nextModelSettings[modelId] = {
                ...model,
                operations: restOps,
            };
        }

        return {
            ...project,
            modelSettings: nextModelSettings,
            shared:        sharedOut,
            schemaVersion: 2,
        };
    },
};

/**
 * Run all migrations from the project's current schemaVersion up to SCHEMA_VERSION.
 * Returns the fully migrated project object (does NOT write to disk — caller does).
 *
 * @param {Object} project    — Raw project.json object
 * @param {string} folderPath — Absolute path to project folder
 * @returns {Object}           — Migrated project object
 */
async function migrateProject(project, folderPath) {
    const fromVersion = project.schemaVersion ?? 0;
    if (fromVersion >= SCHEMA_VERSION) return project;

    let migrated = { ...project };
    for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
        if (MIGRATIONS[v]) {
            migrated = await MIGRATIONS[v](migrated, folderPath);
        } else {
            // No-op migration: just bump the version
            migrated = { ...migrated, schemaVersion: v + 1 };
        }
    }
    return migrated;
}

module.exports = { migrateProject, SCHEMA_VERSION };
