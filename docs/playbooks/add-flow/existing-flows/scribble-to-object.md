# Scribble to Object

> The user draws on top of their own photo; the Flow replaces the drawing with a rendered
> object stitched back into the photo at the same place and scale, **and blends it in so it
> belongs there**. Card: **MPI-567**. **BENCH PROVEN AND SIGNED OFF 2026-08-22, NOT YET
> WIRED** — no `FlowDef`, no op, no runtime graph in `comfy_workflows/` yet.
> Spec: `.agents/mpi-kanban/tasks/MPI-567/brief.md`.
>
> **The blend pass is generic and lives in its own doc:**
> [../blending-into-a-photo.md](../blending-into-a-photo.md) — the route, the prompt, the
> measurement, the model comparison. Read it before touching the blend half. This file holds
> only what is specific to *this* flow.
>
> Portable UI decisions live in [../ui/](../ui/); the any-of model set lives in
> [../any-of-models.md](../any-of-models.md).

## Status — the bench half is settled and signed off, the app half is not started

| Item | State | Notes |
|---|---|---|
| Pipeline proven end to end | **DONE** 2026-08-21 | 40-node API graph run on the standalone bench (8188). The FIRST run produced a correct object AND a correct stitch |
| Both preprocessor arms proven | **DONE** 2026-08-21 | scribble and canny each produce a different, on-brief object from the same seed and prompt |
| White-vs-green hint background | **DECIDED — WHITE** | green is a silent total failure, see § The green trap |
| Model swap on two arms | **DONE** 2026-08-21 | `Input_Base_Model` swapped between SDXL Realistic and ILL Anime — see § The model swap |
| Blend pass | **DONE** 2026-08-22 | whole-image relight → composite back, five plates + a tiny ladder. [../blending-into-a-photo.md](../blending-into-a-photo.md) |
| **Merged runtime graph** | **BUILT + PROVEN** 2026-08-22 | stage 1 + relight + tail as ONE graph, 74 nodes, one dispatch, ~16s. Beats the three-step route's seam on all five plates. Bench store `MPI-567_scribble_to_object_BLEND` (LiteGraph); repo copy `bench-graph-blend.json` is **API format**. `raw/` is agent-writable since 2026-08-22, so the LiteGraph copy is round-tripped off the bench, never synthesised from the API graph |
| `paint` step kind | **BUILT + PROVEN LIVE** 2026-08-22 | `MpiStepPaint`, mounting `PaintManager` + `brushDab.js`; binds through `STEP_MEDIA` and returns the layer ALONE at source resolution. The step declares `mediaRole` so the photo survives beside it. [../ui/paint-gizmo.md](../ui/paint-gizmo.md) |
| `Input_Control_strength` default | **DECIDED — 0.45–0.60** | 0.8 renders the user's ink as garment detail. See § Control strength |
| Which arm for which drawing | **DECIDED** | scribble for flat line art, canny for a TONAL drawing. See § Which preprocessor arm |
| Fabio's sign-off by eye | **GIVEN** 2026-08-22 | *"Compared to what we had previously, these look very good."* |
| App wiring (`/mpi-add-flow`) | **NOT STARTED** | unblocked — the gate is now open |

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

Sampling comes straight off the SDXL Realistic template — `lcm` / `simple`, 7 steps, cfg 1.5.
A full run (preprocess + sample + rembg + stitch) is **~18s cold, ~9s warm** on the bench.

## The four open questions, answered at the bench

1. **Matte?** None needed. `RemoveBackground` returns a `MASK` directly, already the right
   polarity (foreground = 1) for `ImageCompositeMasked.mask` — no `InvertMask`.
2. **White or green behind the scribble?** **WHITE.** Green is a silent total failure — below.
3. **Crop rect round trip?** `MpiMaskSquareBbox` emits `x`, `y`, `size` as plain INTs, and the
   same three feed the crop at the front and the paste at the back — the coordinates never leave
   the graph, so they cannot drift.
4. **Is `InpaintCropImproved` / `InpaintStitchImproved` the right carrier?** **No — the paste
   happens OUTSIDE it.** Inpaint-crop/stitch samples a region *of an existing image* and blends
   the whole rectangle back; here SDXL generates the object on a clean background and only the
   rembg matte should land. A plain `ImageCompositeMasked` at the recorded `x, y` is simpler and
   inherits the **no-feather** ruling (MPI-454) for free — there is no `mask_blend_pixels` to
   set. **That rectangle-blending behaviour is also exactly what makes the localised route
   unusable for the BLEND pass** — see [../blending-into-a-photo.md](../blending-into-a-photo.md).

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

**Second trap in the same node:** with an EMPTY paint layer the drawn bbox is empty and
`AIO_Preprocessor` dies with `ZeroDivisionError: float division by zero`. This graph therefore
cannot stand in as a plain t2i for building a fixture — use a minimal standalone SDXL graph.

## The model swap — confirmed POSITIVELY, 2026-08-21

`Input_Base_Model` is the `CheckpointLoaderSimple` title. Swapping only `ckpt_name` between
`SDXL_Realistic.safetensors` and `ILL_Anime.safetensors` — same seed, prompt and preprocessor —
kept the **same geometry** (the hint survives the swap) rendered as the checkpoints differ:
photoreal timber vs flat cel-shaded lineart. Measured 17.5/255 mean abs diff, 57.5% of pixels
differing; re-confirmed on the figure fixture 2026-08-22.

Because an unmatched title is **dropped in silence** ([../any-of-models.md](../any-of-models.md)),
a byte-identical pair — not a crash — is what failure looks like here. Always confirm the swap
POSITIVELY by showing two arms differ.

> Evidence: `mpi567_arm_realistic_object_*.png` vs `mpi567_arm_illanime_object_*.png`;
> `mpi567_s3_ARMCROP_anime.png` (2026-08-22, with the blend applied).

**Medium is a MODEL-SELECTION problem, not a prompt problem.** *"Match the scene's art style"*
does not restyle a photoreal object onto a cel-shaded plate — asked to place a figure on an anime
rooftop, SDXL Realistic returns a photoreal one. Fabio: *"If you want anime, you gotta use ILL
Anime."* **This makes the any-of picker load-bearing for correctness, not a convenience**, and no
blend pass can rescue a medium mismatch. The blend does preserve whichever medium it is given.

**Watch the download, not the dropdown.** The first attempt at this ran against an
`ILL_Anime.safetensors` that was 84% downloaded and died inside `CheckpointLoaderSimple` with a
shape `RuntimeError` that reads like a corrupt model. The trap is written up in
[../../../workflow-authoring/bench-editing.md](../../../workflow-authoring/bench-editing.md)
§ The traps.

## Control strength — 0.45–0.60, and the slider is MANDATORY

`Input_Control_strength` → `MpiNormalizeValue` → `ControlNetApplyAdvanced.strength`, mapped
0–1 → **0–1** here (the SDXL master template uses 0–0.5; this flow differs because the scribble
IS the subject, not a hint over an existing composition). Swept on one plate, everything else
fixed, 2026-08-22: **0.30–0.60** correct (photoreal, plain garment, pose held); **0.80** — the
bench's old baked value — renders **the ink as CLOTHING**, a drawn neckline becoming a real
V-neck seam; **1.00** puts the drawn lines through as straps across the chest.

**The mechanism is what to keep: a drawing's SHAPE survives far below the strength at which its
LINES start being rendered as objects** — the pose is still correct at 0.30. A low default costs
nothing; a high one silently turns the user's ink into detail they never asked for.

Fabio, 2026-08-21, on a 0.8 result: *"this looks a lot, maybe too much, like the drawing itself.
The strength control that we have on the original workflow needs to be the same for this flow."*
**Exposing the slider is therefore a correctness requirement, not a convenience.**

## Which preprocessor arm — TONAL, not TIDY

`Input_Control_Net`: **1 = scribble, 2 = canny.**

- **Flat line art → scribble.** Canny detects EDGES, and a drawn stroke has TWO of them, so a
  3px line becomes two parallel contours that the model renders as an OUTLINE — the user's ink
  survives into the render and the figure reads as a coloured-in drawing. Scribble thins the
  stroke to a centreline, so the model renders a FORM.
- **A shaded pencil sketch → canny.** Verified 2026-08-22 on a graphite study with tonal
  hatching: **neither arm leaves an outline**, because a shaded drawing's edges are real form
  boundaries rather than the two sides of a drawn line. Canny is mildly *better* there — it
  carries interior structure through (fabric folds, a shirt motif) where scribble flattens it.

**So the step copy must say TONAL, not "structured".** A user with clean line art who reads
"structured" as "neat" will pick canny and get their own ink back. Fabio's wording is a *shaded
pencil sketch* — a drawing with tonal hatching and interior modelling.

## The size floor — ~80–96px of DRAWN ink

Stage 1 crops the drawn bbox and samples it at a fixed 1024. That is what lets a small object
render at high resolution — but it also means the **control hint is upscaled from whatever the
user drew**, so too little ink becomes a blurred hint and SDXL invents to fill it. Ladder on two
figures, sun plate, 2026-08-22: **96px** correct; **63px** distorted plus a spurious third
figure; **40px** three figures where two were drawn; **25px** flat cut-outs, and the blend then
hallucinates a third figure with its own shadow.

**The floor is set by how much the user DRAWS, not by the object's share of the frame** — and it
is a stage-1 limit, so the blend cannot repair it. Fabio's call, 2026-08-22: **warn in the step
copy**, rather than auto-raising strength for a small drawing (which fights § Control strength).

## Carried in from MPI-454 (Place tool)

- **No feather on the cut-out.** Ruled closed by Fabio: the detailing pass is what blends, and
  a blanket feather damages images that do not want one. Satisfied by construction here.
- **The stitched object reads as pasted** — flat lighting, no contact shadow, no scene colour.
  **ANSWERED 2026-08-22.** MPI-454's finding that an EDIT MODEL serves the blend better than the
  plain detail path held up: the pass runs on Klein's edit op. Route, prompt and measurement are
  in [../blending-into-a-photo.md](../blending-into-a-photo.md). Detailing was reconsidered and
  set aside — Fabio, 2026-08-21: *"detailing needs quite a few passes with different denoise
  values to figure out which one comes up as a good pass, while the edit model can give us what
  we want with one pass."* It returns only if a single denoise value can be locked.
- **`deferCommit`** (`generationService.js`, MPI-306) is the mechanism if an intermediate must
  exist on disk without landing in the project. Do not invent a second one.

## What the app half still has to settle

- **~~The paint layer needs a step kind that does not exist.~~ SETTLED 2026-08-22** — `paint` is
  registered in `STEP_KINDS` and proven live. What the FlowDef has to declare:
  `{ kind: 'paint', role: '<the photo>', mediaRole: '<the layer's own slot>' }`, and the op's
  `mediaInputs` must declare BOTH roles or the layer reaches no node. Full contract:
  [../ui/paint-gizmo.md](../ui/paint-gizmo.md).
  **One obligation lands on the wiring, not on the gizmo:** an unpainted step reports
  `paint: null`, `STEP_MEDIA` then derives nothing, and `MpiLoadImageFromPath` runs on its baked
  authoring path — a confident wrong result with no error. The frame cannot guard it (a null
  legitimately means "nothing changed" for `crop`), so this flow must.
- **The model picker.** TWO slots, resolved independently (MPI-599):
  `{ label: 'Image model', models: [the five SDXL ids] }` and
  `{ label: 'Edit model', models: ['klein-4b'] }`, plus a `modelParams` arm per candidate. The
  merged graph titles a node for each — `Input_Base_Model` (`CheckpointLoaderSimple`) and
  `Input_Edit_Model` (`UNETLoader`) — which is the one-title-per-slot rule in
  [../any-of-models.md](../any-of-models.md). Read that first and verify each filename against
  `modelDeps.js` at implementation time. The old "renders only when more than one is installed"
  note is OBSOLETE — MPI-599 removed that gate.
- **The preprocessor radio.** A declared `radio` driving `Input_Control_Net` — 1 = Scribble for a
  loose doodle or flat line art, 2 = Canny for a **shaded pencil sketch**. The step copy must say
  TONAL, not "structured" (§ Which preprocessor arm).
- **The strength slider**, defaulting to 0.45–0.60 — mandatory, § Control strength.
- **A minimum-drawing warning** in the step copy, § The size floor.

## Sibling

**MPI-596** (Object Stamp Flow) is the same problem in a simpler form — extract an object,
stitch it in, blend the seam. Questions 1, 3 and 4 above are its questions too, and the answers
transfer as they stand. **Its blend half is already solved** —
[../blending-into-a-photo.md](../blending-into-a-photo.md) was written to be flow-agnostic
precisely so MPI-596 does not re-derive it.
