# MPI-373 — Composite tool: live overlay + reveal-by-erasing

## Why

MPI-362 shipped a composite that works but asks the user to decide blind:

1. select two entries in the history list,
2. one of them must already carry a mask (the menu is gated on it),
3. a modal asks Add or Subtract — two sentences of prose standing in for a preview,
4. Sharp blends the two files server-side and appends the result.

The user's finding after living with it: the useful shape is the opposite way round.
Put the two images on the canvas — first pick over second pick — and let the boundary
be *painted*, watching the result the whole time. The eraser is the interesting half:
erasing the top image is how the bottom image is revealed. The brush undoes that.

That is not a tweak to the dialog. It is a different tool.

## Shape (proposed — confirm before code)

**A new rail tool, `composite`**, sibling of the mask family MPI-371 built. Same
`MpiMaskStrip` brush/eraser/size/opacity, different meaning for the painted pixels.
The user explicitly preferred a new tool over force-selecting a mask tool, and the
tool-family split from MPI-371 makes that cheap.

**The erase layer IS a mask.** Paint into the manual/subtract canvas pair
`MaskManager` already owns, and Apply hands that layer to the existing
`/project/composite-media` route as `maskDataUrl` — unchanged server side, full-res,
no base64 round-trip for a 4K result. Under this shape the only genuinely new code is
the two-image *preview*, not the pixels.

**Entering the tool** = the two selected entries load together: second pick as an
underlay, first pick as the base the mask cuts holes in. Leaving without Apply must
restore the single-entry canvas and leave no stored mask on either entry.

## Blast radius

| Where | What changes |
|---|---|
| `js/components/Compounds/MpiHistoryList/MpiHistoryList.js` | the select-mode gate that requires a mask on one of the two entries — must go |
| `MpiGroupHistoryBlock.js` ~1706 | `composite-requested` handler: today it picks the mask-carrying entry and opens the dialog; becomes "arm the composite tool with the two entries in click order" |
| `MpiGroupHistoryBlock.js` `_runComposite` | keep — it is already the correct Apply path (base = keeps everything outside the mask, overlay = fills it) |
| `MpiMaskCompositeDialog` | probably obsolete. Decide explicitly: delete, or keep as the no-tool fast path when a mask already exists |
| `MpiCanvasViewer` / `MpiCanvas` / `MaskManager` | the real new work: an underlay image layer, and the base drawn with the mask punched through it |
| new `MpiToolOptionsComposite` | register CSS in `js/shell/preloadStyles.js`, props in `js/components/types.js` |
| `MpiHistoryTools.js` | rail entry (Mask group, or its own group — a call for the brief) |
| `docs/masking.md` | the tool family gains a member |

## Open questions

- Differing pixel dimensions between the two entries — fit, cover, or refuse? Today
  Sharp decides; on a live canvas the user sees it, so it needs an answer.
- Does the composite mask persist per entry like a mask does, or is it scratch state
  that dies with the tool? (Scratch is simpler and probably right.)
- Undo — this tool wants it as badly as paint does. See MPI-376; do not build a
  private undo stack here.
- Does the tool also want the mask family's Detect/Points as a *starting* selection
  (detect the subject, then hand-correct the edge)? Powerful, but scope it separately.

## Read first

`docs/masking.md`, `.claude/rules/components.md`, `docs/component-contracts.md`
(MpiMaskStrip fine print), `docs/gallery.md` for the history-list select mode.
