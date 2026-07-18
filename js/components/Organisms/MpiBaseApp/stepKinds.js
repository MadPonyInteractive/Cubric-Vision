import { MpiStepBox } from '../MpiStepBox/MpiStepBox.js';

/**
 * STEP_KINDS — the step-kind registry (MPI-306 Phase 1).
 *
 * Mirrors the injector registry: `kind` in an app's `steps[]` is a key here.
 * A NEW GIZMO IS ONE COMPONENT + ONE LINE IN THIS OBJECT — no frame change, no
 * per-app layout code (carousel-frame.md § Steps are DATA).
 *
 * Every step kind implements the same contract:
 *   props        { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * A kind never learns which app hosts it, never touches the workflow, and never
 * talks to an injector. The frame collects `{ [role]: value }` and hands it to
 * the app at Run.
 *
 * @type {Record<string, Object>}
 */
export const STEP_KINDS = {
    box: MpiStepBox,
    // mask, light, mood… as they are built.
};

/**
 * @param {string} kind
 * @returns {Object|null} the step-kind blueprint, or null if unregistered.
 */
export function getStepKind(kind) {
    return STEP_KINDS[kind] || null;
}
