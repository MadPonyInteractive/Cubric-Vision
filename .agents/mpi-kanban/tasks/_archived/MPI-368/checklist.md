# MPI-368 — checklist

Derived from `plan.md` (compact plan → one stable step). The five plan items are
the detail; the step flips when all five are verified and `## Remaining Work` is
empty. Verify mode is **user-ux** — the last word is the user's, in the app.

- [x] **Implementation** — USER-VERIFIED 2026-08-04
  - [x] `ShapeManager.js` — the shape in image-px, `shapeMode` armed like
        `pointsMode`, hit-testing in SHAPE-LOCAL space so one test serves all
        three kinds and rotation, ALT-rotate about a held handle or the centre
  - [x] `drawScreen()` on `screenUICanvas` + the `InputController` branch ahead
        of the brushes, with per-handle cursors
  - [x] `commitShape(op)` — one rotated `Path2D`, scaled per destination:
        mask does the twin write and publishes `onMaskStrokeEnd`, paint fills in
        colour; one undo entry each, after the no-op guard
  - [x] `MpiToolOptionsShapes` under both modes (block passes `mode` into the
        options props), the four silent registries, rail buttons, types.js,
        preloadStyles.js, `MpiCanvas._methods`
  - [x] `discardPreview()` extension + docs (`masking-tools.md` is over its cap —
        trim first), `masking-undo.md`'s enumerated set, `UNRELEASED.md`,
        `MPI-424/brief.md`
  - [x] **Shift = resize without deforming** (user, after the first app pass) —
        locks the ratio the shape HAS, not 1:1

## Validation

Evidence lands in `validation.md`: the rotation unit test, the real-pixel commit
probe (rotated ellipse ≠ its bbox, Add-then-Subtract round trip, one undo entry
per commit), the preview-contract guard, and the user's app pass.
