# MPI-454 — validation

**Verify mode: user-ux.** Everything below was measured on a private app instance
(`npm run app:isolated`, port 53237, own profile) against a disposable project seeded with two
generated PNGs and deleted afterwards. The user's app on `:3000` was never touched.

The proof images were chosen to make the one failure that matters visible: the object is a
200×120 PNG whose solid red core is inset by a **40px transparent margin**. If alpha is honoured
the base shows through that margin; if it is not, a rectangle lands.

## Automated

- `npm test` — **663 pass, 0 fail** (up from 662; the suite gained the Place guards).
- `npm run test:desktop` — **24 passed**.
- `npx eslint js/ routes/projects.js` — clean.
- **Mutation-proved the new guards.** Seven wirings removed one at a time, suite re-run each
  time, source restored in `finally`: `_COMPOSITE_TOOLS`, `TOOL_OPTIONS_REGISTRY`, the
  `commitShape` place guard, `reset()`'s placement drop, the `_methods` allowlist, the drop
  routing, and the rail button. **All seven went RED; the tree restored green.**

**The guard gap the plan found is closed.** `COMPOSITE_MODES` was the hardcoded pair
`['maskComp','paintComp']`, and it only ever existed to be *subtracted* from the mask/paint
prefix scrapes — so `placeComp`, which collides with neither prefix, would have been guarded by
nothing at all. It is now scraped from the rail's own Composite group, so a fourth front end is
guarded the day someone adds the button.

## Live, on the running app

| Acceptance | Evidence |
|---|---|
| 1 · registered in the group + `_COMPOSITE_TOOLS` + `_viewerModeFor` | rail Composite group returned `["Paint Comp","Mask Comp","Place"]`; panel mounts and the canvas accepts the mode |
| 2 · panel is slot + toggle + Apply, no Cancel | panel text: *"Image to place / Remove background / APPLY"* |
| 3 · three fill gestures | drop ✓ (below), `MpiMediaPicker` on empty click ✓ (wired to `onEmptyClick`), right-click Paste off `_compositeImage` ✓ (unchanged slot menu) |
| 4 · a drop selects Place and fills the slot | dropped 2 files **while a MASK tool was active** → Place armed, slot filled with `dropped_first.png` |
| 5 · video mode untouched | the handler branches on `isVideo`; the chip loop is byte-identical and guarded by a test asserting BOTH branches survive. **Not exercised on a live video group** — see Not verified |
| 6 · multi-file drop toasts the rest | toast read *"Placed dropped_first.png — 1 other file ignored"* |
| 7 · Remove Background is reversible with no second dispatch | one `generation:complete`, then toggling OFF restored the original with the counter **still at 1**. `removeBackground_001.png` (464 B) landed in `Media/` while the project record stayed at `groups 1, history [4]` — media on disk, record withheld, exactly `deferCommit` |
| 8 · gizmo moves / scales, SHIFT locks aspect | real mouse events through `InputController`: body drag moved the placement by (60, 42.5) image px; SHIFT corner drag grew 170×170 → 222×223, **aspect 1.000 → 0.996** |
| 9 · the placed image keeps its own alpha | preview drew **exactly 9112 px** = the 134×68 core and nothing of the 40px margin |
| 10 · Apply writes ONE entry at full resolution, sources untouched | `composite_001`, 512×512, `operation: "composite"`. Read back with sharp: **changed pixels 9112, bbox 134×68, solid**; 20px outside it the output is byte-identical to the base (`[30,125,132,255]` both) |
| 11 · leaving the tool restores the single-entry canvas | switching to Mask Brush: drawn pixels **9112 → 0**, panel destroyed. Extended through `resetComposite()` + `clearShape()`, never the call site |
| 12 · undo/redo | see Deviation below |
| 13 · Apply dead-gated, not silent | empty slot → Apply `disabled: true` with *"Choose an image to place…"*; filled → enabled. A bad URL emptied the slot **and said so** (proved accidentally by a mangled path: *"That image could not be loaded — the slot was emptied"*) |
| 14 · `docs/composite.md` widened | done, plus a `docs/composite-place.md` split (composite.md was at 194/200) |

**The preview and the written file agree to the pixel** — same bbox `(189,222,134×68)`, same 9112
changed pixels. That is the property MPI-373 was created to guarantee and it holds for Place.

## A real bug, found live and fixed at the cause

After the first Apply the gizmo vanished (`drawn: 0`) while Apply stayed **enabled** — the exact
failure `docs/composite.md` records the user hitting on 2026-08-04: *"Apply stayed enabled over a
hole that no longer existed and the next press returned silently."*

Cause, not symptom: Apply **reloads the entry it just created**, `loadImage()` → `shape.init()`
clears the gizmo because a new image is a new shape. The fix re-seeds the placement in
`loadImage`, beside the `comp.init()` announce that exists for the same reason. Re-measured:
after Apply the gizmo survives (`drawn: 9112`) and a **second Apply with no re-fill and no
re-drag** landed `composite_003`. That also gives Place the shape tools' rule — the gizmo
survives its commit, so stamping an object twice is two clicks. Guarded by a new test.

## Deviation from the acceptance list — needs a ruling

**Acceptance 12, "undo / redo covers a placement the same way a shape commit is covered", is
built as the paint-Apply contract instead, and I think the line is vacuous as written.**

A shape commit is undoable because it writes pixels into a layer. A placement writes none: the
gizmo's transform is not layer content, and `UndoStack` holds layers. What *is* undoable is the
result — Apply appends a new entry and both sources keep everything they had, so a placement is
undone by deleting that entry, exactly as paint's Apply is. Dragging the gizmo is not undoable,
and dragging the **shape** gizmo is not undoable either, so the two behave identically.

Giving Place a transform history the shape gizmo does not have would make the app's two gizmos
diverge, which is the one thing sharing `ShapeManager` exists to prevent. **If Ctrl+Z over a
gizmo drag is actually wanted, it is its own card and should cover both gizmos.**

## The resize button and video mode, live — 2026-08-21, second session

The two things the first pass shipped unverified. Private instance (`npm run app:isolated`, port
63034, own profile) against `mpi-454-proof`, a throwaway copy of `Video Tests` whose `.meta`
sidecars were repointed at the copy so nothing resolved back to the original; deleted afterwards.
The user's app on `:3000` was never driven and still answered 200 after the teardown.

Measurement is the **overlay canvas alpha bounding box** in image space (1024×1024), not a
screenshot: `w`/`h` are the placement's real dimensions and `px` its opaque area — which is what
tells a 400×160 rect apart from a rotated square carrying the same bbox.

### `restorePlaceSize()` — the resizer, unrotated

Source image 400×160, dropped on the History workspace (which armed Place, as acceptance 4 says).

| Step | bbox w×h | aspect | centre | opaque px |
|---|---|---|---|---|
| seeded by the drop | 540×216 | 2.500 | 512, 512 | 116640 |
| after a drag | 541×217 | 2.493 | 614.5, 580.5 | 117397 |
| after a free corner scale | 298×399 | **0.747** | 494, 672.5 | 118902 |
| **after the resize button** | **400×160** | **2.500** | **494, 672** | **64000** |

The image's own pixel size to the pixel, `px` exactly 400·160, the centre unmoved, and **not
square** — the square is the bug this button used to be.

### `restorePlaceSize()` — rotation survives

ALT-rotated ≈45.2°, solved off the bbox itself (400c + 160s = 396, 400s + 160c = 397).

| Step | bbox w×h | centre | opaque px |
|---|---|---|---|
| rotated, still own size | 396×397 | 522, 573.5 | 64637 |
| after a free corner scale | 477×477 | 562.5, 616.5 | 81809 |
| **after the resize button** | **396×397** | **562, 616.5** | **64432** |

Back to the same rotated 400×160: identical bbox, `px` ≈ 400·160 rather than the 78400 a rotated
square of that bbox would carry, centre unchanged within the bbox's own half pixel. The button
restores SIZE and leaves position and angle alone, which is the ruling.

### Video mode keeps the chip — both halves of the `isVideo` split

Group `i2v_ms_019`, an LTX 2.3 i2v video group.

| Case | Path taken | Result |
|---|---|---|
| video + **prompt** tool active | `_isVideoPromptToolActive()` short-circuits the window drag handlers | drop overlay stayed **hidden** on `dragenter`; the drop reached `.mpi-prompt-box` → chip, role `startFrame`, `imageCount` 0→1 |
| video + **crop** tool active | overlay shows, so `_dropOverlay.onDrop` runs with `isVideo` true | chip, role `endFrame`, `imageCount` 1→2 |

`hasPlaceImage` is not even defined on the video viewer — Place is registered for image mode only,
so no drop on a video group can arm it. The chip loop the first pass could only assert statically
is now exercised on a real video group, in both the tool states that reach it.

**Preview contract, re-confirmed:** after the whole Place session the project record still read 3
groups × 1 entry. The only disk writes were the slot imports the fill gestures are supposed to
make (`imported_003`, `imported_004`).

`node --test tests/mask-tool-registry.test.cjs` — **44 pass, 0 fail**, run before the live pass.

## Not verified

- **A base entry above 8192px** was not tested. `PLACE_MAX_EDGE` is 8192 and `compositeOverlay`
  stretches with `fit: 'fill'`, so beyond that the object resamples up. Ceiling and upgrade path
  are written into `docs/composite-place.md` rather than left to be discovered.
