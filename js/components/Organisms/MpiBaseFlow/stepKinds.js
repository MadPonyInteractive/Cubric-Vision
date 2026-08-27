import { MpiStepBox } from '../MpiStepBox/MpiStepBox.js';
import { MpiStepPreview } from '../MpiStepPreview/MpiStepPreview.js';
import { MpiStepCrop, composePaddedImage } from '../MpiStepCrop/MpiStepCrop.js';
import { MpiStepPaint, composePaintLayer, composePaintComposite } from '../MpiStepPaint/MpiStepPaint.js';
import { MpiStepCutout, composeCutObject } from '../MpiStepCutout/MpiStepCutout.js';
import { MpiStepPlace, composePlacedObject } from '../MpiStepPlace/MpiStepPlace.js';

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
    // `crop` is the outpaint gizmo: a rect that LEAVES the image, whose overhang
    // becomes the flat area the model fills. It reports a rect like `box` does,
    // but binds through STEP_MEDIA below rather than `param` — what it changes is
    // the picture the flow runs on, not a widget in the graph.
    crop: MpiStepCrop,
    // `paint` is the drawing gizmo: the user draws on the photo and what the run
    // gets is the DRAWING ALONE — an RGBA PNG at the photo's resolution, the layer
    // and not the composite. Like `crop` it binds through STEP_MEDIA rather than
    // `param`, and like `crop` it mounts the History tool's own engine whole
    // (`PaintManager` + `brushDab.js`) rather than growing a second brush.
    paint: MpiStepPaint,
    // `cutout` is the object-cleanup gizmo: ONE image on a stage of its own, a
    // Remove Background switch and an erase/restore brush, reporting two mask
    // layers. It mounts `MaskManager` + `UndoStack` + `brushDab` whole, exactly as
    // `paint` mounts `PaintManager`. It is SKIPPABLE by construction rather than by
    // a flag — untouched, its STEP_MEDIA adapter returns null and the frame leaves
    // the media alone (MpiStepCutout.js § SKIPPABLE BY CONSTRUCTION).
    cutout: MpiStepCutout,
    // `place` is the placement gizmo: the user says WHERE in one image a SECOND
    // image goes. It is the first kind to read two media roles — its own `role` is
    // the scene it draws on, and `sourceRole` names the object it places. Like
    // `crop` and `paint` it binds through STEP_MEDIA, and like them it mounts the
    // History engines whole (`ShapeManager` in `'place'` mode,
    // `CompositeManager.drawPlaced`) rather than growing a second gizmo.
    //
    // PAIRS WITH `cutout`, and the pair is the flow's stage 2 + stage 3: the object
    // is cleaned there and placed here. `place` reads what that stage produced
    // through `sourceValue`, which the frame hands it beside `source`.
    place: MpiStepPlace,
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
    // `place` reports the gizmo's rect as the region the model looks at, in the same
    // absolute top-left source pixels `box` uses, so a flow can point either kind at
    // `Mpi Box` and get the same unit.
    //
    // ROTATION IS DROPPED, and only Manual consumes this: Manual's box is square and
    // unrotated by construction — it is a region, not a placement — so there is no
    // angle to lose. In Auto the region comes off the placed object's own ALPHA
    // instead, the same read Draw It In does, so a rotated placement never reaches
    // here. A future flow that wants a rotated region needs a node that takes one.
    place: (v) => (v?.place?.halfW > 0
        ? {
            x: Math.round(v.place.cx - v.place.halfW),
            y: Math.round(v.place.cy - v.place.halfH),
            width: Math.round(v.place.halfW * 2),
            height: Math.round(v.place.halfH * 2),
        }
        : null),
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

/**
 * KIND → MEDIA adapters (MPI-594) — the second way a step can reach the run.
 *
 * `STEP_PARAMS` covers a gizmo whose value is a NUMBER the graph reads. Some
 * gizmos instead change the PICTURE: an outpaint rect is not a widget anywhere,
 * it describes a bigger frame the source has to be redrawn into before anything
 * samples it. Such a kind returns a FILE, and the frame swaps it in for that
 * role's media at dispatch.
 *
 * Deliberately kind-shaped, exactly like `STEP_PARAMS`: a flow declares
 * `kind: 'crop'` and needs no JS, so this stays expressible as a manifest. And
 * deliberately PIXELS-ONLY — the returned file is placed by the frame, which
 * owns the project and the preview-asset store.
 *
 * The swap NEVER touches the persisted snapshot. `flowInputs` keeps the user's
 * own image plus the rect, so Reuse restores what they supplied and re-derives
 * the padded file; persisting the derived one instead would re-pad a padded
 * picture on every reuse.
 *
 * A kind here may deliver its file to a role OTHER than the one it drew on — the
 * step declares `mediaRole` and the frame appends rather than replaces
 * (`_deriveRunMedia`). `crop` does not: a padded picture REPLACES the picture it
 * was padded from. `paint` does: the graph wants the photo AND the drawing, so
 * swapping the photo out for the layer would throw the photo away.
 *
 * @type {Record<string, function(Object|null, Object|null, Object=, Object=): Promise<File|null>>}
 */
const STEP_MEDIA = {
    crop: (value, media) => composePaddedImage(media, value),
    // `paint` derives one of TWO pictures, and the STEP says which (MPI-620).
    //
    // Default — the LAYER ALONE. The value already carries it and the source's natural
    // size, so this needs no media; the argument is kept for the shared signature.
    // Draw It In wants this: its graph takes the photo and the drawing as separate
    // inputs and decides for itself where the drawing applies.
    //
    // `composite: true` — the FLATTENED picture, strokes over the source or over flat
    // white when the step has no source at all. A graph with ONE image input wants this,
    // because a bare RGBA layer arrives with undefined colour wherever alpha is 0.
    // Declared rather than inferred: `mediaRole` correlates with it today (a step that
    // sends its file elsewhere wants the layer; one that replaces its own role wants the
    // composite) but that is a coincidence of two flows, not a rule, and inferring it
    // would silently change the picture a future flow gets.
    paint: (value, media, step) => (step?.composite
        ? composePaintComposite(value, media)
        : composePaintLayer(value)),
    // `cutout` derives the object wearing its composited alpha, at the object's own
    // natural size. Returns NULL when nothing was cut and nothing was brushed, which
    // is the whole of the step's skippability: the frame reads a null as "this kind
    // changed nothing", so a PNG that arrived already cut out reaches the graph
    // byte-identical instead of being re-encoded through a canvas for nothing.
    cutout: (value, media) => composeCutObject(value, media),
    // `place` takes the SOURCE media rather than its own role's: the picture it
    // stamps is the object, and its own role is the scene it stamps into. That
    // source is the cutout stage's output when that stage did anything and the
    // user's own upload when it did not — `_deriveRunMedia` walks the steps in FLOW
    // ORDER, so stage 2 has already swapped its file in by the time stage 3 runs.
    //
    // Returns null in MANUAL, which uses the region and not the pixels: the clean
    // object it wants is already sitting in `sourceRole`, so deriving here would
    // hand the run a second copy of a picture it has. Manual contributes the region
    // rect through STEP_PARAMS instead.
    place: (value, media, step, source) => composePlacedObject(value, source),
};

/**
 * @param {string} kind
 * @param {Object|null} value - the step's reported value, `_stepValues[role]`.
 * @param {Object|null} media - the media item the step is bound to, or null when the
 *   step CREATES its picture rather than deriving one (a blank-canvas paint step).
 * @param {Object|null} [step] - the step declaration, for kinds whose output shape the
 *   flow chooses (`paint`'s `composite`).
 * @param {Object|null} [source] - the media for the step's `sourceRole`, for a kind
 *   that derives its picture from a SECOND role (`place` stamps the object it was
 *   pointed at, not the scene it draws on). Resolved from the run's media list, so
 *   an earlier step's derived file is what arrives.
 * @returns {Promise<File|null>} a replacement file for that role, or null when
 *   the kind derives no media (`box` and `preview`) or nothing changed (a rect
 *   identical to the source, an unpainted layer, an untouched cutout, a `place`
 *   in Manual).
 */
export function stepValueToMedia(kind, value, media, step, source) {
    return STEP_MEDIA[kind]?.(value, media, step, source) ?? Promise.resolve(null);
}
