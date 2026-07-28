# Masking

How a mask is built, displayed, and handed to a workflow. Read before touching
`MaskManager`, the overlay draw path, or the auto-mask graph. Related:
[comfy.md](comfy.md) (`runAutoMask`, title-keyed injection) ·
[component-contracts.md](component-contracts.md) · [comfy_injection.md](../.claude/rules/comfy_injection.md).

---

## The layer model — `MaskManager`

Four canvases, three derived. All at a working resolution capped by `MASK_MAX_EDGE` (1536):
masks need no high precision, and recompositing a 4K image full-frame per brush dab is
unusably laggy. Paint coords arrive in image-px, scaled by `_scale`.

| Canvas | What it holds | Written by |
|---|---|---|
| `manualCanvas` | brush strokes — white where painted | `paint()`, `bakeAutoPicksInto('manual')` |
| `subtractCanvas` | eraser strokes — white where erased | `paint()`, `bakeAutoPicksInto('subtract')` |
| `maskCanvas` | **the mask** = `(manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]` | `_recomposite()` |
| `autoCanvas` | **display only** = `⋃autoPickMasks[selected]` | `_recompositeAuto()` |

`autoPickMasks` is a RAM-only `Map<pickIndex, ImageBitmap|Canvas>` of the last detect run;
`selectedAutoPicks` is the `Set<number>` of chosen thumbs. A brush dab writes **both**
layers — paint sets manual white and clears subtract (un-erase), erase does the reverse.
`bakeAutoPicksInto()` mirrors that exactly, which is why Add/Subtract composes with the brush.

### Layer ORDER is load-bearing — the auto picks go on last

Subtract punches the **manual** layer only; selected auto picks union on top. A pick is a
positive assertion made *after* the erase — like a brush stroke over an erased area — so
the older erase cannot veto it. Punching subtract over the picks was a real bug: erase a
face, detect it again, and it stayed invisible in both the mask and the green preview, yet
`Add` (which un-erases) filled it in — preview and commit disagreed.
`MpiCanvasViewer._buildCompositeFromTemp()` mirrors this order; **both change together.**

### `autoCanvas` is a DISPLAY split — never an export (MPI-361)

Detected and painted regions are the same white pixels in `maskCanvas`, so a detection inside
an already-painted area used to be invisible. `_recompositeAuto()` rebuilds the auto subset
alone so `MpiCanvas` can tint it green; it returns early when nothing is selected (per-dab hot
path unchanged) and is torn down with the other canvases in `destroy()`.
**`getURL()` / `getMaskDataURL()` still flatten the single unioned `maskCanvas`** — every
downstream consumer reads that one B/W PNG. Do not leak the split into an export path.

---

## The overlay draw — `MpiCanvas._renderOverlay()`

Order matters: comparison clip → mask → auto layer → point dots → crop → grid. The mask
block runs inside one `globalAlpha` so every mask pixel fades together:

1. `maskCanvas` — as-is, or recoloured pure black when `displayInverted`.
2. `autoCanvas` — recoloured `--accent-ok` green when `mask.hasAutoLayer`, drawn on top
   so green wins wherever a detection overlaps paint.

**B/W view (MPI-381)** is a third display mode: alpha pinned to 1 over a flat backdrop, so the
mask reads as the plain B/W image it exports — how a user spots the stray specks a detection
leaves behind. Composes with `displayInverted` (backdrop and mask swap together); green still
draws on top or pick state vanishes. `maskOpacity` is ignored rather than made grey mush, so
the strip's opacity slider goes inert while B/W is on.

Both recolours go through `_recolorMaskLayer(src, color, W, H)`, filling `source-atop`
inside a **scratch buffer**. That indirection is load-bearing: filling on the overlay
directly would recolour the comparison layer underneath. The buffer is reused across
frames and across both calls in one frame — safe, because `drawImage` copies synchronously
before the next call overwrites it. Canvas colours are module constants mirroring
`styles/01_base.css` tokens (`MASK_AUTO_FILL`, `MASK_INVERT_FILL`, `MASK_BW_*`,
`MASK_POINT_*`) — JS cannot read CSS vars per frame, so update the constant when the token
changes. `displayInverted` is display only; `getURL(bg, fg)` does real inversion for export.

---

## Click-point masking (MPI-361, rebuilt on SAM3 in MPI-380)

Click a point and SAM3 segments whatever it belongs to — the answer to the YOLO vocabulary
ceiling ("mask the headphones" is permanently impossible on `UltralyticsDetectorProvider`).
Runs on `sam3.1_multiplex_fp16.safetensors` (1.75GB, `engineAsset`, SAM License —
commercially clear), loaded by a plain `CheckpointLoaderSimple`: SAM3 is a **core ComfyUI
0.28 model**, no custom node.

SAM 1 (`sam_vit_b`) is **NOT retired** — it still refines the YOLO segment branch, whose
Impact `SAM_MODEL` slot SAM3 cannot fill. That swap needs a SEGS→`BOUNDING_BOX` bridge and
belongs to MPI-379.

### The points layer

Points are a fourth layer and deliberately **not a canvas** — a list of dots the graph
turns into a mask. `points[]` is in **SOURCE-image px**, not the `MASK_MAX_EDGE`-capped
working size: SAM3 normalises coords against the image it loads.

**Polarity is which LIST a point lands in**, not how big it is drawn. `getPointsJSON()`
splits `points[]` into two `[{"x":int,"y":int}]` strings — the KJNodes `PointsEditor` shape
SAM3 documents. Both are always emitted, `[]` included: omitting a key would leave the
previous run's coords sitting on the node. No dot image is rendered, staged, or uploaded —
**one less media upload per remote run.**

### The graph branch — `comfy_workflows/img_auto_mask.json`

```
Input_Points_Positive / Input_Points_Negative (MpiString, JSON pixel coords)
  -> SAM3 Points (SAM3_Detect, refine_iterations 2, individual_masks false)
  -> GrowMaskWithBlur(-4) -> GrowMaskWithBlur(+4, fill_holes)   # scatter cleanup
  -> MaskToSEGS(combined=True)
  -> Input_Points_Mode (MpiIfElse) -> existing ImpactSEGSPicker + SEGSPreview
```

Injectable keys: `Input_Points_Positive`, `Input_Points_Negative`, `Input_Points_Mode`
(bool, default **false**). The branch rejoins the **existing** picker chain, so thumbs /
pick / composite plumbing is reused, not forked, and the shipped one-mask-per-pick contract
(`ImpactSEGSToMaskList`, never `SegsToCombinedMask`) stays intact. `MpiIfElse` inputs are
lazy, so points mode never runs YOLO.

### Behaviour you must not "fix"

- **N dots do NOT give N objects.** All points go into one predict call, so SAM3 returns a
  single region consistent with **all** of them. One part per run; Add accumulates.
- **There is no threshold on the point path.** `SAM3_Detect` takes one, but the point branch
  ignores it entirely — only `refine_iterations` applies. This is why MPI-380 **deleted** the
  Scope dial instead of remapping it. Do not re-add a threshold control here.
- **`positive_coords` / `negative_coords` are `forceInput` STRING** — they must be WIRED from
  `MpiString` nodes; they cannot be widget values on `SAM3_Detect` itself.
- **Nothing in the graph gates an empty run.** The old branch self-gated on
  `MpiLoadImageFromPath(block_if_empty)`; string nodes cannot. `MpiCanvasViewer` refuses the
  run with a toast — that guard is load-bearing, not a nicety.
- **The cleanup pair stays equal and opposite** (`-4` then `+4`), else the mask grows or
  shrinks overall — 4/4 is the shipping default.
- Points mode auto-picks index 0 up front (ONE round trip), relying on
  `MpiAutoMaskThumbs.setPicks()` **not** emitting `'change'`. That silence is deliberate.
- The points-mode `contextmenu` handler calls `stopPropagation` *and* `preventDefault`
  (`MpiCanvasViewer` has its own on its root). Leaving the tool must call
  `setMaskPointsMode(false)` or right-click stays broken app-wide.

---

## Add / Subtract

App-side, via `bakeAutoPicksInto()` — no `AddMask`/`SubtractMask` nodes, no extra round trip.
Shown for **both** sources: a run renders green and waits to be committed either way.
`el.bakeAutoPicks()` clears thumbs, pick store and points together — mode-agnostic by design.

---

## The tool family (MPI-371, split MPI-381)

One rail icon per masking method inside the `Mask` group — no switcher, no source radio.
Each tool owns its method-specific parts and mounts the shared compounds:

| Piece | Owns |
|---|---|
| `MpiToolOptionsMaskBrush` | nothing — it **is** the strip with its brush pair |
| `MpiToolOptionsMaskPoints` | Scope dial, click instructions, Clear points |
| `MpiToolOptionsMaskDetect` | model radio (Face / Hand / Person) + Box / Segment |
| `MpiMaskDetectRow` | thumbs · Detect · Add / Subtract, blocked as a unit while Cue is busy |
| `MpiMaskStrip` | paint / erase (**optional**) · invert · B/W view · clear · opacity |

**One job each.** Only the Brush tool paints. `brush: false` is not cosmetic — the strip
forwards it to `setMaskPaintEnabled()`, so a brushless tool pans on drag, zooms on wheel and
keeps its cursor. The flag lives on the **viewer**: a canvas rebuild would otherwise restore
the manager default (`true`) and silently re-arm the brush. Settings persist under the
**one** `mask` tool key and survive a tool swap. Three things must stay true through any
further split:

- **`destroy()` calls `setMaskPointsMode(false)`** — points mode owns the right mouse
  button; without it the image context menu stays dead after leaving the tool.
- **A tool swap must not clear the mask.** `manualCanvas` + `subtractCanvas` are the user's
  work; only the auto layer is disposable. Nothing on a mount path may call `clearMask()` —
  `_exitMode()` only sets `activeMode = 'none'`.
- **Every mask tool is registered in `_MASK_TOOLS`** (`MpiGroupHistoryBlock`) — teardown,
  the PromptBox gate and `_viewerModeFor()` (rail mode → the viewer's single `'mask'`) all
  hang off it, and a miss is silent. `tests/mask-tool-registry.test.cjs` guards it.

---

## The PromptBox is live inside the family (MPI-372)

A mask and a prompt are **one operation**, so every mask tool keeps the PromptBox up.

- **Mask tools never swap the viewer surface.** `swapToPreview()` is a *VRAM optimisation* —
  it destroys `MpiCanvas` to free GPU texture backing and mounts `MpiMaskedImagePreview`, a
  strict subset of the canvas. A mask tool already has the canvas; that surface belongs to
  `prompt` mode, where no canvas tool is active. Swapping destroys the canvas mid-mask.
- **Mask state is published as it CHANGES**, from the canvas' stroke-end signal:
  `_endMaskStroke()` → `onMaskStrokeEnd` → `_publishMaskState()` → `evaluateMask()` →
  `mask-ready`, emitting only on a flip. **A tool that makes a mask by any other route —
  a shape commit, a text detection — must emit `mask-ready` itself or call
  `viewer.el.evaluateMask()`, or the op strip never unlocks.**
- **The rail owns which tool is armed.** Both reload paths (`entry-selected`,
  `_reloadViewerWithEntry`) re-arm via `_syncViewerToolMode()`; never clear the mode before
  `loadEntry`, which captures and restores it itself.
- `workspace:set-operation` no longer forces prompt mode — its only emitter is the op strip,
  inside the box. Do not reintroduce the force.

## Roadmap

- **MPI-368** — Shapes: rectangle / triangle / ellipse gizmo, Add or Subtract. The 4th tool of
  the split; mounts `MpiMaskStrip` with `brush: false`, no detect row.
- **MPI-379** — the SAM 1 refiner swap, carried over from MPI-380: it needs YOLO SEGS as
  `BOUNDING_BOX` dicts, which this graph cannot produce today. SAM3 *text* masking stays
  CANCELLED (was MPI-361 Phase B): it cannot enumerate, so it refines, never finds.
