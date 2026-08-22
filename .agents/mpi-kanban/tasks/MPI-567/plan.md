# Scribble-to-object Flow — draw it, and the Flow renders it into the photo

Spec: [brief.md](brief.md) (Fabio's verbatim intent, 2026-08-16). **BENCH FIRST** — author and
prove the whole graph in the node graph, get Fabio's approval on real output, and only then wire
the app half via **`/mpi-add-flow`** (`docs/playbooks/add-flow/`).

**Model choice added 2026-08-21:** the base is **SDXL Realistic**, and the user may pick any
SDXL-family model. That was an open question in the brief ("possibly a user-facing model
selector — decide at the bench"); it is now decided, and the mechanism already exists.

## Current State

**2026-08-22, session 8 — THE SEAM IS A TRADE, NOT A TUNABLE BUG. All four candidate fixes ran;
none works. Blocked on a decision from Fabio before any further graph work.**

17 configs on sun/overcast/anime, runner `research/lanpaint/seamfix.py`, numbers in
`seamfix_results.json`, write-up in **[verdict.md](research/lanpaint/verdict.md)** § "The seam is
a TRADE".

- **Session 7's stated cause was wrong.** It guessed VAE round-trip + rescale drift.
  `edge_profile.py` disproves it: drift has no direction, but the signed diff is large and GROWS
  with depth into the box (sun right −19 → −33, overcast +9 → +14 on every edge). The model
  **re-grades everything the noise mask lets it touch**. `norescale` is byte-identical to base, so
  the rescale half of that guess was a no-op all along.
- **All four candidates are dead.** `mask_blend_pixels` caps at 64 (96/128 do not exist) and does
  nothing at 64; `denoise` is quantised away at 4 steps (`int(steps/denoise)`) and the values that
  bite destroy the shadow; the `ImageCompositeMasked` candidate is a **no-op by construction** —
  its mask is the box, which is what the stitch already blends with; and splitting crop from
  denoise mask is the right family but every variant lands on one trade curve.
- **The trade, quantified.** Confine the change → clean photo, sharp boundary, no shadow room.
  Spread it → soft boundary, re-graded photograph. `g192` is the ONLY config under the bar of 2
  (0.40 / 1.13 / 0.86) and it moves **21× more of the photo** (`far_mean` 3.2 vs base 0.15). Its
  low `edge_step` must not be quoted as a fix.
- **Three metrics flatter a big box and one does not.** `edge_step` is sampled at the box edge,
  `shadow_ratio` counts a re-graded field as shadow (overcast `g192` reads 2.05 on a green field),
  `outside` shrinks as the box grows. Use **`far_mean`** (`farglobal.py`), anchored to the object.
- **The feather mechanism itself is real** — a hard-mask control at the identical box scores
  14.44/12.50/13.87 vs `g096`'s 10.39/6.31/2.48. Best edge-per-photo-moved is `s096`. Still not
  under 2.

**Next action: ASK FABIO, do not keep tuning.** Reaching the bar needs the photo RESTORED where
the model only shifted tone — a real change mask compositing decoded over the original crop, which
is what the deleted ~25-node tail did. That is a structural call (THE ROOT-CAUSE RULE step 4), and
the alternatives are: accept a softer bar, or accept `s096`-class residual. **Do not start the
FlowDef until this is decided.**

---

**2026-08-22, session 7 — THE RELIGHT AND THE WHOLE COMPOSITE-BACK TAIL ARE DELETED. LanPaint
replaces them, measured on all five plates. The pipeline this card was built on has changed
shape, and it got smaller.**

Fabio brought [scraed/LanPaint](https://github.com/scraed/LanPaint) — a training-free inpainting
sampler — and two bench workflows using it (`LanPaint.json`, and `klein_t2i_template.json` with
LanPaint already wired behind an `MpiIfElse` on `has_mask`, crop-stitched). Measured verdict, the
runners and the numbers: **[research/lanpaint/verdict.md](research/lanpaint/verdict.md)**.

- **The route:** stamped composite + a BOX mask → `InpaintCropImproved` (context =
  `MpiMaskSquareBbox(mask, 64)`) → `SetLatentNoiseMask` → `LanPaint_KSampler` (4 steps, cfg 1.0,
  euler/simple, `NumSteps` 2, "Image First", "🖼️ Image Inpainting") → `InpaintStitchImproved`.
  Wiring copied from Fabio's two bench graphs, not invented.
- **Deleted:** the whole-image Klein relight AND the ~25-node tail (`ImageBlend`×2 + screen,
  `ImageToMask`, both `ThresholdMask`, both `GrowMaskWithBlur`, `MaskComposite`, the 100px
  proximity gate, the full-frame `ImageCompositeMasked`). The tail only ever repaired a global
  re-grade; there is no longer one.
- **The user's photo stops moving:** `outside` 0.04–0.36 against session 3's `bg_mean` 3.45
  (silhouette) / 10.34 (shadow-aware). Structural, not tuned — the stitch returns the original
  everywhere outside the box.
- **Speed is unchanged on 4B** (16.1s, same as the 74-node merged graph). **9B is better on all
  five plates at 1.9×** (30.1s) and needs `qwen_3_8b_int8_convrot.safetensors`, not 4B's
  `qwen_3_4b` — the mismatch dies with a shape error that reads as a LanPaint bug.
- **The box is now load-bearing UI, and it cuts both ways.** A tight box structurally cannot make
  a shadow (`shadow_ratio` 0.015–0.054); a generous box re-grades everything it contains
  (`far_frac` 0.68/0.66/0.43 on sun/overcast/anime). `auto` = +25% out, +60% down wins on all
  five. **The re-grade did not disappear — it moved under the user's control.**
- **`ring` on the changed region's own bbox is INVALID for this route** and must not be quoted;
  see the verdict's last section. Use `outside` and `far_frac`.

**Decided with Fabio the same day:** the flow gains a **`box` step** — `MpiStepBox` already
exists and already feeds `Mpi Box Mask` / `Mpi Box Crop`, so it is a data line, not a component.
Its `hint` asks for ROOM, never light direction (the model reads the scene's light itself; his
own road/woman test proved it). Auto-seed from the drawing's bbox. Crop-stitch is IN — it also
answers the small-subject-in-a-big-image case that made Fabio ask for it.

**🔴 OPEN DEFECT — THE BOX EDGE IS VISIBLE.** Fabio spotted seams in the sheets; confirmed at 1:1
with `edge_step` up to **30.84** (sun, auto) against the "under 2 is invisible" bar, and present
on `auto`, not just `generous`. **Every metric above missed it** — `outside` looks beyond the box
where the stitch guarantees the original, and `far_frac` returned `None` for `auto` because that
box has no far area, which I read as "cannot re-grade". ~~Probable cause is not the sampler: the
whole crop is VAE round-tripped and rescaled to 1024², so tone drifts inside the box and
`mask_blend_pixels: 32` is too narrow to hide it.~~ **DISPROVEN in session 8 — see
§ Current State. The cause is a directional re-grade of everything the noise mask allows,
and all four candidate fixes were run; none works.**

**Next action: NOT the app wiring.** Fix the seam first. Separately, Fabio has an agent
implementing 9B and the new 4B template, and LanPaint is landing in the shipped
`klein_t2i_template` — which means the node pin reaches every Klein op in the app, not just this
flow. The character-sheet flow also rides the 4B inpaint route, so that template is shared. See
§ Plan Drift.

---

**2026-08-22, session 5 — the MERGED RUNTIME GRAPH is built and proven; the app half is BLOCKED
on a step kind that does not exist.**

Session 4's handoff said "wiring only". That was wrong in a material way, and finding out cost
this session: **`bench-graph.json` is stage 1 ONLY** (36 nodes, ending at `SaveImage`). The blend
half had been proven with a PYTHON harness driving a *separate* graph (`klein_t2i.json` at
`Input_wf_type: 4`) plus PIL compositing. The two halves had never run as one graph — which
§ Session 3 requires ("ONE dispatch, `multiStage` stays false"), and which the app half cannot be
tested without, since `flow-model-choice.test.cjs` asserts every `modelParams` key names a title
that EXISTS in the flow's graph.

**Built it. 74 nodes, one dispatch, ~16s — and it beats the three-step route on every plate:**

| plate | merged (1 graph) | session 3 (3 steps) |
|---|---|---|
| sun | **0.42** | 0.91 |
| overcast | **1.03** | 1.13 |
| night | 0.45 | 0.33 |
| indoor | **1.09** | 2.53 |
| anime | **0.93** | 1.93 |

The Klein arm is faithful, confirmed positively: its relight moves the frame 18.08 mean abs
against session 3's 17.88 on the same plate. Staged on the bench as
`MPI-567_scribble_to_object_BLEND` (previews wired: stamped / relit / region); repo copy
`bench-graph-blend.json`.

**THE `raw/` RULE IS LIFTED (Fabio, 2026-08-22).** Agents may create and update
`comfy_workflows/raw/`. It was never really an ownership problem: the incident that hardened it
(MPI-272) was a user **Export (API)** mis-click, and the agent-side hazard — a bare
`workflow-to-api.mjs` run — was fixed in code by `assertNotInRaw()` (`f918c907`). What survives is
a FORMAT law: `raw/` is LiteGraph, never API JSON. Docs healed in
`docs/workflow-authoring/README.md`, `converters.md`,
`docs/playbooks/common/workflow-authoring-entry.md`, `docs/playbooks/add-flow/README.md`.

**…and the graph is now IN the repo, both halves — no export was ever needed.** There was no
LiteGraph anywhere (both copies were API), so one was made by loading the API graph into the
ComfyUI frontend — which auto-lays-out an API import — and reading `app.graph.serialize()` out of
memory. Nothing written to the bench, nothing queued. Shipped as
`comfy_workflows/raw/flow_scribble_object.json` (LiteGraph, 70 nodes / 109 links) and
`comfy_workflows/flow_scribble_object.json` (converted against the ENGINE on 48188,
`validate-injection-rules.mjs` clean). Commit `9c552cc6`.

**Two things the value-level diff caught, both invisible to a node/class comparison:**

1. **The bench-store copy is NOT the repo copy.** Bench = **74** nodes, 4 `PreviewImage` debug
   taps, `Output_Image` sitting on a *PreviewImage*. Repo = **70** nodes, `Output_Image` on a
   `SaveImage`. The repo copy is what produced the measured results and what ships. **Every "74
   nodes" in this plan and in every handoff refers to the bench copy** — do not correct the repo
   copy to match it.
2. **The ComfyUI editor QUANTISES float widgets.** `ThresholdMask` declares `step: 0.01`, so the
   round trip rounded the signed-off region thresholds `12/255 = 0.047058…` → `0.05` and
   `40/255 = 0.156862…` → `0.16`. Converts clean, validates clean, runs — on a threshold 6% off
   the one § Session 3's measurements were made against. Restored exactly in the raw file (nodes
   150 / 151), located by matching the rounded value rather than a hardcoded `widgets_values`
   index. **It comes back if anyone reopens that raw file in ComfyUI and saves.** Written up in
   `docs/workflow-authoring/bench-editing.md`.

Remaining input diffs against the proven graph: two `GrowMaskWithBlur.fill_holes` the converter
makes explicit at the engine's own default (`False`, confirmed against `/object_info`) —
behaviour-identical.

**🔴 HOLD — DO NOT WRITE THE FLOW (Fabio, 2026-08-22, end of session 6).** He has found an
**inpaint node** that looks strong and *may change the pipeline this card is built on*. Nothing
about the FlowDef, the op, or the two-slot `requiredModels` should be written until he has
described it. The graph and the step kind are both safe work regardless — they are inputs the new
node would reuse or replace, not commitments. **Ask him what the node is before planning around
it**, and note it may interact with the still-open Klein 9B thread above: both are candidates for
deleting the composite-back tail.

**Three translation traps, each silent and each returning a plausible wrong result** — all now
written up in `docs/playbooks/add-flow/blending-into-a-photo.md` so MPI-596 does not re-pay them:
`ImageBlend`'s `difference` CLAMPS at 0 rather than `abs()` (it cost the indoor plate its entire
composite — the flow read as if the blend did nothing); max-of-channels is not luminance and
over-selects (green alone tracks it); and a high threshold does NOT separate shadow from re-grade
without a PROXIMITY gate.

**One finding contradicts the settings table, and it is Fabio's call.** The published ring/fill
table came from `compose_back` — the SILHOUETTE region — while the settings table names the
SHADOW-AWARE region, which was only ever judged by eye on shadow quality. They were never crossed.
Measured on session 3's own frames, ungated shadow-aware costs 2-3x more movement in the user's
untouched photo (sun `bg_mean` 10.34 vs the silhouette's 3.45). **The 100px proximity gate is what
resolves it** — it keeps the shadow fix Fabio valued AND beats the silhouette route's seam. That is
what shipped in the graph; if he wants the photo protected harder, the gate drops to 60.

**OPEN THREAD FROM FABIO, 2026-08-22 (end of session 5): Klein 9B's LOCALISED edit does NOT
re-grade the image.** Results were coming in from the MPI-600 / 9B line as this session closed
(`e1b667a7` — "9B INT8 fits"). **This contradicts the headline conclusion in
`docs/playbooks/add-flow/blending-into-a-photo.md`** — *"Four model configurations, one
conclusion: stop looking for a model that returns a clean patch"* — which was measured on Boogu,
Klein **4B**, and Qwen at three tiers. 9B was never in that matrix (it was licence-gated and
explicitly out of scope: *"do not design around it"*).

If it holds, it is a genuine simplification, not a tweak: the localised crop/stitch route needs
**none** of the whole-image relight or the ~25-node composite-back tail this session built, and
`Input_Edit_Model`'s slot simply gains `klein-9b` as a candidate (which is MPI-598's job anyway).

**Do NOT swap the route on the eye call alone** — that is the exact mistake the doc's § Measuring
the rectangle exists to prevent: `border` coverage reads 0.034 on the WORST rectangle, and the
night plate under-reports because it is dark. Measure it with `ring_step` + `fill`, on the same
five plates, against the same stamps. Everything needed is already on disk and costs no new
authoring: `D:/WORK/Images/Outputs/mpi567/runners/` (`run_models.py` drives a localised arm,
`measure.py` scores it), the five plates, and the stamps. **Under ~2 ring is invisible; Klein 4B
localised scored 21.45 on sun.** Do that ONE run before touching the graph.

**2026-08-22, session 6 — THE `paint` STEP KIND IS BUILT AND PROVEN LIVE. The app half is
unblocked; the next action is the wiring itself.**

`MpiStepPaint` mounts `PaintManager` + `brushDab.js` — the History paint tool's own layer and
dab — on a plain canvas stage, exactly the relationship `MpiStepCrop` has with `CropManager`.
No second brush. It binds through `STEP_MEDIA` and returns the layer ALONE as an RGBA PNG at the
SOURCE's natural size. Contract: [`docs/playbooks/add-flow/ui/paint-gizmo.md`](../../../docs/playbooks/add-flow/ui/paint-gizmo.md).

**One frame change was unavoidable, and the handoff had not seen it: the graph takes TWO images.**
`Input_Image` (the photo) *and* `Input_Paint` (the layer). `_deriveRunMedia` could only REPLACE a
role's media, so a paint step bound to `image1` would have eaten the photo. A step may now declare
`mediaRole` — where its derived file lands — and the frame appends when that role has no media
yet. Omit it and nothing changes (`crop` still replaces). One word on the step, still no JS, still
manifest-expressible.

**Verified live in an isolated instance**, not by inspection — see `validation.md`. The load-bearing
numbers: layer comes back at the source's 1200×800 (not the layer's own working size), undo
restores a stroke to the byte (19529 opaque px → 32893 → 19529), Clear and undo-after-Clear both
hold, a fresh mount seeded with the value restores the identical drawing (the Reuse path), and an
unpainted step reports `paint: null` and derives no file.

**The last item leaves ONE obligation on the wiring**, and it is silent when got wrong: with no
drawing there is no `Input_Paint` file, so `MpiLoadImageFromPath` runs on its baked authoring path
and returns a confident wrong result. The frame cannot guard it — a null from `STEP_MEDIA`
legitimately means "nothing changed" for `crop` — so this flow must.

**2026-08-22, session 4 — nothing was wired. The session went to MPI-599 instead, and that was
deliberate: the picker this flow needs did not exist yet.** Fabio asked for a model picker per
PHASE of a flow's graph, and the shipped any-of mechanism could not express it — one pick per
flow, one unlabelled dropdown, and candidates offered only once two were already installed.
MPI-599 landed the slot shape (`740a8ef2`, `847d9978`, card in `doing/validating`), so this
card's wiring now writes the FINAL form and does not get rewritten later. § The model picker in
this plan is healed to match; its old "install a second SDXL model before judging the picker"
note is struck, because that gate is gone.

One open thread on MPI-599 belongs to Fabio, not to this card: he asked for a star + hover
tooltip on the recommended model and what shipped is the sparkle + the WORD inline. Cosmetic,
does not change anything this card writes.

**2026-08-21, session 3 — the shape decision is SETTLED: composite-back wins, on all five
plates and on the tiny case.** Two new constraints arrived from Fabio mid-session and both are
now measured, not assumed. Detail in § Session 3.

- **Composite-back leaves no rectangle anywhere** (fill 0.37–0.56 across five plates) while the
  localised crop/stitch rectangles on the same stamps (fill 0.94 / 0.92 / 0.88, one suspect at
  0.81, one under threshold on the dark night plate). Sheet: `mpi567_s3_SHEET_routes.png`.
- **`Input_Control_strength` 0.8 is TOO HIGH and must ship as a user control** (Fabio: *"this
  looks a lot, maybe too much, like the drawing itself"*). Measured default: **0.45–0.6**.
- **The tiny case passes on composite-back**, contradicting the prediction that a whole-frame
  relight would ignore a small subject. The localised route rectangles even there.
- **ILL Anime arm confirmed live** — cel-shaded figure on the anime plate vs photoreal on SDXL
  Realistic, from the same drawing. `Input_Base_Model` swap exercised positively.

- **The blend prompt is settled as `BLEND_PHYSICS2`** — conditional shadow physics plus an
  anti-glow guard, after v1's rim clause re-created session 2's halo failure.
- **The shadow-aware composite region fixes the clipped-shadow problem** Fabio thought was
  unfixable.
- **Qwen is OUT at all three tiers** (Hyper / Turbo / Quality). Turbo is its best arm and still
  re-grades, plate-dependently, at ~105s against Klein's 10-16s.
- **A floor exists and it is in STAGE 1:** below ~80-96px of DRAWN ink the render invents extra
  figures. Fabio's call, 2026-08-22: **warn in the step copy** (not auto-raise strength).
- **The shaded-pencil-sketch case is RUN and canny's niche is confirmed** — no ink outline on
  tonal input, and canny carries interior structure slightly better than scribble.

**SIGN-OFF GIVEN 2026-08-22** — *"Compared to what we had previously, these look very good."*
The bench gate is OPEN. Also decided in the same exchange: the shadow is **not** a user toggle
(the prompt already makes it conditional on the light, so a toggle re-introduces the
unconditional instruction this session removed), and the blend pass is **always on** (a Flow owes
a finished product).

**Session 3's findings are now DOCUMENTED, not just carded** — Fabio, 2026-08-22: *"cards get
deleted, I don't want to lose the information."*
- **[`docs/playbooks/add-flow/blending-into-a-photo.md`](../../../../docs/playbooks/add-flow/blending-into-a-photo.md)** — NEW, flow-agnostic: the three
  laws, the model comparison, how to measure the rectangle (and the two metrics that fail), the
  shadow-aware region, the shipping prompt, the graph tail. Written so **MPI-596 does not
  re-derive any of it**. Routed from `docs/README.md` and the add-flow README.
- **[`existing-flows/scribble-to-object.md`](../../../../docs/playbooks/add-flow/existing-flows/scribble-to-object.md)** — the flow-specific half: status, control
  strength, which preprocessor arm, the size floor.

**Next action: wire the flow** via `/mpi-add-flow`, using § Settings this session settled.

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

`requiredModels` entries are **slots**: `{ label, models }` declares a ROLE the graph plays a
model in, the flow runs on whichever candidate resolves, and the badge is satisfied by any one.
Shipped as MPI-590, generalised to N slots x N candidates by **MPI-599** — read
[`docs/playbooks/add-flow/any-of-models.md`](../../../../docs/playbooks/add-flow/any-of-models.md)
before writing a line of it.

**MPI-599 is what unblocked this flow's two-slot shape**, and it changed three things the table
below predates: slots are OBJECTS with a `label` (not bare arrays), the picker renders with
NOTHING installed (so Fabio installing one SDXL model no longer hides it — the note at the end of
this section is obsolete), and `models[0]` is the recommended candidate, starred in the dropdown.

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
requiredModels: [
  { label: 'Image model', models: ['sdxl-realistic', 'sdxl-nsfw', 'ill-anime', 'ill-anime-beauty', 'pony-mix'] },
  { label: 'Edit model',  models: ['klein-4b'] },   // grows to klein-9b (MPI-598)
],
modelParams: {
  'sdxl-realistic':   { 'Input_Base_Model': 'SDXL_Realistic.safetensors' },
  // …one arm per candidate, INCLUDING the recommended one — restate its baked value
},
```

The edit slot is written as a slot rather than the plain string `'klein-4b'` because it BECOMES
choosable the moment MPI-598 lands 9B: the shape is then already right and only the array grows.
A one-candidate slot renders no dropdown, so it costs the user nothing today.

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

**~~Ordering note:~~ OBSOLETE — MPI-599 removed the install gate.** It used to read: *the picker
renders only when more than one member is installed, so a single-model bench run shows no picker.*
That is no longer true, and it was the bug MPI-599 was opened for. The dropdown now lists all five
SDXL candidates whether or not any is on disk, so the picker can be judged on a machine holding
one model — or none.

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
- **The `paint` step kind, 2026-08-22 (session 6).** `MpiStepPaint` + its CSS, registered in
  `STEP_KINDS` and `STEP_MEDIA`; `FlowStep.mediaRole` in the frame and the FlowDef typedef;
  `docs/playbooks/add-flow/ui/paint-gizmo.md` (+ index and `carousel-frame.md` pointers).
  Proven live in an isolated instance — evidence in `validation.md`.
- **New trap filed** in `docs/workflow-authoring/bench-editing.md` § The traps: a part-downloaded
  weight is listed in `/object_info` under its final name and dies with a shape `RuntimeError`
  that reads like a corrupt checkpoint. Cost one wasted arm here. Gate on byte count + the
  absence of the `.cubricdl` sidecar, never on the dropdown.

## Remaining Work

Both bench gates are CLOSED, the `paint` step kind is BUILT, and the graph is in the repo in both
formats (§ Current State). What is left is app wiring only — **but it is ON HOLD**: Fabio's
inpaint-node find may change the pipeline, so the first move next session is to ask him what it is,
not to write the FlowDef.

- Wire the flow via `/mpi-add-flow` — FlowDef, the op in its 4 files, the two-slot
  `requiredModels` + `modelParams`, the declared fields (incl. the mandatory
  `Input_Control_strength` slider), the step copy's TONAL wording and its minimum-ink warning.
  The paint step is `{ kind: 'paint', role: 'image1', mediaRole: 'image2' }` (role names to match
  whatever the op's `mediaInputs` declares for `Input_Image` / `Input_Paint`), and the flow MUST
  guard the no-drawing case — see § Current State.
- Extend `tests/flow-model-choice.test.cjs` to this flow — it already pins that every
  `modelParams` key names a title that EXISTS in the flow's graph, which is the assertion that
  catches a five-arm `Input_Base_Model` typo.
- Live-run + reuse round trip per `docs/playbooks/add-flow/05-verify.md`. The picker no longer
  needs two SDXL models installed to be exercised (MPI-599), but a real ARM swap still does.
- Graphics (tile + hero) — a separate `/mpi-flow-graphics` pass once the flow runs.
- At close-out, heal the card's acceptance list: it still says *"Canny for a clean structured
  drawing"*, and canny's real niche is a TONAL/shaded drawing.

**Then MPI-596** (Fabio, 2026-08-22) — the next card after this one proves out. It is the other
consumer of `docs/playbooks/add-flow/blending-into-a-photo.md`, which session 3 wrote
flow-agnostic for exactly that reason.

## Plan Drift

- **THE BLEND HALF WAS REPLACED WHOLESALE (2026-08-22, session 7).** Sessions 2–5 spent their
  whole budget on one problem — a localised edit re-grades its crop, so the route had to relight
  whole-image and repair the collateral with a ~25-node difference-mask tail. LanPaint's noise
  mask removes the premise: unmasked latents survive the denoise, so there is nothing to repair.
  Everything sessions 2–5 measured about the tail is now **history, not guidance** — kept in this
  plan because the laws behind it (filled rect not silhouette; shadow physics conditional, never
  ordered; never calibrate on the dark plate) all survived the change and still bind. Evidence:
  [research/lanpaint/verdict.md](research/lanpaint/verdict.md).
- **THE RE-GRADE DID NOT GO AWAY — IT BECAME A UI PROBLEM.** An over-large box re-invents the
  photo inside it (`far_frac` 0.68 on sun). Sessions 2–5 fought this in the graph; it is now
  fought in the step's default box size and its `hint`. That is a better place for it, but it is
  the same failure and it is one drag-handle away at all times.
- **`Input_Control_strength` is unaffected** — it belongs to stage 1 (ControlNet), which this
  change does not touch. The 0.45–0.60 default and the ~80–96px ink floor both stand.
- **SCOPE ESCAPED THIS CARD.** LanPaint is being wired into the shipped `klein_t2i_template`, not
  into this flow's private graph, so the custom-node pin (`dev_configs/node_lock.json`) reaches
  **every Klein op in the app**. Fabio has a separate session doing 9B + the new 4B template.
  This card may CONSUME that template; it must not be the card that silently pins a third-party
  sampler into every Klein path. Overlaps MPI-598 and MPI-600 — MPI-600's verdict is explicitly
  held open pending "two repos Fabio found", which are this.
- **The frame gained `FlowStep.mediaRole` (2026-08-22, session 6).** Not in any plan or handoff:
  the merged graph takes TWO images (`Input_Image` + `Input_Paint`) and `_deriveRunMedia` could
  only REPLACE a role's media, so a paint step would have eaten the photo. `mediaRole` names where
  a `STEP_MEDIA` kind's file lands and the frame APPENDS when that role is empty. Absent, the old
  behaviour is byte-identical, so `crop` is untouched.
- **The drawing IS persisted, as a PNG data URL in `stepValues`** — the opposite of `crop`, whose
  derived file is deliberately stripped from the snapshot. The distinction is not arbitrary: a
  padded outpaint image is DERIVED (re-deriving it from the rect is correct, persisting it would
  outpaint an outpainted picture), while a drawing is an INPUT the user made by hand and there is
  nothing to re-derive it from. Cost is base64 pixels in the snapshot — 42 KB for the probe's
  scribble, marked `ponytail:` with the preview-asset upgrade path named.
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

### Session 3 (2026-08-21) — composite-back WINS, and strength becomes a shipped control

Runners: `<scratchpad>/bench.py` (shared), `run_shape.py`, `run_tiny.py`, `run_strength.py`,
`run_models.py`, `run_ladder.py`, `measure.py`, `crops.py`, `contact.py`.

**The seam is now a NUMBER, not an eye call — and the first metric was wrong.** A column-profile
step ratio could not tell the routes apart (0.246 vs 0.280) because the object's own pixels
dominate any whole-frame profile. Two measures do work, and both are in `measure.py`:

- **`fill`** — changed-pixel count over the area of the changed region's own bbox. A stitched
  rectangle returns the whole crop, so it FILLS its box (~0.9+); a feathered composite changes a
  round blob inside a square box (~0.4-0.55).
- **`ring_step`** — mean |difference| in a 12px band just inside that bbox edge. This is the one
  that matches the eye: the rectangle is visible precisely because that band is re-graded while
  the pixels immediately outside it are untouched. **Under ~2 is invisible.**

`border` was tried and is NOT usable — the localised rectangle scored 0.034 because the outermost
ring of the returned crop matches its surroundings even when everything inside it is re-graded.

**RUN (1) ANSWERED — the rectangle is absent on all five plates via composite-back.** Same
stamps, same prompt, same seed, only the route differs:

| plate | Klein localised | Qwen Hyper localised | composite-back |
|---|---|---|---|
| sun | ring 21.45 / fill 0.943 | ring 13.71 / fill 0.723 | **ring 0.91** / fill 0.425 |
| overcast | ring 15.56 / fill 0.916 | ring 14.06 / fill 0.926 | **ring 1.13** / fill 0.545 |
| night | ring 6.22 / fill 0.657 | ring 5.76 / fill 0.645 | **ring 0.33** / fill 0.368 |
| indoor | ring 11.01 / fill 0.811 | ring 10.68 / fill 0.735 | **ring 2.53** / fill 0.517 |
| anime | ring 10.74 / fill 0.875 | ring 8.78 / fill 0.455 | **ring 1.93** / fill 0.563 |

Sheet: `mpi567_s3_SHEET_routes.png` (localised row boxes on every plate; composite-back row does
not). Note the **night plate is the one that under-reports** — it is dark and low-contrast, so
the re-grade sits under the visible threshold there. Do not calibrate on night.

**QWEN DOES RE-GRADE — Fabio's read is NOT supported, and Quality is the WORST arm.** This was
the cheapest thing that could have unblocked the localised route, and it does not.

| tier | sun | overcast | note |
|---|---|---|---|
| Klein (reference) | ring 21.45 | ring 15.56 | |
| Qwen 3 = Hyper, 4-step, CFG 1.0 | ring 13.71 | ring 14.06 | melts the figure's legs on all five plates |
| Qwen 2 = Turbo, 8-step | ring 10.39 | ring 20.43 | best Qwen arm — figure intact, but plate-dependent |
| Qwen 1 = Quality, ~20-step, CFG 2.5 | **ring 22.94** | **ring 16.36** | fill 0.954 / 0.960 — a blatant box |

**Turbo was worth running and Fabio was right about it** — *"we also have the turbo tier for Qwen,
which sometimes fixes issues that the hyper tier has"*. It does: the melted legs are a Hyper
artifact and Turbo returns an intact figure with a far weaker box than Quality
(`mpi567_s3_QWENTIERS_sun.png`). It still does not remove the re-grade, and it is
**plate-dependent** — ring 10.4 on sun but 20.4 on overcast, against composite-back's 0.91 / 1.13.
**And it costs ~105s per plate against Klein's 10-16s**, which is a Flow-level cost on its own.

`mpi567_s3_SHEET_qwen_t1.png` shows the overcast Quality run as a hard brown rectangle over green
grass, worse than Klein's. **Tier is a runtime radio in this graph, not a model variant**
(`Input_Tier`: 1 Quality / 2 Turbo 8-step / 3 Hyper 4-step) and it **ships baked at 3**, so any
run that does not set it is measuring the fastest arm. Fabio asked for Turbo too — *"we also have
the turbo tier for Qwen, which sometimes fixes issues that the hyper tier has"* — queued.
`MPI_TIER=<n> python run_models.py qwen <plates>`.

**The takeaway is bigger than Qwen: the re-grade is not a model quirk to shop around for.** Three
models (Boogu, Klein, Qwen at two tiers) all return a re-graded patch. Stop treating "find a model
that does not re-grade" as a live path; the composite-back route is the answer because it never
asks a model to return a patch at all.

**The composite-back is a GRAPH TAIL, not an app-side step — checked against the bench's live
`/object_info`, 2026-08-21.** This matters for the wiring step: the bench proved the route with a
Python composite, which would otherwise imply a second dispatch, a `multiStage` op, or a new
server-side image service. None of that is needed. Every piece is a core node already registered:

| step | node |
|---|---|
| difference of the plate and the stamped composite | `ImageBlend` (blend_mode `difference`) |
| difference → mask | `ImageToMask` |
| binarise | `ThresholdMask` |
| grow + feather in one | `GrowMaskWithBlur` |
| take the region back | `ImageCompositeMasked` |

The shadow-aware variant adds one more: `MaskComposite` to union the silhouette mask with the
high-threshold "what the relight changed" mask. **So the whole flow stays ONE dispatch** — SDXL
stage 1, the Klein relight, and the composite tail in a single graph — and `capabilities.multiStage`
stays false. Verify each node's exact input names against `/object_info` when authoring; this
table records existence, not signatures.

### The shadow, and why the prompt must not ORDER one (Fabio, 2026-08-21)

Two separate faults, raised on the sun composite:

1. **The prompt ORDERS a shadow.** The session-2 wording ends *"cast a natural shadow onto
   whatever it rests on"*. An ordered shadow has no reason to agree with the scene's light, which
   is the wrong-direction shadow Fabio caught: *"the composite with the back sun shadow is not
   right at all"*.
2. **A shadow is not always correct at all.** *"Shadows aren't present in every image. If a
   subject is backlit right from behind them, it won't cast any shadows, it will just have a light
   silhouette around it. If the scene is lit from where the camera is, or the sun is at 12:00, the
   shadow might not be visible — it will be under the character."* So the clause has to encode
   **conditional physics**, not an instruction. Three arms are under test in `variants.py`:
   `withshadow` (session-2 wording), `noshadow` (silent), `physics` (the rule plus its exceptions,
   including the backlit rim case).

3. **The composite box CLIPS long shadows** — *"the box cutting shadows off, which is a known
   issue with long shadows with this technique. There's not much we can do about that, I think."*
   There is one thing: `compose_back` derives its region from the object SILHOUETTE grown 48px, so
   anything the relight drew beyond that is cut mid-shadow. `variants.compose_shadow_aware`
   derives it from **what the relight actually changed**, at a high threshold — the object and its
   cast shadow are a large local change, the global re-grade is a small one, so the threshold
   separates them and the shadow travels with the region.

#### RESULT — `physics2` + the shadow-aware mask. Both halves were needed.

Four prompt arms x two composite regions, on sun / indoor / night (chosen for their LIGHT, not
their look). `mpi567_s3_PR2_{sun,indoor,night}.png`.

- **The shadow-aware mask fixes the clipping.** Shadows now run out of the region instead of
  fading at its boundary. This is worth having even though Fabio expected nothing could be done.
- **`physics` v1 over-applied the rim and brought the GLOW BACK.** Asked for *"a rim of light"*,
  Klein drew a luminous OUTLINE around the figure on both night and indoor — and on indoor a
  plain cast shadow to the lower-right was the correct answer, which both other arms got. **This
  is session 2's dust-cloud failure from the opposite direction:** name a light effect and the
  model draws a halo. Session 2 cured it by forbidding glow outright; v1 re-introduced it by
  asking for one.
- **`physics2` fixes it** with two changes: edge light is described as something the object's OWN
  EDGES do rather than something added around it, and session 2's anti-glow guard is restored
  (*"Do not add glow, haze, or an outline of light around it"*). Indoor loses the halo and gets
  the correct lower-right shadow; night loses the outline and gains subtle warm edge light off
  the road reflections; sun keeps a grounded shadow.

**The shipping prompt** (`variants.BLEND_PHYSICS2`) — still no object noun and no scene noun:

> `Place the object into the scene so it looks like it was always part of it, not pasted on: match the scene's lighting direction, colour temperature, contrast and art style, and let the scene's light and shadows fall across it. Ground it with contact shading where it meets the surface. Any cast shadow must follow the scene's own light in direction, length and softness; if the light is overhead or comes from behind the camera, keep the shadow small and directly beneath it, and if the light comes from behind the object, let its own edges catch that light instead of casting a shadow toward the camera. Do not add glow, haze, or an outline of light around it. Let nearby foreground elements overlap its edges. Keep the object's shape and design.`

**Fabio's read of the sheets, 2026-08-22 — `physics2` CONFIRMED:** *"the best light shadow is
number 2 and 4 ... number three: the rim also looks good, but obviously it's a special case on
very special images where the light is behind the character. Compared to what we had previously,
these look very good."* Panels are 1 stamp / 2 `withshadow` / 3 `physics` v1 / 4 `physics2`.

So panels 2 and 4 are both acceptable on shadow quality, and v1's rim is only right for a truly
backlit subject. **`physics2` is the pick because it is the only arm that does BOTH** — it lands
the same shadow as `withshadow` where the scene calls for one, and switches to edge light when
the light is behind. `withshadow` cannot: it orders a shadow unconditionally. v1 is the same
behaviour with the rim turned up too far, which is what produced the halo.

**Why the conditional wording is load-bearing** (Fabio): *"shadows aren't present in every image.
If a subject is backlit right from behind them, it won't cast any shadows, it will just have a
light silhouette around it. If the scene is lit from where the camera is, or the sun is at 12:00,
the shadow might not be visible."* The session-2 prompt ORDERED a shadow, so it produced one
whether or not the scene called for it — including the wrong-direction shadow on the sun plate,
whose own grass tufts and stones cast SHORT shadows to the LEFT (sun high, slightly right of
camera) while the blend drew a long one to the right.

### The shaded-pencil-sketch case — RUN, and Fabio's canny ruling HOLDS

The last untested item from session 2. Same plate, same seed, same strength (0.5), same subject
prompt; the only difference is `Input_Control_Net`. Input is a **graphite study with tonal
hatching**, not flat line art. `mpi567_s3_PENCIL_sun.png`, runner `run_pencil.py`.

**Both arms return a clean photoreal figure and NEITHER leaves an ink outline.** That is the
finding: the flat-line-art failure — a 3px stroke read as two parallel contours and rendered as
an outline — **does not occur on tonal input**, because a shaded drawing's edges are real form
boundaries rather than the two sides of a drawn line. Canny is safe here.

**Canny is also the better arm on this input**, mildly: it carries more interior structure
through (denim folds, and the shirt graphic renders as a structured motif where scribble
flattens it to a plain shape). That is exactly what "reads tonal structure" should look like.

So the acceptance line *"Canny for a clean structured drawing"* stands, and the step copy must
say **TONAL, not TIDY** — a user with clean line art who reads "structured" as "neat" will pick
canny and get their own ink back.

**Fixture caveat:** no real graphite study was available in this tree, so stage 0 renders one on
the bench with a minimal 7-node SDXL t2i graph. The flow graph itself CANNOT stand in for that —
with no paint layer the drawn bbox is empty and `AIO_Preprocessor` dies with
`ZeroDivisionError: float division by zero`. Worth re-running once against a real user sketch.

### Settings this session settled — carry these into `/mpi-add-flow`

| setting | value | why |
|---|---|---|
| `Input_Control_strength` default | **0.45-0.60** (not the bench's 0.8) | at 0.8 the ink renders as garment seams; at 1.0 as straps |
| `Input_Control_strength` exposure | **user-facing slider, mandatory** | correctness, not convenience — Fabio's "same as the original workflow" |
| blend route | **whole-image relight -> composite back** | the only route with no rectangle, on every plate and every object size |
| composite region | **shadow-aware** (silhouette UNION strong-change) | the silhouette-grown region clips long shadows |
| blend prompt | **`BLEND_PHYSICS2`** | conditional shadow physics, anti-glow guard |
| blend model | **Klein 4B** | 10-16s vs Qwen's 105s, and Qwen re-grades at all three tiers |
| minimum drawn height | **~80-96px of ink**, **warned in the step copy** | below it stage 1 invents extra figures; Fabio chose the warning over auto-raising strength, 2026-08-22 |

**THE TINY CASE PASSES on composite-back, against the prediction.** Fabio, 2026-08-21: *"you
would be able to draw two characters in this scene at the far corner of the building, very tiny
characters, which obviously would need a localised edit."* The prediction was that a whole-frame
relight would have too few pixels to work with. At **8.4% of frame height (97px)** it did not:
composite-back fill 0.63 (anime) / 0.49 (sun), no rectangle, real cast shadows, figures grounded
— while the localised route rectangled even there (fill 0.914 / 0.916). `mpi567_s3_TINYCROP_*`.
**…but there IS a floor, and it is in STAGE 1, not the blend — the opposite of the prediction.**
The ladder (8.4 → 5.5 → 3.5 → 2.2% of frame height, `mpi567_s3_LADCROP_sun_*.png`) never produced
a rectangle at any size (fill 0.49 → 0.25), so the composite-back route holds. What fails is the
render:

| drawn height | stage 1 | blend |
|---|---|---|
| 96px (8.4%) | correct — two figures, clean | grounded, real shadows |
| 63px (5.5%) | **distorted, plus a spurious third figure** | shadows added to the wrong shapes |
| 40px (3.5%) | **three figures where two were drawn** | a fourth dark shape merges in |
| 25px (2.2%) | flat, cut-out | **hallucinates a third figure with its own shadow** |

**Mechanism:** stage 1 crops the drawn bbox and samples it at a fixed 1024. That is what makes a
small drawing render at high resolution — but it also means the CONTROL HINT is upscaled from
whatever the user drew, so a 25px-tall figure becomes a blurred hint at 1024 and SDXL invents to
fill it. The floor is therefore set by **how much ink the user actually drew**, not by the
object's share of the frame.

**Working floor ≈ 80-96px of drawn height.** This is a real limit on Fabio's "very tiny
characters at the far corner" case and it needs a product answer — the honest options are a
minimum-ink warning in the step copy, or raising `Input_Control_strength` automatically for a
small drawing (untested). **Do not claim the tiny case works without this caveat.**

**`Input_Control_strength` — measured, and it must be a user control.** Fabio, 2026-08-21, on
the sun result: *"this looks a lot, maybe too much, like the drawing itself. The strength control
that we have on the original workflow needs to be the same for this flow."* Swept 0.30 / 0.45 /
0.60 / 0.80 / 1.00 on one plate, everything else fixed (`mpi567_s3_STRENGTH_sun.png`):

- **0.30-0.60 — correct.** Photoreal figure, plain garment, pose held.
- **0.80 (the bench default) — the ink starts becoming CLOTHING.** The drawn neckline renders as
  a real V-neck seam and the sleeve strokes as garment edges.
- **1.00 — worst.** The drawn lines come through as straps across the chest.

**Ship 0.45-0.60 as the default, not 0.8.** The mechanism is worth stating because it is not
obvious: the drawing's SHAPE survives far below the strength at which its LINES start being
rendered as objects — the pose is still correct at 0.30. So a lower default costs nothing and a
high one silently converts ink into detail. The knob already exists (`Input_Control_strength` →
`MpiNormalizeValue` → `ControlNetApplyAdvanced.strength`, `capabilities.controlStrength: true`);
this makes exposing it a CORRECTNESS requirement, not a convenience.

**ILL Anime arm confirmed live (RUN 2).** Same drawing, same plate, `Input_Base_Model` swapped to
`ILL_Anime.safetensors`: a cel-shaded figure that matches the plate's art style, against the
photoreal one SDXL Realistic returns (`mpi567_s3_ARMCROP_anime.png`). frac=0.060 of the FRAME
changed — which reads low only because the object occupies ~16% of it; 0.000 is what a dropped
title looks like, so this is the positive confirmation. Fabio's ruling stands: **medium is model
selection, and the blend pass preserves the medium it is given.** Minor: the ILL Anime shirt
carries gibberish lettering, an SDXL-family text artifact, not a pipeline fault.

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
