# MPI-424 - Canvas tool family umbrella

Design settled with the user 2026-08-01. This card owns the ARCHITECTURE and the
ORDER; it holds no implementation of its own.

## MPI-379 REJECTED 2026-08-01

Hover-to-select on the canvas is dropped whole, including the cheap Part 1. What
ships today is fine; the thumb strip and the Detect button stay. Closed
`done` / `rejected`, kept as the record - its live measurements are still true.

## The agreed architecture

```
  Mask
   [brush]                brush engine  -> binary mask layers
   [detect]  ->  floating strip: [points] [text] [auto]
   [adjust]               sliders over an existing mask
   [shapes]               shape gizmo   -> binary mask layers
  Paint
   [brush]                same brush engine -> RGBA paint layer
   [shapes]               same gizmo        -> RGBA paint layer
  Composite
   [mask comp]            1 image slot + 1 mask slot
   [paint comp]           1 image slot
```

**Two engines, six buttons.** Mask Brush and Paint Brush are one brush engine with
two destinations. Mask Shapes and Paint Shapes are one gizmo with the same split.
That is the answer to "how do we do all this without adding too many tools".

**Detect is a collapse button.** Click it, a small vertical strip appears outside
the tool panel with points / text / auto, and it dismisses itself on an unhovered
timer. No triangle, no long-press - both rejected by name. The three stay separate
modes underneath; only presentation changes.

**Composite is one operation with two front ends.** The SELECTED ENTRY is image 1
and sits on TOP. The slot holds image 2, underneath. Paint Comp erases image 1 to
reveal image 2 and paints it back; Mask Comp does the same cut, except the hole is
supplied by the mask slot instead of painted live. Same stack, same blend, and
MPI-362's full-res server route sits under both.

**Slots are filled by paste, not by selection.** The context menu already has Copy
mask; a new Copy takes the image. Right-click a slot to paste image or mask. This
is what kills the confusion the user reported: with the shipped modal composite he
ends up running it three or four times, because the blend is invisible while he is
deciding and changing the selection restarts the whole thing.

**Adjust** is a method over an existing mask, not a strip control: live preview,
Apply + Reset, and an un-applied adjustment is DISCARDED when leaving the tool -
the same contract as leaving Detect without pressing Add. Control shape is one
Grow / Shrink slider, with an Edge button that swaps that row for Outward + Inward.
Grow, shrink and an edge band are one primitive: an edge band is
`dilate(outward) - erode(inward)`.

## Order

| # | Card | Scope after the brainstorm |
|---|------|----------------------------|
| 1 | **MPI-425** taxonomy | The three groups, the floating Detect strip, the new modes. The frame everything mounts into. |
| 2 | **MPI-382** Adjust | Grow/shrink + edge band, live preview, Apply/Reset. Alpha brushes moved OUT to MPI-375. |
| 3 | **MPI-368** Shapes | One gizmo, TWO mounts - mask and paint. |
| 4 | **MPI-375** Paint | RGBA layer + brush-engine extraction (both mounts) + the alpha brush pack. |
| 5 | **MPI-373** Composite | Both comps, pasted slots, replaces the MPI-362 modal. |
| - | **MPI-421** run cost | Independent of the rest; now scoped to ONE Detect panel instead of three. |

## A fresh session starts HERE

1. Read this file — it is the whole design; the chat it came from is gone.
2. `mpi-continue MPI-425`. That card is next, it already has a compact plan at
   `tasks/MPI-425/plan.md`, and `mpi-continue` moves it To do -> Doing and
   derives the checklist before touching a file.
3. The other four have settled designs on their own cards but NO plan file yet —
   run `mpi-create-plan` against each as it comes up, not before.

Nothing about this design lives outside these cards. The rejected MPI-379 is the
record of what was ruled out and why.

## Standing constraints for every card in this set

- Mask and paint layer mutations are UNDOABLE - record an `UndoStack` entry before
  mutating (`docs/masking-undo.md`). An unwired mutation is a silent hole in Ctrl+Z.
- Layer ORDER rule from MPI-371 holds: auto picks union last, so nothing baked into
  manual may resurrect an erased region.
- Every new tool registers in `_MASK_TOOLS` (where it is mask family) and in
  `TOOL_OPTIONS_REGISTRY` - the MPI-381 guard test fails if one is missing.
- `docs/masking.md` is capped at 200 lines: trim before adding.
