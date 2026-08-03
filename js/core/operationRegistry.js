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
    // `control` absorbs the whole structure-transfer family (MPI-365): the user picks
    // WHICH structure (pose / depth / scribble / canny) and the graph switches its
    // preprocessor. It replaced two keys that existed only inside 1.4.0 and never
    // shipped — `depth` (itself a rename of `poseReference`) and a short-lived `pose` —
    // so no history item can carry either and neither needs a deprecated entry.
    //
    // The KEY is new in 1.4.0 even though depth transfer shipped in 1.1.0, so
    // `getOperationsIntroducedIn` lists it. What is genuinely new for users is the
    // TYPE PICKER on SDXL and Qwen, not the op — write the note that way.
    control:      { latestVersion: '1.0', appVersionIntroduced: '1.4.0' },
    // Superseded by `control` (1.4.0). Kept ONLY so history items written by <=1.3.0 —
    // which stamped `poseReference` as the operation — still validate and stay viewable.
    // Nothing may WRITE this key again.
    poseReference: { latestVersion: '1.0', appVersionIntroduced: '1.1.0', deprecated: true },
    upscale:      { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    edit:         { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    krea2Edit:    { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    qwenEdit:     { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    detail:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    // Superseded by `inpaint` (1.3.0). Neither was ever wired to a workflow or a
    // model's supportedOps, so nothing can have generated with them — the entries
    // stay (deprecated) only so a legacy history item still validates.
    change:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1', deprecated: true },
    remove:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1', deprecated: true },
    inpaint:      { latestVersion: '1.0', appVersionIntroduced: '1.3.0' },
    kleinEdit:    { latestVersion: '1.0', appVersionIntroduced: '1.3.0' },
    pid:          { latestVersion: '1.0', appVersionIntroduced: '1.0.0' },
    // Video operations
    t2v:          { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    t2v_ms:       { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    i2v:          { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    i2v_ms:       { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    extend:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    // Universal operations (not model-tied)
    interpolate:  { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    videoUpscale: { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    imageUpscale: { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    removeBackground: { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    imageDescribe: { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    autoMaskImg:  { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    resize:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
    resizeVideo:  { latestVersion: '1.1', appVersionIntroduced: '0.0.1' },
    appImageRegen: { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    appSdxl4k: { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    appVideoStitch: { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
    appHeadSwap: { latestVersion: '1.0', appVersionIntroduced: '1.1.0' },
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
