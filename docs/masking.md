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
| `maskCanvas` | **the mask** = `(manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]` | `_recomposite()` |
| `autoCanvas` | **display only** = `⋃autoPickMasks[selected]` | `_recompositeAuto()` |

`autoPickMasks` is a RAM-only `Map<pickIndex, ImageBitmap|Canvas>` of the last detect run;
`selectedAutoPicks` is the `Set<number>` of chosen thumbs. A brush dab writes **both** layers —
paint sets manual white and clears subtract (un-erase), erase does the reverse.
`bakeAutoPicksInto()` mirrors that exactly, which is why Add/Subtract composes with the brush.

### Layer ORDER is load-bearing — the auto picks go on last

Subtract punches the **manual** layer only; selected auto picks union on top. A pick is a positive
assertion made *after* the erase, so the older erase cannot veto it — punching subtract over the
picks made a re-detected region invisible while `Add` still filled it in, i.e. preview and commit
disagreed. `MpiCanvasViewer._buildCompositeFromTemp()` mirrors this order; **both change together.**

### `autoCanvas` is a DISPLAY split — never an export (MPI-361)

Detected and painted regions are the same white pixels in `maskCanvas`, so a detection inside an
already-painted area used to be invisible. `_recompositeAuto()` rebuilds the auto subset alone so
`MpiCanvas` can tint it green; it returns early when nothing is selected (per-dab hot path
unchanged) and is torn down with the other canvases in `destroy()`. **`getURL()` /
`getMaskDataURL()` still flatten the single unioned `maskCanvas`** — every downstream consumer
reads that one B/W PNG. Do not leak the split into an export path.

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

## Add / Subtract

App-side, via `bakeAutoPicksInto()` — no `AddMask`/`SubtractMask` nodes, no extra round trip.
Shown for **both** sources: a run renders green and waits to be committed either way.
`el.bakeAutoPicks()` clears thumbs, pick store and points together — mode-agnostic by design.

## Canvas tool taxonomy (MPI-425)

Groups are **by artifact**, not by feature; engines are shared ACROSS groups, so a new
destination never means a new engine. Order + cards: `tasks/MPI-424/brief.md`.

| Group | Artifact | Buttons | Engine | PromptBox |
|---|---|---|---|---|
| `Mask` | binary mask layers | brush · detect · adjust (382) · shapes (368) | brush, gizmo | keeps it |
| `Paint` | RGBA paint layer (375) | brush · shapes | the SAME two | keeps it |
| `Composite` | blended image (373) | mask comp · paint comp | one op, two front ends | **no** |

`Paint` keeps the box because paint → mask → detail is one operation; `Composite` ends at its own
Apply and needs the column for its slots. Recorded so MPI-375 / MPI-373 do not re-decide it —
neither branch exists yet and neither may be stubbed in early. **Only working tools ship**: a
method with no panel gets no button, never a greyed placeholder.

**Same job, different engine → one COLLAPSE button.** `Detect` is one rail button that opens
`points` / `text` / `auto` in a floating strip (`MpiPopup`, `position: 'right'`, auto-dismiss on an
unhovered timer). It activates nothing and keeps a fixed icon — never the last-used method's
identity. **The modes underneath are ordinary modes**, still registered in `_MASK_TOOLS` and
`TOOL_OPTIONS_REGISTRY` and still scraped by `mask-tool-registry.test.cjs`. Presentation collapsed;
plumbing did not. Different jobs (brush vs shapes vs adjust) stay separate buttons.

## The tool family (MPI-371, split MPI-381)

Inside the `Mask` group, each tool owns its method-specific parts and mounts the shared
compounds:

| Piece | Owns |
|---|---|
| `MpiToolOptionsMaskBrush` | nothing — it **is** the strip with its brush pair |
| `MpiToolOptionsMaskPoints` | click instructions, Clear points |
| `MpiToolOptionsMaskText` | the object name + how many to find (stamped `name:N`) |
| `MpiToolOptionsMaskDetect` | model radio (Face / Hand / Person) + Box / Segment |
| `MpiMaskDetectRow` | thumbs · Detect · Add / Subtract, blocked as a unit while Cue is busy |
| `MpiMaskStrip` | paint / erase (**optional**) · invert · B/W view · clear · opacity |

**One job each.** Only the Brush tool paints. `brush: false` is not cosmetic — the strip forwards
it to `setMaskPaintEnabled()`, so a brushless tool pans on drag, zooms on wheel and keeps its
cursor. The flag lives on the **viewer**: a canvas rebuild would otherwise restore the manager
default (`true`) and silently re-arm the brush. Settings persist under the **one** `mask` tool key
and survive a tool swap. Three things must stay true through any further split:

- **`destroy()` calls `setMaskPointsMode(false)`** — points mode owns the right mouse button;
  without it the image context menu stays dead after leaving the tool.
- **A tool swap must not clear the mask.** `manualCanvas` + `subtractCanvas` are the user's work;
  only the auto layer is disposable. Nothing on a mount path may call `clearMask()` —
  `_exitMode()` only sets `activeMode = 'none'`.
- **Every mask tool is registered in `_MASK_TOOLS`** (`MpiGroupHistoryBlock`) — teardown, the
  PromptBox gate and `_viewerModeFor()` (rail mode → the viewer's single `'mask'`) all hang off
  it, and a miss is silent. `tests/mask-tool-registry.test.cjs` guards it.

## The PromptBox is live inside the family (MPI-372)

A mask and a prompt are **one operation**, so every mask tool keeps the PromptBox up.

- **Any path that HIDES the PromptBox must re-show it through the family predicate.**
  `_modeKeepsPromptBox(mode)` = `prompt` OR any mask tool. A bare `getActiveMode() === 'prompt'`
  re-show leaves the box hidden in a mask tool until the rail remounts options — the
  delete-entries and model-switch paths both had it. `mask-tool-registry.test.cjs` guards it.
  Not every `=== 'prompt'` is wrong: the compare paths gate a `swapToCanvas()` and are correct,
  because only `prompt` mode swaps to the lighter preview surface.
- **Mask tools never swap the viewer surface.** `swapToPreview()` frees GPU texture backing by
  destroying `MpiCanvas` for `MpiMaskedImagePreview` — that surface belongs to `prompt` mode,
  where no canvas tool is active. In a mask tool it destroys the canvas mid-mask.
- **Mask state is published as it CHANGES**, from the canvas' stroke-end signal:
  `_endMaskStroke()` → `onMaskStrokeEnd` → `_publishMaskState()` → `evaluateMask()` →
  `mask-ready`, emitting only on a flip. **A tool that makes a mask by any other route — a shape
  commit, a text detection — must emit `mask-ready` itself or call `viewer.el.evaluateMask()`, or
  the op strip never unlocks.**
- **The rail owns which tool is armed.** Both reload paths (`entry-selected`,
  `_reloadViewerWithEntry`) re-arm via `_syncViewerToolMode()`; never clear the mode before
  `loadEntry`, which captures and restores it itself.
- `workspace:set-operation` no longer forces prompt mode — its only emitter is the op strip,
  inside the box. Do not reintroduce the force.

## Roadmap

The taxonomy table above is the roadmap; MPI-424 sequences the cards behind it. Shapes (MPI-368)
mounts `MpiMaskStrip` with `brush: false` and no detect row. **MPI-379 is closed `rejected`**
(2026-08-01) — hover-to-select is not being built and the thumb strip stays; its SAM 1 refiner
swap has no owner. Reasons are on the card.
