# Object Stamp — take an object out of one photo and put it into another

> `id: 'object-stamp'` · `operation: 'flowObjectStamp'` · `workflow: 'flow_object_stamp.json'`
> · MPI-596. Draw It In's architecture with the scribble swapped for a real object.
>
> The generalisable half — identity-vs-viewpoint, the three-reference limit, the
> full-frame-reference rule — is promoted into
> [blending-into-a-photo.md](../blending-into-a-photo.md). This file is the specifics.

## The shape

One model slot (Klein 9B), two image inputs, two gizmo steps, one graph, two modes.

| | Auto (default) | Manual |
|---|---|---|
| reference 1 | the clean scene, cropped to the region | the clean scene, cropped to the region |
| reference 2 | the **stamped composite**, cropped | the **clean object**, full frame |
| what stage 3 derives | the stamped layer, into `image2` | nothing — the object is already `image2` |
| prompt | baked | baked frame + the user's own words |
| identity | free — the object keeps its own pixels | spent — the model re-draws the object |
| buys you | nothing to decide | a viewpoint the source photo never had |

Reference 1 is ALWAYS the scene and reference 2 ALWAYS whatever carries the object.
**That order is semantic, not incidental**: both baked prompts say "image two into the
scene of image one" ([prompts.md](../../../../.agents/mpi-kanban/tasks/MPI-596/prompts.md)).

## The steps, and why the ORDER is load-bearing

```js
steps: [
    { kind: 'cutout', role: 'image2' },
    { kind: 'place',  role: 'image1', sourceRole: 'image2', mediaRole: 'image2',
      param: { region: 'box1', mode: 'Input_Mode' } },
]
```

`_deriveRunMedia` walks `flow.steps` in **declaration order**, and `place` stamps whatever
sits in `sourceRole` at the moment it runs. **Declare `cutout` second and stage 3 stamps the
uncut object** — background and all — and the run still completes and still returns a
picture. There is no error to catch this. Only the order.

- `cutout` replaces its own role's file, so no `mediaRole`. It is **skippable by
  construction, with no flag**: untouched, `composeCutObject` returns null, the frame reads
  a null as "this kind changed nothing", and `image2` reaches the run byte-identical rather
  than being re-encoded through a canvas. An already-cut PNG therefore costs nothing.
- `place` is the one kind that reads TWO roles, and the one that reports a **map** rather
  than a bare value. See below.

## `place` reports a MAP, so the flow binds an OBJECT `param`

`STEP_PARAMS.place` returns `{ region, mode }` — `region` to `Input_Box` (through the
`headSwap` injector, because an `MpiBox` carries four widgets the generic title injector
would match and silently not write), and `mode` to `Input_Mode`.

Binding it with the string form assigns the whole object to one node, which the injector
writes as `[object Object]` — silently, and the run still finishes.
`tests/flow-step-param-binding.test.cjs` asserts no `place` step uses the string form.

`mode` is emitted **even when the gizmo has no shape yet**, because it decides which arm of
the graph runs regardless. 1 = Auto, 2 = Manual — the 1-based `MpiAnySwitch` `select`
convention Head Swap's `Input_Tier` and Character Sheet's `Input_Recipe` already use.

## The graph: one file, three switches

`Input_Mode` drives **all three** `MpiAnySwitch` nodes. Two wired and one left on a constant
is the silent half-fork — Manual would take its own reference but Auto's crop source, and
the run would still finish. The inject test asserts the count is 3.

| switch | picks | Auto | Manual |
|---|---|---|---|
| `Crop_Source_Select` | `163.image` | node `6`, the composite | node `1`, the raw scene |
| `Ref2_Select` | `203.latent` | `107`, the composite crop | `202`, the clean object |
| `Prompt_Select` | `18.string_a` | `103`, the Auto instruction | `224`, the Manual one |

**`Input_Paint` carries `image2` and the GRAPH fans it out.** There is deliberately no third
image title: `commandExecutor._buildParams` keys its `assigned` Map by `slot.key`, so a
second slot declared with the same key hits `assigned.has(slot.key)` and is skipped — one
role can never fill two titles, and the MPI-292 dedup enforces the same thing from the other
side. An earlier build did carry an `Input_Image_2`; dropping it was **pixel-identical** in
both modes and removed a node and a title.

`Crop_Source_Select` exists for exactly one reason: in Manual, `Input_Paint` holds the clean
object, and without the switch node 6 pastes it at 0,0 straight into the crop.

## Crop sizing — law 8, and it is geometry, not a quality knob

- `context_from_mask_extend_factor` = **1.0** (`183`), NOT Draw It In's `4.267`. That
  constant SIZES the crop, which is now the write-back's job.
- `mask_expand_pixels` is **derived, never hard-coded**: `MpiMath` (`225`) running
  `floor(0.3 * a + 0.5)` off `MpiMaskSquareBbox.size`, on BOTH crops so the two references
  stay in step. It is an INT input, and `safe_math` exposes only `math.*` — `round()` is a
  builtin and raises, so `floor(x + 0.5)` is what both rounds and returns an int.
- **Why it must be derived:** `InpaintStitchImproved` writes back only the mask while the
  model's canvas is the whole crop, which is larger. A hard-coded pixel count is right for
  exactly one box size and silently wrong for every other, and being wrong means a
  dead-vertical cut through the object and its shadow. A prompt cannot reach this — it was
  tested and rejected.

Both crops must also share one mask and one context factor (**law 7**). A reference passed at
full frame is an instruction the model obeys literally: it paints that whole wide scene into
the narrow frame and the patch stitches back as a miniature room inside the table. The inject
test asserts both.

## Known limitation — copy, not code

An object photographed at a viewpoint the scene cannot use (a hero product shot: side-on,
floating, studio-lit) cannot be re-angled while staying itself. **Law 1**, and no prompt buys
past it. The product answer is to tell the user to supply the object photographed from roughly
the angle they want it seen from — most products have several photos, so it is a ten-second fix
for them and an impossible one for the model. Same shape as MPI-567's "upscale the source
first".

## Evidence

- Graph authored and proven on the bench across 18 runs, 2026-08-26 (two separate files, one
  per mode).
- Unified into one file 2026-08-27 and re-run: both modes green on a 4060 Ti at 26.1s each,
  and **pixel-identical** to the two files they replaced (0 differing subpixels of 3,145,728).
- The full derivation, the eight measured laws, and two designs that were tried and dropped
  live in `.agents/mpi-kanban/tasks/MPI-596/brief.md`. Do not re-propose either.

## Still to do

- `preview` / `video` are ABSENT and that is correct while the art is missing — a declared
  name with no file 404s, and `tests/desktop/flows-tab-ring.spec.js` asserts a clean console.
  Run `/mpi-flow-graphics`, then add the names. The ~25 runs already in the **Stamp Flow
  Tests** project are the plate material.
