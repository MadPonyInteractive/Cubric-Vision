# Shape gizmo — one geometry, two destinations

## Current State

Project mode: scalable-foundation. Card 4 of the MPI-424 umbrella; MPI-425, MPI-382,
MPI-431 and MPI-375 have all shipped, so **both destinations exist** and this card lands
both mounts as its own text promises.

- **`CropManager.js` is the prior art**: 8 handle keys (`tl,tr,bl,br,t,b,l,r`) plus
  `body`, image-px hit-testing with a `HANDLE_HIT_RADIUS / scale` radius, fixed-screen-size
  handle drawing, and a static `getCursor()` consumed by `InputController.updateCursor()`.
  It draws on `screenUICanvas` (not the overlay) because the rect may leave the image and
  because that canvas has no `image-rendering: pixelated`. **No rotation anywhere.**
- **`mask.pointsMode` is the closer precedent for arming.** It is a FLAG inside the
  canvas' `'mask'` mode that re-routes the pointer, not a new `activeMode`. Shapes takes the
  same shape, which is why this card touches neither `CANVAS_MODES` nor `_enterMode`.
- **Rail groups exist**: Mask (brush · detect collapse · adjust) and Paint (paint). This
  card adds ONE button to each, not a group.
- **`TOOL_OPTIONS_REGISTRY` mounts with fixed props** `{ viewer, kind, currentItem }` at the
  single call site `MpiGroupHistoryBlock.js:484`. Nothing passes the mode through today.
- **`MpiMaskStrip` is destination-driven** (`DESTINATIONS` table). `brush: false` is not
  cosmetic — it calls `dest.setEnabled(false)`, which disarms canvas painting so a drag pans.
- **Undo**: a shape commit is a layer-wide ONE SHOT → `mgr._recordUndo()` **after** the
  no-op guard, then draw (`docs/masking-undo.md`). Both managers expose the same trio.
- **Scale**: `MaskManager._scale` (1536 cap) and `PaintManager._scale` (4096 cap) are
  different numbers. Image-px → layer-px is the caller's job in both.
- **Publish**: a mask made by any route other than a brush stroke MUST reach
  `onMaskStrokeEnd` or the op strip never unlocks (`docs/masking-tools.md` § PromptBox).

Decisions settled with the user before planning, so implementation stops for nothing:

1. **Paint mount commits `Fill` / `Erase`; mask mount keeps `Add` / `Subtract`.** Paint
   vocabulary for the paint layer — "Subtract" already names a mask layer and would collide.
2. **The gizmo STAYS after a commit.** Three ellipses is three drags, not three
   re-creations. Leaving the tool still discards it (preview contract).
3. **Filled only.** No outline mode, no stroke-width control — a shape reference for a
   model is a region. Outlines have a better home; see `## Preservation Notes`.

## Implementation

- [ ] **`ShapeManager.js` — the gizmo and its maths.** One shape in IMAGE px:
      `{ kind: 'rect'|'triangle'|'ellipse', cx, cy, halfW, halfH, rot }`, seeded centred at
      a third of the image on first arm. `shapeMode` is `null | 'mask' | 'paint'` — the
      `pointsMode` pattern, so the canvas' `activeMode` stays `'mask'` / `'paint'` and the
      B/E-owner, undo-gating and opacity wiring keep working untouched. **Hit-test in
      SHAPE-LOCAL space**: inverse-rotate the cursor about `cx,cy`, then reuse CropManager's
      axis-aligned handle test verbatim — one hit-test serves all three kinds AND rotation,
      instead of three rasteriser-shaped hit-tests. `body` is the shape-local bbox (a
      triangle's corner gap is not worth a barycentric test). Handle drag reshapes on that
      handle's axis in shape-local space; **ALT over a handle rotates about THAT handle**
      (it stays put, the centre orbits it), ALT over `body`/centre rotates about the centre.
      **Verify:** unit test in `tests/` — a 90° rotation of a non-square shape maps a known
      handle onto the expected image-px point; hit-testing that same point returns that
      handle at scale 1 and at scale 0.25; and a `t`-handle drag on a shape rotated 45°
      moves along the shape's own axis, not the screen's.

- [ ] **Draw + input.** `drawScreen(ctx, view)` on `screenUICanvas` beside the crop overlay:
      rotated outline per kind, the 8 handles at fixed screen size, a centre handle. Wire
      `InputController`: a shape branch **before** the mask/paint brush branches (where crop
      sits), `startDrag` / `drag` / `endDrag`, and a cursor from `CropManager.getCursor()`
      plus a rotate cursor while ALT is held over a handle. Shapes is brushless, so both
      panels mount `MpiMaskStrip` with `brush: false` — the drag must reach the gizmo, never
      the brush.
      **Verify:** in the running app at 3 zoom levels and after a pan — grab each handle,
      the body, and ALT-rotate from a handle and from the centre; the outline tracks the
      cursor with no drift, and dragging off the gizmo pans instead of painting.

- [ ] **Commit — `commitShape(op)` on MpiCanvas, both destinations off ONE path.** Build the
      rotated `Path2D` once in image px, scale it into the destination's own px with that
      manager's `_scale`, then:
      *mask* — `Add` fills the path white into `manualCtx` and `destination-out`s the same
      path from `subtractCtx` (the `bakeAutoPicksInto()` twin write), `Subtract` is the
      mirror; `mask._recordUndo()` after the no-op guard, `_recomposite()`, `draw()`, then
      `options.onMaskStrokeEnd?.()` so the op strip re-evaluates.
      *paint* — `Fill` fills the path in `paint.color`, `Erase` fills it `destination-out`;
      `paint._recordUndo()` after the guard, then `draw()`. No publish — paint is not a mask.
      No-op guard = no shape, zero area, or a degenerate axis. The gizmo survives the commit.
      **Verify:** real-pixel probe (temp module under `js/`, imported in Chromium via
      `playwright-cli`, deleted after) — a 30°-rotated ellipse commits pixels that match the
      rotated outline and NOT its axis-aligned bbox (the card's own rotation criterion);
      Add-then-Subtract of the same shape returns the layer to its start; each commit books
      exactly ONE undo entry and Ctrl+Z restores the layer; a zero-area shape books none.

- [ ] **Panels, registration, rail.** ONE `MpiToolOptionsShapes` organism registered under
      BOTH `maskShapes` and `paintShapes`; the block's single `Compound.mount()` call gains
      `mode` in its props (one line, generic — every options compound gets it) and the panel
      derives its destination from that. Panel = kind radio (rect / triangle / ellipse), the
      two commit buttons for its destination, and `MpiMaskStrip` with `brush: false` and the
      matching `dest`. Register `maskShapes` in `_MASK_TOOLS` and `paintShapes` in
      `_PAINT_TOOLS` (a miss in either is SILENT), both in `TOOL_OPTIONS_REGISTRY`, one rail
      button in each group, props in `js/components/types.js`, CSS in
      `js/shell/preloadStyles.js`, and every new `el.*` name in `MpiCanvas._methods`.
      **Verify:** `node --test "tests/*.test.cjs"` — `mask-tool-registry.test.cjs` scrapes
      the rail source, so both modes must resolve; add a guard that `paintShapes` is NOT in
      `_MASK_TOOLS` (it would silently drive the mask layer while looking correct) and one
      tying each new `el.*` to `_methods`. Negative-control both. `npm run lint:components`
      clean.

- [ ] **Preview contract + docs.** An uncommitted gizmo IS a preview: extend
      `el.discardPreview()` to drop the shape and disarm `shapeMode` — **never the
      `mountOptions()` call site**, which is the one seam. The panel's `destroy()` disarms
      too. Docs: `docs/masking-tools.md` is at **211 lines, over its 200 cap — trim first**,
      then add the Shapes section (gizmo, both mounts, the commit vocabularies);
      `docs/painting.md` § Seams resolves its MPI-368 bullet to what shipped;
      `docs/masking-undo.md`'s **enumerated** mutation table gains the shape commit for both
      managers (an unlisted mutation is a silent hole in Ctrl+Z); `UNRELEASED.md` gets its
      line; `tasks/MPI-424/brief.md` marks card 4 shipped and points at MPI-373.
      **Verify:** `tests/preview-contract.test.cjs` extended and negative-controlled — arm
      Shapes, place a shape, switch rail tool, assert the gizmo is gone and `manualCanvas` /
      `paintCanvas` are byte-identical (a discard is not an edit). Both docs at or under
      200 lines.

## Completed

All five implementation items, 2026-08-04. Suite 363/0 (was 343), lint 0 errors.
What actually shipped:

- **`ShapeManager.js`** — the shape in image-px (`kind`, `cx/cy`, `halfW/halfH`,
  `rot`), armed by `shapeMode` (`null|'mask'|'paint'`) the way `pointsMode` is, so
  `CANVAS_MODES` and `_enterMode` were never touched. Hit-testing inverse-rotates
  the cursor and then runs `CropManager`'s axis-aligned test verbatim; the handle
  keys, hit radius, fixed-screen-size drawing and `getCursor()` are imported, not
  forked. ALT rotates about the grabbed handle (it stays put, the centre orbits it)
  or about the centre from the body.
- **Draw + input** — `drawScreen()` on `screenUICanvas` beside the crop overlay; an
  `InputController` branch where crop's sits, `endDrag()` on mouseup and on Space,
  ALT read off the mouse event rather than through `hotkeyRegistry`.
- **Commit** — `MaskManager.commitShape()` / `PaintManager.commitShape()`, both
  taking a path BUILDER so each applies its own `_scale`. Mask does the
  `bakeAutoPicksInto()` twin write and publishes `onMaskStrokeEnd`; paint fills in
  `color` or erases. `_recordUndo()` after the no-op guard in both.
- **Panels + registration** — one `MpiToolOptionsShapes` under both modes (the block
  now passes `mode` into every options compound), `maskShapes` → `_MASK_TOOLS`,
  `paintShapes` → `_PAINT_TOOLS`, both in `TOOL_OPTIONS_REGISTRY`, a rail button in
  each group, four new icons, types.js, preloadStyles.js, `_methods`.
- **Preview + docs** — `discardPreview()` drops the gizmo; `docs/masking-shapes.md`
  (new), `docs/masking-adjust.md` (split), `painting.md`, `masking-undo.md`,
  `docs/README.md`, `UNRELEASED.md`, `MPI-424/brief.md`.
- **Guards** — `tests/shape-gizmo.test.cjs` (15 new), 4 new registry guards, 1 new
  preview-contract guard. Nine negative controls, all bit, all restored
  byte-identical. 22-assertion real-pixel probe green in Chromium.

## Remaining Work

- The `user-ux` pass in the running app (see `## Verification`).

## Plan Drift

- **2026-08-04 — 7.5° ROTATION SNAP + a new rail icon, after the second app pass.**
  The user asked what the snap value was: there wasn't one, rotation was free.
  `ROT_SNAP = π/24`, snapping the ABSOLUTE angle so an off-grid shape is pulled back
  square, with the orbit using the same snapped delta or the pivot would slide off
  the cursor. The first `shapes_stroke` icon (square + circle + triangle) read as a
  blob at 24px with a 2px stroke — two shapes is the legible limit, so it is now
  square + circle, checked rendered at 24 and 96px beside its rail siblings. Again
  two of five sabotages came back green and both were REAL holes: every test started
  at `rot = 0` (so delta-snap and absolute-snap agree) and 15° multiples are also
  7.5° multiples. Both covered now; suite 374/0.
- **2026-08-04 — SHIFT added after the user's app pass.** The gizmo works, and the
  ask was a proportion lock like crop's. Ratio clarified with the user first, because
  the two readings differ on an already-stretched shape: Shift keeps the ratio the
  shape **HAS** (Figma), it does not snap back to the 1:1 seed (Photoshop). Read off
  the mouse event like ALT. Two of the four sabotages against it went green and both
  were REAL holes — nothing drove a top/bottom handle (the other branch) and nothing
  called `drag()` twice — so two tests were added; a third green was a genuine no-op
  sabotage and the comment that claimed otherwise was corrected. Suite 370/0.

- **2026-08-04 — the commit lives in the LAYER managers, not in `MpiCanvas`.** The
  plan had `MpiCanvas.commitShape()` building the path and reaching into each
  manager. It takes `_scale` and `_recordUndo()` to do that, both private, and
  `docs/masking-undo.md`'s enumerated mutation set is written per manager — so a
  foreign class mutating a layer would be an unlisted mutation by construction.
  `commitShape(buildPath, flag)` on each manager instead; `MpiCanvas` only picks the
  destination and publishes.
- **2026-08-04 — the docs cap was met by SPLITTING, not trimming.** The plan said
  trim `masking-tools.md` (211/200) before adding. It was 11 lines over *before*
  this card, and the fat left was measured evidence, not prose. Split instead, the
  way `masking-sam3.md` already had been: `masking-shapes.md` (new) and
  `masking-adjust.md` (Adjust + Fill Holes moved out). `masking-tools.md` is 147.
- **2026-08-04 — a Centre button was added, unplanned.** The shape survives its
  commit and can be dragged off screen, where there is no handle left to grab. One
  button back is cheaper than a dead end.
- **2026-08-04 — THE ROUND-TRIP CRITERION WAS WRONG, and what it exposed is not
  this card's.** "Add then Subtract returns the layer to its start" fails at `a > 0`:
  antialiasing makes `destination-out` leave a sub-threshold rim (1973 px non-zero,
  **0 px at the app's own `>= 128` cut**). The shipped mask BRUSH leaves the same
  thing (1605 px, 0 at 128) — it is the alpha model, not the gizmo. It matters only
  because `MaskManager.getURL()` exports `a > 0` as SOLID WHITE while Fill Holes cuts
  at `>= 128`; those two thresholds disagree, and every masked generation goes
  through that export. NOT fixed here: it predates the card, and the root-cause rule
  says brief before touching a shipped shared primitive. Measured detail in
  `docs/masking-shapes.md`; flagged on `MPI-424/brief.md`.

## Verification

**Verify mode:** user-ux

The card is a direct-manipulation gizmo — handle feel, rotation about a held handle, the
seed size, and whether a filled triangle reads right on a busy image are all things the
user has to judge on screen. Before asking for that pass: full `node --test
"tests/*.test.cjs"` green with no new failures (suite was 336/0 after MPI-375), `npm run
lint` and `npm run lint:components` clean, every new guard negative-controlled, and the
real-pixel rotation probe run and recorded in `validation.md`.

Two traps this session inherits, both already paid for once:

- **The working tree is CRLF.** Anchor any source-scraping regex on `;\r?\n`; a `;\n`
  anchor matches nothing and reads as "the constant was renamed".
- **`playwright-cli eval` has no `--file`** (pass an async IIFE inline) and it **caches ES
  modules** — close and reopen the page after editing a probe dependency, or a sabotage
  comes back green.

## Preservation Notes

- **Adjust for the paint layer is a real follow-up, and it is where OUTLINES belong**
  (user, 2026-08-04). `MaskManager._morph(src, r)` is blur-then-threshold over a canvas'
  ALPHA and is already generic in its input; the paint version differs only in what the
  result is filled with — shrink is `destination-in` against the existing layer (colours
  survive), grow fills the new ring in the current paint colour with the original layer
  drawn back on top, and the edge band **is** "outline my scribble in colour X". Separate
  card, not this one: MPI-382 shipped mask-only, and folding it in would double this card.
- `docs/masking-tools.md` is OVER its 200-line cap (211) — trim before adding, and never to
  a catch-all file.
- MPI-373 (Composite) is the last card of the MPI-424 umbrella and hangs its own preview on
  the same `discardPreview` seam this card extends. It has no plan file yet.
- MPI-435 (alpha brush pack) is unblocked and parameterises `stampDab` alone — it does not
  touch the gizmo, and shapes are filled, so the two do not interact.
