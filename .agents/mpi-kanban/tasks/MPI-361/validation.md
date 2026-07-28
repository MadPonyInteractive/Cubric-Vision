# MPI-361 Validation

## Phase A

**Verify mode:** `auto` for the graph step (converter output is machine-checkable);
`user-ux` for the MaskManager / MpiToolOptionsMask steps.

### Step 1 — graph branch — PASS (2026-07-28, agent-verified on the live engine)

Chain added beside the intact YOLO path (nodes 1650-1657):

```
Input_Points_Mask (MpiLoadImageFromPath, empty path self-gates)
  -> ImageToMask(channel=red)              # dots arrive WHITE ON BLACK, not alpha
  -> MaskToSEGS(combined=False, crop_factor 3, drop_size 1)
  -> Input_Points (SAMDetectorCombined, mask-points, dilation 0, threshold 0.93)
  -> GrowMaskWithBlur(expand -4) -> GrowMaskWithBlur(expand +4, fill_holes)
  -> MaskToSEGS(combined=True)
  -> Input_Points_Mode (MpiIfElse) -> existing ImpactSEGSPicker + SEGSPreview
```

New injectable keys: `Input_Points_Mask` (path or `data:` URL), `Input_Points_Mode`
(bool, default **false**), `Input_Points.threshold` (dotted key, float).

- [x] Converter clean — 21 nodes, **0 dangling, 0 missing-required** (checked against
      live `/object_info`, not just the converter's own OK line)
- [x] YOLO chain untouched — the whole API diff is two `segs` retargets from `1592`
      to the new `1657` plus the eight added nodes
- [x] `Output_image` still fed by `ImpactSEGSToMaskList` (multi-pick contract intact)
- [x] **POINTS MODE ran live** — one dot at (458,572) on the 928×1136 probe photo
      returned the denim shorts alone, 15,564 white px = **1.48%** of frame. Matches
      the bench proof (15,583 px / 1.48%); the 19-px delta is the new erode/dilate
      cleanup. Clean garment cutout with the leg-gap notch, no scatter.
- [x] **YOLO MODE regression ran live** — `bbox/face_yolov8n.pt`, points mode off,
      empty points path: `Output_image` + `Output_Detected` both emitted, 0.48%
      coverage (a face on a full-body shot). 2s vs 5s, so the points branch really
      is skipped.
- [x] No new node self-builds a path enum → no `SLASH_ONLY_NODE_TYPES` entry needed
      (MPI-246 trap checked, not applicable)

Note: `Input_Points_Mask` still *executes* in YOLO mode (it is a preview-emitting
node) but self-gates on the empty path via `ExecutionBlocker`, so nothing downstream
of it runs. `MpiIfElse`'s lazy inputs keep the two detector branches mutually
exclusive.

### Step 1b — negative-point polarity — PASS (agent-verified live)

`MaskManager` synthesizes **r=8** for a positive dot and **r=4** for a negative one,
betting those straddle the exact `< 10px bbox width` cliff that
`mask_hint_use_negative='Small'` uses. [research/polarity-test.mjs](research/polarity-test.mjs)
puts dots at the SAME two locations both times and changes only the second radius:

| dots | result | white px | % |
|---|---|---|---|
| shorts (r8) + calf (**r8**) | the whole person | 94,835 | 9.00% |
| shorts (r8) + calf (**r4**) | the shorts alone | 15,553 | 1.48% |

6.10x apart. The negative point works, and the two-positive row independently
reproduces the brief's "N dots do NOT give N objects" finding (9.00% here vs the
bench's 8.97% whole-person). `mask_hint_use_negative` is now `Small` in the graph.

### Steps 2-5 — app side — USER-VERIFIED 2026-07-28, one change outstanding

> **User verdict:** *"It seems to work great. The tests I've done, the applications
> I've used, it works really well."* Click-point masking, negative points,
> Scope and Add / Subtract all behave in the app.
>
### Step 6 — detection colour — PASS (USER-VERIFIED 2026-07-28)

> **User verdict:** *"Yeah, it looks great. It's working really well."*

The defect: a detected region rendered in the same white as the painted mask, so a
detection landing *inside an already-masked area* was invisible. Root cause was
structural, not cosmetic — `MaskManager._recomposite()` unions the manual layer and
the selected auto-picks into ONE `maskCanvas` and `MpiCanvas._renderOverlay()` draws
that single canvas, so the two are indistinguishable by construction.

Fixed by splitting the **display** and never the **export**:

- `MaskManager` gained `autoCanvas` + `hasAutoLayer`, built by a new
  `_recompositeAuto()` = `(⋃autoPickMasks[selected]) AND NOT subtract` — the same
  math as the union minus the manual layer. It **returns early when nothing is
  selected**, so the per-dab brush hot path pays nothing for the extra pass.
  Sized in `init()`, torn down in `destroy()`.
- `MpiCanvas._renderOverlay()` draws it as a second pass tinted `MASK_AUTO_FILL`
  (`--accent-ok`, the same green as a positive dot), inside the same
  `globalAlpha = maskOpacity` block, above the union and below the dots.
- The old `displayInverted` scratch-buffer recolor was factored into a shared
  `_recolorMaskLayer(src, color, W, H)` used by both branches — one buffer reused
  across both calls in a frame (safe: `drawImage` copies synchronously). Its
  `eslint-disable mpi/no-hardcoded-hex-color` went away with the `'#000'` literal,
  replaced by a `MASK_INVERT_FILL` constant beside the other stage colours.
- **Export untouched.** `getURL()` / `getMaskDataURL()` still flatten the single
  unioned `maskCanvas` every downstream mask consumer reads.

Also landed with it — **Add / Subtract now show in BOTH sources.** The
`commitRow.hidden = !_pointsMode` gate in `MpiToolOptionsMask` is gone;
`el.bakeAutoPicks()` was already mode-agnostic (it clears thumbs, the pick store and
the points together), so a YOLO detection renders green and waits for Add or Subtract
exactly like a points run.

User-confirmed in the app across four screenshots: a points run returned the cat in
green on top of a white painted blob; Add flattened it to white; Detect / Face
returned the face in green over the white hair mask with Add / Subtract present.

Files: `MaskManager.js`, `MpiCanvas.js`, `MpiToolOptionsMask.js`. `node --check` ×3
and `eslint` ×3 clean; no orphan references left (`_syncCommitRow`, `_maskInvertBuf`).

The record below is the pre-verification state, kept for the file list.

### Steps 2-5 — app side — CODE COMPLETE, NEEDS THE USER'S EYES

**Verify mode: `user-ux`.** Everything below is agent-verified only as far as
syntax + lint (`node --check` and `eslint` clean on all six files); no browser or
Electron run has exercised it.

Files:

- `js/components/Primitives/MpiCanvas/managers/MaskManager.js` — points layer
  (`points[]` in SOURCE-image px, `addPoint` / `removePointAt` / `clearPoints` /
  `getPointsMaskDataURL`) plus `bakeAutoPicksInto('manual'|'subtract')` for Add /
  Subtract. `clear()` and `destroy()` drop points too.
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` — `_drawMaskPoints()` renders
  the dots above the mask at constant screen size; brush indicator suppressed in
  points mode; new methods added to the `_methods` proxy list.
- `js/components/Primitives/MpiCanvas/managers/InputController.js` — left-click
  adds a positive point, right-click a negative one, clicking an existing dot
  removes it; `contextmenu` suppressed **with stopPropagation** (the viewer root
  has its own contextmenu handler); crosshair cursor.
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` — `_pointsMode` /
  `_pointsThreshold` (survive the preview remount), points payload, auto-pick of
  index 0 so a points run is ONE round trip, `el.bakeAutoPicks`, new
  `mask-points-changed` event.
- `js/services/commandExecutor.js` — `Input_Points_Mode` / `Input_Points_Mask` /
  `Input_Points.threshold` in the `autoMaskImg` params.
- `js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.{js,css}` —
  Detect / Points source radio, Scope slider, info box, Clear points, Add /
  Subtract. Points mode is turned off in `destroy()`.

**What the user needs to check in the app** (mask tool on an image):

1. Detect mode is unchanged — Face and Person still work.
2. Switch to Points. Left-click an object YOLO has no word for (headphones).
   A green dot appears. Hit Detect → the object is masked.
3. Right-click somewhere to exclude → red dot, smaller. Detect again → excluded.
4. Click a dot again → it disappears. Right-click does NOT open the image menu.
5. Sweep Scope (35 / 50 / 70 / 93) — it should step between a few results, not glide.
6. Add → the region joins the painted mask and the dots clear. Place new dots,
   Detect, Add again → both parts held. Subtract → cuts out of the mask.
7. Switch back to Detect / leave the mask tool → right-click menu works again.
