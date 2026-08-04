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
| 3 | **MPI-375** Paint | RGBA layer + brush-engine extraction (both mounts) + the alpha brush pack. |
| 4 | **MPI-368** Shapes | One gizmo, TWO mounts - mask and paint. |
| 5 | **MPI-373** Composite | Both comps, pasted slots, replaces the MPI-362 modal. |
| 6 | **MPI-436** Paint Adjust | The SAME `_morph` primitive pointed at the RGBA layer — and the app's outline tool. Added 2026-08-04. |
| ! | **MPI-437** composite fillHoles | Edge-band masks composited as discs. Root-caused and FIXED 2026-08-04, awaiting the user's repro. MPI-373 inherits that route — do not reintroduce a default fill. |
| - | **MPI-421** run cost | Independent of the rest; now scoped to ONE Detect panel instead of three. |

**MPI-436 added 2026-08-04 (user), and it is why MPI-368 ships FILLED-ONLY.** An outline
mode on the shape gizmo would be a second, worse implementation of something Adjust already
does properly, and it would only ever outline a shape — `_morph` outlines any paint. Shrink
is `destination-in` against the layer, grow fills the new ring in the current colour with
the original drawn back on top, and the edge band *is* the outline. Same engine, one more
destination: the taxonomy's whole thesis, applied to Adjust instead of to the brush.

**3 and 4 SWAPPED 2026-08-03 (user).** Shapes was third and Paint fourth, which is
backwards: the gizmo's whole point is ONE geometry with TWO destinations, and the
second destination — the RGBA paint layer — is built by MPI-375. Grepped `js/` on
2026-08-03: no `paintCanvas`, no paint layer, nothing. Shapes-first would therefore
have shipped one mount and left the other as an unbuildable promise, or forced a
half-designed paint canvas into MPI-368 that MPI-375 owns. Paint first means MPI-368
lands both mounts at once, which is what its card actually says. The checklist's
"re-read the order after MPI-425 ships" line is what licensed this.

## A fresh session starts HERE

1. Read this file — it is the whole design; the chat it came from is gone.
2. **MPI-425, MPI-382, MPI-431, MPI-375 and MPI-368 have all SHIPPED** (2026-08-02
   → 2026-08-04). The frame exists, and **both shared engines are now genuinely
   shared**: the brush (`brushDab.js`) and the gizmo (`ShapeManager.js`) each mount
   in two groups. Four of the five cards are done; **MPI-373 (Composite) is the
   last**, and it is the one that ends the umbrella.
3. Before writing any of MPI-373: read `tasks/MPI-425/plan.md` § Completed (the
   shape you mount a button into, and the traps already paid for),
   `docs/masking-tools.md` § The preview contract (extend `discardPreview`, never
   the call site — Shapes is the second tool to have done it, and
   `docs/masking-shapes.md` shows how), and `docs/masking-undo.md` if it mutates a
   layer at all.
4. MPI-373 has a settled design on its own card but NO plan file yet — run
   `mpi-create-plan` against it when it comes up, not before. MPI-435 (alpha brush
   pack) is unblocked and parameterises `stampDab` alone. **MPI-436** (Adjust for
   the paint layer, added 2026-08-04) sits after MPI-373.
5. **MPI-368 left one thing on the table, deliberately.** The mask export
   (`MaskManager.getURL()`) treats `a > 0` as mask while Fill Holes cuts at
   `>= 128`, so the sub-threshold rim antialiasing leaves behind — after ANY
   erase, including the shipped brush's — exports as solid white. Measured, not
   inferred: `docs/masking-shapes.md` § Measured against real pixels. It predates
   this card and belongs to whoever owns the export threshold.

Nothing about this design lives outside these cards. The rejected MPI-379 is the
record of what was ruled out and why.

## Standing constraints for every card in this set

- **THE PREVIEW CONTRACT (user, 2026-08-02).** Every tool is *visited, previewed, then
  applied - or the preview goes away.* An unapplied preview must NEVER outlive its tool.
  Not tidiness: previews that survive stack on top of each other, so the user judges a
  composite of things he never committed to while the graph receives something else
  again. Detect is the only producer today and it VIOLATES this - `_exitAutoMaskMode(false)`
  exists and has no caller, which is also MPI-365's open "detected-but-not-applied mask is
  still injected" item. MPI-382 fixes it and builds the shared discard seam in
  `mountOptions()`; **368 and 373 hang their own previews on that seam, they do not
  re-decide this.** Cost, accepted: Add becomes mandatory.
- Mask and paint layer mutations are UNDOABLE - record an `UndoStack` entry before
  mutating (`docs/masking-undo.md`). An unwired mutation is a silent hole in Ctrl+Z.
- Layer ORDER rule from MPI-371 holds: auto picks union last, so nothing baked into
  manual may resurrect an erased region.
- Every new tool registers in `_MASK_TOOLS` (where it is mask family) and in
  `TOOL_OPTIONS_REGISTRY` - the MPI-381 guard test fails if one is missing.
- Docs are capped at 200 lines each. The canvas knowledge is already split across
  `masking.md` (129), `masking-tools.md` (**211 — over, trim before adding**),
  `masking-sam3.md`, `masking-undo.md` and `painting.md` (170). Write to the one the
  fact belongs to; never to a catch-all.
