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

## Answered by the user, 2026-08-21 — all closed

- [x] **Acceptance 12 (undo)** — stays as built, the paint-Apply contract. *"We can leave the
      undo as is. If I find it to be annoying, I'll create a card later."*
- [x] **Brief question 4** — the group keeps the name **Composite**.
- [x] **Brief question 2** — **no feather**. The detailing pass the user runs afterwards is what
      blends the object, and a blanket feather would hurt images that do not want one. Recorded
      in `docs/composite-place.md`.
- [x] **The re-centre button was a bug** — it seeded a SQUARE and squashed the photo. Replaced by
      `restorePlaceSize()`: the image's own pixel dimensions, in place, position and rotation
      kept. Guarded three ways, all mutation-proved RED. **Not yet driven in the app.**

## Carried to the sibling card

- **MPI-596 (Object Stamp Flow):** the user's detailing test says an **edit model** is preferable
  for the pass after a stamp. Design input for that card, not a change to this one.

## Left for the next session

1. Live-verify `restorePlaceSize()` in the running app — the only thing shipped unverified.
2. One manual drop on a VIDEO group (unchanged code, test-guarded, never exercised live).
3. Then close the card.
