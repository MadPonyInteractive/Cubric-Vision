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
draws on top or pick state vanishes. `maskOpacity` is ignored while B/W is on, so the strip's
opacity slider goes inert rather than making grey mush.

Both recolours go through `_recolorMaskLayer(src, color, W, H)`, filling `source-atop` inside a
**scratch buffer** — load-bearing, since filling on the overlay would recolour the comparison
layer underneath. The buffer is reused across frames and across both calls in one frame (safe:
`drawImage` copies synchronously). Canvas colours are module constants mirroring
`styles/01_base.css` tokens (`MASK_AUTO_FILL`, `MASK_INVERT_FILL`, `MASK_BW_*`, `MASK_POINT_*`)
— JS cannot read CSS vars per frame, so update the constant when the token changes.
`displayInverted` is display only; `getURL(bg, fg)` does real inversion for export.

### The brush cursor is TWO-TONE on purpose — `_drawBrushIndicator()`

It draws on `screenUICanvas` (container px, outside the CSS transform), not the
overlay, so the ring keeps its screen size at any zoom while its radius tracks
`brushSize * scale`. The real cursor is hidden while painting; this circle *is* it.

The arc is stroked **twice** — accent, then `BRUSH_CURSOR_OUTLINE` dark at
`lineDashOffset` half a period — the same interleave `_drawGridOverlay()` uses. A
single-colour ring is invisible against a background of its own hue: the eraser was
drawn in `--surface-canvas` and disappeared on black and in B/W view. **Dash halves
must stay equal with the offset at half the period** (`[4,4]` / `4`) or the two
passes stop tiling and bare arcs open up. Same reason the centre dot is an accent
fill inside a dark ring, exactly like the SAM3 point dots.

Mode reads off the accent alone: `BRUSH_CURSOR` heat = paint, `BRUSH_ERASER` frost =
erase. `MpiCanvasViewer.css`'s `.mask-shape*` rules are the dead pre-canvas cursor —
they duplicate these colours and are not the source of truth.

---

## The SAM3 tools — points and text

Both live in **[masking-sam3.md](masking-sam3.md)**: the click-point branch (MPI-361/380),
the open-vocabulary text branch (MPI-384), their shared graph plumbing, and the behaviours
that look like bugs and are not.

---

## Undo — `UndoStack` (MPI-376)

Ctrl+Z / Ctrl+Shift+Z on the mask layers lives in **[masking-undo.md](masking-undo.md)**:
what the stack stores (only `manualCanvas` + `subtractCanvas` — everything else is derived,
so the layer ORDER above survives any undo for free), the dirty-rect/byte-budget design with
its measured costs, and the wiring traps.

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
| `MpiToolOptionsMaskPoints` | click instructions, Clear points |
| `MpiToolOptionsMaskText` | the object name + how many to find (stamped `name:N`) |
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

- **Any path that HIDES the PromptBox must re-show it through the family predicate.**
  `_modeKeepsPromptBox(mode)` = `prompt` OR any mask tool. A bare
  `getActiveMode() === 'prompt'` re-show leaves the box hidden in a mask tool until the
  rail remounts options — the delete-entries and model-switch paths both had it (a gate
  written before MPI-372 widened the contract). `mask-tool-registry.test.cjs` guards it.
  Not every `=== 'prompt'` is wrong: the compare paths gate a `swapToCanvas()` and are
  correct, because only `prompt` mode swaps to the lighter preview surface.
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

- **MPI-368** — Shapes: rectangle / triangle / ellipse gizmo, Add or Subtract. Mounts
  `MpiMaskStrip` with `brush: false`, no detect row.
- **MPI-379** — the SAM 1 refiner swap, carried over from MPI-380: it needs YOLO SEGS as
  `BOUNDING_BOX` dicts, which this graph cannot produce today.
