# MPI-439 — Convert mask to paint / paint to mask, from the canvas context menu

Part of the **MPI-424 canvas tool family** (that umbrella closed with MPI-373; this is a
follow-up on the taxonomy it built, not a sixth member re-opening it). Read
`docs/masking.md`, `docs/painting.md` and `docs/masking-undo.md` before touching anything.

## The ask (user, 2026-08-04)

Right-click on the image canvas already offers `Clear mask` and `Send to Composite`. Add
two conversions to the same menu:

- **Convert mask to paint** — enabled only when the current canvas has a mask.
- **Convert paint to mask** — enabled only when the current canvas has paint.

Image mode only. The video viewer has its own menu and is out of scope.

## Where it goes

One `items` array, one `onSelect` switch — both already exist:

- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:2637` — the
  `image-viewer:context-menu` handler that builds `MpiContextMenu.show({ items, onSelect })`.
  `noMask`/`noFile` gating and the `info` disabled-reason string are the pattern to copy.
- Gating predicates are already exposed on the viewer:
  `el.hasMask()` (MpiCanvasViewer.js:1132) and `el.hasPaint()` (MpiCanvasViewer.js:1280,
  which forwards to `canvas.hasPaint()`). Nothing new is needed to decide enablement.
- The conversion itself belongs on the managers, not in the Block. `MaskManager` owns
  `manualCanvas` + `subtractCanvas`; `PaintManager` owns the RGBA `paintCanvas`
  (`docs/painting.md`). Add one method per direction and expose it through
  `MpiCanvasViewer`'s `el.*` surface the way `clearMask` / `clearPaint` already are — the
  Block must not reach into canvases.

## Undo is mandatory, not optional

Both directions MUTATE a stored layer, so both are Ctrl+Z holes if unwired. These are
**layer-wide one-shot** ops, so per `docs/masking-undo.md` § the recipe is
`this._recordUndo()` **before** mutating and **after** the no-op guard — never before the
guard, or an empty conversion pushes a dead undo entry. `undo.begin()/commit()` is for
gestures and is the wrong tool here.

Note the asymmetry the doc records: only `manualCanvas` + `subtractCanvas` are stored for
mask (`maskCanvas` and `autoCanvas` are derived), and `paintCanvas` is stored for paint. So
paint→mask must land in `manualCanvas`, not in the composited `maskCanvas`.

## Open questions — ANSWERED BY THE USER 2026-08-04, do not re-decide

1. **What colour does mask→paint paint with?** **The Paint tool's current colour, FLAT.** The
   mask's coverage is filled at full alpha; carrying the mask's own alpha through so a soft
   mask edge becomes a soft paint edge was offered and declined. Only the antialiased rim of
   the scaled coverage is partial, which is the same edge every brush stroke already has.
2. **Does the source layer survive the conversion?** **Yes — it is a COPY.** Convert leaves
   the source layer alone and the user clears it explicitly if they wanted a move. It also
   means the conversion MERGES into the destination (source-over) rather than replacing it:
   nothing the user already painted or masked is destroyed by a menu item.
3. **Does paint→mask use alpha or luminance?** **Alpha, cut at ≥128** — inherited from
   MPI-436, which settled it for the whole MPI-440 set (`docs/masking-adjust.md` § The paint
   layer). A dark scribble is as painted as a light one. Not re-decidable here.

## Verification

The mask/paint layers are canvas pixels, so a real check needs a pixel probe, not a DOM
click — see memory `tool_real_pixel_probe_via_playwright_cli` (temp ES module under `js/`,
close-and-reopen the page or Chromium serves a cached copy of the probe).

Minimum to claim done:

- Menu shows both items; each is disabled with its `info` reason when its layer is empty,
  and the existing two items are unchanged.
- mask→paint then Ctrl+Z restores the paint layer to its pre-conversion pixels.
- paint→mask then Ctrl+Z restores `manualCanvas` to its pre-conversion pixels.
- A conversion on an empty layer is a no-op that pushes NO undo entry (the guard-order bug).
- `node --test "tests/*.test.cjs"` green (quoted glob — the directory form dies on Node v24).
