# MPI-567 — Scribble-to-object Flow

Fabio's spec, 2026-08-16, verbatim intent preserved. **No umbrella** — see § Board note.

## What it is

The user draws on top of their own image, and the Flow replaces that drawing with a
real rendered object, stitched back into the original photo at the same place. It is an
inpaint, but the conditioning is the user's SCRIBBLE, not just a prompt. Fabio: *"I've
never seen anything like that, and I think it's gonna be high value."*

## The run, step by step (as the user experiences it)

1. **Import.** Step 1 takes the user's image.
2. **Draw.** The image mounts on the canvas with the existing paint tools. The user
   paints/draws whatever they want to add, directly on top of the photo.
3. **Extract the drawing.** Take the paint layer ALONE — not the composite — and put it
   on a flat background (white or green, TBD). That flat image is the ControlNet hint.
4. **Preprocessor choice, exposed to the user.** Scribble for a loose doodle, Canny for a
   clean structured drawing. Step copy tells them which to pick, in those words.
5. **Prompt box.** A plain text field: describe what you drew.
6. **Prompt shaping.** The Flow appends the "object on a clean/empty background" ask, so
   SDXL returns the object isolated rather than a full scene.
7. **Region only.** Derive a mask from the drawing's own extent, take its coordinates, and
   let SDXL sample only that region — not the whole frame.
8. **Generate.** SDXL + ControlNet on that region.
9. **Clean the result.** Run remove-background over the SDXL output to keep only the
   object the user asked for.
10. **Stitch back.** Paste the extracted object onto the user's original image at the
    coordinates recorded in step 7.

## Model

SDXL for v1. Which SDXL checkpoint is deferred — possibly a user-facing model selector in
the Flow itself. Decide at the bench.

## Order of work — BENCH FIRST

Author and prove the entire graph in the node graph, get Fabio's approval on real output,
and only then wire the app half via `/mpi-add-flow`. This card is not app work yet.

## Open questions for the bench pass

> **ALL FOUR ANSWERED at the bench 2026-08-21** — the answers, with the evidence, are in
> [`docs/playbooks/add-flow/existing-flows/scribble-to-object.md`](../../../../docs/playbooks/add-flow/existing-flows/scribble-to-object.md).
> Short form: rembg's MASK is directly usable and already the right polarity; **white**, and
> green is a silent total failure; `MpiMaskSquareBbox` gives x/y/size as INTs that never leave
> the graph; and `InpaintCrop/StitchImproved` is **not** the carrier — a plain
> `ImageCompositeMasked` is. Read the doc rather than re-running the bench.

- Does the remove-background node already emit a usable MASK, or does the stitch need a
  separate matte? Fabio: *"I believe our remove background tool also generates masks, so
  we can use that mask, probably, maybe. I don't know, or maybe you stitch."*
- White background or green for the ControlNet hint? Which one the preprocessors read
  cleanest.
- How the drawing's bounds become the crop rect, and how those coordinates survive the
  round trip to the stitch.
- Whether the existing crop→sample→stitch wiring (`InpaintCropImproved` /
  `InpaintStitchImproved`, live in several graphs) is the right carrier here, or whether
  the paste happens outside it.

## Board note — why no umbrella

**HEALED 2026-08-21.** The restructuring this note said had not happened, has: **MPI-529,
MPI-552 and MPI-530 were merged into MPI-560 on 2026-08-16**, at Fabio's request and on the
same day this brief was written. There is now ONE flow umbrella — **MPI-560** — so the
original reason for keeping this card unparented is gone.

Fabio, 2026-08-16, which drove that merge: *"three flow umbrellas exist to me. That's just
ridiculous. Flows are one thing, so there should be only one umbrella. That's all improperly
set up at the moment."*

This card still ships **standalone**: MPI-560 is FORMAT (community flow authoring shape and
package format), not flow CONTENT, so it is not this card's parent either. Re-parent only if
a content umbrella is ever created. The other unparented flow-content cards are the same
case: **MPI-355** (4K/8K localized-edit Flow) and **MPI-596** (Object Stamp Flow, the sibling
whose bench questions are answered here).

> The stale version of this note listed MPI-552, MPI-560 and MPI-529 as three live umbrellas.
> Do not restore it — it would send the next reader looking for boards that no longer exist.
