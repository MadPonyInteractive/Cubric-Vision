# Box gizmo — region selector

> **PORTABLE.** First needed by Head Swap ([../existing-flows/head-swap.md](../existing-flows/head-swap.md)),
> but applies to any flow where the user picks a REGION of an image that the graph then crops,
> masks, or composites.

## Why not a painted mask

The graph consumes a **rectangle**. Whatever the user paints is reduced to its bounding box,
so the painted detail is discarded. Asking the user to paint a head — slow, fiddly — to
produce four integers is a lie in the UI: it implies a precision the pipeline does not keep.

A box the user drags is faster, honest about what the graph consumes, and needs no mask file.
See § State for the cost comparison that settled it.

## Coord contract — the `mpi_box` system (ComfyUi-MpiNodes)

**One injection entry per box.** The flow writes four widgets on a single `Mpi Box` node; that
node emits an `mpi_box` typed output which every consumer takes. The flow injects nothing else
— not the frame size, not the consumers.

| Inject | Widget | Meaning |
|---|---|---|
| box left | `x` | **top-left** anchored, absolute source px |
| box top | `y` | **top-left** anchored, absolute source px |
| box width | `width` | px |
| box height | `height` | px |

### Top-left anchored — no conversion

`x`/`y` are the box's **top-left corner in absolute source pixels**, which is how a crop rect
is naturally represented, so the gizmo sends its own coordinates **unconverted**. There is no
centre-offset maths and therefore no half-box offset bug to introduce.

Verified 2026-07-18 against a 1500×1500 source: `x=50, y=50, 512×512` → crop 512×512, mask
rect just inside the top-left corner.

### Out of bounds CLAMPS — the gizmo must constrain

Verified 2026-07-18: `x=1244, y=100, 512×512` on a 1500-wide source (box overhangs the right
edge by 256px) → crop returns **256×512**, mask rect flush to the right edge. `Mpi Box Crop`
returns the **intersection** with the image; it does not pad.

**The gizmo constrains by DEFAULT — and a step may opt out** (MPI-325). Constraining is the
right default: a user dragging past an edge otherwise gets a silently non-square crop, which
for Head Swap is a distorted reference head that reads as a model problem rather than a UI one.

But constraint has its own failure, and it is worse. A square that must stay inside the frame
cannot sit tight on a subject at the edge — to cover all the hair it has to GROW, until it
swallows whoever is standing next to them. That is how the MPI-324 validation run swapped the
wrong face.

So a step declares it:

```js
{ kind: 'box', role: 'image1', param: 'box1', ratio: 1, overflow: 'allow' }
```

`overflow: 'allow'` lifts BOTH frame bounds, and it needs both:

- **Position** — the box may hang off an edge by up to HALF its own size, so its centre always
  stays over the content: never dragged into nowhere, never ungrabbable. `x`/`y` reach the
  graph **negative**, and `MpiBox`'s widgets accept that (their `min` was `0` until MPI-325 —
  a gizmo relaxed without the node is a no-op at the boundary).
- **Size** — the box may grow to the media's **LONGEST edge**, so a square can exceed a
  portrait's WIDTH. Position alone is not enough: a square capped at the width of a 768×1354
  portrait cannot take in hair above the head or a tattoo below the chin, whatever you do with
  its position. Verified live at `1354 × 1354` on exactly that image.

`MpiStepBox` pads its stage per axis, out to that longest edge (+ handle slack), so the whole
box is drawn and its handles stay grabbable — a rectangle you cannot see is not a selection you
can judge. **That padding is the size policy**: `cropTool._maxNorm()` reads the cap back off
the canvas rather than holding a second constant that could drift from the CSS.

**The padding is NOT coordinate-free, and assuming it was cost a silent bug.** The overlay
canvas under overflow is the padded STAGE, so normalized space must be derived from where the
media actually renders inside it (`cropTool._getTargetBox`). Letterboxing the media into the
whole canvas instead scales every coordinate up by the padding — measured ~18%, i.e. the drawn
box was not the crop the readout promised, with no error anywhere.

**Whether a flow may opt in is a property of the CONSUMER, not the gizmo:**

| Consumer | Overhang costs | What the flow must do |
|---|---|---|
| `Mpi Box Mask` | nothing | just declare `overflow`. The mask is full-frame and clips at the edge — there are no pixels out there to mark. If it feeds `InpaintCropImproved`, that node grows the region back to its target aspect itself before sampling. |
| `Mpi Box Crop` | the aspect | declare `overflow` **and** set the node's `pad` input. Off, the crop is the intersection and a square reference arrives squashed. |

**Never pad the SOURCE image to fix a masked slot.** Padding the image the flow delivers grows
the delivered picture — the user gets their photo back with a strip on it. Padding is only ever
safe on an intermediate, which is what a reference crop is.

> Historical note: an earlier design injected KJNodes `CreateShapeMask` directly, whose
> `location_x`/`location_y` are CENTRE-anchored and required conversion. The `mpi_box` system
> replaced it — top-left, and no coupling to a third-party node's widget names.

### Consumers — one box, many uses

Each consumer takes `image` + `mpi_box` and passes `mpi_box` through, so boxes chain:

| Node | Does | Typical use |
|---|---|---|
| `Mpi Box Crop` | cuts the box region out of the image; `pad` replicates the edge to keep the requested size | take a reference region at native res |
| `Mpi Box Mask` | white rect on black at the box position, **full frame size** | mark a region for edit/inpaint |
| `Mpi From Box` | unpacks `mpi_box` → `width` / `height` / `x` / `y` ints | feed nodes that want raw numbers |

Crop and mask come from the SAME box type — Head Swap masks image 1 and crops image 2 with
identical injection. Adding a consumer never changes the flow side.

The one place the consumer does reach back into the flow is `overflow` (§ Out of bounds): a
crop needs `pad` on to survive an overhanging box, a mask needs nothing.

### Free box — a UI lock, not a graph lock

`width` and `height` are independent, so the graph is **already free-box capable**. A ratio
lock (1:1 or otherwise) lives in the gizmo, which sends `width === height` while a flow wants
square. A flow needing a non-square box unlocks its gizmo — **zero workflow changes, zero
node renames.**

### More than one box — suffix matches the image number

A workflow may box **several** images (Head Swap boxes both the base image and the reference
head). Each box is one `Mpi Box` node, bound to its image by the SAME numeric suffix the media
slots use:

| Image slot | Its box node |
|---|---|
| `Input_Image` | `Input_Box` |
| `Input_Image_2` | `Input_Box_2` |
| `Input_Image_N` | `Input_Box_N` |

No separate mapping to maintain — a box is simply "the box for image N", mirroring the
media-slot pattern (the injector already treats an unsuffixed title as slot 1:
`/^input_(video|audio|image)(_\d+)?$/i`, case-insensitive — `Input_Image` and `Input_image`
both match).

Two rules that keep this honest:

- **Unsuffixed IS slot 1.** `Input_Box` ≡ the box for `Input_Image`. Never write
  `Input_Box_1` — pick one form (unsuffixed) or the flow-side lookup has to try both.
- **A box is optional per image.** A flow may box image 1 only. Injection already skips a
  param whose title matches no node, so authoring the node is what opts an image in — this is
  intentional, not an accident of the injector.

### Why this generalises

Boxes are not a Head Swap quirk. 1024×1024 crops stitch well, so any workflow that crops,
stitches, or composites a region wants one. Boxing a *reference* image is the strongest case:
the user drops in a full portrait and marks the head, instead of pre-cropping outside the flow
and guessing how much context to include. Same gizmo, twice — no new UI per flow.

Because `mpi_box` is a first-party type, the app is insulated from third-party node churn: a
consumer can be added or rewritten without touching injection.

## Interaction

Reuse the **crop tool** interaction — the user has already learned it. Ratio-lock it where the
flow wants square. Do not author a new drag/resize behaviour.

**Optional detector seeding.** Where a detector can locate the subject reliably, use it to
*place* the initial box, then let the user nudge/resize. This must degrade gracefully: no
detection, or a bad detection, leaves a plain draggable box. Never make the detector a hard
dependency of the interaction — Head Swap's hair detector failed exactly this test
([../existing-flows/head-swap.md](../existing-flows/head-swap.md) § Hair detector dead end).

## State

Box coords live in the flow's input state (`state.s_flowInputs[flowId]`, replace-not-mutate) and
ride the normal reuse path — four ints restore instantly, with no file to re-resolve on
restart. A mask file would have needed a `.preview-assets` write, a media slot with a role, a
path-reading loader node, and reuse resolution across restart: a whole media pipeline for data
losslessly expressible as four integers.

## Open

Nothing outstanding on the coord contract — anchor and out-of-bounds behaviour are both
verified above. Remaining UI questions (slot previews, result pane, control placement) are in
[README.md](README.md) § Open / to brainstorm.

`overflow: 'allow'` is verified end to end as of 2026-08-17: unit tests, a live gizmo check,
and a real Head Swap generation through a padded overhanging box. The executed graph (read from
the engine's `/history`) carried `pad: true` on `MpiBoxCrop` with the reference box at
`1354×1354, origin -267,-5` — past the source's WIDTH and off-frame on both axes — and the
delivered image came back with no padded strip. Evidence in MPI-325's `validation.md`.
