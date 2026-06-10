/**
 * js/core/operationRegistry.js — Versioning layer on top of commandRegistry.js.
 *
 * commandRegistry.js  → UI metadata (labels, input requirements, components)
 * modelRegistry.js    → workflow file resolution per model
 * operationRegistry.js → versioning, deprecation, app version introduced
 *
 * When adding a new operation: add it to commandRegistry.js first, then add
 * an entry here with the current APP_VERSION as appVersionIntroduced.
 */

/** All non-stub operations from commandRegistry.js. */
export const OPERATION_REGISTRY = {
    // Image operations
    t2i:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    i2i:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    upscale:      { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    edit:         { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    detail:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    change:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    remove:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    // Video operations
    t2v:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    t2v_ms:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    i2v:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    i2v_ms:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    extend:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    // Universal operations (not model-tied)
    interpolate:  { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    videoUpscale: { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    imageUpscale: { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    autoMaskImg:  { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    resize:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    resizeVideo:  { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
};

/**
 * Returns the registry entry for an operation, or null if not found.
 * @param {string} operationId
 * @returns {{ latestVersion: string, appVersionIntroduced: string } | null}
 */
export function getOperationMeta(operationId) {
    return OPERATION_REGISTRY[operationId] ?? null;
}

/**
 * Returns true if the operation key exists in the registry.
 * Use in validation (e.g., when loading a history item with an unknown operation key).
 * @param {string} operationId
 * @returns {boolean}
 */
export function isOperationKnown(operationId) {
    return operationId in OPERATION_REGISTRY;
}
