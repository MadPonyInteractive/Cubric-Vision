/**
 * js/core/appVersion.js — Application version constants.
 *
 * APP_VERSION: Semantic version of the Cubric Studio application. Bump on every release.
 * SCHEMA_VERSION: Project schema version (integer). Increment whenever project.json
 *                 structure changes in a way that requires migration.
 *
 * NOTE: COMFY_VERSION is no longer here. Engine versions are read from
 * dev_configs/system_dependencies.json via routes/platformEngine.js
 */

/** Semantic version of the Cubric Studio application. Bump on every release. */
export const APP_VERSION = '1.1.0';

/**
 * Project schema version (integer). Increment whenever project.json structure changes
 * in a way that requires migration (field renames, additions, restructuring).
 */
export const SCHEMA_VERSION = 4;