# Scribble to Object

> The user draws on top of their own photo; the Flow replaces the drawing with a rendered
> object stitched back into the photo at the same place and scale. Card: **MPI-567**.
> **BENCH PROVEN 2026-08-21, NOT YET WIRED** — no `FlowDef`, no op, no runtime graph in
> `comfy_workflows/` yet. Spec: `.agents/mpi-kanban/tasks/MPI-567/brief.md`.
>
> Portable UI decisions live in [../ui/](../ui/); the any-of model set lives in
> [../any-of-models.md](../any-of-models.md).

## Status — the bench half is settled, the app half is not started

| Item | State | Notes |
|---|---|---|
| Pipeline proven end to end | **DONE** 2026-08-21 | 40-node API graph run on the standalone bench (8188). The FIRST run produced a correct object AND a correct stitch |
| Both preprocessor arms proven | **DONE** 2026-08-21 | scribble and canny each produce a different, on-brief object from the same seed and prompt |
| White-vs-green hint background | **DECIDED — WHITE** | green is a silent total failure, see § The green trap |
| Model swap on two arms | **DONE** 2026-08-21 | `Input_Base_Model` swapped between SDXL Realistic and ILL Anime — see § The model swap |
| App wiring (`/mpi-add-flow`) | **NOT STARTED** | gated on Fabio approving the bench output by eye |

## Shape — the flow DRIVES the shipped SDXL ControlNet-Union branch

There is **no new ControlNet path to author.** All five SDXL-family models already declare
`controlTypes: ['depth', 'pose', 'scribble', 'canny']` behind ONE
`ControlNet-Union-ProMax-SDXL.safetensors` loader, switched by `Input_Control_Net`
(`models.js`). This flow uses arms 3 and 4 of that same switch.

The proven graph, in brief order:

| Brief step | Nodes | What it does |
|---|---|---|
| 1–2 | `Input_Image`, `Input_Paint` (`MpiLoadImageFromPath`) | the photo, and the paint layer ALONE as an RGBA PNG at photo resolution |
| 7 | `InvertMask` → `MpiMaskSquareBbox(padding=48)` | the drawing's own alpha becomes a **square** crop rect: `square_mask`, `x`, `y`, `size` |
| 3 | `EmptyImage(color=0xFFFFFF)` → `ImageCompositeMasked` → `ImageCrop(x, y, size, size)` | paint RGB over flat white, cropped to that rect — the ControlNet hint |
| 4 | 2× `AIO_Preprocessor` + 2× `SetUnionControlNetType`, both switched by `MpiAnySwitch(Input_Control_Net)` | `ScribblePreprocessor` + `hed/pidi/scribble/ted`, or `CannyEdgePreprocessor` + `canny/lineart/anime_lineart/mlsd` |
| 5–6 | `Input_Positive` → `StringConcatenate` | the user's text, plus the "isolated object on a plain white background…" tail |
| 8 | `ControlNetApplyAdvanced` → `KSampler` @ **1024×1024** → `VAEDecode` | SDXL samples the object, not the frame |
| 9 | `LoadBackgroundRemovalModel('birefnet')` → `RemoveBackground` | → a **MASK**, foreground = 1 |
| 10 | 2× `ImageScale` (+ `MaskToImage` / `ImageToMask` for the matte) → `ImageCompositeMasked(x, y)` | object and matte down to `size`, pasted at the recorded `x, y` |

`Input_Control_strength` → `MpiNormalizeValue` → `ControlNetApplyAdvanced.strength`. The SDXL
master template normalises 0–1 onto **0–0.5**; this graph uses **0–1**, because here the
scribble IS the subject rather than a hint over an existing composition. Bench value 0.8.

Sampling comes straight off the SDXL Realistic template — `lcm` / `simple`, 7 steps, cfg 1.5.
A full run (preprocess + sample + rembg + stitch) is **~18s cold, ~9s warm** on the bench.

## The four open questions, answered at the bench

1. **Does remove-background emit a usable MASK, or does the stitch need its own matte?**
   `RemoveBackground` returns a `MASK` **directly**, already the right polarity — foreground =
   1, which is exactly what `ImageCompositeMasked.mask` wants. No separate matte and no
   `InvertMask`. (`remove_background.json` node 9 uses it the same way, un-inverted; the
   `InvertMask` at its node 6 exists only to feed `JoinImageWithAlpha`.)

2. **White or green behind the scribble?** **WHITE.** Green is not merely worse — see below.

3. **How do the drawing's bounds become the crop rect, and survive the round trip?**
   `MpiMaskSquareBbox` already exists and is exactly this node's job: square, centred on the
   mask, clamped inside the image, emitting `x`, `y`, `size` as plain INTs. Those same three
   INTs feed the crop at the front and `ImageCompositeMasked` at the back, so the coordinates
   never leave the graph and cannot drift.

4. **Is `InpaintCropImproved` / `InpaintStitchImproved` the right carrier?** **No — the paste
   happens OUTSIDE it.** Inpaint-crop/stitch exists to sample a region *of an existing image*
   and blend the whole rectangle back; here SDXL generates the object on a clean background and
   only the rembg matte should land. A plain `ImageCompositeMasked` at the recorded `x, y` is
   simpler and more correct — and it inherits the **no feather** ruling (MPI-454) for free,
   because there is no `mask_blend_pixels` to set.

## The green trap — a silent, plausible, completely wrong result

Putting the scribble on a **green** (`0x00FF00`) background instead of white makes
`ScribblePreprocessor` return a **fully black hint**. Nothing errors anywhere. ControlNet then
contributes nothing at all and SDXL free-generates from the prompt alone: measured on the
bench, the same seed and the same prompt produced a handsome 3/4-view watchtower with a
ladder, railings and shingles that bears **no relationship to what the user drew** — different
geometry, different perspective, off-centre.

That is the worst failure mode this flow can have: it looks like it worked. Keep the
background white, and if the hint ever changes, **look at the preprocessor output** before
judging the result — a black hint is the tell.

## The model swap — confirmed POSITIVELY, 2026-08-21

`Input_Base_Model` is the `CheckpointLoaderSimple` title, and it was proven by swapping only
`ckpt_name` — same seed, same prompt, same preprocessor, same everything else — between
`SDXL_Realistic.safetensors` and `ILL_Anime.safetensors`:

- **Both arms produced the same watchtower geometry** — tapered legs, X-brace, horizontal rail,
  cabin, pitched roof, pennant. The ControlNet hint survives the swap intact.
- **The render differs exactly as the checkpoints differ**: SDXL Realistic returned photoreal
  weathered timber; ILL Anime returned flat cel-shaded lineart with an outline, which is what an
  Illustrious anime checkpoint is for.
- Measured: **mean abs diff 17.5/255, 57.5% of pixels differing**, byte-identical `False`.

That last point is the one that matters. **An unmatched title is dropped in silence**
([../any-of-models.md](../any-of-models.md)), and a dropped title produces a run that succeeds
and looks fine — so "no error" proves nothing. Two arms must be shown to differ. A byte-identical
pair is the failure signature, not a crash.

> Evidence: `D:\WORK\Images\Outputs\mpi567_arm_realistic_object_*.png` vs
> `mpi567_arm_illanime_object_*.png`.

**Watch the download, not the dropdown.** The first attempt at this ran against an
`ILL_Anime.safetensors` that was 84% downloaded and died inside `CheckpointLoaderSimple` with a
shape `RuntimeError` that reads like a corrupt model. The trap is written up in
[../../../workflow-authoring/bench-editing.md](../../../workflow-authoring/bench-editing.md)
§ The traps.

## Carried in from MPI-454 (Place tool)

- **No feather on the cut-out.** Ruled closed by Fabio: the detailing pass is what blends, and
  a blanket feather damages images that do not want one. Satisfied by construction here.
- **The stitched object reads as pasted** — flat lighting, no contact shadow, no scene colour.
  Plainly visible in the bench run. That is what brief step 8's detail pass is for, and
  MPI-454's finding that **an EDIT MODEL serves that blend better than the plain detail path**
  (recorded for MPI-596) applies here unchanged. Not part of the bench half.
- **`deferCommit`** (`generationService.js`, MPI-306) is the mechanism if an intermediate must
  exist on disk without landing in the project. Do not invent a second one.

## What the app half still has to settle

- **Where the paint layer comes from.** The graph wants the paint layer ALONE as an RGBA PNG at
  photo resolution — not the composite. `docs/painting.md` owns per-entry paint persistence;
  the flow's media I/O hangs off that.
- **The model picker.** `requiredModels: [[…five SDXL ids…]]` plus a `modelParams` arm per
  member swapping `Input_Base_Model` — the graph side of that is already proven (§ The model
  swap). Read [../any-of-models.md](../any-of-models.md) before writing the descriptor, and note
  the picker only renders when **more than one** member is installed (`flowModelChoices`).
  Filenames verified against `modelDeps.js` 2026-08-21: `SDXL_Realistic.safetensors`,
  `SDXL_NSFW.safetensors`, `ILL_Anime.safetensors`, `ILL_Anime_Beauty.safetensors`,
  `PONY_Mix.safetensors`.
- **The preprocessor radio.** A declared `radio` field driving `Input_Control_Net` (1 = Scribble
  for a loose doodle, 2 = Canny for a clean structured drawing). The step copy says which to
  pick, in those words.

## Sibling

**MPI-596** (Object Stamp Flow) is the same problem in a simpler form — extract an object,
stitch it in, blend the seam. Questions 1, 3 and 4 above are its questions too, and the answers
transfer as they stand.
