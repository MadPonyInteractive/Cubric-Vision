# MPI-454 — checklist

Design and the seven implementation items live in [plan.md](plan.md); evidence in
[validation.md](validation.md). All shipped.

- [x] **Register `placeComp`** — `_COMPOSITE_TOOLS`, `TOOL_OPTIONS_REGISTRY`, `TOOL_LABELS`, the
      rail's Composite group, a `place_stroke` icon. Closed the guard gap:
      `tests/mask-tool-registry.test.cjs` scraped `COMPOSITE_MODES` from a hardcoded pair that
      only existed to be subtracted from the mask/paint scrapes, so a third front end whose name
      starts with neither prefix was guarded by nothing. It now reads the rail's own group.
- [x] **The gizmo** — `ShapeManager` gained `'place'` as a third destination; `seed(aspect)` opens
      it at the placed image's proportions; `setMode` forces `kind = 'rect'` (kind is shared with
      the shape tools); `commitShape` refuses `'place'` so it can never rasterise into the mask.
- [x] **The placed image** — on `CompositeManager`, beside the hole and the underlay, so
      `resetComposite()` drops it on the ONE preview seam. Preview draws straight to the overlay:
      no scratch layer, and therefore no `PAINT_MAX_EDGE` ceiling.
- [x] **Panel `MpiToolOptionsPlace`** — slot + Remove Background switch + Apply, no Cancel.
- [x] **Three fill gestures** — drop, `MpiMediaPicker` on an empty-slot click (`MpiMediaSlot`
      gained one optional `onEmptyClick` and stayed dumb), right-click Paste off `_compositeImage`.
- [x] **Drop routing** — image mode fills the slot and arms the tool; video mode's chip path
      untouched; a multi-file drop takes the first and toasts the rest.
- [x] **Remove Background on `deferCommit`** — live-verified first, as the plan required: it had
      had no consumer since MPI-306 and works. The cut-out lands in `Media/` while the project
      record stays put.
- [x] **Apply** — rasterises at the entry's own resolution and reuses `POST /project/apply-paint`.
      The route took one optional allowlisted `operation` so a placement is filed as `composite`,
      not `paint_007`.
- [x] **Docs** — `docs/composite-place.md` split out; composite.md, masking-tools.md,
      masking-shapes.md and docs/README.md updated. All inside the 200-line budget.

## Found and fixed during validation

- [x] **Apply left the tool dead but enabled** — it reloads the entry it just created, and
      `loadImage()` → `shape.init()` cleared the gizmo. Same shape as the cut bug
      `docs/composite.md` records from 2026-08-04. Fixed at the cause (re-seed in `loadImage`),
      which also gives Place the shape tools' "the gizmo survives its commit" rule. Guarded.

## Open for the user

- **Acceptance 12 (undo/redo) is built as the paint-Apply contract, not a transform history** —
  reasoning in [validation.md](validation.md) § Deviation. Needs a ruling.
- **Brief question 4** — three tools in the group, two hole-cutters and one placer: does the group
  still deserve the name *"Composite"*? Deliberately not renamed; it is a user call.
- **Brief question 2** — a 1–2px feather on the cut-out. `compositeOverlay` takes alpha as given.
  BiRefNet's own alpha was not judged by eye against a real photographic cut-out; worth a look
  before deciding it needs one.
