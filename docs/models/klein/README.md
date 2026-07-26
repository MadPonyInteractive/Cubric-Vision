# FLUX.2 Klein 4B — model research

Settled facts for the Klein wiring (MPI-354). Raw eval history: MPI-353.
The model-agnostic *how* lives in `docs/playbooks/add-model/` — this file is
Klein-specific only.

## What it is

FLUX.2 Klein, 4B params, **Apache-2.0**. Two checkpoints ship from fal, both
7,751,105,712 bytes: `flux-2-klein-4b` (distilled) and `flux-2-klein-base-4b`.

**We ship the BASE checkpoint, int8_convrot quantized** (decided 2026-07-26 after a
four-way bench A/B — see "Which checkpoint ships" below). One transformer serves both
tiers via a strength-gated turbo LoRA, the Krea2 raw+accelerator pattern (MPI-316).

Its value to Vision: it is the **fastest image model we ship** — faster than SDXL —
and the only proven path to **object removal**.

## Weights

| File | Size | Folder | dep id |
|---|---|---|---|
| `flux-2-klein-base-4b-int8-convrot.safetensors` | 4.26 GB | `diffusion_models/` | `klein-4b-transformer` |
| `qwen_3_4b.safetensors` (text encoder) | 8.04 GB | `text_encoders/` | `qwen3-4b-clip` |
| `klein4b_turbo_r128.safetensors` (tier 2) | 0.79 GB | `loras/flux2-klein/` | `klein-lora-turbo` |
| `flux2-vae.safetensors` | 0.34 GB | `vae/` | `vae-flux2` |
| `flux2-klein-4b-outpaint.safetensors` | 0.076 GB | `loras/flux2-klein/` | `klein-lora-outpaint` |

Total **+13.5 GB**. The **text encoder is now the biggest file** — bigger than the
quantized transformer. Comfy-Org's `z_image_turbo` repack hosts `qwen_3_4b_fp8_mixed`
(5.63 GB) and `qwen_3_4b_fp4_mixed` (3.48 GB); fp4_mixed is a format we already ship
(LTX's Gemma). Untested here — TE quantization shows up as prompt-adherence drift, so
A/B it on a multi-constraint prompt, not a pretty-picture one.

**Dep reuse: NONE — checked 2026-07-26 and closed.** Klein's TE is
Qwen3-**4B text-only** (`CLIPLoader type: flux2`); every Qwen encoder we host is a *VL*
weight (`qwen3vl_4b_abliterated`, `qwen3vl_8b`, `qwen_2.5_vl_7b`) — different files. Same
for the VAE: `vae-flux-ae` is FLUX.**1**'s `ae.safetensors`, not `flux2-vae`. So all four
weights are new hosts and the user download stays the full 16.2 GB.

All four dep entries are **written with real sha256** (hashed off the local
`G:\CubricModels` masters, per playbook 02 — hashes never wait for the upload).
**Not yet uploaded to R2** — that needs explicit user approval.

**The LoRA must be the comfy-converted file** (`diffusion_model.*` prefix, rank 16 —
all 68 target keys bind). The plain diffusers file does NOT work in ComfyUI.

**VRAM: ~13 GB measured on the bf16 checkpoint**, despite being a 4B model. The
shipped weight is int8 (3.5 GB smaller), so **re-measure before setting the tier
badge** — the bf16 figure is what threatened the 8 GB tier and may no longer apply.

## Graph shape (all ops)

`UNETLoader` → `LoraLoaderModelOnly` → `CFGGuider` → `SamplerCustomAdvanced`,
with `Flux2Scheduler` sigmas, `KSamplerSelect(euler)`, `CLIPLoader(type=flux2)`
on `qwen_3_4b`, `VAELoader` on `flux2-vae`.

**Shipped config (base): cfg 5.0, euler, 20 steps**, ~35-40 s. That is also the ONLY
config where a **negative prompt is live** — at cfg 1.0 the negative is bit-identical
(max diff 0), so distilled/turbo runs must `ConditioningZeroOut` it. Consequence for
the ModelDef: `negativePrompt` is TRUE on the base tier, and the tier-2 turbo path
cannot honour it.

Klein's TE is **Qwen3-4B, an LLM — not CLIP**, so CLIP-era keyword-soup negatives
(`bad anatomy, worst quality, lowres`) are out of distribution. Use short plain
phrases, and keep them short: at cfg 5 a long negative adds guidance pressure, the
same over-guidance that drives base's colour drift. Positive-side suppression measured
BETTER than negatives on this model (MPI-353: invented blemishes down 21%).

The **distilled** numbers, for history: cfg 1.0, euler, 8 steps (the knee of a
4/6/8/12/16/20 sweep — 20 steps adds film grain, not structure).

## Operations — all proven on the bench (2026-07-26, ComfyUI 0.28)

| op | time | how |
|---|---|---|
| t2i | 10s | `EmptyFlux2LatentImage` → sampler |
| edit, 1 ref | 20s | `ReferenceLatent` + `VAEEncode`(source); sampler starts from source latent |
| edit, 2 refs | 30s | chain a 2nd `ReferenceLatent` |
| edit, 3 refs | 44s | chain a 3rd (~+14s per ref) |
| inpaint / removal | 20–36s | green plate, below |

### Multi-reference works

`ReferenceLatent` sets `reference_latents` with `append=True`
(`comfy_extras/nodes_edit_model.py`), so **chaining the node stacks reference
images**. Verified: fox from ref-2 composited beside the woman from ref-1 with
correct scale, lighting and floor contact. Each extra ref costs real time, so the
op should cap the slot count deliberately rather than expose unlimited refs.

### Removal / inpaint = green plate

Paint the region pure `#00FF00`, prompt `"Fill the green spaces according to the
image."` + what should be there. `EmptyImage(color=65280)` + `ImageCompositeMasked`.
All builtin nodes — no custom pack needed.

Wrap in `InpaintCropImproved` → sample → `InpaintStitchImproved`
(`mask_blend_pixels=32`, `expand=8`): cuts the seam gradient **6×** (14.56 → 2.44)
for ~4s.

The outpaint LoRA is **mandatory for outpaint** (without it ~95% of extended bands
stay pure green) but **optional for inpaint** — a surrounded region is just a normal
edit. LoRA strength barely matters for removal (0.0–1.8 all removed cleanly).

## Step count

Sweep at 1024², seed fixed: 4/6/8/12/16/20 steps → 12/8/10/14/16/20 s.
Detail (lapvar) climbs 95 → 236 across the range, but the 20-step gain is **film
grain, not structure** — compositions differ, quality does not improve. **8 steps
is the knee.**

## Which checkpoint ships

**Base int8_convrot, plus a turbo LoRA for tier 2.** Decided 2026-07-26 on the bench
after running four transformers head to head. The other three are dropped:

| candidate | size | verdict |
|---|---|---|
| **base int8_convrot** | **4.26 GB** | **SHIPS.** Best images; int8 matches base bf16 at 3.5 GB less |
| base bf16 | 7.75 GB | dropped — int8 equals it for 3.5 GB more |
| distilled int8_convrot | 4.07 GB | dropped — fast (~5 s) but base's images are better |
| distilled bf16 | 7.75 GB | dropped |

The two int8 quants are NOT equivalent work: the base quant touches 70 layers and
leaves 79 in BF16, the distilled one does 80/69. The base quant is the conservative
one — that is where its extra 190 MB goes, and why it holds quality. Both carry native
`comfy_quant` markers, so stock `UNETLoader` loads them with no custom-node dep.

### The earlier "base is closed" finding, and why it reversed

An earlier pass (MPI-353) closed the base off this table:

| config | time | fill detail (lapvar) | colour drift |
|---|---|---|---|
| distilled 8st cfg 1.0 | 20s | 19.6 | 10.60 |
| base 28st cfg 4.0 | 92s | 14.6 | 12.10 |
| base 50st cfg 4.0 | 154s | 16.0 | 11.88 |

That measured the **removal/fill** op at cfg 4.0 and 28-50 steps, where base is
over-guided (the `docs/models/krea2/editing.md` § cfg pathology). The reversal came
from **t2i quality at cfg 5.0 / 20 steps**, a config that pass never ran, plus int8
erasing the speed and size penalties. Both results stand — they measured different
ops at different settings. Do not re-run the old sweep expecting the new answer.

The old note that a turbo LoRA extraction was "closed" (both checkpoints byte-identical,
so `distilled − base` would cost more disk than shipping distilled) is also superseded:
we ship a **community turbo LoRA at 786 MB**, not an extracted delta.

## Known limits

- **Denoise < 1.0 is wrong for removal.** Lower denoise preserves the source latent,
  and the source latent contains the thing being removed. Measured on a tattoo: dark
  spots 1213 → 1367 → 1798 at denoise 1.00 / 0.90 / 0.80, with correlation to the
  original ink rising 0.015 → 0.044 → 0.090 (ink measurably resurfacing).
  `SplitSigmasDenoise` also quantises as `round(steps × denoise)` — at 8 steps, 0.95
  is a no-op and 0.90/0.85 are identical. Needs ≥20 steps to have any resolution.
- **It invents blemishes.** Klein paints plausible skin with its own moles/freckles,
  uncorrelated with what was underneath (corr 0.006). Prompting suppresses this best:
  adding "no moles, no freckles, no blemishes, no spots" to the **positive** prompt cut
  invented dark spots 21% (1213 → 962) at zero cost. Negative prompts can't help at cfg 1.0.
- **Fill grain lands ~50–80% of real skin.** Every model tested does (Qwen 4/8/20-step
  scored 49/54/52%; Klein 56%). Not Klein-specific — a single generative pass cannot both
  erase and re-detail. The fix is an app-level second pass, not a model setting.

## Out of scope for the model

- **Outpainting ships as an App**, not a model op. Users already do it with the resize
  tool + "fill the black bars with …" prompting (proven with Boogu and Krea2).
- **`MpiInpaintHeal`** (ring-sampled colour/grain correction, built 2026-07-26, live in
  the bench via symlink) is **not** part of this model and is **not** released. It helps
  on small evenly-lit patches and *hurts* on regions spanning a lighting gradient — it
  pulls the fill toward a ring average that is wrong when the region is lit unevenly.
