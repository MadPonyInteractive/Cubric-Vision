# MPI-426 — a detection preview must stay a preview

## What happens today

1. User runs a SAM3 detect (points / text / auto).
2. `MpiCanvasViewer.js` → `exec.onMasks` builds the pick bitmaps, then:
   `canvas.setAutoPickMasks(map)` → `canvas.setSelectedAutoPicks(runPicks)` → `el.evaluateMask()`.
3. `MaskManager._recomposite()` unions every *selected* pick into `maskCanvas`
   (`maskCanvas = (manual AND NOT subtract) ∪ ⋃autoPickMasks[selected]`).
4. `hasMask()` reads `maskCanvas` → true. `getURL()` flattens `maskCanvas` → those pixels
   land in `Input_Mask`.

So the green detection overlay is already the mask, before Add is pressed. Add
(`bakeAutoPicksInto('manual')`) only moves the same pixels into the manual layer.

## Why that is wrong

The green overlay reads as a *proposal*: this is what the detection found, and the user
decides what to do with it. The two available answers are **Add** and **Subtract** — and
the Subtract case proves the point, because a pick the user is about to subtract is
currently being injected as mask content. User, verbatim:

> If a preview stops being a preview, it is no longer a preview. The green mask signifies
> a preview of what the user can do to the current mask. It should not automatically add
> to the current mask. The user might want to subtract it.

Found live during MPI-365 verification: a Qwen masked edit was dispatched with a detection
that had never been Added, and the mask went with it.

## The constraint this card has to respect

The auto-select is deliberate, not an oversight. The comment at the call site states it:

> Picking a chip puts real pixels in maskCanvas, so it is a mask made outside a brush
> stroke — publish it or the op strip stays locked until Add/Subtract (MPI-372 contract,
> MPI-384).

So simply not selecting the picks re-breaks MPI-372: the op strip would stay locked after
a detection until the user presses Add. **This card reverses that decision and owes a
replacement**: the op strip needs to unlock on "there is something the user could act on"
(a detection exists) rather than on "maskCanvas has pixels".

## Shape of the fix (not yet decided)

Split the two questions that `maskCanvas` currently answers at once:

- *Is there mask content to send?* → baked layers only: `manual AND NOT subtract`.
- *Is there something on screen to act on?* → baked content OR a live detection.

`_recompositeAuto()` already keeps a display-only auto layer for tinting (MPI-361), so the
display half of the split exists — what changes is which canvas `getURL()` / `hasMask()`
read, plus whatever gates the op strip.

## Touch points

- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` — `exec.onMasks`,
  `evaluateMask`, `getCurrentMaskDataURL`, every `hasMaskContent(_cv.el.maskCanvas)` site
- `js/components/Primitives/MpiCanvas/managers/MaskManager.js` — `_recomposite`, `getURL`
- `_buildCompositeFromTemp` (same file as the viewer) composites persisted auto picks the
  same way — fix both twins or the preview-mode path keeps the old behaviour
- `docs/masking-sam3.md` and `docs/masking.md` record the current contract; both need the
  reversal written down

## Related

Masking umbrella MPI-424 / MPI-425. Reverses MPI-372 + MPI-384.
