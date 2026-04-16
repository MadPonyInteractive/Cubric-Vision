/**
 * js/core/appVersion.js — Canonical source of truth for all version constants.
 *
 * APP_VERSION: Semantic version of the MpiAiSuite application. Bump on every release.
 * COMFY_VERSION: ComfyUI commit/tag bundled with this app version. Must match
 *                dev_configs/system_dependencies.json engine.version field.
 * SCHEMA_VERSION: Project schema version (integer). Increment whenever project.json
 *                 structure changes in a way that requires migration.
 */

/** Semantic version of the MpiAiSuite application. Bump on every release. */
export const APP_VERSION = '0.0.1';

/** ComfyUI commit/tag bundled with this app version. Never changes mid-release. */
export const COMFY_VERSION = '0.18.0';

/**
 * Project schema version (integer). Increment whenever project.json structure changes
 * in a way that requires migration (field renames, additions, restructuring).
 */
export const SCHEMA_VERSION = 1;