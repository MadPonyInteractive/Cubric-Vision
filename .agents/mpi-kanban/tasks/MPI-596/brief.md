# MPI-596 — Object Stamp Flow

Take an object out of one image, put it into another, blend it. As a **Flow**, not a
workspace tool. Carded from the 2026-08-21 brainstorm that redesigned MPI-454 and closed
umbrella MPI-562.

**Run `/mpi-add-flow`** — it enforces `docs/playbooks/add-flow/`. Graphics are
`/mpi-flow-graphics` afterwards.

## What the user asked for

> The user can supply the image to stamp on and the image to extract from. Step two would be
> selecting which object to extract, with a simple input field so the user can write what
> object to extract. Step three would be the gizmo, the same transform gizmo — the user places
> it in the image — and the final step is just generate, which the flow itself would detail
> that area. Maybe a denoise slider for detailing, and I think that can be done with Krea2.

## The shape

| Step | Kind | What it collects |
|---|---|---|
| 0 (implicit) | inputs | `image1` = the image to stamp **onto**, `image2` = the image to extract **from** |
| 1 | `fields` | one text field naming the object to extract → SAM3 text segment on `image2` |
| 2 | `box` | where the object goes on `image1`, bound to an injection `param` |
| last (implicit) | run | denoise slider + Generate |

## Why this needs almost no new code

**The placement step is `kind: 'box'`, which already exists.** `head-swap` declares two of
them bound straight to graph params (`flowsRegistry.js:283-312`), and the registry comment is
explicit: *"A NEW GIZMO IS ONE COMPONENT + ONE LINE IN THIS OBJECT"* (`stepKinds.js`) — and
here not even that, because the line is already there.

**No mid-flow dispatch.** The obvious design has the user place the *actual cutout*, which
means SAM3 has to run before step 2 — a flow that generates twice, which the frame does not
do. It is not needed: the user boxes **where the object goes on the target**, and the graph
does extract → fit → detail in one pass. The box is a **bounding box**, which is exactly the
right semantic, and the whole feature stays a descriptor plus a workflow.

**Fit inside the box preserving aspect — never stretch to it.** A person stamped into a
non-matching box otherwise arrives squashed. `head-swap`'s `Mpi Box Crop` carries `pad: true`
for the mirror-image reason; read `docs/playbooks/add-flow/` and the head-swap graph before
choosing nodes.

## Known pieces

- **Extraction:** SAM3 text tool. Already wired and already installs with the engine —
  `sam3-multiplex` is in the engine install set (see the note near `flowsRegistry.js:580`).
  Mind the `name:N` trap: `docs/masking-sam3.md`.
- **Detail pass:** Krea2, with a denoise slider as the flow's knob. `docs/models/krea2/`.
- **Not BiRefNet.** MPI-454's tool uses BiRefNet because it cuts *the* subject with no naming.
  This flow names an object, which is SAM3's job. Different extractor on purpose.

## Open questions for the plan session

1. **Does the box step need a `preview` step before it?** Step 0 loads media at thumbnail
   size, which is why `preview` exists. Boxing a placement on a thumbnail may be too coarse —
   check what `MpiStepBox` actually renders at before adding a step.
2. **Denoise range.** A stamp needs enough denoise to blend seams and little enough to keep
   the object. Measure; do not guess a default.
3. **Does it declare `result: { compare: 'image1' }`?** The flow improves media the user
   supplied, which is the stated trigger for the before/after surface (MPI-585). Probably yes.
4. **What happens when SAM3 finds nothing?** The named object may not be in `image2`. A flow
   that returns the untouched target with no explanation is the bad outcome.

## Sibling card

**MPI-454 — the Place tool.** Same capability on the workspace surface, with a real drag
gizmo over the actual cutout pixels. Deliberate duplication
(`project_flows_are_the_beginner_surface`): capabilities ship twice on purpose so a
non-technical user never leaves the Flow Library. **Shared control vocabulary, zero shared
code** — a canvas gizmo and a `box` step are not the same component and should not be made
into one.
