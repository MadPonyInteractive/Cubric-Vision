# Masking

How a mask is built, displayed, and handed to a workflow. Read before touching `MaskManager`, the
overlay draw path, or the auto-mask graph. Related: [comfy.md](comfy.md) (`runAutoMask`,
title-keyed injection) · [component-contracts.md](component-contracts.md) ·
[comfy_injection.md](../.claude/rules/comfy_injection.md).

## The layer model — `MaskManager`

Four canvases, three derived. All at a working resolution capped by `MASK_MAX_EDGE` (1536): masks
need no high precision, and recompositing a 4K image full-frame per brush dab is unusably laggy.
Paint coords arrive in image-px, scaled by `_scale`.

**The cap is INTERNAL — both exports scale back to SOURCE resolution** (`getURL()` via
`_toSourceScale()`, `_buildCompositeFromTemp()` via `item.pixelDimensions`; change them together).
`InpaintCropImproved` — the masked-edit branch of every model that ships localised edit (the
master templates, plus Boogu's single-file graph since MPI-428) — asserts `mask dims ==
image dims`. `SetLatentNoiseMask` resized silently, which hid this until MPI-365 routed masks into
the crop node and every source over 1536px failed.

**Why localised edit keeps the resolution:** a whole-image edit downscales the source to the
model's working size; a masked edit crops to the mask, edits, and stitches back, so the picture
keeps its own pixels. It rewards a PRECISE mask — broad changes (a new pose) belong on the
whole-image path.

| Canvas | What it holds | Written by |
|---|---|---|
| `manualCanvas` | brush strokes — white where painted | `paint()`, `bakeAutoPicksInto('manual')` |
| `subtractCanvas` | eraser strokes — white where erased | `paint()`, `bakeAutoPicksInto('subtract')` |
| `maskCanvas` | **the mask** = `manual AND NOT subtract` | `_recomposite()` |
| `autoCanvas` | **display only** = `⋃autoPickMasks[selected]` — where an un-Added detection lives | `_recompositeAuto()` |

`autoPickMasks` is a RAM-only `Map<pickIndex, ImageBitmap|Canvas>` of the last detect run;
`selectedAutoPicks` is the `Set<number>` of chosen thumbs. A brush dab writes **both** layers —
paint sets manual white and clears subtract (un-erase), erase does the reverse.
`bakeAutoPicksInto()` mirrors that exactly, which is why Add/Subtract composes with the brush.

### A detection is NOT mask content until Add (MPI-426)

`_recomposite()` builds the mask from the **baked layers alone**. Selected auto picks are
deliberately absent: they used to union on top, which made `maskCanvas` answer two questions at
once — *what is on screen* and *what gets sent* — so a detection the user had never Added still
flowed through `hasMask()` / `getURL()` into `Input_Mask`. Found live during MPI-365: a Qwen
masked edit was dispatched with an un-Added pick and the pick went with it. The green overlay is a
proposal, and the user's answer may be **Subtract** as easily as Add, so consuming it as content
was wrong in both directions.

`bakeAutoPicksInto()` is the only door into the mask. **The op strip inherits this**
(`MpiGroupHistoryBlock._opOptions()` gates on `hasMask`): a bare detection leaves masked ops
locked until Add. That is intended, not the MPI-372/384 regression it resembles — the strip now
offers a masked op exactly when there is a mask to send.

`MpiCanvasViewer._buildCompositeFromTemp()` is the twin — it rebuilds the same mask from persisted
TEMP layers for preview mode, and carried the same bug through `_previewMaskCache`. **Both change
together.** Picks are still persisted and restored; they just rehydrate the preview, not the mask.

Layer ORDER still matters where the picks land: `bakeAutoPicksInto()` un-erases as it adds, so a
pick is not vetoed by an erase that predates it. Punching subtract over the picks instead made a
re-detected region invisible while `Add` still filled it in — preview and commit disagreed.

### `autoCanvas` is a DISPLAY split — never an export (MPI-361)

Detected and painted regions would be the same white pixels, so a detection inside an
already-painted area used to be invisible. `_recompositeAuto()` rebuilds the auto subset alone so
`MpiCanvas` can tint it green; it returns early when nothing is selected (per-dab hot path
unchanged) and is torn down with the other canvases in `destroy()`. Since MPI-426 it is also the
picks' **only** home until they are baked. **`getURL()` / `getMaskDataURL()` flatten `maskCanvas`
alone** — every downstream consumer reads that one B/W PNG. Do not leak the split into an export
path, and do not re-union the picks into `maskCanvas` to "fix" a preview that looks unapplied.

### Storage: session TEMP PNGs — not RAM, not `.meta/`

`js/services/maskTempStore.js` persists **two PNGs per (project, group, item)** — `manual.png`
and `subtract.png`, kept SEPARATE because copy/paste/reuse must carry both (flattening bakes the
eraser in and the mask can never be erased further). Only `autoPickMasks` is RAM.

**Lifetime: survives a renderer reload, dies on app restart.** Ctrl+R keeps the main process, so
`sessionId` and the TEMP dir persist; a restart mints a fresh UUID (`main.js`), cleans the old dir
on quit, and prunes stale `cubric-*` dirs at boot. Masks are session-scoped by decision
(`docs/archive/mpi-kanban/plans/2026-04-29-layered-mask-persistence.md`) — outliving a restart
means moving the layers to `.meta/`, real work rather than a config flip.

**The display surface is not always the canvas.** In `_currentMode === 'none'` the viewer shows
`MpiMaskedImagePreview` and the live canvas is TORN DOWN, so writing layers into `_cv.el` repaints
nothing (MPI-311's "paste does nothing until you switch entries"). Code mutating a mask **outside
mask mode** must refresh via `setMaskDataURL()` — that exact name. `setManualFromDataURL` draws
with an explicit dest rect, so a pasted layer STRETCHES: cross-resolution is a clean scale, only a
differing ASPECT distorts.

## The overlay draw — `MpiCanvas._renderOverlay()`

Order matters: comparison clip → mask → auto layer → point dots → crop → grid. The mask block runs
inside one `globalAlpha` so every mask pixel fades together:

1. `maskCanvas` — as-is, or recoloured pure black when `displayInverted`.
2. `autoCanvas` — recoloured `--accent-ok` green when `mask.hasAutoLayer`, drawn on top so green
   wins wherever a detection overlaps paint.

**B/W view (MPI-381)** is a third display mode: alpha pinned to 1 over a flat backdrop, so the mask
reads as the plain B/W image it exports — how a user spots the stray specks a detection leaves
behind. Composes with `displayInverted` (backdrop and mask swap together); green still draws on top
or pick state vanishes. `maskOpacity` is ignored while B/W is on, so the strip's opacity slider goes
inert rather than making grey mush.

Both recolours go through `_recolorMaskLayer(src, color, W, H)`, filling `source-atop` inside a
**scratch buffer** — load-bearing, since filling on the overlay would recolour the comparison layer
underneath. The buffer is reused across frames and across both calls in one frame (safe: `drawImage`
copies synchronously). Canvas colours are module constants mirroring `styles/01_base.css` tokens
(`MASK_AUTO_FILL`, `MASK_INVERT_FILL`, `MASK_BW_*`, `MASK_POINT_*`) — JS cannot read CSS vars per
frame, so update the constant when the token changes. `displayInverted` is display only;
`getURL(bg, fg)` does real inversion for export.

### The brush cursor is TWO-TONE on purpose — `_drawBrushIndicator()`

It draws on `screenUICanvas` (container px, outside the CSS transform), not the overlay, so the ring
keeps its screen size at any zoom while its radius tracks `brushSize * scale`. The real cursor is
hidden while painting; this circle *is* it. The arc is stroked **twice** — accent, then
`BRUSH_CURSOR_OUTLINE` dark at `lineDashOffset` half a period — the same interleave
`_drawGridOverlay()` uses, because a single-colour ring vanishes against a background of its own
hue. **Dash halves must stay equal with the offset at half the period** (`[4,4]` / `4`) or the two
passes stop tiling and bare arcs open up. The centre dot is an accent fill inside a dark ring for
the same reason.

Mode reads off the accent alone: `BRUSH_CURSOR` heat = paint, `BRUSH_ERASER` frost = erase.
`MpiCanvasViewer.css`'s `.mask-shape*` rules are the dead pre-canvas cursor — they duplicate
these colours and are not the source of truth.

## The SAM3 tools — points and text

Both live in **[masking-sam3.md](masking-sam3.md)**: the click-point branch (MPI-361/380), the
open-vocabulary text branch (MPI-384), their shared graph plumbing, and the behaviours that look
like bugs and are not.

## Undo — `UndoStack` (MPI-376)

Ctrl+Z / Ctrl+Shift+Z on the mask layers lives in **[masking-undo.md](masking-undo.md)**: what
the stack stores (only `manualCanvas` + `subtractCanvas` — everything else is derived, so the
layer ORDER above survives any undo for free), the dirty-rect/byte-budget design with its
measured costs, and the wiring traps.

## The tool family, the preview contract, and the PromptBox

All in **[masking-tools.md](masking-tools.md)**: the Mask / Paint / Composite taxonomy and the
collapse button (MPI-425), the preview contract every tool obeys (MPI-382), Add / Subtract, who
owns which panel (MPI-371, split MPI-381), and why the PromptBox stays up inside the family
(MPI-372).
