# Scribble-to-object Flow — draw it, and the Flow renders it into the photo

Spec: [brief.md](brief.md) (Fabio's verbatim intent, 2026-08-16). **BENCH FIRST** — author and
prove the whole graph in the node graph, get Fabio's approval on real output, and only then wire
the app half via **`/mpi-add-flow`** (`docs/playbooks/add-flow/`).

**Model choice added 2026-08-21:** the base is **SDXL Realistic**, and the user may pick any
SDXL-family model. That was an open question in the brief ("possibly a user-facing model
selector — decide at the bench"); it is now decided, and the mechanism already exists.

## Current State

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

- **Fabio's sign-off on the bench output by eye** — the ONLY thing left in the bench half, and
  the gate on everything below.
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

## Verification

**Verify mode:** user-ux

The whole point is that the rendered object reads as part of the photo. Fabio judges the bench
output by eye before any app work, and judges the finished flow the same way. The mechanical
half self-verifies (inject test, `node --check`, `flow-model-choice.test.cjs`, a live run
completing, the reuse round trip).

Bench = standalone ComfyUI on port **8188**; the app engine is **48188**. Drive the app with
`npm run app:isolated` — **never** the user's app on `:3000`.

## Preservation Notes

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
