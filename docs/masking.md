# Masking

How a mask is built, displayed, and handed to a workflow. Read before touching
`MaskManager`, the overlay draw path, or the auto-mask graph. Related:
[comfy.md](comfy.md) (`runAutoMask`, title-keyed injection) ·
[component-contracts.md](component-contracts.md) ·
[.claude/rules/comfy_injection.md](../.claude/rules/comfy_injection.md).

---

## The layer model — `MaskManager`

Four canvases, three derived. All at a working resolution capped by `MASK_MAX_EDGE`
(1536): masks need no high precision, and recompositing a 4K image full-frame per brush
dab is unusably laggy. Paint coords arrive in image-px, scaled by `_scale`.

| Canvas | What it holds | Written by |
|---|---|---|
| `manualCanvas` | brush strokes — white where painted | `paint()`, `bakeAutoPicksInto('manual')` |
| `subtractCanvas` | eraser strokes — white where erased | `paint()`, `bakeAutoPicksInto('subtract')` |
| `maskCanvas` | **the mask** = `(manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]` | `_recomposite()` |
| `autoCanvas` | **display only** = `⋃autoPickMasks[selected]` | `_recompositeAuto()` |

`autoPickMasks` is a RAM-only `Map<pickIndex, ImageBitmap|Canvas>` of the last detect
run; `selectedAutoPicks` is the `Set<number>` of chosen thumbs. A brush dab writes
**both** layers — paint sets manual white and clears subtract (un-erase), erase does the
reverse. `bakeAutoPicksInto()` mirrors that exactly, which is why Add/Subtract composes
with the brush.

### Layer ORDER is load-bearing — the auto picks go on last

Subtract punches the **manual** layer only; selected auto picks union on top. A pick is a
positive assertion made *after* the erase — like a brush stroke over an erased area — so
the older erase cannot veto it. Punching subtract over the picks was a real bug: erase a
face, detect that same face, and it stayed invisible in both the mask and the green
preview, yet `Add` (which un-erases) filled it in — preview and commit disagreed.
`MpiCanvasViewer._buildCompositeFromTemp()` mirrors this order; **both change together.**

### `autoCanvas` is a DISPLAY split — never an export (MPI-361)

Detected and painted regions are the same white pixels in `maskCanvas`, so a detection
landing inside an already-painted area used to be invisible. `_recompositeAuto()` rebuilds
the auto subset alone so `MpiCanvas` can tint it green.
**`getURL()` / `getMaskDataURL()` still flatten the single unioned `maskCanvas`** — every
downstream consumer reads that one B/W PNG. Do not leak the split into an export path.
`_recompositeAuto()` returns early when nothing is selected, so the per-dab hot path is
unchanged; it is torn down with the other canvases in `destroy()`.

---

## The overlay draw — `MpiCanvas._renderOverlay()`

Order matters: comparison clip → mask → auto layer → point dots → crop → grid. The mask
block runs inside one `globalAlpha = mask.maskOpacity` so every mask pixel fades together:

1. `maskCanvas` — as-is, or recoloured pure black when `displayInverted`.
2. `autoCanvas` — recoloured `--accent-ok` green when `mask.hasAutoLayer`, drawn on top
   so green wins wherever a detection overlaps paint.

Both recolours go through `_recolorMaskLayer(src, color, W, H)`, filling `source-atop`
inside a **scratch buffer**. That indirection is load-bearing: filling on the overlay
directly would recolour the comparison layer underneath. The buffer is reused across
frames and across both calls in one frame — safe, because `drawImage` copies
synchronously before the next call overwrites it.

Canvas colours are module constants mirroring `styles/01_base.css` tokens
(`MASK_AUTO_FILL`, `MASK_INVERT_FILL`, `MASK_POINT_*`) — JS cannot read CSS vars per
frame, so update the constant when the token changes. `displayInverted` is display only;
`getURL(bg, fg)` does real inversion for export.

---

## Click-point masking (MPI-361 Phase A)

Click a point and SAM segments whatever it belongs to — the answer to the YOLO vocabulary
ceiling ("mask the headphones" is permanently impossible on `UltralyticsDetectorProvider`).
Runs on `sam_vit_b_01ec64.pth`, already loaded by the auto-mask graph: **zero download,
zero licence, zero dep entry.**

### The points layer

Points are a fourth layer and deliberately **not a canvas** — a list of dots the graph
turns into a mask. `points[]` is in **SOURCE-image px**, not the `MASK_MAX_EDGE`-capped
working size: SEG coords must match the image `SAMDetectorCombined` receives, and the
negative-point cliff is measured in those pixels.

**Polarity is carried by RADIUS.** `mask_hint_use_negative='Small'` reads a dot whose
bbox width is `< 10 px` as negative. `MaskManager` synthesizes `r=8` (bbox 17px) and
`r=4` (bbox 9px) to straddle that cliff — proven live at 6.10× separation (same two
locations: whole person at r8+r8, shorts alone at r8+r4). Dots ship **white on black**
through `ImageToMask(channel=red)`, deliberately not alpha: `LoadImage`-family MASK
outputs are `1-alpha` and that inversion is a known foot-gun.
`getPointsMaskDataURL()` renders them on demand for `Input_Points_Mask`; a `data:` URL in
a media param is staged to a real file (and uploaded to a Pod) automatically, because the
param's same-titled node is in `PATH_MEDIA_CLASSES`.

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
`Input_Points.threshold` (dotted, float). The branch rejoins the **existing** picker
chain, so thumbs / pick / composite plumbing is reused, not forked, and the shipped
one-mask-per-pick contract (`ImpactSEGSToMaskList`, never `SegsToCombinedMask`) stays
intact. `MpiIfElse` inputs are lazy, so points mode never runs YOLO — 2s vs 5s.

### Behaviour you must not "fix"

- **N dots do NOT give N objects.** All points go into one `sam_obj.predict`, so SAM
  returns a single region consistent with **all** of them (dots on shorts + calf gave the
  whole person). One part per run; Add accumulates across runs.
- **`threshold` is not a smooth confidence.** `sam_predict` unions every candidate scoring
  ≥ threshold, else falls back to the best. SAM emits 3 candidates, so the dial **snaps
  between 3 states** — `0.50 → 0.60` is usually identical. Shipped raw as a 30-99 "Scope"
  slider whose info box says *sweep it, don't nudge it*.
- **`dilation` stays 0** — it blindly grows whatever SAM returned, scatter included.
- **The cleanup pair stays equal and opposite** (`-4` then `+4`), else the mask grows or
  shrinks overall. 4/4 is the shipping default.
- Points mode auto-picks index 0 up front (ONE round trip), relying on
  `MpiAutoMaskThumbs.setPicks()` **not** emitting `'change'`. That silence is deliberate.
- The points-mode `contextmenu` handler calls `stopPropagation` *and* `preventDefault`
  (`MpiCanvasViewer` has its own on its root). Leaving the tool must call
  `setMaskPointsMode(false)` or right-click stays broken app-wide.

---

## Add / Subtract

App-side, via `bakeAutoPicksInto()` — no `AddMask`/`SubtractMask` nodes, no extra round
trip. Shown for **both** sources: a run renders green and waits to be committed either
way. `el.bakeAutoPicks()` clears thumbs, pick store and points together, so it is
mode-agnostic by construction.

---

## The tool family (MPI-371)

One rail icon per masking method inside the `Mask` group — no switcher, no source radio.
Each tool owns only its method-specific parts and mounts two shared compounds:

| Piece | Owns |
|---|---|
| `MpiToolOptionsMaskDetect` | model radio (Face / Hair / Hand / Person) + Box / Segment |
| `MpiToolOptionsMaskPoints` | Scope dial, click instructions, Clear points |
| `MpiMaskDetectRow` | thumbs · Detect · Add / Subtract, blocked as a unit while Cue is busy |
| `MpiMaskStrip` | paint / erase (**optional**) · invert · clear · opacity |

`MpiMaskStrip` takes `brush: false` — how Points mounts it. Invert, clear and opacity are
on every tool. Everything persists under the **one** `mask` tool key, so settings survive
a tool swap.

Two things must stay true through any further split:

- **`destroy()` calls `setMaskPointsMode(false)`** — points mode owns the right mouse
  button; without it the image context menu stays dead after leaving the tool.
- **A tool swap must not clear the mask.** `manualCanvas` + `subtractCanvas` are the
  user's work; only the auto layer is disposable. Nothing on a mount path may call
  `clearMask()` — `_exitMode()` only sets `activeMode = 'none'`.

Rail modes are `maskDetect` / `maskPoints`; the viewer knows only `'mask'`, so
`MpiGroupHistoryBlock._viewerModeFor()` maps between them. **Add any new mask tool to
`_isMaskTool()`** — everything below hangs off it.

---

## The PromptBox is live inside the family (MPI-372)

A mask and a prompt are **one operation**, so every mask tool keeps the PromptBox up.

- **Mask tools never swap the viewer surface.** `swapToPreview()` is a *VRAM
  optimisation* — it destroys `MpiCanvas` to free GPU texture backing and mounts
  `MpiMaskedImagePreview`, a strict subset of the canvas. A mask tool already has the
  canvas; that surface belongs to `prompt` mode, where no canvas tool is active.
  Swapping from a mask tool destroys the canvas mid-mask.
- **Mask state is published as it CHANGES**, from the canvas' stroke-end signal:
  `_endMaskStroke()` → `onMaskStrokeEnd` → `_publishMaskState()` → `evaluateMask()` →
  `mask-ready`, emitting only on a flip. **A tool that makes a mask by any other route —
  a shape commit, a text detection — must emit `mask-ready` itself or call
  `viewer.el.evaluateMask()`, or the op strip never unlocks.**
- **The rail owns which tool is armed.** Both reload paths (`entry-selected`,
  `_reloadViewerWithEntry`) re-arm via `_syncViewerToolMode()`; never clear the mode
  before `loadEntry`, which captures and restores it itself.
- `workspace:set-operation` no longer forces prompt mode — its only emitter is the op
  strip, inside the box. Do not reintroduce the force.

## Roadmap

- **MPI-368** — Shapes: rectangle / triangle / ellipse gizmo, Add or Subtract. Mounts
  `MpiMaskStrip` (brush pair probably off), no detect row.
- **MPI-361 Phase B** — Text: `SAM3_Detect` + `CLIPTextEncode` open-vocabulary prompts
  (1.75GB `sam3.1_multiplex_fp16`, SAM License, not gated). Its `threshold` gates TEXT
  detections only — **not** the point dial. Mounts both compounds unchanged.
