# MPI-600 — Bench FLUX.2 Klein 9B: base vs turbo LoRA vs distilled vs KV

Created 2026-08-22, out of a research conversation with Fabio. This card is the **bench**
that MPI-598 (`Wire FLUX.2 Klein 9B`) is waiting on. MPI-598 cannot pick a weight, a step
count or a cfg until this runs. **This card does not touch app code.**

Run it in a **separate session**. The protocol is `plan.md`.

## The product intent, stated by Fabio 2026-08-22

> "The original plan, at least my plan, is to use 9B base with turbo LoRA so that the user
> can decide on quality vs speed."

So the shape MPI-598 should ship is a **`turboToggle`**: one 9B base checkpoint plus a turbo
LoRA, the toggle trading quality for speed at run time. That is the hypothesis this bench
tests — it is not yet proven, and two of the four candidate weights may beat it.

**Klein 4B is out of scope on this card.** It is a different model with a different licence
and it is already shipped. Do not benchmark against it, do not reason from its results, and
do not cite its dropped turbo LoRA as evidence here.

## The four candidates

| # | Weight | HF repo | Steps | Licence |
|---|---|---|---|---|
| 1 | **9B base** | `black-forest-labs/FLUX.2-klein-base-9B` | ~50 | FLUX Non-Commercial |
| 2 | **9B base + turbo LoRA** | base + a community base→turbo LoRA | ~4–8 | FLUX NCL + LoRA's own |
| 3 | **9B distilled** | `black-forest-labs/FLUX.2-klein-9B` | 4 (step-distilled) | FLUX Non-Commercial |
| 4 | **9B KV** | `black-forest-labs/FLUX.2-klein-9b-kv` | 4 (step-distilled) | FLUX Non-Commercial |

**Licence is identical across all four** — FLUX Non-Commercial Licence v2.1. Nothing on this
card changes the licence picture, and the MPI-357 gate (keyed to `klein-9b`) covers whichever
wins. Outputs are commercially usable; the bar is on using the model.

## What KV actually is — read this before designing the KV leg

`9b-kv` is **not a third distillation**. It is the distilled 9B with a caching path for
**reference-image tokens**:

- **step 0** `forward_kv_extract` — full pass, caches the reference tokens' key/value projections
- **steps 1+** `forward_kv_cached` — output + text tokens only; reference K/V come from cache

Consequences that shape the test:

1. **KV can only help ops that carry a reference image.** On pure `t2i` there is nothing to
   cache — expect **zero** speedup. Do not run a t2i KV leg and report a null result as a finding.
2. **The headline "2.5x" is not our number.** BFL's own table scales with reference count and
   *inversely* with output resolution:

   | #refs | 512² | 768² | 1024² | 1440² |
   |---|---|---|---|---|
   | 1 | 1.78x | 1.57x | **1.40x** | 1.21x |
   | 2 | 2.16x | 1.97x | 1.77x | 1.46x |
   | 4 | 2.66x | 2.44x | 2.22x | 1.85x |

   Single-reference at 1024 is **1.40x**. Record ref count and output resolution on every KV row
   or the number means nothing.
3. **There is no `base-9b-kv`.** KV exists only on the distilled branch, which is why leg C is
   "KV vs the leg-B winner" and not a fourth arm of the same comparison.
4. **It needs a node.** ComfyUI's `FluxKVCache` (added in ComfyUI 0.17.0; our pin is
   **v0.31.0**, so the node is present). Known rough edge: users report `timestep_zero_index`
   failures at KSampler when the KV node meets some Flux paths, and LoRAs load fine on the KV
   weights when used *without* the KV node. If leg C dies at the sampler, that is the first
   thing to check — it is a known upstream issue, not a bad download.
5. **Weight identity: RESOLVED 2026-08-22 — the KV weights are genuinely DIFFERENT tensors.**
   No source stated this either way, so it was measured directly on the two INT8 builds, which
   are **byte-identical in size** (9,433,065,664 each):

   | File | SHA256 |
   |---|---|
   | `flux-2-klein-9b-int8-convrot.safetensors` | `8daaac4f1e869cea35a051fcc619c515b7ba003d319667c1db6ae798fa1e6db2` |
   | `flux-2-klein-9b-kv_int8_convrot.safetensors` | `c96cede25e4eab27c90e5f0181888ab4b451066fc30134a7320ae6ae66d1338c` |

   Same size, different hash. So KV is a real variant — a finetune or re-derivation, **not** the
   same weights with a different loader. Two consequences: it is a separate download for MPI-598
   (never a swap-in), and **leg C's quality-parity half is load-bearing, not a formality** — if
   the tensors differ, output can differ, and "is KV a free speedup" is an open question rather
   than an assumption.

## The hardware constraint that gates the whole bench

**This machine is an RTX 4060 Ti, 16380 MiB.** Every 9B variant is quoted at **~29 GB VRAM in
bf16**. Nothing on that table fits, so **bf16 is not on this bench at all** — it is not the
format we would ship and there is no point measuring it.

So the first thing the bench must settle is **which quantised format ships**. `plan.md` § Leg 0
owns it and **it must complete before any other leg starts** — a leg run at the wrong precision
is a wasted leg. Benching on a rented 5090 would produce numbers describing a card our users do
not have.

**INT8 ConvRot exists for all three arms** (searched 2026-08-22), which changes the shape of
Leg 0 — it is now INT8-vs-fp8, not "find something that fits":

| Arm | INT8 ConvRot file | Size |
|---|---|---|
| base 9B | `flux-2-klein-base-9b-int8-ConvRot.safetensors` | 9.41 GB |
| distilled 9B | `flux-2-klein-9b-int8-convrot.safetensors` | 9.43 GB |
| KV | `flux-2-klein-9b-kv_int8_convrot.safetensors` | 9.43 GB |
| Qwen3 text encoder | `qwen_3_8b_int8_convrot.safetensors` | 9.44 GB |

`Winnougan/Klein9b-Distilled-Base-INT8-Convrot` carries distilled + KV + the encoder from one
quantiser; base comes from `bertbobson/ComfyUI-INT8_ConvRot` or
`obsxrver/ComfyUI-Native-INT8_ConvRot`.

Two reasons this matters more than it looks:

- **It is the family we already ship.** Klein 4B is `flux-2-klein-4b-int8-convrot.safetensors`
  from `wraps/FLUX.2-klein-4B-INT8-ConvRot-ComfyUI`. Same quantisation, proven in production.
- **Community reports put INT8 ConvRot at ~2x fp8 with equal or better quality** on consumer Ada
  cards — precisely this bench's hardware. If that holds, INT8 is the ship format and the fp8
  the ComfyUI templates default to is the slower option.

**The INT8 loader question is CLOSED — do not re-open it.** Settled 2026-08-22 with no bench run
needed. `G:\CubricModels\diffusion_models\` already holds **six** int8_convrot weights in
production use:

`flux-2-klein-4b-int8-convrot` · `krea2_raw_int8_convrot` ·
`ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot` · `lustify-v10-krea-raw-int8_convrot` ·
`qwen_image_edit_2511_int8_convrot`

and `dev_configs/node_lock.json` pins **zero** INT8 custom nodes. Core ComfyUI loads the format
natively. The `BobJohnson24/ComfyUI-INT8-Fast` writeups predate core support — Fabio called this
correctly on 2026-08-22.

**INT8 is therefore the decided format**, not a candidate ("if int8 exists, we're going to go
with int8 for everything" — Fabio, 2026-08-22). Leg 0 is a confirmation run, not a bake-off. fp8
stays documented only as the fallback if 9B INT8 somehow fails where five other models did not.

Note the 8B Qwen3 text embedder is a second ~9.4 GB resident. ComfyUI encodes then unloads, so
peak should be ~9.5 GB, not the sum — an expectation to verify, not an assumption.

## What is already on disk, and what was pulled for this card

**There is NO Qwen3-8B dependency, and nothing existing can be promoted into one.** Checked
`assetDeps.js` 2026-08-22. The two that look like candidates are not:

| Existing dep | What it actually is | Why it does not serve Klein 9B |
|---|---|---|
| `qwen3-4b-clip` → `qwen_3_4b.safetensors` (7.49 GB) | Qwen3-**4B**, Klein **4B**'s encoder | different parameter count — a 4B encoder is not an 8B one, nothing to "promote" |
| `boogu-qwen3vl-8b-clip` → `qwen3vl_8b_fp8_scaled.safetensors` (9.86 GB) | Qwen3-**VL**-8B, a vision-language model, loaded with `type: 'boogu'` | different architecture; Klein wants text-only Qwen3-8B at `type: 'flux2'` |

So **MPI-598 owes a brand-new dep** for `qwen_3_8b_int8_convrot.safetensors` — hashed and staged
to R2 like any other weight. Same size class as the transformer (~9.4 GB), so 9B's install
footprint is roughly **double** 4B's on the encoder alone. Worth saying out loud in the model
description.

We DO already have `flux2-vae.safetensors`; `full_encoder_small_decoder.safetensors` is absent,
which likely settles the templates' VAE ambiguity — confirm in Leg 0.

**We already have `flux2-vae.safetensors`**; `full_encoder_small_decoder.safetensors` is absent.
That likely settles the VAE ambiguity in the templates' favour of `flux2-vae` — confirm in Leg 0
and write the decision into `research/format.md`.

Pulled 2026-08-22 (all public on HF, no gate, verified 200 + content-length before starting):

| File | Bytes | Repo | Lands in |
|---|---|---|---|
| `flux-2-klein-9b-int8-convrot.safetensors` | 9,433,065,664 | `Winnougan/Klein9b-Distilled-Base-INT8-Convrot` | `diffusion_models/` |
| `flux-2-klein-9b-kv_int8_convrot.safetensors` | 9,433,065,664 | same | `diffusion_models/` |
| `flux-2-klein-base-9b-int8-ConvRot.safetensors` | 9,405,838,474 | `bertbobson/ComfyUI-INT8_ConvRot` | `diffusion_models/` |
| `qwen_3_8b_int8_convrot.safetensors` | 9,435,828,164 | `Winnougan/…` | `text_encoders/` |
| `klein_9B_Turbo_r128.safetensors` | 1,388,608,880 | `anyMODE/Flux-2-Klein-Base-9B-to-turbo-lora` | `loras/` |

Total 39.1 GB against 81.1 GB free on G:.

**Distilled and KV are byte-identical in SIZE (9,433,065,664 both).** After the pull, `sha256sum`
both — that settles the "are the KV weights the same as plain 9B" question this brief flagged as
unverified, for free.

## The turbo LoRA is COMMUNITY, not first-party

MPI-598's card says "9B ships one". **That is wrong** — BFL publishes base and distilled
checkpoints only. The base→turbo LoRA is community work by **anyMODE**, published as
*"Klein 4B/9B Base to Turbo Lora"*, Civitai `models/2324315`.

**SOURCED AND VERIFIED 2026-08-22 — no Civitai and no VPN needed.** anyMODE mirrors it on their
own Hugging Face repo:

`anyMODE/Flux-2-Klein-Base-9B-to-turbo-lora` → **`klein_9B_Turbo_r128.safetensors`**, 1,388,608,880 bytes

Downloaded to `G:\CubricModels\loras\`. **SHA256 `69d54afd97c016b5a773be7e45a83083932a8e4f47e1b99eb7e6f7aa5a3c056c` matches CivArchive's hash for the Civitai file exactly** — so it is provably the same artifact, not a lookalike. A `klein_9B_Turbo_r64.safetensors` (662 MB) also exists if rank 128 proves too heavy.

Its licence still has to be read separately from the FLUX NCL before MPI-598 ships it.

## How the LoRA was made — this reshapes legs A and B

anyMODE built it by **subtracting Klein-base from Klein-distilled and decomposing the difference
into a LoRA**. Their own words: it "adds turbo back to the base checkpoint, allows you to control
the amount of turbo and thus CFG by adding it to base."

It is the **distillation delta**, not an independently trained accelerator. So:

- **Strength is a continuous dial between base and distilled.** At 1.0 it should approximate the
  distilled weight *by construction*. That is precisely the quality/speed control Fabio wants —
  and it is a **slider, not a boolean**, which is a live question for `turboToggle` on MPI-598.
- **Leg B's expected result is "base+turbo@1.0 ≈ distilled".** That is not a finding, it is the
  premise. The real question moves to whether *intermediate* strengths reach quality the distilled
  weight cannot. `plan.md` legs A and B are written against that.

Published settings to seed the sweep (author first, then community reports):

| Strength | Steps | CFG | Source |
|---|---|---|---|
| **0.7** | 8–12 | 1.5 | anyMODE's own recommendation |
| 1.0 | 8 | 1.0 | community |
| 0.25–0.5 | 8 | 3.5 | community, "quality-focused" |
| — | 8–10 | 1.0 | community, specifically for image **editing** |

**Rank 128 on a base that is itself quantised is still unproven.** The LoRA must apply cleanly on
INT8 ConvRot. If it loads on fp8 but not INT8, leg A is forced to fp8 — record that asymmetry,
do not silently absorb it.

## The failure this bench exists to catch

Fabio supplied a screenshot: a figure composited onto a dirt-road plate, where the edited
region is a **visible lighter rectangle** — the model re-rendered a box at different
exposure/contrast and left a hard seam against the untouched plate.

That is scenario 3 in `plan.md` and it is the **highest-value scenario on this card**. A model
that scores well on adherence and badly here is not shippable for editing, because the defect
is instantly visible to a non-technical user and cannot be prompted away. Score it separately
from adherence; do not let a good likeness carry a bad seam.

## Related cards

- **MPI-598** — Wire FLUX.2 Klein 9B. Consumes this card's verdict. Do not start it first.
- **MPI-357** — the licence gate, already shipped and keyed to `klein-9b`. Nothing owed here.
