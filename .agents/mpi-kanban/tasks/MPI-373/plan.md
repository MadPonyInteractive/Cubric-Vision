# MPI-373 — Composite: one operation, two front ends, a live preview

The LAST card of the MPI-424 umbrella. Architecture: `tasks/MPI-424/brief.md` §
"Composite is one operation with two front ends". This plan does not re-decide it.

## Current State

Project mode: scalable-foundation.

- **The taxonomy row already exists and is locked.** `docs/masking-tools.md` §
  "Canvas tool taxonomy" declares `Composite` | blended image | `mask comp` ·
  `paint comp` | one op, two front ends | **no PromptBox**. MPI-425's note is
  explicit that MPI-373 "may not re-decide the Composite row or stub it in early",
  and that only working tools get a rail button — never a greyed placeholder.
- **The rail has no Composite group yet.** `IMAGE_TOOLS` in `MpiHistoryTools.js`
  ends at the `paint` group. Adding one is the same shape as the `paint` group
  MPI-375 added.
- **The server side is done and must not be touched.** `POST
  /project/composite-media` (`routes/projects.js:2327`) →
  `compositeThroughMask()` in `services/imageComposite.js:83`. Base keeps
  everything OUTSIDE the mask; overlay fills the masked area. It already returns
  `filePath` / `thumbPath` / `pixelDimensions`, and
  `MpiGroupHistoryBlock._runComposite()` (~line 1821) is already the correct
  Apply path — it appends the entry, persists, and reloads the viewer.
- **`fillHoles` is OPT-IN as of MPI-437** (`compositeThroughMask` defaults it
  `false`). MPI-424's brief: *"MPI-373 inherits that route — do not reintroduce a
  default fill."* An edge-band hole must composite as a band, not a disc.
- **The app-local copy buffer already exists** — `_copiedMask` in
  `MpiGroupHistoryBlock.js:170`, deliberately NOT the OS clipboard, with `Copy
  mask` / `Paste mask` on `MpiHistoryList`'s context menu and a `hasCopiedMask()`
  gate. There is no image equivalent yet.
- Both shared engines are live: `brushDab.js` (MPI-375) and `ShapeManager`
  (MPI-368). Undo is a real subsystem (`docs/masking-undo.md`), so nothing here
  builds a private stack — the brief's MPI-376 worry is resolved.
- `MpiCanvas.draw()` is `_renderBase()` → `_renderOverlay()` → `_renderScreenUI()`
  (line 768). `_renderBase()` draws the source 1:1 at (0,0); that is the seam the
  underlay hangs on.
- The card's `brief.md` PREDATES the 2026-08-01 re-scope. Where the two disagree,
  `task.json`'s description (TWO BUTTONS, PASTED SLOTS) wins.

### Decisions taken 2026-08-04 (user) — implementation must not re-ask

1. **The hole lives on its own scratch layer.** A `CompositeManager` owning a
   `compCanvas` beside `manualCanvas` / `subtractCanvas` / `paintCanvas`. It is
   NEVER persisted and dies with the tool. Reusing the mask layers was rejected:
   the mask persists per entry, so a composite would silently consume — and leave
   behind — a mask the user brushed for an inpaint.
2. **Size mismatch = COVER, centred.** The underlay scales up to fill image 1's
   frame and is centre-cropped, so a revealed pixel is ALWAYS filled. Fit-and-pad
   would make erasing into the pad band reveal nothing.
3. **The MPI-362 modal is DELETED**, not kept as a fast path. It is the exact
   thing the user says makes him run the composite three or four times.

## Implementation

- [ ] Build the Composite group end to end: a `CompositeManager` scratch layer +
      cover-fit underlay in `_renderBase()`, one `MpiToolOptionsComposite` panel
      registered under both `maskComp` and `paintComp`, media slots filled from an
      extended app-local copy buffer, Apply through the existing
      `/project/composite-media` route, and the MPI-362 modal path deleted.
      **Verify:** see `## Verification`.

Order within that one flow (it is one coherent change, not four independent ones):

1. **`CompositeManager` + the underlay.** New manager in
   `js/components/Primitives/MpiCanvas/managers/`: `compCanvas` (the hole),
   `underlayBitmap` + its cover-fit transform, `setUnderlay()`, `clear()`,
   `getURL()`, and `commitShape(buildPath, erase)` so the gizmo works here too
   for free. `_renderBase()` draws underlay-then-base-with-hole. The hole is a
   `destination-out` of `compCanvas` against the base — the same primitive
   `subtractCanvas` uses, so nothing new is invented.
2. **Arming + the brush.** A `compMode` flag armed like `shapeMode` /
   `pointsMode` (MPI-368's precedent), NOT a fourth `CANVAS_MODES` entry. Route
   `InputController`'s dab at `compCanvas` when armed. Every mutation records an
   `UndoStack` entry (`docs/masking-undo.md` — gesture via `undo.begin()` /
   `commit(rect)`).
3. **Copy image.** Add `_copiedImage` beside `_copiedMask` in
   `MpiGroupHistoryBlock`, a `Copy image` context-menu entry + `copy-image` emit
   in `MpiHistoryList`, and a `hasCopiedImage()` gate prop. Same buffer shape and
   same non-OS-clipboard reasoning as the mask one.
4. **`MpiToolOptionsComposite`** — ONE component under BOTH `maskComp` and
   `paintComp`, reading `props.mode` exactly as `MpiToolOptionsShapes` does, with
   a `MOUNTS` table and a THROW on an unknown mode. `maskComp` = image slot +
   mask slot (the hole comes from the pasted mask, no brush). `paintComp` = image
   slot only, plus `MpiMaskStrip` mounted `{ brush: true, dest: 'composite' }` —
   a new `DESTINATIONS` **row**, never a branch. Apply `MpiButton` gated on a
   filled image slot, disabled-not-inert (MPI-375's ruling).
5. **The slot component.** A small `MpiMediaSlot` compound: thumb or empty state,
   right-click → paste image / paste mask from the buffer, clear. Register its
   CSS in `js/shell/preloadStyles.js` and its props in `js/components/types.js`.
6. **Rail + registries.** A `composite` group in `IMAGE_TOOLS` with `maskComp` and
   `paintComp`; both into `TOOL_OPTIONS_REGISTRY`; a new `_COMPOSITE_TOOLS` set
   that is **NOT** in `_modeKeepsPromptBox` (the taxonomy's only group that drops
   the box) but IS a canvas tool for teardown. Extend
   `tests/mask-tool-registry.test.cjs` the way the paint family is guarded.
7. **Apply.** Panel → `composite-apply` → the Block calls the EXISTING
   `_runComposite(baseItem, overlayItem, maskDataUrl)`: base = the selected entry
   (on top), overlay = the slot image (underneath), mask = `compCanvas.getURL()`.
   No `fillHoles`. No base64 round-trip of the result.
8. **Delete the modal path.** `MpiMaskCompositeDialog/` + its `preloadStyles.js`
   entry + the `composite-requested` handler + `MpiHistoryList`'s two-entry
   "one of them must carry a mask" gate. `_runComposite` and the route STAY.
9. **Preview contract.** Extend `MpiCanvasViewer.discardPreview()` to drop the
   underlay + `compCanvas` — on the ONE seam, never at the `mountOptions()` call
   site (`docs/masking-tools.md` § The preview contract; `masking-shapes.md`
   shows the shape). Extend `tests/preview-contract.test.cjs`.
10. **Docs.** A new `docs/composite.md` (the layer stack, cover-fit, the two
    front ends, why the hole is scratch), routed from `docs/README.md` and
    CLAUDE.md's Context Router. `masking-tools.md` is at 147/200 — its taxonomy
    row already covers Composite, so only the "373 will extend this" forward
    references need healing, not new prose.

## Completed

- [x] **All ten steps, 2026-08-04.** New: `CompositeManager.js`,
      `MpiToolOptionsComposite/` (.js + .css), `MpiMediaSlot/` (.js + .css),
      `docs/composite.md`. Changed: `MpiCanvas` (manager + `composite` activeMode +
      10 API methods + allowlist + the reveal in `_renderOverlay`), `InputController`
      (cut brush, wheel, B/E, cursor, `_endCompositeStroke`), `MpiCanvasViewer`
      (`CANVAS_MODES`, the `el` surface, `discardPreview`), `MpiMaskStrip` (the
      `composite` destination row), `MpiGroupHistoryBlock` (`_COMPOSITE_TOOLS`,
      registry, `_viewerModeFor`, the clipboard, `composite-apply`),
      `MpiHistoryList` (`Copy image` in, `Mask composite` out), `MpiHistoryTools`
      (the rail group), `services/imageComposite.js` (cover-fit),
      `types.js`, `preloadStyles.js`. Deleted: `MpiMaskCompositeDialog/`.
- [x] Suite **384/0** (was 374 at plan time — 9 new registry guards + 1 preview-contract
      guard). `npx eslint js/ services/` → **0 errors** (19 pre-existing warnings, none
      in the new files). Four negative controls fired and the tree restored clean:
      composite keeping the PromptBox, `discardPreview` leaking the preview, the server
      going back to `fit: 'fill'`, and `maskComp` landing in `_MASK_TOOLS`.

## Remaining Work

**A REDESIGN, specified by the user 2026-08-04 after testing the build.** Paint Comp
works; Mask Comp's pasted-mask half is being replaced rather than kept:

1. **Right-click the canvas → "Send to Composite"**, the same gesture the Video
   workspace already offers for Start Frame / End Frame. It fills the image slot for
   BOTH front ends. `Copy image` comes back OUT of the history context menu.
2. **The mask slot is DELETED.** Mask Comp uses the mask already on the selected
   entry — cut that region out of the top image and reveal what is underneath. No
   pasting a mask, no second slot, no `_copiedMask.flat`.

Also outstanding: the `user-ux` pass in `## Verification`, re-run against the redesign
rather than against what shipped.

## Plan Drift

- **2026-08-04 — `composite` is a canvas MODE, not a flag.** The plan said to arm it
  like `shapeMode`. Wrong: the gizmo can be a flag *because it is not a brush* and
  never competes for the pointer, whereas the cut brush needs its own ownership —
  which is exactly what `activeMode` decides. A flag would have had to hide inside
  `mask` or `paint` and then fight that mode's brush. `MpiCanvasViewer`'s own comment
  already names adding a `CANVAS_MODES` entry as the supported path.
- **2026-08-04 — the server WAS touched, one line.** The plan said `imageComposite.js`
  stays untouched. It resized the overlay with `fit: 'fill'`, so a mismatched pair
  would stretch on disk while the canvas showed the agreed centre-crop — the preview
  would lie, which is the one thing this card exists to fix. Now
  `fit: 'cover', position: 'centre'`, identical to `fill` whenever the aspects match
  (every pair the retired modal was used on). Guarded with the client half in one test.
- **2026-08-04 — no `CompositeManager.commitShape()`.** The plan had it "so the gizmo
  works here too for free". The taxonomy gives Composite two buttons and neither is
  Shapes, so it would have been an uncalled method. Add it with the rail button, if ever.
- **2026-08-04 — `MpiMaskStrip` grew two table fields, not one row.** `opacitySlider:
  false` (a composite is a hard cut; a display alpha would make the preview disagree
  with the file) and `defaultBrush: 'eraser'` (revealing is the point, and the radio
  has to be told or it shows Paint while the canvas cuts). Both are rows-not-branches,
  and pushing the default down also fixed a latent disagreement on the other two
  destinations, where the radio and the manager could differ until the first click.
- **2026-08-04 — TWO BUGS FOUND IN THE APP by the user, both fixed, both guarded.**
  (a) **Apply silently did nothing after the first one.** Apply reloads the entry it
  just created → `loadImage()` → `comp.init()` wipes the cut, and nothing told the
  panel; Apply stayed enabled over a hole that no longer existed and the next press
  returned at its own null guard. No error, no toast. Root fix: `loadImage` announces
  through `_onCompositeChange`, like every other path that changes the cut. (b) **Both
  slots rendered their thumbnail AND their empty-state text at once** —
  `.mpi-media-slot__thumb` / `__empty` carry a `display`, and a class outranks the UA
  sheet's `[hidden] { display: none }`. The exact MPI-382 trap I had written warning
  comments about twice in this same card. Both have a test that fails on the shipped
  code and passes on the fix.
- **2026-08-04 — the real-pixel probe was not run.** The plan listed one for the
  cover-fit maths. The maths and both ends of the cover contract are guarded by source
  tests; what a probe would actually add is proof that *erasing reveals the underlay*,
  and that is the first thing the `user-ux` pass looks at. Not worth standing up the
  probe route to pre-empt a check the user is making anyway.

## Verification

**Verify mode:** user-ux

The whole point of this card is that the blend is VISIBLE while it is being
decided, which only the user can judge in the running app.

Automated, before handing it over:

- `node --test "tests/*.test.cjs"` — suite is 374/0 at plan time. New tests:
  registry membership for both composite modes, the discard extension, and the
  cover-fit transform maths (a real-pixel probe, per
  `tool_real_pixel_probe_via_playwright_cli`).
- `npx eslint js/` — 0 errors.
- No `fillHoles: true` reaches `compositeThroughMask` from this path.

In the app (Electron, not the browser — `npm run test:desktop`'s target):

1. Copy an image entry, open **Paint Comp** on another, paste into the slot —
   the underlay appears beneath and the top entry is unchanged until erased.
2. Erase → the underlay shows through live at the painted pixels; brush →
   restores the top image. Ctrl+Z steps both back.
3. Paste a mismatched-size image — cover-fit, centred, and no transparent gap
   anywhere the eraser reaches.
4. **Mask Comp**: paste an image AND a mask; the cut matches the mask. Use an
   EDGE-BAND mask (Adjust → Edge) — it must composite as a band, not a filled
   disc. That is MPI-437's regression, and this route inherits it.
5. Apply → ONE new history entry at full resolution; the source is untouched.
6. Switch rail tools without applying → underlay and hole are gone, no mask is
   left on either entry, and nothing new is on disk.
7. The PromptBox is HIDDEN in both composite modes and comes back on leaving.

## Preservation Notes

- `docs/composite.md` is new; docs are capped at 200 lines each and there is no
  catch-all file. Route it from `docs/README.md` AND the CLAUDE.md Context Router
  in the same pass.
- The four `.claude/rules/component-*.md` maps need the composite family added —
  `/mpic-update-component-map`, the same surgical-addition pass MPI-375 (commit
  `6d112007`) and MPI-368 used. Ask before editing architectural rule files.
- `docs/releases/UNRELEASED.md` gains a `whatIsNew` entry; the Add/Subtract modal
  disappearing is an `importantChanges` line.
- Closing this card CLOSES the MPI-424 umbrella. MPI-435 (alpha brush pack) and
  MPI-436 (Adjust for the paint layer) are the follow-ups and are independent.
- Still not fixed, and still not this card's: `MaskManager.getURL()` exports
  `a > 0` as solid white while the app cuts at `>= 128`
  (`tasks/MPI-424/brief.md` item 5). A composite mask taken from `compCanvas`
  inherits the same antialiasing rim — worth watching in step 4 above, but the
  decision belongs to whoever owns the export threshold.
