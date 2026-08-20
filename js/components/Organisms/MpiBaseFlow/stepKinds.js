import { MpiStepBox } from '../MpiStepBox/MpiStepBox.js';
import { MpiStepPreview } from '../MpiStepPreview/MpiStepPreview.js';

/**
 * STEP_KINDS — the step-kind registry (MPI-306 Phase 1).
 *
 * Mirrors the injector registry: `kind` in a flow's `steps[]` is a key here.
 * A NEW GIZMO IS ONE COMPONENT + ONE LINE IN THIS OBJECT — no frame change, no
 * per-flow layout code (carousel-frame.md § Steps are DATA).
 *
 * Every step kind implements the same contract:
 *   props        { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * A kind never learns which flow hosts it, never touches the workflow, and never
 * talks to an injector. The frame collects `{ [role]: value }` and hands it to
 * the flow at Run.
 *
 * @type {Record<string, Object>}
 */
export const STEP_KINDS = {
    box: MpiStepBox,
    // `preview` is the odd one: a LOOK, not a gizmo. It reports nothing, and
    // exists because step 0 loads media at thumbnail size — a flow whose input
    // is a video had nowhere the user could actually see it before running.
    preview: MpiStepPreview,
    // mask, light, mood… as they are built.
};

/**
 * FRAME-NATIVE kinds — a step the frame draws itself, with NO component and NO
 * media role (MPI-504).
 *
 * `fields` is the media-less step: its declared `fields` ARE the work, stacked in
 * the canvas position. It exists because a prompt-only flow has no media at all,
 * so every gizmo kind's `{ media, value, onChange }` contract is unsatisfiable —
 * `_buildStepSlide` would render "Add the image for this step on the first step."
 * on a flow that has no first-step slots to add it to.
 *
 * The one-row cap on a step's `fields` (carousel-frame.md) does NOT apply here:
 * that cap exists because the row is a MODIFIER on a canvas. With no canvas there
 * is nothing to modify — so these stack, exactly like the run slide's column.
 *
 * A `fields` step has no role, therefore no step-scoped identity, so its values
 * live in the FLOW-level store rather than `stepValues`. That is not a flag; it
 * is the only coherent place for them, and it is what lets one prompt be edited
 * on this step and on the run slide as a single shared value.
 *
 * @type {Set<string>}
 */
export const FRAME_KINDS = new Set(['fields']);

/** @param {string} kind @returns {boolean} */
export function isFrameKind(kind) {
    return FRAME_KINDS.has(kind);
}

/**
 * @param {string} kind
 * @returns {Object|null} the step-kind blueprint, or null if unregistered.
 */
export function getStepKind(kind) {
    return STEP_KINDS[kind] || null;
}

/**
 * KIND → graph-param adapters (MPI-572).
 *
 * A step that declares `param` sends its gizmo's value to that injection param.
 * WHICH role feeds which node stays flow knowledge — the flow declares it — but
 * the SHAPE the graph wants is a property of the gizmo, so the rename lives here
 * rather than in the flow or the frame. That is what makes the binding
 * declarable: a third-party manifest picks a `kind`, it never writes one, so
 * kind-shaped knowledge is the only knowledge a manifest gets for free.
 *
 * This is the last thing `MpiFlowHeadSwap.getInputs()` did that a FlowDef could
 * not say for itself.
 *
 * COORDS PASS THROUGH UNCONVERTED. `MpiStepBox` already reports absolute TOP-LEFT
 * SOURCE PIXELS clamped to the image, which is exactly what `Mpi Box` consumes
 * (box-gizmo.md § Coord contract). The key rename is the ONLY transform — adding
 * arithmetic here is the centre-anchor bug the mpi_box system exists to avoid.
 *
 * The reported value shape is deliberately NOT changed to match: `stepValues` is
 * persisted for Reuse, so renaming at the source would strand every card already
 * saved with `w`/`h`.
 *
 * @type {Record<string, function(Object): (Object|null)>}
 */
const STEP_PARAMS = {
    box: (v) => (v?.box
        ? { x: v.box.x, y: v.box.y, width: v.box.w, height: v.box.h }
        : null),
    // `preview` reports nothing, so it has no adapter and can carry no `param`.
};

/**
 * @param {string} kind
 * @param {Object|null} value - the step's reported value, `_stepValues[role]`.
 * @returns {Object|null} the injection-param value, or null when there is
 *   nothing to send (no value yet, or a kind that reports none). A null is
 *   OMITTED by the caller, leaving the node on its baked default.
 */
export function stepValueToParam(kind, value) {
    return STEP_PARAMS[kind]?.(value) ?? null;
}
