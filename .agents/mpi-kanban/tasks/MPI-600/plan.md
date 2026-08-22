# MPI-600 — bench protocol

Read `brief.md` first. This file is the runnable protocol. **No app code is edited on this
card** — this is bench work on the standalone ComfyUI install, and the deliverable is a
verdict plus a numbers table in `research/`.

## Where it runs

| | |
|---|---|
| Bench | standalone `G:\ComfyUi`, **port 8188** (the app engine is 48188 — do not confuse them) |
| Outputs | **`D:\WORK\Images\Outputs\klein_9b`** — set this on every SaveImage node, every arm |
| GPU | RTX 4060 Ti, 16380 MiB — see Leg 0 |
| Weights | `G:\CubricModels\...` per the bench's `extra_model_paths.yaml` |

The bench's default output root is `D:\WORK\Images\Outputs`, **not** `<ComfyUI>\output`. This
card writes to the `klein_9b` subfolder of it so 48 runs do not scatter through Fabio's
general output pile. Sub-path per arm — `klein_9b/base`, `klein_9b/base-turbo`,
`klein_9b/distilled`, `klein_9b/kv` — so a filename alone identifies the candidate.

Do not run any of this against the user's live app on :3000.

## The bench workflow — already built, do not author a new graph

Fabio's call 2026-08-22: **reuse the shipped Klein 4B template.** `research/klein_9b_bench.json`
is a copy of `comfy_workflows/klein_t2i.json` with the 9B swaps applied — 9B transformer, the
Qwen3-**8B** encoder, the 4B LoRAs neutralised, steps/cfg as per-run literals, and `SaveImage`
writing under `klein_9b/<arm>/`.

**`research/README.md` is the operating manual** — the per-arm settings table, the node ids for
every knob, and the trap that every LoRA baked into that graph is a **4B** LoRA (node 38 fires on
every run and had to be bypassed). Read it before touching the JSON.

The turbo LoRA needs **no graph surgery**: `Input_Lora_1` (node 99) is a free `MpiLoraModel` slot
already in the model chain. Set its `lora_name` and `strength_model` and leg A's sweep is done.

Three things are still owed before the first scored run, all listed at the end of that README:
the LoRA loading on an INT8 base at all, the `FluxKVCache` node for the KV arm, and one warm
1024² run proving the graph executes on 9B.

---

## Leg 0 — decide the weight FORMAT (blocking, do this first)

bf16 9B is ~29 GB and this card has 16 GB. Nothing else on this plan can start until we know
what actually loads and runs here.

**INT8 ConvRot exists for all three arms — bench it, do not default to fp8.** This is the same
quantisation family as the 4B weight we already ship
(`flux-2-klein-4b-int8-convrot.safetensors`, `wraps/FLUX.2-klein-4B-INT8-ConvRot-ComfyUI`), and
community reports put INT8 ConvRot at roughly **2x fp8 speed with equal or better quality** on
consumer Ada cards. That is exactly this bench's hardware class, so it is not a footnote.

| Arm | INT8 ConvRot file | Size | Source |
|---|---|---|---|
| base 9B | `flux-2-klein-base-9b-int8-ConvRot.safetensors` | 9.41 GB | `bertbobson/ComfyUI-INT8_ConvRot`, also `obsxrver/ComfyUI-Native-INT8_ConvRot` |
| distilled 9B | `flux-2-klein-9b-int8-convrot.safetensors` | 9.43 GB | `Winnougan/Klein9b-Distilled-Base-INT8-Convrot`, also `obsxrver/`, `Sakujo/FLUX.2-Klein-9B-INT8-ConvRot` |
| KV | `flux-2-klein-9b-kv_int8_convrot.safetensors` | 9.43 GB | `Winnougan/Klein9b-Distilled-Base-INT8-Convrot` |
| text encoder | `qwen_3_8b_int8_convrot.safetensors` | 9.44 GB | `Winnougan/Klein9b-Distilled-Base-INT8-Convrot` |

`Winnougan` carries distilled + KV + the text encoder from one quantiser, which is the
comparable pair for leg C. Base has to come from a different repo — **note that in the results
table**, because a cross-quantiser difference is a confound leg A cannot separate from a real
base-vs-turbo difference.

The fp8 alternatives, which is what the ComfyUI templates ship (confirmed from Fabio's
screenshots 2026-08-22):

- `flux-2-klein-base-9b-fp8.safetensors` · `flux-2-klein-9b-fp8.safetensors` · `flux-2-klein-9b-kv-fp8.safetensors`
- CLIP `qwen_3_8b_fp8mixed.safetensors`
- VAE `full_encoder_small_decoder.safetensors` **or** `flux2-vae.safetensors` — see the warning below

GGUF is the third option if both fail: `unsloth/FLUX.2-klein-9B-GGUF`,
`unsloth/FLUX.2-klein-base-9B-GGUF`, `QuantStack/FLUX.2-Klein-9B-KV-GGUF`.

**The INT8 custom-node question is CLOSED — do not re-litigate it.** Settled 2026-08-22 without
a bench run: `G:\CubricModels\diffusion_models\` already holds **six** int8_convrot weights in
production use — `flux-2-klein-4b`, `krea2_raw`, `ltx-2.3-22b-distilled-1.1`,
`lustify-v10-krea-raw`, `qwen_image_edit_2511` — and `dev_configs/node_lock.json` pins **zero**
INT8 custom nodes. Core ComfyUI loads this format natively. The `ComfyUI-INT8-Fast` writeups
predate core support, exactly as Fabio read them.

**So INT8 is the decided format** (Fabio, 2026-08-22: "if int8 exists, we're going to go with
int8 for everything"). Leg 0 is now a *confirmation*, not a bake-off.

**Steps:**

1. Load `flux-2-klein-9b-int8-convrot.safetensors` + `qwen_3_8b_int8_convrot.safetensors` and run
   one 1024² edit. Record wall clock and peak VRAM.
2. Peak VRAM should land near **~9.5 GB** — ComfyUI loads the text encoder, encodes, unloads,
   then loads the transformer, so the two ~9.4 GB residents are not concurrent. If a read shows
   both resident at once, that is the finding and INT8 does not fit either.
3. Only if INT8 fails on 9B, fall back to fp8 (`flux-2-klein-9b-fp8` + `qwen_3_8b_fp8mixed`) and
   say so loudly — that would contradict a decision already taken.
4. **All four candidates run in INT8.** A base at fp8 against a distilled at INT8 is not a
   comparison.

**Exit condition:** INT8 confirmed running at 1024² on this card, peak-VRAM figure written into
`research/format.md`, plus the fixed CLIP and VAE names.

If nothing fits at usable speed, **stop and report** — that is a finding, and it means 9B is
not shippable to 16 GB users regardless of which variant wins. Do not silently move the bench
to a rented Pod: a 5090 number does not describe our users.

### Hold CLIP and VAE constant — the templates disagree with each other

Fabio's three template screenshots do **not** agree on the VAE: the `Image Edit (Flux.2 Klein
9B)` nodes name `full_encoder_small_decoder.safetensors`, while the separate `Load VAE` node in
the KV graph names `flux2-vae.safetensors`. Those are different decoders and they will produce
visibly different output.

Pick **one** CLIP and **one** VAE, write both into `research/format.md`, and use them on every
run of every leg. A VAE that changes between arms invalidates the seam/lighting axis outright —
which is the axis this whole card exists for.

---

## The scenarios (4) — fixed across every leg

Same source images, same prompts, same seeds, same output resolution for every candidate.
Write them once into `research/scenarios.md` and never edit them mid-bench.

| # | Scenario | What it stresses | Pass looks like |
|---|---|---|---|
| 1 | **Object / character replacement** | swapping a subject while the scene survives | new subject reads as belonging; background, perspective and camera unchanged |
| 2 | **Clothing replacement** | garment swap on a held identity | face, hair, pose, body proportions untouched; fabric follows the real body |
| 3 | **Localised edit — seam + lighting integrity** | *the screenshot failure* | **no visible box**, no exposure/contrast step at the edit boundary, global lighting untouched outside the mask |
| 4 | **Character pose change** | re-posing while identity holds | same person, same clothes, same scene; anatomy correct at the new pose |

Scenario 3 is the one this card exists for. Build it deliberately: a plate with **obvious
directional light and a flat, unforgiving ground plane** (the dirt-road screenshot is exactly
right), then a localised edit inside it. A busy, high-frequency plate hides the seam and
wastes the test.

**Seeds:** 3 fixed seeds per scenario. One seed cannot separate "the model does this" from
"that seed did that". 4 scenarios × 3 seeds = **12 runs per candidate**.

---

## The legs

Run in order. Each leg's loser is dropped and never re-run.

### Leg A — 9B base vs 9B base + turbo LoRA, swept by strength

Tests Fabio's intended shipping shape: does the turbo LoRA give a *usable* quality/speed trade?

**Read this before designing the leg — it changes the shape.** anyMODE built the LoRA by
**subtracting Klein-base from Klein-distilled and decomposing the difference into a LoRA**. It
is the distillation delta, not an independently trained accelerator. Two consequences:

- **LoRA strength is a continuous dial between base and distilled.** At strength 1.0 it should
  approximate the distilled weight *by construction*. This is exactly the quality/speed control
  Fabio wants — and it is a slider, not a boolean.
- So a binary "on/off" leg wastes the interesting middle. **Sweep the strength.**

| Arm | Strength | Steps | CFG | Source of the numbers |
|---|---|---|---|---|
| base | — | ~50 | real cfg (negative prompt live) | BFL base defaults |
| base + turbo | **1.0** | 8 | 1.0 | community-reported |
| base + turbo | **0.7** | 8–12 | 1.5 | **author's own recommendation** |
| base + turbo | **0.25–0.5** | 8 | 3.5 | community "quality-focused" |

Run the full 4-scenario × 3-seed set at the author's 0.7/1.5 setting and at 1.0. Sample the
0.25–0.5 band on scenario 3 only unless it shows promise — that band is a quality play, and
scenario 3 is the quality axis that matters here.

**This leg decides whether `turboToggle` should be a toggle at all**, or a strength slider. Say
which in the verdict; MPI-598 wires whatever this concludes.

### Leg B — 9B base + turbo LoRA vs 9B distilled

Both arms are ~4–8 step. **Given how the LoRA was made, base+turbo@1.0 ≈ distilled is the
expected result, not a surprise.** So the real question is not "which wins at 1.0" — it is:

1. Does base+turbo at 1.0 actually reproduce distilled? If it does **not**, one of our
   assumptions about the LoRA is wrong and that is the finding.
2. **Do intermediate strengths buy quality the distilled weight cannot reach?** If yes, shipping
   base + LoRA gives users a real dial and Fabio's plan holds. If every strength is either worse
   than distilled or indistinguishable from it, the two-weight plan collapses into one distilled
   checkpoint and MPI-598 gets much smaller.

That second question is the whole point of the leg. Do not settle it on speed alone.

### Leg C — 9B KV vs the leg-B winner

**Editing scenarios only** (1–4 all carry a reference; there is no t2i arm here — see brief § KV).

- Run the leg-B winner and `9b-kv` on identical inputs.
- Two things are being measured, and they are separate:
  - **quality parity** — is KV's output equivalent to the winner's, or does caching cost
    fidelity? If KV is a free speedup, outputs should be near-indistinguishable.
  - **actual speedup on our shape** — record **reference count and output resolution on every
    row**. Expect ~1.40x at 1 ref / 1024², not 2.5x.
- If leg C dies at the sampler with `timestep_zero_index`, check the `FluxKVCache` node wiring
  before suspecting the download (brief § KV point 4).

---

## What to record per run

One row per run in `research/results.md`:

`candidate | format | scenario | seed | steps | cfg | out-res | #refs | wall-clock | peak VRAM | output path`

Plus a 1–5 score on **four axes, scored independently**:

1. **Instruction adherence** — did it do the asked edit
2. **Preservation** — is everything outside the edit untouched
3. **Seam / lighting integrity** — the scenario-3 axis, scored on *every* run not just scenario 3
4. **Artifacts** — hands, text, texture mush, duplicate limbs

Do not collapse these into one number. A model can win adherence and lose the card on axis 3.

## Timing traps — every one of these yields a confident wrong number

- **`execution_cached`.** Same seed + same graph = ComfyUI serves from cache and the wall clock
  is a lie. Read `execution_cached` in the `/history` entry; use the two-run trick to prove
  execution positively.
- **Run 1 after a weight swap is not warm.** Discard it. Compare warm against warm.
- **Confirm the resolution actually used** before trusting a series — a silently different
  output size invalidates the whole column, and it is exactly what a resolution-scaled KV
  speedup would be blamed on.
- **Peak VRAM must come from a sampled read**, not from a single `nvidia-smi` after the fact.

---

## Deliverable

`research/verdict.md` answering exactly four questions:

1. Which **format** ships (Leg 0) — **INT8 ConvRot or fp8** — does it load natively, and does 9B
   fit a 16 GB card at all?
2. Does the **turbo LoRA** earn its place — is `turboToggle` a real control or a bad one?
3. **One checkpoint or two?** (i.e. does Fabio's base+turbo plan survive Leg B)
4. Is **KV** a free speedup on our edit shape — and what is the honest multiplier at 1 ref / 1024²?

Then post the verdict onto **MPI-598** as an event + a brief section, and move this card to done.

## Out of scope — do not drift into these

- Any edit to `models.js`, `modelDeps.js`, `licences.js` or `klein_t2i.json`. That is MPI-598.
- Anything about Klein **4B**. Different model, already shipped, not a control here.
- R2 staging / hashing the winning weight. MPI-598 owns that once a winner exists.
- Turbo plumbing in the graph. Already built (`Input_is_Turbo`, node 52) — this card supplies
  the numbers it needs, not the wiring.


---

## Completed

- **Leg 0 (2026-08-22)** - INT8 ConvRot confirmed running at 1024x1024 on the 4060 Ti, both
  branches (t2i and kleinEdit). Peak VRAM, the fixed CLIP and the fixed VAE are in
  `research/format.md`. fp8 is not needed; the format question stays closed.
- `research/run.py` written - the bench runner for every remaining leg. Queues
  `klein_9b_bench.json` on :8188 with `--set NODE.input=value` knobs, samples GPU memory
  through the run, and reports peak, wall clock, `execution_cached` and the files that landed.

## Current State

Leg 0 is closed and the bench is proven end to end. Three images exist under
`D:\WORK\Images\Outputs\klein_9b\leg0\`: two t2i plates and one edit off the second plate.

**The next action is the scenarios**: write the 4 stress scenarios + 3 fixed seeds into
`research/scenarios.md`, then run Leg A. `t2i_00002_.png` is already a usable **scenario 3**
plate - harsh directional light, a long hard shadow, and a flat unforgiving dirt ground, which
is exactly the shape the plan asks for. Reuse it rather than generating another.

Things found this leg that are not obvious from the diff:

- **Peak VRAM is ~14.1 GB, not the ~9.5 GB this plan predicted.** It fits a 16380 MiB card with
  roughly 690 MiB spare. Shippable, but the margin is thin - a note MPI-598 owes its users.
- **A VRAM read is a lie unless you free the bench first.** `nvidia-smi` per-process is `[N/A]`
  on Windows/WDDM, and the bench keeps its `cudaMallocAsync` pool between runs, so the previous
  run's pool shows up in the next run's "idle" baseline. `POST /free` -> sample the floor -> run.
  Full write-up in `research/format.md`.
- **`MpiClearVram` (node 570) does NOT force a cold run** (Fabio, 2026-08-22). It offloads
  VRAM->RAM and leaves the weights in RAM, so the next run reloads from RAM rather than disk.
  Runs stay warm and every arm pays the same constant transfer. Leave it in the chain.
- **`FluxKVCache` is already registered** on the bench - Leg C needs no node install.
- **`MpiAnySwitch10` is genuinely lazy**, so `Input_wf_type` executes exactly one branch and a
  t2i run cannot touch the 4B LoRAs sitting on the control and fill branches.

## Plan Drift

- **2026-08-22** - Leg 0's predicted "~9.5 GB peak, because the encoder unloads before the
  transformer loads" is **wrong as measured**: 14181 MiB on t2i and 14074 MiB on the edit. The
  overlap is partial, not absent. The leg's exit condition is still met (INT8 runs at 1024 on
  this card) - only the predicted figure was off.
- **2026-08-22** - Leg 0 ran as *two* runs rather than one: a t2i at 1024 to prove the graph
  executes on 9B (README's owed item #3) and to produce an edit source, then the plan's 1024
  edit off that output. No scenario plates existed yet, so the t2i had to come first.
- **2026-08-22** - two of README's three "still owed" items closed for free: `FluxKVCache` is
  present, and the CLIP/VAE ambiguity settles itself because
  `full_encoder_small_decoder.safetensors` is not on disk. Only "does the turbo LoRA apply to an
  INT8 base" is still owed, and that is Leg A's first run.


## Plan Drift (cont.)

- **2026-08-22, scenario 3 reshaped by Fabio** - the localised edit is not a `wf_type` 4 run with
  a small prompt. It is **`wf_type` 5**, which takes a **mask**, green-fills the masked region and
  stitches the regenerated patch back. One good use is **placing a character into a base plate**,
  which is also the cleanest test of whether the model shifts the colouring around it. Scenario 3
  is therefore a masked run, and `Input_Mask` (node 298) joins the fixed inputs.
- **2026-08-22, the 4B-LoRA trap moved** - `research/README.md` claimed node 259
  (`flux2-klein-4b-outpaint`, strength 1.1) sat on a branch the bench does not run. Adding
  `wf_type` 5 made that false: the inpaint branch reaches 259 unconditionally. Bypassed as edit #8
  (`254.model` and `278.model` -> node 100). All three branches now reach zero
  `LoraLoaderModelOnly`. The README has been corrected.
- **2026-08-22, scenario 3 is now scored by measurement** - `research/seam.py` replaces an opinion
  with numbers. First result: past 128 px from the mask the output is **byte-identical** to the
  plate, so **the model does not change the image's colouring**. The visible rectangle is a
  **seam**, not a cast: the patch edge runs -3.1/255 darker at 0-8 px and flips to +1.3 lighter by
  16-32 px. The axis to score is the **0-32 px signed step**, not the global mean.


## Plan Drift (cont. 2)

- **2026-08-22, scenario 1 dropped (Fabio).** "Object / character replacement" is cut: a
  `wf_type` 5 localised edit *is* a character being placed into a plate, so scenario 2 in the old
  numbering already covers it and scoring it twice buys nothing. The bench is **3 scenarios x 3
  seeds = 9 runs per candidate**, not 12. `task.json`'s `acceptance` array still says "all 4
  scenarios x 3 seeds" - that line is **stale by decision**, not by oversight; `research/
  scenarios.md` is the source of truth and the card description records the call.
- **2026-08-22, scenarios LOCKED** into `research/scenarios.md`: S1 clothing replacement
  (`wf_type` 4), S2 localised masked edit (`wf_type` 5, the seam axis), S3 pose change
  (`wf_type` 4). Fixed plate `plates/plate_dirt_road.png`, fixed mask
  `plates/mask_standing_left.png`, fixed seeds 101 / 202 / 303. Do not edit mid-bench.
- **2026-08-22, S2 is scored on the 0-32 px SIGNED step, not the global mean.** Leg 0 proved
  there is no colour cast (byte-identical past 128 px), so a global number reads ~0 for every
  candidate and separates nothing. Baseline to beat: -3.135/255 at ring 0-8, +1.280 by 16-32.


## Current State (2026-08-22, handoff)

**Leg 0 is closed and the scenarios are locked. Legs A, B and C have not started - not one
scored run exists yet.**

On disk under `D:\WORK\Images\Outputs\klein_9b\`: `plates/plate_dirt_road.png` and
`plates/mask_standing_left.png` (the fixed inputs), plus four Leg 0 proof runs in `leg0/`.

**Next action: Leg A.** Run S1/S2/S3 x seeds 101/202/303 on the `base` arm, then on
`base+turbo` at 1.0, 0.7 and the 0.25-0.5 band. Per-arm weight / LoRA / steps / cfg are in
`research/README.md` § Per-arm settings; the exact command shape is at the bottom of
`research/scenarios.md`. **Leg A's very first run is the one open question in the whole card:
does `klein_9B_Turbo_r128` (rank 128) even apply to an INT8 ConvRot base?** If it only loads on
fp8, Leg A is forced to fp8 and that asymmetry must be recorded.

Record each run into `research/results.md` (that file does not exist yet - create it from the row
format in `scenarios.md`).

---

## Plan Drift (cont. 3) - 2026-08-22, THE SCENARIO WAS WRONG THREE TIMES

The single largest drift on this card. S2 - the axis the card exists for - was corrected three
times by Fabio while the bench was running, and each correction voided the runs before it.

1. **`wf_type` 5 -> `wf_type` 4 with a mask.** The mask is what makes an edit localised. wf5 is
   the INPAINT branch: it green-fills the mask and depends on node **259**, a
   `flux2-klein-4b-outpaint` LoRA at strength 1.1, to regenerate that fill. 4B cannot apply to a
   9B base and the bench had bypassed it (README edit #8), so every wf5 run was the branch minus
   the component it is built around. The surviving green was the missing LoRA - not a weight
   verdict, not seed fragility, not a step count. The whole inherited "fault 2" story was an
   artifact of benching the wrong branch.
2. **Text inpainting -> REFERENCE placement.** Placing a man described by a prompt was never the
   ask. The test is placing the man from **image 2** (node 236) into the plate carrying the mask.
3. **Ellipse -> BOX mask.** A rectangle proves two things at once (no colour shift AND correct
   placement) because a straight edge shows a seam an oval hides. It immediately turned what the
   oval showed as a soft halo into a hard rectangular patch of the reference background.

A fourth fault was in the INSTRUMENT: the `guard` green test required `r<80` and scored a visibly
half-green frame at 0.00%. It now tests green dominance (`g - max(r,b) > 60`).

## Current State (2026-08-22, handoff 2)

**Legs A, B and C are all RUN on the corrected scenario.** 48 rows in
`research/results.md` SS CURRENT MATRIX (6 arms x 3 scenarios x 3 seeds), sectioned
CURRENT / SUPERSEDED / VOID so a voided row cannot be read as a verdict.
`research/verdict.md` exists and answers Q1, Q2, Q3.

Measured and settled:

- **Q1 format** - INT8 ships, fp8 not needed, 9B fits: 14.2-15.9 GB peak on a 16380 MiB card,
  FLAT across all six arms. The turbo LoRA costs nothing measurable in VRAM.
- **Q2 turboToggle is DEAD.** `base` is 6-7x slower than distilled (115 s vs 20 s on a
  whole-image edit, 192 s vs 28 s on a placement) AND scores 0/3 on reference placement - it
  ignores image 2 and copies the plate own subject into the mask. LoRA strengths 0.7 and 0.35
  score WORSE than 1.0, so there is no monotonic quality/speed axis to expose as a slider.
- **Q3** - one checkpoint, not two. base+turbo@1.0 ties distilled at 2/3 placement but needs
  8 steps / 32-48 s against 4 steps / 20-28 s, plus a second file to host and version.
- **Q4 KV - NOT ANSWERED, and deliberately not banked.** `FluxKVCache` is not in the graph, so
  the KV arm ran with no caching path active; the measured 1.00x is what a disabled cache
  predicts. The `kv` WEIGHT is fine - 2/3 placement, same VRAM, same wall clock as distilled.

Reference placement is **~2/3 at best on every 9B weight tested** and the failure is SILENT:
the `guard` column reads `green 0.00% / clip 0.1%` on all 18 S2 rows, including the nine where
the arm placed the wrong person or nothing at all. Placement was scored by EYE off
`research/S2_contact_sheet.png`. A rectangular seam is present on essentially every arm, so it
is a workflow property, not a weight discriminator.

## Plan Drift (cont. 4) - the verdict is ON HOLD, and base is NOT discarded

Fabio, 2026-08-22, after reading the verdict:

- **Do not act on the recommendation yet.** `verdict.md` carries a STATUS banner saying so.
- **Base stays a candidate** pending two repos he found - an inpainting approach for Klein 9B,
  unproven, but on the repo own claims broadly applicable across the app.
- **Q4 is re-scoped, not dropped.** Install the KV node and retest KV SPEED, but only in a shape
  where KV can show: **edit only (`wf_type` 4, NO mask), MULTIPLE references.** Agreed shape is
  THREE images - an empty background plate plus two different people - placing both people into
  the plate, `distilled` vs `kv`, a few runs. A single-reference test is not worth running.
- **The localised edit is finished** and is not part of the KV leg.

**Next action: create the KV leg, then ask Fabio for THE Ripple** (the repos to review).

---

## Leg D — the KV multi-reference speed leg. RUN 2026-08-22.

Q4 is answered. 16 rows in `research/results_kv.md`; driver `kv_leg.py`, ratios `kv_ratios.py`,
contact sheet `kv_contact_sheet.png`.

**Built:** `FluxKVCache` added to the bench graph as node **900** (model from node 100). It has
no consumer by default, so ComfyUI never executes it — an arm opts in with the new
`run.py --link 170.model=900,0`, which reaches branch 4's `CFGGuider` only and cannot touch t2i.
Three fixed inputs made on the bench: `plates/plate_empty_road_00001_.png` (empty, seed 8001),
`plates/ref_woman_00001_.png` (seed 8002), plus the existing `ref_man_00001_.png`.

**The matrix is 2×2, not "distilled vs kv".** `FluxKVCache` is a plain MODEL→MODEL patch with
nothing weight-specific in it, and a safetensors *header* diff of the two 9B weights shows an
identical key set (425 tensors, same shapes/dtypes, no `__index_timestep_zero__` marker) — only
the values differ. So the node is required either way, and only crossing weight × node answers
whether the second 9.4 GB file earns its place.

**Results:**

- **KV is a 2.40x speedup at 2 refs and 3.18x at 3**, 1024², sampler-only, both seeds within 1 s.
  It scales with reference count as claimed. Bigger than the card's "expect ~1.40x", because that
  assumed 1 reference and **a Klein edit feeds the plate in as a reference too** — the cheapest
  real edit already carries 2.
- **The speedup is the NODE. The `kv` weight alone is 1.00x** — identical to distilled at both ref
  counts. Leg C's earlier 1.00x was correct for a graph with no cache node in it.
- **But the node needs the KV weight to be CORRECT.** `distilled+node` posts the *same* 8.5 s and
  *same* VRAM, and produces the wrong picture: the plate is replaced and the references drift
  (denim jacket → denim shirt; long yellow raincoat → yellow shirt + olive skirt). `kv+node` keeps
  both. Both seeds, both ref counts. **No column in the table shows this** — it is only in the
  images, which is this card's failure mode for the fifth time.
- **VRAM is the binding constraint.** The cache costs +600–800 MiB; worst peak **16037 / 16380 MiB
  — 343 MiB of headroom** at 3 refs. Tighter than Leg 0's ~690 MiB.

**Two things found that are instrument lessons, not results:**

- Wall clock is useless for a speed ratio here — ~73% of a run is constant RAM→VRAM load, because
  the bench is freed before every run to keep VRAM honest. `run.py` now reads the sampler's own
  tqdm bar and `Prompt executed in X seconds` off `/internal/logs/raw`.
- **Mark that log by TIMESTAMP, not by index.** The endpoint keeps only the last 300 entries, so
  `len()`-before / slice-after silently returns an empty list and the timing reads `None` — which
  reads as a broken parser and is not one. Cost one run to find.

## Current State (2026-08-22, after Leg D)

**All four deliverable questions are now answered.** `verdict.md` §4 and its Recommendation are
rewritten; the STATUS banner's item 1 is struck through.

**The verdict is still PROVISIONAL, and for one reason only:** THE Ripple — the two Klein 9B
inpainting repos. Fabio said 2026-08-22 that he is running that review in a **separate session**,
so this card must not chase it. `base` stays a candidate until that review lands.

**What Leg D changes about the recommendation**, for whoever finalises it: "one checkpoint,
distilled" was written when KV looked like a 1.00x no-op. It is not — a reference edit is 2.4–3.2x
faster with `kv` + the node, and the node on `distilled` is not a substitute. So MPI-598 may want
**two files after all** (distilled for t2i / no-reference work, `kv` + node for reference edits),
or `kv` + node everywhere — which needs a t2i and single-reference check **this leg did not run**.

## DECIDED 2026-08-22 — the weight question is closed, and KV is rejected

Fabio, same day, after running his own KV test — **a pose request inside painting**:
*"I think this is decided in terms of models. Let's delete all diffusion models and keep int8
distilled only."* Plus the CLIP.

**Ship: `flux-2-klein-9b-int8-convrot.safetensors` + `qwen_3_8b_int8_convrot.safetensors`.**
One transformer, one text encoder, no LoRA, no toggle, no KV.

**A CORRECTION I OWED, and it lands on Fabio's side of the argument.** The Leg D headline was
framed as "3.18x", which is the **sampler slice**. End to end it is **1.27–1.46x** (38.2 s ->
26.2 s at 3 refs). Sampling is only ~27–45% of a run — the rest is text encode, three VAE
encodes, decode, save, and a RAM->VRAM reload this bench pays every run because it frees first to
keep the VRAM column honest. Both figures were always in the table as separate columns; leading
with the larger one was the error, and it made KV look better than a user would find it. The app,
warm, would land somewhere between 1.46x and 3.18x — **not measured, so not claimed.**

With that framing corrected, KV loses on every axis that costs something:

- **1.27–1.46x end to end**, not 3.18x.
- **Needs a SECOND 9.4 GB weight** to stay correct — `FluxKVCache` on plain distilled is the same
  speed and the wrong picture.
- **+600–800 MiB VRAM**, worst peak 16037 / 16380 MiB — ~340 MiB of headroom.
- Fabio's independent test on a different shape (masked paint + pose) agreed.

**Weights deleted from `G:\CubricModels\`, ~27.6 GiB freed** (2026-08-22, on instruction, bench
freed first so no handle was held):

- `diffusion_models/flux-2-klein-9b-kv_int8_convrot.safetensors`
- `diffusion_models/flux-2-klein-base-9b-int8-ConvRot.safetensors`
- `diffusion_models/flux-2-klein-base-9b-int8-convrot-comfy.safetensors`
- `loras/klein_9B_Turbo_r128.safetensors`

Kept: the distilled 9B and the Qwen3-8B CLIP. **Nothing in production was touched** — the 4B
Klein, krea2, LTX, lustify, minimax and qwen-image-edit weights are all untouched. All four
deleted files are re-downloadable from the HF repos recorded in `brief.md`.

**The bench can no longer re-run Legs A, B or C** — those arms' weights are gone. Leg D's KV arms
are gone too. `results.md`, `results_kv.md` and the contact sheets are the surviving record.

## Current State (2026-08-22, DECIDED)

All four questions answered, decision taken, rejected weights deleted. `verdict.md` STATUS banner
now reads DECIDED and names the two files that ship.

**Next action:** post the verdict onto MPI-598 as an event + brief section and close this card.
No longer blocked on anything — THE Ripple review continues in Fabio's separate session and
concerns the inpainting *approach*, not which transformer ships.
