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
