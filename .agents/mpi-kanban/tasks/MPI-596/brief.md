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
> re-proposes them. Every claim below is from a real run — see `events.jsonl` findings 1–12
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

## Known limitation — document it, do not engineer around it

An object photographed at a viewpoint the scene cannot use (a hero product shot: side-on,
floating, studio-lit) cannot be re-angled while staying itself. That is law 1, and no prompt
buys past it.

**The product answer is copy, not code:** tell the user to supply the object photographed from
roughly the angle they want it seen from. Most products have several photos; it is a ten-second
fix for them and an impossible one for the model. Same shape as MPI-567's "upscale the source
first" — a user-side move, documented.

## Open, for the bench

- **Crop sizing** off the placed bbox, and whether shadows clip at the return-region edge.
  Draw It In's derivation does **not** transfer (there the scribble sits *inside* the box; here
  the box *is* the region).
- **Does the box degrade results versus free placement?** If a boxed spot the object cannot sit
  in produces worse output than letting the model choose, that is the one thing that would
  justify an auto-placement path. Evidence so far says no — the model keeps angle freedom
  inside the box.
- Whether the richer prompt becomes safe once the crop bounds scale (it broke uncropped).
- `ColorMatch` is expected to be needed on a vintage plate, as it was for Draw It In.

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
