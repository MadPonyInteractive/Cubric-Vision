# Scribble-to-object Flow — draw it, and the Flow renders it into the photo

Spec: [brief.md](brief.md) (Fabio's verbatim intent, 2026-08-16). **BENCH FIRST** — author and
prove the whole graph in the node graph, get Fabio's approval on real output, and only then wire
the app half via **`/mpi-add-flow`** (`docs/playbooks/add-flow/`).

**Model choice added 2026-08-21:** the base is **SDXL Realistic**, and the user may pick any
SDXL-family model. That was an open question in the brief ("possibly a user-facing model
selector — decide at the bench"); it is now decided, and the mechanism already exists.

## Current State

**2026-08-21, end of session 2.** Boogu multi-image is ANSWERED (no). The blend was benched on
Klein 4B across five lighting plates driven end to end from Fabio's own drawing, and the
**localised crop/stitch path is BLOCKED**: it leaves a visible rectangular re-grade patch on
every plate. Fabio's ruling: that is a **Boogu/Klein** behaviour and **Qwen Edit does not
usually do it** — so the next measurement is Qwen, not a bigger Klein. Klein 9B is unproven,
licence-gated and being explored in another session; do not design around it.

**Next action (both approved by Fabio, neither run):**
1. Whole-image relight → composite-back across all five plates — confirm the rectangle is
   absent everywhere, not just the two tried. This is the shape decision. ~30s/plate.
2. Re-run the anime plate on the **ILL Anime** arm — confirms medium is model choice, and
   exercises the `Input_Base_Model` swap live.

Then, if the rectangle survives (1): the same five plates on **Qwen Edit**.

**2026-08-21, end of session 1.** Bench half is PROVEN — pipeline, both preprocessor arms, and
the `Input_Base_Model` swap. Fabio has not yet signed off by eye, and reviewing the output he
raised the thing the bench half does not do: **the stamped object does not sit in the photo.**

**That changes the scope, and it is not a nice-to-have.** Fabio, 2026-08-21: *"Flows should give
the user a finished product, which is different from the history workspace tools."* The user must
not have to go into the History workspace to fix the seam. So the blend pass is **IN this card**,
not deferred to MPI-596. He is installing **Boogu ImageEdit** to find a prompt that generalises.

Everything below the blend question is settled and needs no re-litigating. See § The blend pass.

Project mode: `scalable-foundation`. Card was `idea`; this plan makes it `planned`.

### The bench half is far smaller than the brief assumes

The brief plans a ControlNet branch from scratch. **It is already shipped.** Every SDXL-family
model declares:

```js
controlTypes: ['depth', 'pose', 'scribble', 'canny']
```

> *"SDXL is the only model whose control switch offers more than depth: ONE ControlNet-Union
> checkpoint behind four `SetUnionControlNetType` nodes and four `AIO_Preprocessor` annotators,
> both switched by `Input_Control_Net`."* — `models.js`, the `sdxl-realistic` block

So **scribble and canny are both live, in one graph, selected by an injection param** — exactly
the two preprocessors brief step 4 wants to expose. The flow drives an existing branch; it does
not author one. `capabilities: { controlStrength: true }` gives `Input_Control_strength` as a
free knob (`Input_Control_strength` → `MpiNormalizeValue` → `ControlNetApplyAdvanced.strength`).

`controlnet-union-sdxl` (ControlNet Union ProMax, 2.34GB) is already a wired dep.

### The model picker — decided, and the mechanism is shipped

`requiredModels` entries may be **arrays** = an **any-of set**: the flow runs on whichever member
is installed and the badge is satisfied by any one. Shipped as MPI-590; read
[`docs/playbooks/add-flow/any-of-models.md`](../../../../docs/playbooks/add-flow/any-of-models.md)
before writing a line of it.

The five SDXL-family models, all five carrying scribble + canny:

| Model id | Name | Checkpoint |
|---|---|---|
| `sdxl-realistic` | SDXL Realistic | `checkpoints/SDXL_Realistic.safetensors` |
| `sdxl-nsfw` | SDXL NSFW | `checkpoints/SDXL_NSFW.safetensors` |
| `ill-anime` | ILL Anime | `checkpoints/ILL_Anime.safetensors` |
| `ill-anime-beauty` | ILL Anime Beauty | `checkpoints/ILL_Anime_Beauty.safetensors` |
| `pony-mix` | PONY Mix | `checkpoints/PONY_Mix.safetensors` |

Shape to write (verify each filename against `modelDeps.js` at implementation time rather than
trusting this table):

```js
requiredModels: [['sdxl-realistic', 'sdxl-nsfw', 'ill-anime', 'ill-anime-beauty', 'pony-mix']],
modelParams: {
  'sdxl-realistic':   { 'Input_Base_Model': 'SDXL_Realistic.safetensors' },
  // …one arm per member, INCLUDING the default arm — restate its baked value
},
```

**Four rules from `any-of-models.md`, each one a shipped bug:**

- **Never read `flow.requiredModels` directly.** A set reaches a plain consumer as a nested
  array. Go through `flowModelIds` / `flowModelChoices` / `setFlowModel` / `flowModelParams` /
  `flowSettingsModel`.
- **`modelParams` is what makes the picker REAL.** Without it the pick changes the badge and
  nothing else, and **injection drops an unmatched title in silence** — no error anywhere. The
  checkpoint loader in the flow's graph MUST be titled `Input_Base_Model`.
- **Restate the default arm's own values.** A pair reads as a pair, and it catches a graph
  re-export that quietly moves the default.
- **Do NOT reach for `modelFamily`.** MPI-316 removed it deliberately; it drives the tier letter.

`tests/flow-model-choice.test.cjs` already asserts every `modelParams` key names a title that
exists in that flow's graph — extend it to cover this flow.

**Ordering note:** the picker renders only when **more than one** member is installed
(`flowModelChoices`). Fabio is installing SDXL Realistic now, so a single-model bench run shows
no picker — that is correct behaviour, not a bug. Install a second SDXL model before judging the
picker.

### Carried in from MPI-454 (Place tool, shipped `3eb09d26`)

Three findings from the user's own testing of the sibling card, all of which bear on brief steps
8-10:

- **The detail/blend pass after a stamp is better served by an EDIT MODEL than by the plain
  detail path.** Recorded on MPI-454 as a note for MPI-596; it applies here too. Consider it at
  the bench before settling step 8.
- **NO feather on the cut-out.** Ruled closed by the user: the detailing pass is what blends, and
  a blanket feather damages images that do not want one. Brief step 9's stitch inherits this —
  do not add one.
- **`deferCommit` is live and correct** (`generationService.js`, MPI-306), with Place its first
  consumer since. If any intermediate here must exist on disk without landing in the project,
  that is the mechanism — do not invent a second one.

## Implementation

- [x] **Bench: prove the whole graph.** DONE 2026-08-21 — 40-node API graph run on the bench
      (8188), driving the existing ControlNet-Union branch via `Input_Control_Net`. All four open
      questions answered; the graph, the answers and the green trap are written up in
      [`docs/playbooks/add-flow/existing-flows/scribble-to-object.md`](../../../../docs/playbooks/add-flow/existing-flows/scribble-to-object.md).
      **AWAITING Fabio's sign-off by eye** — that gate is still shut, no app work until it opens.
- [x] **Bench: prove the model swap.** DONE 2026-08-21 — Fabio installed ILL Anime, and the same
      graph ran on both arms with only `ckpt_name` changed. Both produced the SAME watchtower
      geometry (the hint survives the swap) rendered as the checkpoints differ: photoreal timber
      on SDXL Realistic, cel-shaded Illustrious lineart on ILL Anime. Mean abs diff 17.5/255,
      57.5% of pixels differing, byte-identical `False` — the POSITIVE confirmation, since a
      dropped title yields an identical pair rather than an error.
- [ ] **Wire the flow** via `/mpi-add-flow`: the `FlowDef` (image input; the paint step; the
      preprocessor choice as a declared `radio`; the prompt field; `Input_Control_strength` as a
      slider), the op in its 4 files, and the any-of `requiredModels` + `modelParams` above.
      **Verify:** the inject test and `node --check` from `05-verify.md`; extend
      `tests/flow-model-choice.test.cjs` to this flow.
- [ ] **Live-run in the app**, including the picker with two SDXL models installed and one
      uninstalled, plus a reuse round trip. **Verify:** `05-verify.md`'s Definition of Done — a
      live run and a reuse, not a validation pass.

## Completed

- **Bench pass, 2026-08-21.** Three runs on the standalone bench (8188), ~18s cold / ~9s warm
  each. The FIRST run produced both a correct object and a correct stitch. Evidence in
  `D:\WORK\Images\Outputs\mpi567_*_00001_.png` (`hint` / `object` / `cutout` / `final`, plus
  `mpi567_canny_*` and `mpi567_green_*`). Fixture + graph builder:
  `<scratchpad>/make_paint.py`, `scribble_graph.py`, `run_variants.py`.
- **All four open questions answered**, written up in
  [`docs/playbooks/add-flow/existing-flows/scribble-to-object.md`](../../../../docs/playbooks/add-flow/existing-flows/scribble-to-object.md).
- **brief.md's stale "why no umbrella" board note healed** — MPI-529/552/530 → MPI-560, and the
  brief's open-questions section now points at the answers doc.
- **Model swap proven on two arms, 2026-08-21** (SDXL Realistic + ILL Anime). Evidence:
  `mpi567_arm_realistic_object_*.png` vs `mpi567_arm_illanime_object_*.png`; runner
  `<scratchpad>/run_swap.py`.
- **New trap filed** in `docs/workflow-authoring/bench-editing.md` § The traps: a part-downloaded
  weight is listed in `/object_info` under its final name and dies with a shape `RuntimeError`
  that reads like a corrupt checkpoint. Cost one wasted arm here. Gate on byte count + the
  absence of the `.cubricdl` sidecar, never on the dropdown.

## Remaining Work

- **The blend pass** — see § The blend pass. Now IN scope for this card, and the gate on wiring.
  Starts with the online investigation into Boogu multi-image support.
- **Fabio's sign-off on the bench output by eye** — pending, and he has already named the blend
  as what is missing.
- Wire the flow via `/mpi-add-flow`; live-run + reuse per `05-verify.md`.
- Graphics (tile + hero) — a separate `/mpi-flow-graphics` pass once the flow runs.

## Plan Drift

- **`InpaintCropImproved` / `InpaintStitchImproved` are NOT used.** The plan carried them in as
  a candidate carrier from the brief; the bench settled that the paste belongs outside them (a
  plain `ImageCompositeMasked` at the recorded x/y). Reason in the answers doc, § question 4.
- **`Input_Control_strength` normalises 0-1 → 0-1 here, not 0-0.5** as the SDXL master template
  does. Here the scribble IS the subject, not a hint over an existing composition.
- **Sampling is a fixed 1024x1024**, with the object scaled back down to the bbox `size` before
  the stitch, rather than sampling at the bbox size directly — a drawn region is an arbitrary
  side length and SDXL degrades below ~768.

## The blend pass — the open design question for session 2

The bench pipeline stamps a clean cut-out at the right place and scale. It does **not** make the
object belong to the photo: flat lighting, no contact shadow, no scene colour. Fabio's ruling is
that a Flow owes the user a **finished product**, so this is in scope here.

History: the brief said a *detailing* pass; MPI-454 moved that to an **edit model**; Fabio has now
confirmed the edit-model direction and is installing Boogu ImageEdit.

### The two candidate shapes

**A — stamp, then a localised edit over the region.** This is the pattern the app ALREADY runs for
localised edits, and `comfy_workflows/boogu_edit_balanced.json` already implements it:
`MpiMaskSquareBbox(padding 64)` → `InpaintCropImproved` → the edit sampler →
`InpaintStitchImproved`, gated by `MpiAnyChecker` on whether `Input_Mask` carries a path. Note that
graph uses the **same `MpiMaskSquareBbox`** this flow already uses, so the two compose naturally —
the square bbox is computed once and serves the crop, the stamp and the edit. Needs one
general-purpose blend prompt. Lowest new machinery by a wide margin.

**B — hand the edit model TWO images** — the region crop from the photo, and the stamp on its own
image — and ask it to place one into the other. Fabio's read is this gives the better result. It
also removes the "edit a thing that is already pasted badly" framing, which is a harder ask than
"put this object in this scene".

### What is actually known about Boogu and two images

- **Structurally it takes up to 16.** `TextEncodeBooguEdit.images` is a `COMFY_AUTOGROW_V3` input
  with slots `image_1`…`image_16`, `min: 0` (probed live on the bench, 2026-08-21).
- **Behaviourally it did NOT work.** Fabio tested two images when Boogu was first installed: *"It
  always messes up."* Its own tooltip agrees — *"Boogu focuses on one reference per sample; more
  are allowed."*
- The app's own graph wires **`images.image_1` only**.

So the slot count proves nothing, and shape **B** is **not** unblocked. That test was a while ago.

### Open questions — answer these FIRST in session 2

1. **ONLINE INVESTIGATION (do this first, it gates everything else): has Boogu gained real
   multi-image support since?** Upstream model/node updates, a different encode node, a community
   node, or a documented technique. If it has, Fabio's position is that Boogu then **beats Krea and
   Qwen outright and we simply use Boogu**. If it has not, shape **B** must run on Qwen Edit Plus
   (`TextEncodeQwenImageEditPlus`, already wired in `flow_head_swap.json` with two
   `MpiLoadImageFromPath` inputs and `FluxKontextMultiReferenceLatentMethod`) — which is the
   proven two-image path in this repo.
2. **A or B**, decided on bench output, not on argument.
3. **The general-purpose blend prompt.** Whichever shape wins, one prompt must work across most
   objects and scenes without per-case tuning. Starting points are below.
4. **Which model** carries the pass: Boogu, Qwen Edit, or Krea2.
5. **Ambiguity to resolve with Fabio:** he said *"Move all workflows that have added capabilities
   of this"* — dictation, meaning unclear. Best reading is "we already have workflows carrying this
   capability" (true: the Boogu and Qwen edit graphs). Ask before acting on it.

### Session 2 result — ANSWERED: shape B is dead, the winner is relight-then-composite

**Open question 1 answered: Boogu has NOT gained multi-image support.** Upstream model card
(Edit and Edit-Turbo, both re-read 2026-08-21) still says *"Only support 1 reference image for
now."* The NODE is innocent — `nodes_boogu.py` encodes every slot into vision tokens AND a ref
latent, dropping nothing. The real mechanism, which the MPI-257 research did not have: **Boogu
has no per-image addressing.** Qwen and Klein write `"Picture {i}: <|vision_start|>…"` into the
prompt per image (`nodes_qwen.py:100`); Boogu passes the list bare. There is no token for "the
second one", so no prompt can fix it. The "up to 4 refs" claim circulating online traces to
`dheeai/dhee-runner-boogu`, which 404s. So shape B could only run on Qwen or Klein.

**Klein two-image duplicated the object — because it was given no MASK.** `kleinEdit` with
Image 1 = stamped composite, Image 2 = the object cut-out produced a **SECOND tower**
(`mpi567_blend_p1_00001_.png`, 24.2s). ~~Klein's multi-ref is additive by design, do not
re-propose~~ — **that conclusion was WRONG and is struck.** It came from a matrix with a hole:
ref2 and mask were each tested alone, never together. Fabio named the real cause — with the
whole image and no localised area, "place this object" has nowhere to place it, so it adds one.
**Adding `Input_Mask` removes the duplication entirely** (`mpi567_place_place/fixperp`, 18.1s):
one object, photo preserved. Klein's multi-ref is usable here; it just needs a WHERE.

**What works — three findings that only make sense together:**

1. **Whole-image relight fixes the object but re-grades the whole photo** (`solo`, 12.2s). The
   tower relit correctly; the entire scene also went golden. Unshippable alone — a Flow may not
   restyle the user's photo.
2. **The masked crop/stitch path destroys the object** (`masked`, 10.4s). Photo preserved
   perfectly, but the tower came back a glowing blob. **Cropping removes the very scene the
   relight is supposed to match** — the model cannot match a grade it cannot see. This is the
   general law: *relighting is a global-reference op and cannot be done inside a crop.* It is
   also why `boogu_edit_balanced.json`'s existing localised-edit path is NOT the carrier here.
3. **So: relight whole-image, then composite only the region back.** Mask = where the composite
   differs from the source photo (exact, no bookkeeping), grown 48px to carry the cast shadow,
   feathered 24px. Result: `mpi567_BLEND_WINNER_klein_noglow_composite.png`. This feathers the
   BLEND REGION, not the cut-out edge — the MPI-454 no-feather ruling is about the cut-out and
   still holds.

**The prompt is load-bearing, and "add a shadow" backfires.** The first prompts asked for "warm
sunset light" + "add a cast shadow" and the model added a *lit dust cloud* at the base — a warm
halo that survived every mask size, because it was CONTENT, not a seam. Tightening the mask made
it worse. The fix was naming the shadow as dark and forbidding the glow outright:

> `relight the wooden watchtower to match the scene it stands in: darken it into the surrounding shade, cool its midtones to match the muddy ground, keep only a warm rim of sunset light on its right edge, and lay a soft dark cast shadow on the ground to its left. Do not add glow, haze, dust or light around it. Keep its shape, structure and proportions exactly as they are`

**THE FIXTURE WAS THE BIGGEST PROBLEM, and it invalidated half of the above.** Session 1's
battlefield plate is a steep **3/4-from-above** shot; the object SDXL renders is a **front
elevation**. No blend pass can reconcile a camera mismatch — every "it still doesn't sit"
finding on that plate was measuring the fixture, not the pipeline. Fabio caught it and supplied
a representative plate (an **eye-level** forest path), which is what a user actually produces
when they draw on their own photo: they draw in the photo's own perspective, so a front-view
object is the CORRECT projection. Re-run there, the blend works.

**Second correction from Fabio, and it relaxes the hardest constraint: the SDXL intermediate
does NOT need to survive the edit.** The user never sees it. So identity preservation is not
the bar — the bar is that the object lands at the drawn LOCATION in the scene's camera angle.
The earlier "identity drift is a blocker" note is downgraded accordingly.

**Result on the realistic fixture** (`mpi567_FOREST_WINNER.png`): the tower is darkened into
the forest shade, ferns and undergrowth overlap the legs, flag and structure intact, and the
photo — god-rays, lit path, dappled light — is untouched. It reads as photographed there.
Fixture builder: `<scratchpad>/make_forest_fixture.py`; runs: `run_forest.py`, `compose_forest.py`.

**Asking for OCCLUSION is what sells it.** *"let ferns and leaves overlap in front of the base"*
produced real foliage crossing the legs. A pure relight prompt never generates occlusion, and
occlusion is the strongest "this is really there" cue in a cluttered scene.

**The mask must be a FILLED RECT over the area, not the object silhouette** (Fabio, 2026-08-21
— the app's own localised-edit shape). A silhouette mask confines the denoise to the outline, so
the model can neither cast a shadow onto the ground nor let scene light fall across the object.
Note the Klein graph already squares the mask it is given (node 264 `MpiMaskSquareBbox`,
padding 64) — but squaring the CROP is not the same as filling the DENOISE region, which is why
the silhouette runs came back flatly lit. With a filled rect the forest result gains sunlight
across the roof, shade on the far face, and real leg shadows on the path.

**The prompt GENERALISES — no object noun, no scene noun.** Every earlier prompt hand-named the
tower and the scene, which is not shippable. This one line ran unchanged on both plates and
broke neither:

> `Place the object into the scene so it looks photographed there rather than pasted: match the scene's lighting direction, colour temperature, contrast and depth of field, let the scene's light and shadows fall across it, cast a natural shadow onto whatever it rests on, and let nearby foreground elements overlap its edges. Keep the object's shape and design.`

Evidence: `mpi567_gen_forest_00001_.png` (14.1s), `mpi567_gen_battle_00001_.png` (10.1s).
**Not yet proven** — two plates, one seed each. Fabio's stated expectation is that it will break
on other images, and that is the next thing to measure, not to assume either way.

**The predicted crop/stitch re-grade did NOT bite at this padding** (56px, 15-29% of frame) on
either plate — no rectangular seam. It remains the known risk of this path; sample more before
calling it absent.

### Break-test, 5 plates, Fabio's own drawing (2026-08-21) — the localised path FAILS

Driven end to end: his line drawing of a seated figure → the session-1 bench graph → the
blend. Plates chosen to break a single prompt: hard sun, overcast, night/sodium, interior
window light, and a **cel-shaded anime** plate (his point that "photographed" does not
translate to animated scenes — the wording was changed to *"looks like it was always part of
it"* + *"match the scene's art style"*).

**BLOCKER — the crop/stitch re-grades the patch, exactly as Fabio predicted.** Every blended
plate carries a visible lighter RECTANGLE around the object. It is worst where the background
is large and uniform — the dirt road and the anime rooftop make it blatant — and it appears on
BOTH preprocessor arms, so it is the stitch, not the render. **The localised
`InpaintCrop/Stitch` path is therefore not shippable for this flow as it stands.** Note the
earlier whole-image-relight-then-composite-back route did NOT show it, because the region is
returned by a feathered composite instead of a model-graded stitch. That is one candidate.

**THE RE-GRADE IS MODEL-SPECIFIC, and that reframes the whole model choice (Fabio,
2026-08-21).** It is a **Boogu and Klein** behaviour. **Qwen Edit does NOT usually do it.** So
the axis is not "which model is fastest" but "which model returns a patch that still matches
its surroundings" — and on that axis Qwen, previously ruled out for being slow, comes back into
contention. **Klein 9B is a HOPE, not a plan:** Fabio hopes it does not re-grade, but it is
unproven, another session is still working out whether it is even possible, and it is
**licence-gated (MPI-357) — verification is a real pain for most users**, which is a product
cost on top of the technical one. Do not design around 9B landing.

**Next measurement, in this order:** (1) whole-image relight → composite-back across all five
plates, confirming the rectangle is absent everywhere rather than on the two tried; (2) the
same five plates on **Qwen Edit**, to test Fabio's read that it does not re-grade — that is the
cheapest way to buy a shippable localised path without waiting on 9B.

**CANNY IS THE WRONG ARM FOR FLAT LINE ART — but it is NOT wrong in general.** With
`Input_Control_Net = 2` (canny) the user's ink outline SURVIVES into the render and the figure
reads as a coloured-in drawing. `= 1` (scribble) removes it completely and returns a clean
photoreal figure with the pose intact. Mechanism: canny detects EDGES and a drawn stroke has
TWO of them, so a 3px line becomes two parallel contours the model renders as an outline;
scribble thins the stroke to a centreline, so the model renders a FORM.

**Fabio's ruling on where canny DOES belong (2026-08-21): a SHADED PENCIL SKETCH** — a drawing
carrying tonal hatching and interior modelling, not flat contour lines (he supplied a graphite
figure study as the reference case). There the edges are real tonal structure and canny is the
right reader. So the acceptance line *"Canny for a clean structured drawing"* stands, but
"structured" means TONAL, not TIDY — and the step copy must say so, or a user with clean line
art will pick canny and get outlines. **Untested: the pencil-sketch case itself. Run it.**

**"Match the scene's art style" does NOT restyle the object.** On the anime plate the figure
came back fully photoreal on a cel-shaded rooftop. Root cause is upstream: stage 1 rendered on
`SDXL_Realistic`. **Fabio: "If you want anime, you gotta use ILL Anime. SDXL Realistic is
probably gonna have a real hard time doing it."** So medium is a MODEL-SELECTION problem, not a
prompt problem — which is precisely what the any-of picker is for, and it makes the picker
load-bearing for correctness rather than a convenience. The blend pass cannot rescue a medium
mismatch. **Untested: the anime plate re-run on the ILL Anime arm** — approved by Fabio, not
yet run; it doubles as a live exercise of the `Input_Base_Model` swap.

Runner: `<scratchpad>/run_e2e.py` (`MPI_CN=1` scribble / `2` canny), plates from
`make_plates.py`. Outputs `mpi567_e2e_{stamp,blend}_{arm}_{plate}_00001_.png`.

**Three traps for the wiring step:**

- **The session-1 `cutout` preview's ALPHA IS NOT A SILHOUETTE.** ~90% opaque, corners at 254,
  so `getbbox()` returns the whole frame and a crop silently does nothing (it cost two wrong
  fixtures here). The object is recoverable from the RGB as non-white pixels. The real pipeline
  stamps correctly, so it has a proper mask internally — but nothing downstream may read that
  preview file's alpha.

- **The edit pass CHANGES THE DIMENSIONS.** 896x1200 in → 880x1184 out (Klein snaps to ÷32), and
  the two axes do not scale by the same factor. Any composite-back must handle the resize, or the
  region lands a few pixels off.
- **Identity drift is NOT fully solved.** *"Keep its shape, structure and proportions exactly"*
  held the tower, but the pony lost its pennant and some barding detail. The identity clause needs
  strengthening before this ships — this is the open item, not a finished result.

Runners: `<scratchpad>/run_blend.py` (two-image), `run_blend2.py` (solo/masked/noglow),
`compose_blend.py` (the composite-back).

### Prompt starting points for the blend pass

Untested — bench them, do not ship them. Shape A (edit the stamped region):

- `blend the pasted object into the scene: match the scene's lighting direction, colour temperature and contrast, add a natural contact shadow where it meets the ground, keep the object's shape and identity unchanged`
- `make the inserted object look photographed in this scene, not pasted: correct its exposure and white balance to the surroundings, add grounding shadow and subtle atmospheric haze at matching depth, do not redesign the object`
- Terser, for a turbo/low-step tier: `integrate the object into the scene with matching light, shadow and colour grade`

Shape B (two images, place one into the other):

- `place the object from the second image into the first image at the same position and scale, matching the scene's lighting, colour and perspective, with a natural contact shadow`

The identity clause (*keep the object's shape unchanged* / *do not redesign*) is the part most
likely to be load-bearing — an edit model asked to "blend" will happily re-imagine the object, and
then the flow has thrown away the user's drawing, which is the one thing it must not do.

## Verification

**Verify mode:** user-ux

The whole point is that the rendered object reads as part of the photo. Fabio judges the bench
output by eye before any app work, and judges the finished flow the same way. The mechanical
half self-verifies (inject test, `node --check`, `flow-model-choice.test.cjs`, a live run
completing, the reuse round trip).

Bench = standalone ComfyUI on port **8188**; the app engine is **48188**. Drive the app with
`npm run app:isolated` — **never** the user's app on `:3000`.

## Preservation Notes

- **The bench graph is STAGED and openable.** ComfyUI workflow browser →
  `MPI-567_scribble_to_object` (posted to the bench's own store in API format, which frontend
  1.48.7 imports and auto-lays-out). Fixtures baked in at `D:\WORK\Images\Outputs\mpi567\`, so it
  runs as-is; three previews wired (hint / pre-stitch object / final). Repo copy of the same
  graph: `bench-graph.json` beside this plan. It is NOT yet a `raw/` template — that is part of
  the `/mpi-add-flow` step, and `raw/` is the user's to export.
- **`brief.md` § "Board note — why no umbrella" is STALE and will mislead whoever picks this
  up.** It lists MPI-552, MPI-560 and MPI-529 as three separate flow umbrellas; MPI-529 and
  MPI-552 (and MPI-530) were **merged into MPI-560 on 2026-08-16** at Fabio's request, which is
  the restructuring the note says has not happened. Heal it before or during implementation.
- Add `docs/playbooks/add-flow/existing-flows/scribble-to-object.md` — one file per flow is the
  convention; the bench answers to the four open questions belong there.
- `controlnet-union-sdxl` is a **per-model dep, NOT an `engineAsset`** — "GC'd when the last SDXL
  model uninstalls". The any-of `requiredModels` set is what keeps that honest; a flow that
  assumed the ControlNet was always present would break on a user with no SDXL installed.
- Sibling card **MPI-596** (Object Stamp Flow) is the same bench problem in a simpler form —
  extract an object, stitch it in, blend the seam. This card is the harder one and its four open
  questions ARE MPI-596's questions. Prove them here, apply them there. **Run them in one bench
  session.**
