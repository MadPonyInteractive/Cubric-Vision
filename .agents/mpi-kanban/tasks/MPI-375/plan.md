# Paint — an RGBA layer on MpiCanvas, sharing the mask brush's dab

## Current State

Project mode: scalable-foundation. Third in the MPI-424 umbrella (resequenced ahead of
MPI-368 by the user 2026-08-03, because the shape gizmo's second destination is the layer
this card builds). Read `tasks/MPI-424/brief.md` for the architecture and
`docs/masking-tools.md` for the contracts every canvas tool obeys.

**2026-08-03: items 1-3 are DONE and user-verified — see `## Completed`. The paint
layer, the shared dab and the Paint tool all exist and work. Items 4 (persistence +
Apply) and 5 (docs) remain, and `applyPaint` does not exist yet, so the Apply button
deliberately renders disabled rather than swallowing its own click.**

Measured in source 2026-08-03, before planning:

- **There is no paint layer of any kind.** No `paintCanvas`, no `paintLayer`, no `'paint'`
  mode. Every layer on `MaskManager` is binary alpha at a downscaled working size
  (`MASK_MAX_EDGE`, `init()` sets `_scale = min(1, MASK_MAX_EDGE / maxEdge)`).
- **The brush is a hard circle.** `MaskManager.paint()` is `save()` →
  `globalCompositeOperation` → `arc()` → `fill()` → `restore()`, done twice (manual and
  subtract). `brushType` is only `'brush' | 'eraser'`. No textures exist anywhere in the repo.
- **`paint()` stamps one dab per `mousemove` event** — there is no interpolation between
  samples.
- `MpiMaskStrip` (MPI-371) is the shared bottom strip, but half of it is mask-only: invert,
  B/W view, `clearMask()`, and settings persisted under the one `mask` tool key.
- `POST /project/composite-media` (MPI-362) takes **two file paths plus a mask** and blends
  them. Paint's flatten is base-file plus an **RGBA data URL that carries its own alpha** and
  needs no mask, so that signature does not fit as-is.
- `UndoStack` is deliberately layer-agnostic — "an entry is a list of rect patches over
  arbitrary 2D contexts" (`docs/masking-undo.md`). It was built before paint for this.
- `_isMaskTool()` in `MpiGroupHistoryBlock` currently gates three separate things:
  teardown, `_viewerModeFor()`, and `_modeKeepsPromptBox()`. Paint is **not** a mask tool but
  **does** keep the PromptBox (`docs/masking-tools.md` § taxonomy), so that predicate splits.

Settled with the user at planning, 2026-08-03 — implementation stops for none of these:

1. **Alpha brush pack is OUT** → `MPI-435`, blocked on this card. It needs ten textures that
   do not exist; keeping it here made the umbrella hostage to sourcing them.
2. **Extract the dab, not a class.** One `stampDab(...)` plus stroke interpolation, shared.
   `MaskManager` keeps its two-layer logic, `PaintManager` gets its one-layer logic. A full
   `BrushEngine` was rejected — it rewrites a working shared primitive and every call site for
   no behaviour the small version misses.
3. **Paint persists per entry, like masks** — temp PNG keyed by (project, group, item). The
   headline flow is paint → mask → detail, which spans a tool switch; discard-on-exit breaks
   it at step one.
4. **Paint is committed pixels, not a preview.** It does **not** extend `discardPreview()`.
   `manualCanvas` is the precedent: the preview contract protects uncommitted previews, and a
   paint stroke is as committed as a brush stroke.

Two things this plan decides on technical grounds and states as assumptions:

- **The paint layer is at image-native resolution**, not the mask working size. Masks are
  downscaled because they are consumed as a mask; paint becomes real pixels in a new history
  entry, so downscaling then upscaling on flatten would visibly soften every stroke. Cap it
  only if memory measures badly, with a `ponytail:` comment naming the ceiling.
- **One undo stack, chronological** — the card says so explicitly. Consequence to accept and
  document: Ctrl+Z inside the Paint tool can walk back into a mask stroke. That is one canvas
  with one history, and a second stack was ruled out before undo was built.

## Implementation

- [ ] **Extract the shared dab, then build `PaintManager`.** Pull `stampDab(ctx, x, y, r, op)`
      and a `strokeTo()` that interpolates dabs between two samples out of
      `MaskManager.paint()`; `MaskManager` calls it twice (manual + subtract), `PaintManager`
      once, with colour and flow. New `PaintManager.js` beside `MaskManager.js`: one RGBA
      canvas at image-native size, `paint`/`erase` (`destination-out`), `clear()`,
      `isEmpty()`, and `undoLayers()` feeding the existing `UndoStack`. Wire the gesture
      exactly as the mask brush does — `undo.begin()` at mousedown, `undo.commit(box)` at
      mouseup, `abort()` when nothing changed — and grow the stroke box from the same helper
      so the two cannot drift.
      **Verify:** the mask brush is byte-for-byte unchanged in behaviour — run
      `node --test "tests/*.test.cjs"` (suite is at 324/0) and paint a mask by hand; then a
      real-pixel check via a temp module under `js/` served off the running `:3000` and
      imported in Chromium (the `docs/masking-tools.md` § Fill Holes route), asserting a paint
      stroke lands the expected RGBA at the expected coordinates and that one stroke books
      exactly one undo entry. **Interpolation is a behaviour change to the mask brush** — first
      confirm whether fast drags gap TODAY; if they do not, leave spacing so they still do not.

- [ ] **Mount it: `MpiToolOptionsPaint` + the rail entry.** New organism with the colour
      picker, Clear paint and Apply, mounting `MpiMaskStrip` for brush/eraser, size and
      opacity. The strip is a shared primitive, so this is a sweep, not a local edit: give it
      flags to drop the mask-only controls (invert, B/W view) and route clear/opacity at a
      destination, then re-check **all five** existing mask-tool consumers. Register in
      `TOOL_OPTIONS_REGISTRY`, `TOOL_LABELS`, the `MpiHistoryTools` **Paint** group (image mode
      only), `js/shell/preloadStyles.js`, `js/components/types.js`, and the `MpiCanvas._methods`
      **allowlist** — a name missing there is `undefined` on `el`, which the optional-call
      idiom in the panels swallows in silence.
      **Verify:** `npm run lint:components` clean; `node --test tests/mask-tool-registry.test.cjs`
      still passes; each of the five mask tools opened by hand and its strip unchanged. Negative
      control the allowlist: drop one name, confirm the panel breaks, restore.

- [ ] **Split `_isMaskTool()`'s three jobs.** Paint is not a mask tool but keeps the PromptBox
      and needs its own viewer mode. `_modeKeepsPromptBox()` must cover paint; `_viewerModeFor()`
      gets a `'paint'` mode; teardown must still find it. Extend
      `tests/mask-tool-registry.test.cjs` so a paint mode missing from the PromptBox predicate
      fails — the MPI-372 bug was exactly this class, and it was silent.
      **Verify:** negative control both directions on the new assertion. In the app: enter
      Paint, confirm the PromptBox stays up, confirm the canvas does not swap to
      `MpiMaskedImagePreview` (that surface belongs to `prompt` mode and destroys the canvas
      mid-stroke).

- [x] **Document and close the loop.** New `docs/painting.md`: the layer model, the
      native-resolution decision, per-entry persistence, why paint is not a preview, and the
      shared-dab seam MPI-435 will parameterise. Add the paint mutations to
      `docs/masking-undo.md`'s **enumerated complete set** — that list is load-bearing, an
      unlisted mutation is a silent hole in Ctrl+Z. Route it from `docs/README.md` and the
      Context Router. Note in `docs/releases/UNRELEASED.md`.
      **Verify:** every named file, function and flag in the new doc exists in source; the
      undo set matches what `PaintManager` actually mutates.

## Completed

**Items 1-3, shipped and USER-VERIFIED in the app 2026-08-03** (colour, undo, brush,
eraser, clear, opacity all confirmed by hand). Evidence: `validation.md`.

- **The shared dab.** `brushDab.js` — `stampDab()` plus `strokeDabs()`, which
  interpolates between mouse samples at a quarter-radius spacing. `MaskManager`
  stamps it twice (manual + subtract), `PaintManager` once. MPI-435 parameterises
  that one function and both brushes get textures.
- **`PaintManager`.** One RGBA layer at image-native size capped at 4096, on the
  SHARED `UndoStack`. `isEmpty()` scans alpha rather than tracking a flag, because a
  flag goes stale the moment an undo empties the layer.
- **`MpiToolOptionsPaint` + the Paint rail group**, with `MpiMaskStrip` made
  destination-driven by a `DESTINATIONS` table rather than branches in `setup()`.
- **`_isMaskTool()`'s three jobs split** into `_isMaskTool` / `_isPaintTool` /
  `_isCanvasTool`, so paint keeps the PromptBox without pretending to be a mask.
- **A pre-existing mask-brush bug fixed on the way through** — see Plan Drift.

**Item 4, shipped and USER-VERIFIED 2026-08-03** ("all tests passed"). Evidence:
`validation.md` § Round 3.

- **Per-entry persistence** — `paint.png` beside the mask layers in the same TEMP
  item dir, written when the layer has pixels and DELETED when it does not, so a
  cleared layer cannot resurrect. Rides the existing three persist points and two
  restore points, so no new lifecycle.
- **`POST /project/apply-paint`** — a sibling of `composite-media`, sharing only its
  `nextSequence` / `.meta` / thumbnail machinery. `compositeOverlay()` flattens the
  RGBA by its own alpha; the source never round-trips as base64.
- **`mask-temp:delete` narrowed** so Clear mask cannot take the paint layer with it.
- **Apply honours the opacity slider**, added on the user's request at verification.

**Item 5, shipped 2026-08-03** — docs only, no code touched. `docs/painting.md` (170
lines) written from source-verified facts and routed from BOTH `docs/README.md` and
CLAUDE.md's Context Router; `docs/masking-undo.md`'s enumerated mutation set is now a
two-layer table with the paint entries and the `init()`-must-not-clear-twice rule;
`docs/masking-tools.md` § taxonomy's Paint row stops being a forward reference; ONE
`## whatIsNew` line in UNRELEASED.md. Every identifier named in the new doc grepped
back out of source; suite unchanged at 342/0.

## Remaining Work

None. All five items are done — the card is complete pending the user's close.

## Plan Drift

- **2026-08-03 (late) — `docs/masking.md` was NOT at its 200-line cap, and item 5's stated
  reason for a separate doc was therefore wrong.** Measured: 129 lines. The split is
  still correct on the other ground — masking.md plus ~90 lines of paint crosses the
  cap, and paint is its own subsystem with its own layer model, persistence and Apply
  route — so `docs/painting.md` was written as planned, with the false premise dropped
  rather than repeated into the new doc. `docs/masking-tools.md` is the file actually
  over the line (211), which is why item 5's edits there were kept length-neutral.
- **2026-08-03 — the mask brush was ALREADY dropping dabs, and this card fixed it.**
  The plan said to confirm whether fast drags gap before adding interpolation. They
  did, by construction: `paint()` stamped one arc per `mousemove` with nothing
  joining them, so any drag wider than the brush (40 image-px at the default) left
  holes. It read as a skipping brush, not a missing feature. The shared spacing
  closes it for both brushes. **This is a user-visible change to a shipped tool** and
  needs its own release-note line, not a fold into "paint added". User confirmed:
  *"no skip whatsoever."*
- **2026-08-03 — `MpiCanvasViewer._enterMode()` was a hardcoded mode chain, and the
  first build of the Paint tool was DEAD because of it.** Not in the plan's blast
  radius: `paint` was added to `MpiCanvas.activeMode`, the rail, the registry and
  `_viewerModeFor`, and fell through the viewer's final `else` to
  `activeMode = 'none'`. Nothing errored — the tool mounted and the canvas just
  panned. Fixed at the cause (`CANVAS_MODES` set), and the sweep found the
  drop-stale-mode triple DUPLICATED across both `modechange` subscriptions, now
  `_syncModeFromCanvas()`. Two guards added, both negative-controlled; the important
  one ties `_viewerModeFor`'s outputs to the viewer's accepted modes.
- **2026-08-03 — item 4's "Reload the app: still there" was WRONG, and matching the
  mask is the decision.** The mask TEMP store is **session-scoped**: `main.js`
  deletes `MASK_TEMP_ROOT` on quit and prunes stale dirs at boot. Paint inherits
  that, so it survives an entry switch, a tool switch and a renderer reload (Ctrl+R),
  but **not** a quit and relaunch. Masks have always behaved this way; a paint layer
  that outlived the session would be the odd one out, and per-project durable storage
  is a different feature nobody asked for.
- **2026-08-03 — `mask-temp:delete` had to stop being a directory nuke.** Not in the
  plan's blast radius. It `rm -rf`'d the item dir, and `paint.png` now lives in that
  dir, so **Clear mask** and **paste-mask-to-entry** would both have silently wiped
  the paint layer — breaking the card's own acceptance criterion that the two layers
  are independent. It now removes the three mask files by name. Both call sites mean
  "clear the mask", so the narrowing is correct at each; a guard fails if anyone
  restores the `rmSync(dir, …)`.
- **2026-08-03 — Apply now HONOURS the opacity slider (user asked, at item 4's
  verification).** The layer's own pixels stay fully opaque; the server scales the
  FLATTENED layer's alpha once, which is the same maths as the canvas drawing it at
  `globalAlpha`, so the new entry matches the screen. Measured exactly: 0.75 → 191,
  0.5 → 128, 0.7 → 179 on a white-on-black probe. This does NOT reopen the
  per-stroke-alpha decision below — a layer-wide scale has no dab build-up, which was
  the whole reason that was refused.
- **2026-08-03 — opacity is DISPLAY opacity, not paint alpha.** Marked with a
  `ponytail:` comment naming the ceiling: true alpha painting needs a per-stroke
  scratch buffer, because dabs overlap 75% and would build to solid within one
  stroke, making a slow drag darker than a fast one. A shape reference for a model
  does not need it.

## Verification

**Verify mode:** user-ux

The card is a hands-on drawing tool; nothing here proves itself from a test file. The user
must, in the running app: paint with brush and eraser, change colour and opacity, Ctrl+Z a
stroke, Clear, then run the real flow this card exists for — **paint a rough shape, mask it,
run detail over it** — and confirm the paint reached the model as a shape reference. Then
Apply and check the new history entry.

Automated floor before that: `node --test "tests/*.test.cjs"` (quoted glob — the directory
form dies on Node v24) still at or above 324/0, and `npm run lint:components` clean.

Two traps this card can hit silently, both worth checking explicitly:

- A shared-primitive edit that fixes paint and half-fixes the mask brush. Both destinations get
  swept, or neither is done (THE ROOT-CAUSE RULE, step 3).
- The working tree is CRLF — a Node replace using a literal newline escape misses silently.
  Assert a sabotage APPLIED before trusting any negative control.

## Preservation Notes

- `docs/painting.md` is new and must be routed from `docs/README.md` **and** CLAUDE.md's
  Context Router, or it is invisible to the next session.
- `docs/masking-undo.md`'s enumerated mutation set gains the paint entries.
- `docs/masking-tools.md` § taxonomy: the Paint row stops being a forward reference.
- MPI-435 (alpha brush pack) unblocks the moment the shared dab exists — clear its `blocked`
  maturity then, and point its card at the actual helper name.
- MPI-368 (Shapes) is next and needs the RGBA layer's rasterise target; leave the destination
  seam named in `docs/painting.md` so that card does not have to rediscover it.
- If dab interpolation turns out to change the mask brush's feel, that is a user-visible change
  to a shipped tool — say so rather than folding it into the paint release note.
