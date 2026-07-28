# Masking

The mask subsystem: how a mask is built, displayed, and handed to a workflow. Read this
before touching `MaskManager`, the overlay draw path, or the auto-mask graph.

Related: [comfy.md](comfy.md) (`runAutoMask`, title-keyed injection) ·
[component-contracts.md](component-contracts.md) (per-component fine print) ·
[.claude/rules/comfy_injection.md](../.claude/rules/comfy_injection.md).

---

## The layer model — `MaskManager`

Four canvases, three of them derived. All at a working resolution capped by
`MASK_MAX_EDGE` (1536): masks do not need high precision, and a 4K image recomposited
full-frame per brush dab is unusably laggy. Paint coords arrive in image-px and are
scaled by `_scale`.

| Canvas | What it holds | Written by |
|---|---|---|
| `manualCanvas` | brush strokes — white where painted | `paint()`, `bakeAutoPicksInto('manual')` |
| `subtractCanvas` | eraser strokes — white where erased | `paint()`, `bakeAutoPicksInto('subtract')` |
| `maskCanvas` | **the mask** = `(manual ∪ ⋃autoPickMasks[selected]) AND NOT subtract` | `_recomposite()` |
| `autoCanvas` | **display only** = `(⋃autoPickMasks[selected]) AND NOT subtract` | `_recompositeAuto()` |

`autoPickMasks` is a RAM-only `Map<pickIndex, ImageBitmap|Canvas>` of what the last
detect run returned; `selectedAutoPicks` is the `Set<number>` of chosen thumbs.

Brush at P writes **both** layers: paint sets manual white and clears subtract
(un-erase); erase clears manual and sets subtract white. `bakeAutoPicksInto()` mirrors
that exactly, which is why Add/Subtract composes with the brush and preserves undo.

### `autoCanvas` is a DISPLAY split — never an export (MPI-361)

A detected region and a painted region are the same white pixels in `maskCanvas`, so a
detection landing inside an already-painted area used to be invisible — the user could
not see what a run returned. `_recompositeAuto()` rebuilds the auto subset on its own so
`MpiCanvas` can tint it green.

**`getURL()` / `getMaskDataURL()` still flatten the single unioned `maskCanvas`.** Every
downstream mask consumer reads that one black-and-white PNG. Do not leak the split into
any export path.

`_recompositeAuto()` returns early when nothing is selected, so the per-dab brush hot
path costs the same as before the split. It is torn down with the other canvases in
`destroy()`.

---

## The overlay draw — `MpiCanvas._renderOverlay()`

Order matters. Comparison clip layer → mask → auto layer → point dots → crop → grid.

The mask block runs inside one `globalAlpha = mask.maskOpacity` so every mask pixel
fades together:

1. `maskCanvas` — as-is, or recoloured pure black when `displayInverted`.
2. `autoCanvas` — recoloured `--accent-ok` green when `mask.hasAutoLayer`, drawn on top
   so green wins wherever a detection overlaps paint.

Both recolours go through `_recolorMaskLayer(src, color, W, H)`, which fills
`source-atop` inside a **scratch buffer**. That indirection is load-bearing: filling on
the overlay directly would recolour the comparison layer painted underneath. The buffer
is reused across frames and across both calls in one frame — safe, because `drawImage`
copies synchronously before the next call overwrites it.

Canvas colours are module constants mirroring `styles/01_base.css` tokens
(`MASK_AUTO_FILL`, `MASK_INVERT_FILL`, `MASK_POINT_*`). JS cannot read CSS vars in a
per-frame draw — update the constant when the token changes.

`displayInverted` is display only. It never touches mask data; `getURL(bg, fg)` handles
real inversion for export.

---

## Click-point masking (MPI-361 Phase A)

Click a point on the image and SAM segments whatever that point belongs to — the answer
to the YOLO vocabulary ceiling ("mask the headphones" is impossible on
`UltralyticsDetectorProvider`, permanently). Runs on `sam_vit_b_01ec64.pth`, the weight
the auto-mask graph already loads: **zero download, zero licence, zero dep entry.**

### The points layer

Points are a fourth layer and deliberately **not a canvas** — they are a list of dots the
graph turns into a mask, not mask content. `points[]` is in **SOURCE-image px**, not the
`MASK_MAX_EDGE`-capped working size, for two reasons: SEG coords must line up with the
image `SAMDetectorCombined` receives, and the negative-point cliff is measured in that
image's own pixels.

**Polarity is carried by RADIUS.** `mask_hint_use_negative='Small'` reads a dot whose
bbox width is `< 10 px` as negative. `MaskManager` synthesizes `r=8` (bbox 17px,
positive) and `r=4` (bbox 9px, negative) to straddle that cliff. Proven live at 6.10×
separation: the same two dot locations gave the whole person at r8+r8 and the shorts
alone at r8+r4. The dots ship **white on black** through `ImageToMask(channel=red)` —
deliberately not an alpha mask, because `LoadImage`-family MASK outputs are `1-alpha` and
that inversion is a known foot-gun.

`getPointsMaskDataURL()` renders them on demand for `Input_Points_Mask`. A `data:` URL in
a media param is staged to a real file (and uploaded to a Pod on a remote engine)
automatically, because the param's same-titled node is in `PATH_MEDIA_CLASSES`.

### The graph branch — `comfy_workflows/img_auto_mask.json`

```
Input_Points_Mask (MpiLoadImageFromPath, empty path self-gates via ExecutionBlocker)
  -> ImageToMask(channel=red)
  -> MaskToSEGS(combined=False, crop_factor 3, drop_size 1)
  -> Input_Points (SAMDetectorCombined, mask-points, dilation 0, threshold 0.93)
  -> GrowMaskWithBlur(-4) -> GrowMaskWithBlur(+4, fill_holes)   # scatter cleanup
  -> MaskToSEGS(combined=True)
  -> Input_Points_Mode (MpiIfElse) -> existing ImpactSEGSPicker + SEGSPreview
```

Injectable keys: `Input_Points_Mask`, `Input_Points_Mode` (bool, default **false**),
`Input_Points.threshold` (dotted key, float).

The branch rejoins the **existing** picker chain, so thumbs / pick / composite plumbing
is reused rather than forked, and the shipped one-mask-per-pick contract
(`ImpactSEGSToMaskList`, never `SegsToCombinedMask`) stays intact. `MpiIfElse` inputs are
lazy, so points mode never runs YOLO and vice versa — measured 2s (YOLO) vs 5s (points).

### Behaviour you must not "fix"

- **N dots do NOT give N objects.** Every point goes into one `sam_obj.predict` call, so
  SAM returns a single region consistent with **all** of them. Two positive dots on
  shorts and calf gave the whole person. One part per run is the shape of the feature;
  Add accumulates parts across runs.
- **`threshold` is not a smooth confidence.** `sam_predict` keeps every SAM candidate
  scoring ≥ threshold and unions them, falling back to the single best if none pass. SAM
  emits 3 candidates, so the dial **snaps between 3 states** — `0.50 → 0.60` is usually
  identical. The UI ships it raw as a 30-99 "Scope" slider with an info box saying
  *sweep it, don't nudge it*.
- **`dilation` stays 0.** It blindly grows whatever SAM returned, scatter included. The
  eraser is the better answer.
- **The cleanup pair must stay equal and opposite** (`-4` then `+4`) or the mask grows or
  shrinks overall. 4/4 is the shipping default.
- Points mode auto-picks index 0 up front, so a run is ONE round trip. It relies on
  `MpiAutoMaskThumbs.setPicks()` **not** emitting `'change'` — that silence is deliberate.
- `InputController`'s points-mode `contextmenu` handler calls `stopPropagation` as well as
  `preventDefault`, because `MpiCanvasViewer` has its own contextmenu handler on its root.
  Leaving the mask tool must call `setMaskPointsMode(false)` or right-click stays broken.

---

## Add / Subtract

App-side, via `bakeAutoPicksInto()` — no `AddMask`/`SubtractMask` nodes and no extra round
trip. Shown for **both** the Points and Detect sources: a run renders green and waits for
the user to commit it either way. `el.bakeAutoPicks()` clears the thumbs, the pick store
and the points together, so it is mode-agnostic by construction.

---

## Roadmap

- **MPI-368** — Shapes: rectangle / triangle / ellipse gizmo, Add or Subtract.
- **MPI-361 Phase B** — Text: `SAM3_Detect` + `CLIPTextEncode` open-vocabulary prompts
  (1.75GB `sam3.1_multiplex_fp16`, SAM License, not gated). Its `threshold` gates TEXT
  detections only — it is **not** the point-path confidence dial.
- **MPI-371** — split Points / Detect / Shapes / Text into sibling tools under the MASK
  rail and extract the shared brush/eraser/invert/clear/opacity strip into one component
  (brush pair optional — the Points tool hides it).
