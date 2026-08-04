# Painting — the RGBA layer (MPI-375)

The paint layer on `MpiCanvas`: one RGBA canvas the user draws colour onto, flattened into a
new history entry by **Apply**. Read before touching
`js/components/Primitives/MpiCanvas/managers/PaintManager.js`, `brushDab.js`, or anything that
mutates the paint layer. Related: [masking.md](masking.md) (the mask layer model this is
deliberately *not*) · [masking-tools.md](masking-tools.md) (the tool family and the taxonomy) ·
[masking-undo.md](masking-undo.md) (the shared stack every mutation here must record into).

**Why the feature exists:** a scribble is an INPUT to the models, not decoration. Rough in a
shape with colour, mask it, run detail over it — the model gets *where, what size, what colour*
on top of the prompt. That is the whole product justification, and it is why this subsystem is a
fraction of `MaskManager`'s size: no sub-layers, no blend modes, no pressure curves.

## One layer, at image-native resolution

`PaintManager` owns exactly one canvas, `paintCanvas` / `paintCtx`. Coordinates arrive in
**image-px** and are scaled by `_scale` inside `paint()`, the same contract `MaskManager.paint()`
follows.

| | Mask layers | Paint layer |
|---|---|---|
| Content | binary alpha, white where painted | real RGBA colour |
| Working size | `MASK_MAX_EDGE` **1536** | `PAINT_MAX_EDGE` **4096** |
| Consumed as | a mask, by the graph | real pixels, in a new history entry |
| Eraser | writes BOTH layers (manual + subtract twin) | a straight `destination-out` — one layer, no twin |

**The resolution difference is the decision, not an oversight.** A mask is downscaled because it
is consumed as a mask; paint becomes real pixels, so downscaling and then upscaling on flatten
would visibly soften every stroke. 4096 bounds the worst case at ~64MB for a square layer; a
source larger than that is resampled up by Sharp on Apply — a soft edge on a vanishingly rare
input rather than a quarter of a gigabyte on a common one.

`isEmpty()` **scans alpha** rather than tracking a flag: a flag goes stale the moment an undo
empties the layer, and the two callers that care — Apply and the per-entry save — are exactly
where being wrong costs something.

## The shared dab — `brushDab.js`

The whole of *"one brush engine, two destinations"*. `stampDab(ctx, x, y, r, op, fillStyle)`
plus `strokeDabs(from, to, r, stamp)`, which interpolates along a stroke at `DAB_SPACING` = a
quarter radius (75% dab overlap). `MaskManager` stamps into its two binary layers,
`PaintManager` into the one RGBA layer, and **neither owns the geometry**. Coordinates and radii
are in the DESTINATION canvas' own pixels — callers scale first.

A full `BrushEngine` class was rejected at planning: it rewrites a working shared primitive and
every call site in `InputController`, `MpiCanvas` and the undo wiring to deliver what these two
functions already deliver. **If a change finds itself editing two dab implementations, the
extraction has regressed — repair it here rather than forking.**

**Interpolation fixed a shipped bug on the way through.** Before MPI-375 there was no spacing at
all: `MaskManager.paint()` stamped one arc per `mousemove` with nothing joining them, so any
sample gap wider than the brush left a hole — 40 image-px at the default size, which a normal
fast flick clears on a zoomed-out large image. It read as a skipping brush rather than as a
missing feature, which is why it survived so long.

## Paint is not a mask, and not a preview

Two separate contracts, both load-bearing:

- **Not a mask tool.** `MpiGroupHistoryBlock` has `_PAINT_TOOLS` / `_isPaintTool` beside
  `_MASK_TOOLS` / `_isMaskTool`, and `_isCanvasTool` = either. Splitting that one predicate's
  three jobs is what lets paint keep the PromptBox (paint → mask → detail is ONE operation)
  without pretending its artifact is a mask. `_viewerModeFor()` maps the paint family to the
  viewer's `'paint'` mode. `tests/mask-tool-registry.test.cjs` guards all of it — every failure
  in that area is silent in the app.
- **Not a preview**, so it does **not** extend `discardPreview()`. The preview contract
  ([masking-tools.md](masking-tools.md) § The preview contract) exists to stop an UNCOMMITTED
  preview outliving its tool. A paint stroke is as committed as a brush stroke on
  `manualCanvas`, which that seam has never touched either.

**The layer draws in EVERY mode, under the mask** (`MpiCanvas._renderOverlay()`, step 1b): paint
is image content, the mask is an annotation over it, and the strokes have to still be on screen
after the user switches to a mask tool — that switch *is* the feature.

## Opacity is DISPLAY opacity — and Apply honours it

`PaintManager.opacity` is what the shared strip's slider already means for the mask, so the
control does not change behaviour between tools. Strokes are laid down **fully opaque** in the
layer itself; the canvas draws the layer at `globalAlpha`.

Apply bakes at the slider so the new entry matches the screen: the server scales the
**flattened** layer's alpha **once**. Applied layer-wide, not per dab, so overlapping dabs inside
one stroke cannot bake darker than the rest.

That is why this does not reopen the refused decision: true PER-STROKE alpha needs a scratch
buffer composited on mouseup, because dabs overlap 75% and would build to solid within one
stroke — making a slow drag darker than a fast one. A shape reference for a model does not need
it. Marked with a `ponytail:` comment naming that ceiling.

## Persistence — per entry, session-scoped

`paint.png` lives in the **same TEMP item dir** as the mask layers, keyed by
(project, group, item), through `js/services/maskTempStore.js` (`writePaint` / `deletePaint`,
`paint` in the `read()` shape) and `main.js`'s `mask-temp:write-paint` / `delete-paint` handlers.

**Lifetime is the mask's lifetime**: survives an entry switch, a tool switch and a renderer
reload (Ctrl+R keeps the main process), **dies on quit** — `main.js` deletes `MASK_TEMP_ROOT` on
quit and prunes stale dirs at boot. A paint layer that outlived the session would be the odd one
out, and per-project durable storage is a different feature nobody asked for.

Two things about this are easy to break and silent when broken:

- **The persist WRITES OR DELETES — never just writes.** `MpiCanvasViewer._persistLayers()` calls
  `writePaint` when the layer has pixels and `deletePaint` when it does not. The mask layers get
  their stale copy dropped by `clearMask()`'s TEMP delete; paint has no such twin, so a
  write-only persist would resurrect a cleared layer on the next visit to that entry.
- **`mask-temp:delete` is NOT a directory nuke.** It removes `manual.png`, `subtract.png` and
  `auto.json` **by name**. `paint.png` shares that dir and is not a mask, so a dir-wide
  `rmSync` would make **Clear mask** and **paste-mask-to-entry** silently wipe the paint layer —
  breaking the card's own criterion that the two layer families are independent. A guard fails if
  anyone restores the `rmSync(dir, …)`. The dir itself still dies with the session.

The `sameEntry` short-circuit in `loadEntry` counts **both** families: a paint-only entry has an
empty `maskCanvas`, so a mask-only test would fall through and restore an empty TEMP over live
strokes.

## Apply — flattened server-side

`el.applyPaint()` → `POST /project/apply-paint` → `compositeOverlay()` in
`services/imageComposite.js` → emit `'paint-applied'` → `MpiGroupHistoryBlock._appendViewerEntry`,
the same append path `'crop-applied'` uses.

**A SIBLING route, not a mode of `composite-media`.** That route (MPI-362) blends two project
FILES through a mask; paint has neither — one file plus an RGBA layer carrying its own alpha.
Only the surrounding machinery is shared: `nextSequence`, the `.meta` sidecar, the thumbnail, the
response shape. Destabilising a shipped blend to save a route was the wrong trade.

- **The SOURCE never round-trips as base64** (the MPI-362 rule) — it is read off disk from
  `sourceFilePath`. Only the paint LAYER travels as a data URL, because it exists nowhere but the
  renderer.
- The overlay is resized to the base's pixel size (`fit: 'fill'`), matching the stretch semantics
  the mask path already has.
- The opacity scale is a `dest-in` composite against a uniform 1×1 tile — that multiplies the
  destination's alpha, the same maths as `globalAlpha`. Measured live: `0.75 → 191`,
  `0.7 → 179`, `0.5 → 128`, absent or garbage → `255`.
- The source entry is untouched and keeps its own paint, so **Apply is undone by deleting the new
  entry**.
- `operation: 'paint'`, `appId: null` (App-provenance parity, MPI-256).

`MpiToolOptionsPaint` gates the Apply button on `typeof viewer.el.applyPaint === 'function'` and
renders it **disabled** when absent, rather than letting `viewer.el.applyPaint?.()` swallow its
own click — the silent-failure shape this codebase keeps getting bitten by.

## Undo

**One `UndoStack`, shared with the mask, chronological.** Ctrl+Z inside the Paint tool can walk
back into a mask stroke: one canvas, one history, ruled on before undo was built. The stack is
layer-agnostic (rect patches over arbitrary 2D contexts) precisely so this layer would not need a
second one, and it does **not** survive an entry switch — every load clears it, which is how the
mask brush has always behaved.

Every mutation here records. The enumerated set and the three recording shapes live in
[masking-undo.md](masking-undo.md) § the contract — **read it before adding any mutation**, an
unlisted one is a silent hole in Ctrl+Z.

## Seams the next cards land on

- **MPI-435 (alpha brush pack)** parameterises **`stampDab` and nothing else**. Both the mask
  brush and the paint brush get textures from that one edit.
- **MPI-436 (Adjust over RGBA) HAS LANDED.** Grow / shrink / edge band on this layer, off the mask's
  own distance field — and the app's outline tool. The layer model it adds is one preview canvas
  (`adjustCanvas`) drawn **instead of** `paintCanvas`, and the fact every later card inherits is
  that **the shape of this layer is its ALPHA**, cut at ≥128. Rules, the three fills and the
  measured cost ceiling: [masking-adjust.md](masking-adjust.md) § The paint layer. Unlike a stroke,
  an unapplied adjustment IS a preview and extends `discardPreview()`.
- **MPI-368 (Shapes) HAS LANDED.** `PaintManager.commitShape(buildPath, erase)` is the paint half
  of one gizmo with two destinations — Fill lays the shape down in `color`, Erase punches it out,
  the same pair the brush already means here. It takes a path BUILDER, not a path, and applies
  `_scale` itself: the mask works at 1536 and this layer at 4096, so a path built for one is
  silently offset in the other. Layer-wide one shot, so `_recordUndo()` after the no-op guard.
  `paintEnabled` does the job it was added for — the Shapes panel mounts `MpiMaskStrip` with
  `brush: false`, which disarms painting so a drag off the gizmo pans. Geometry, hit-testing and
  the ALT-rotate live in `ShapeManager`; see [masking-tools.md](masking-tools.md) § Shapes.

Any new method reaching the panels must go in **`MpiCanvas._methods`** — the allowlist. A name
missing there is `undefined` on `el`, and the optional-call idiom in the panels swallows it
without a word (`getPaintOpacity` was caught this way; a guard now covers it).
