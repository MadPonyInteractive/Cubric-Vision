# MPI-596 — Object Stamp

> Put a **specific** object — an exact gun, an exact headphone model, a logo, a painting —
> from one photo into another, and have it look like it was really there. The whole point is
> **fidelity to the object the user supplied**, which is what separates this from every
> "generate something into a scene" flow.
>
> **Run `/mpi-add-flow`.** Graphics afterwards via `/mpi-flow-graphics`.
>
> **The design in this file is the THIRD one and it is settled**, proven live across ~25 runs
> in the app on 2026-08-26. The two earlier designs are recorded at the bottom so nobody
> re-proposes them. Every claim below is from a real run — see `events.jsonl` findings 1–16
> and `prompts.md`.

## What the user asked for

> "The user picks up an exact gun model, for example, or an exact headphone model, and places
> it in the scene." — Fabio, 2026-08-26

Cases it must cover: a logo on a cup or a car · an image replacing a painting on a wall · an
image on a monitor screen · a person sitting on a bench · a flower jar on a table · a gun in a
character's hand.

## The shape

| Stage | What |
|---|---|
| 1 | Two image inputs: `image1` = the scene, `image2` = the object |
| 2 | Canvas + a **1:1 box**, an **Auto/Manual** toggle (Auto default), **Remove Background** toggle, and an **erase/restore brush** |
| run | Generate |

### Auto (default) — the object's own pixels are used

Canvas shows **the object itself**; the user moves, scales and rotates it. No prompt box.
Helper: *the model will match the object's lighting and scale to the scene.*

Dispatch sends **slot 1 = the clean scene, slot 2 = the stamped composite.**

### Manual — only the region is used

Canvas shows an **empty box with no rotation handle**, because the box is *the region the model
looks at*, not a placement of the object. A **prompt box appears**, whose placeholder teaches
the move (`e.g. "lying flat on its side, barrel pointing left"`).

Dispatch sends **slot 1 = the scene cropped to the box, slot 2 = the clean object, full frame.**

**The canvas differs because the mechanism differs, and that is the point of the design.** In
Auto the object's pixels really are used, so the user sees them. In Manual only the region is
used, so there is nothing honest to show but the region — and a rotation handle would be a lie.

## The measured laws behind it — do not re-derive these

**1. Identity and viewpoint are mutually exclusive.** License a redraw and you get a re-render,
not a transform: the model has no 3D model of *that* gun, so it synthesises a generic one from
its prior. Measured — a pose-described run returned a beautifully lit pistol that was **not the
user's Glock**. Krea2's `editing.md` reached the identical conclusion independently ("identity
and direction cannot both be had on this graph"), which makes it a property of the model class,
not a quirk of either. **This is why the two modes exist**: Auto keeps the object and its
viewpoint, Manual trades the viewpoint away.

**2. A stamp cannot re-project.** Translate/scale/rotate cannot turn a side-on product shot into
an object resting on a table seen from above; stretching only destroys it. So in Auto the stamp
is a **placement hint, not a paste** — the stage-2 copy is load-bearing, because a user who
believes it is a paste will fight the gizmo. No perspective/warp gizmo is needed or wanted.

**3. Three references cause identity mixing.** Vendor-documented and confirmed live: at three
refs the model drew **two guns**, one per reference it read as content. **Never exceed two.**

**4. A full-frame reference preserves identity; an embedded one does not.** The object inside a
stamped composite is ~200px of a 1024 frame — too little to carry detail. As its own reference
it is 1024px of actual object. Same sub-200px threshold that Draw It In measured for anchoring,
showing up here as *identity* loss. This is why Manual passes the clean object rather than the
stamp.

**5. Klein 9B ONLY. 4B was tested and failed** (Fabio, 2026-08-26) — the same call Draw It In
made for its own reasons. `requiredModels` takes a model SLOT, and **the CLIP arm moves with the
checkpoint**: 9B needs `qwen_3_8b_int8_convrot`, and pairing it with 4B's encoder dies with a
shape error that reads as a sampler bug (MPI-600).

**6. Prompts are bad at geometry.** Whatever constrains geometry *mechanically* makes the
wording stop mattering — a surface does it for a logo, the crop does it for everything else.
This is why the crop is a correctness requirement, not an optimisation. Full prompt rules and
both baked instructions: **[prompts.md](prompts.md)** — read it before touching a prompt.

**7. Every reference must be framed like the OUTPUT frame.** Measured on the bench 2026-08-26,
and it is the law that breaks this flow when it is broken. The output frame is the *crop*, so a
reference passed at full frame is an instruction the model obeys literally: it paints that whole
wide scene into the narrow frame, and the patch stitches back as a **miniature room inside the
table** — sofa, vase, second table, visible seam. Cropping the clean scene to the *same* region
removes it completely (clean A/B on the mug plate). Draw It In never met this because it has
**one** reference and that reference *is* the crop; the moment there are two, both must be
cropped. Everything that looked like "the crop is too tight" was this.

**8. The stitch mask is the contract, and no prompt can reach it.** `InpaintStitchImproved`
writes back **only the mask** (the box + `mask_expand_pixels` + the blend band) while the model's
canvas is the whole **crop**, which is larger. Everything Klein draws outside the box is
discarded — a dead-vertical cut through the object *and* its shadow. Auto never shows it (the
stamp pins the size, so the object is inside the box by construction); Manual has nothing
pinning size, so Klein filled the crop and lost the grip. **A prompt cannot fix this** — tested
and rejected (`prompts.md` § does NOT work): the model already keeps the object whole inside
*its* frame, and the loss happens downstream in a node it knows nothing about. The fix is
geometric: canvas == write-back region, per the config above.

## Known limitation — document it, do not engineer around it

An object photographed at a viewpoint the scene cannot use (a hero product shot: side-on,
floating, studio-lit) cannot be re-angled while staying itself. That is law 1, and no prompt
buys past it.

**The product answer is copy, not code:** tell the user to supply the object photographed from
roughly the angle they want it seen from. Most products have several photos; it is a ten-second
fix for them and an impossible one for the model. Same shape as MPI-567's "upscale the source
first" — a user-side move, documented.

## Settled on the bench — 18 runs, 2026-08-26 (`events.jsonl` findings 13–16)

- **The canonical crop config: `context_from_mask_extend_factor` pinned to `1.0`, and the
  write-back grown with `mask_expand_pixels` ≈ 30% of the box side** (83px on a 276px box). This
  makes the model's canvas *equal* the region written back — see law 8. Drive the 30% off
  `MpiMaskSquareBbox.size` with an `MpiMath`; it is an INT input, not a float.
- **Crop sizing is otherwise NOT a correctness knob.** With the references matched (law 7),
  every crop tested worked: 155, 300, 384, 414, 480, 607px and full frame. More object pixels
  visibly helps a *small* object: at 90px placed, full frame lost the grip to light grey; a
  155px crop (object at ~731px) came back correct. Draw It In's `4.267` constant sizes the
  *crop*, which is now pinned at 1.0, so it has no job left here.
- **Shadows need the margin.** With the write-back at the bare box, the mug's cast shadow ended
  exactly at the box edge and the gun's was cut with it; the 30% expansion lets it run past the
  corner cleanly.
- **`ColorMatch` is inert on a modern plate** — mean delta 0.032/255, 0.32% of pixels above 3.
  Keep it for the vintage case, but it is not what makes this flow work.

Still open: **object colour fidelity wanders run to run** (the same gun came back black at one
crop size and tan at another). Not a blocker for wiring; worth a sweep once the app side runs.

The box-versus-free-placement question stays answered as before — the model keeps angle freedom
inside the box, so no auto-placement path is justified.

## Sibling — MPI-454, the Place tool

Same capability on the workspace surface, and Fabio's own distinction is the right one:
**Place stretches pixels under user control; this re-renders into the scene.** Different
applications. Deliberate duplication (`project_flows_are_the_beginner_surface`) — shared control
vocabulary, **zero shared code**.

## Two designs that were tried and dropped — do not re-propose

**Design 1 (as originally carded): SAM3 text-extract → aspect-fit into a box → Krea2 denoise
blend.** Superseded before any code was written. MPI-621 names it directly as "cut, paste,
repair: the same architecture disproven here". A paste can never occlude, and a localised
crop/stitch re-grades the patch (ring 10–23 across four model configs). Also dead with it: the
`MpiFitInBox` node the plan expected to author (`ImageResizeKJv2` with `keep_proportion:
"resize"` already does `min(w/W, h/H)` and is pinned), and the denoise slider.

**Design 2: a box plus a text prompt, no stamp, Krea2 two-ref.** Dropped because Krea2 measures
identity and direction as unobtainable together and nothing on that graph is spatially
selective. Klein's `ReferenceLatent` chain is the route instead.
