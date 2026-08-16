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

Fabio asked for this to go under "the flows umbrella". There isn't one. Three flow
umbrellas exist and none covers flow CONTENT:

- **MPI-552** — LTX 2.3 v2v trio (foley / extend / lipsync). Model-specific.
- **MPI-560** — Community Flows: 1.5 authoring shape, 1.6 package format. FORMAT, not content.
- **MPI-529** — Flow Library v2: library paths, ripping the test flows. Plumbing.

Unparented flow-content cards already on the board: **MPI-355** (4K/8K localized-edit
Flow), **MPI-504** (Character Sheet flow, sits under the bench umbrella MPI-530).

Fabio, 2026-08-16: *"three flow umbrellas exist to me. That's just ridiculous. Flows are
one thing, so there should be only one umbrella. That's all improperly set up at the
moment."* Restructuring is a separate session's job. This card ships standalone and gets
re-parented when that happens.
