# FLUX.2 Klein 4B — model research

Settled facts for the Klein wiring (MPI-354); raw eval history in MPI-353. The
model-agnostic *how* lives in `docs/playbooks/add-model/`. Siblings:
`9b.md`, `removal.md`, `refcontrol.md`, `licences.md`.

> **Klein ships at TWO sizes; this is the 4B half.** 9B (MPI-598) is the SAME graph — one
> template, `generate_klein.py` bakes both runtimes — so everything below applies to both.
> **`9b.md` holds every difference, AND what is now 4B-history here** (inpaint is LanPaint;
> the outpaint LoRA has left both graphs but its dep and R2 object stay — MPI-603).

## What it is

FLUX.2 Klein, 4B params, **Apache-2.0**. Two checkpoints ship from fal, both
7,751,105,712 bytes: `flux-2-klein-4b` (distilled) and `flux-2-klein-base-4b`.

**We ship the DISTILLED checkpoint, int8_convrot quantized** (decided 2026-07-27 —
this REVERSED the base+turbo decision of 2026-07-26; see "Which checkpoint ships").
**ONE tier, no accelerator LoRA**: distilled already runs at cfg 1.0 / 4 steps, so
the base leg the turbo LoRA existed to accelerate is gone.

Its value to Vision: it is the **fastest image model we ship** — faster than SDXL —
and the only proven path to **object removal**.

## Weights

| File | Size | Folder | dep id |
|---|---|---|---|
| `flux-2-klein-4b-int8-convrot.safetensors` | 4.07 GB | `diffusion_models/` | `klein-4b-transformer` |
| `qwen_3_4b.safetensors` (text encoder) | 8.04 GB | `text_encoders/` | `qwen3-4b-clip` |
| `flux2-vae.safetensors` | 0.34 GB | `vae/` | `vae-flux2` |
| `flux2_klein_4b_refcontrol_depth.safetensors` | 0.092 GB | `loras/flux2-klein/` | `klein-lora-refcontrol-depth` |
| `flux2-klein-4b-outpaint.safetensors` | 0.076 GB | `loras/flux2-klein/` | `klein-lora-outpaint` |
| `NSFW_party_time_v2.0_klein4b.safetensors` | 0.18 GB | `loras/flux2-klein/` | `klein-lora-nsfw` |
| 8 style LoRAs | 0.77 GB | `loras/flux2-klein/styles/` | `klein-style-*` |

Total **+13.6 GB** (14 deps). Two more weights the graph loads are NOT Klein deps:
`4x_NMKD-Siax_200k.pth` is the shared `4x-NMKD-Siax` engineAsset (already hosted, also
used by SDXL/Krea2/Chroma), and `depth_anything_v2_vits.pth` is auto-downloaded by the
`comfyui_controlnet_aux` node dep. **Reconcile the dep set against what the template
actually loads before any R2 upload** — this list drifted twice (see below).

The **text encoder is the biggest file**, bigger than the quantized transformer.
Comfy-Org's `z_image_turbo` repack hosts `qwen_3_4b_fp8_mixed` (5.63 GB) and
`qwen_3_4b_fp4_mixed` (3.48 GB, a format we already ship for LTX's Gemma). Untested —
TE quantization surfaces as prompt-adherence drift, so A/B on a multi-constraint
prompt, not a pretty-picture one.

**Dep reuse: NONE — checked 2026-07-26 and closed.** Klein's TE is
Qwen3-**4B text-only** (`CLIPLoader type: flux2`); every Qwen encoder we host is a *VL*
weight (`qwen3vl_4b_abliterated`, `qwen3vl_8b`, `qwen_2.5_vl_7b`) — different files. Same
for the VAE: `vae-flux-ae` is FLUX.**1**'s `ae.safetensors`, not `flux2-vae`. Every Klein
weight is a new host.

All deps carry **real sha256** (hashed off `G:\CubricModels` masters, per playbook 02).
**Uploaded + verified 2026-07-27**: `sha256sum -c` 14/14 vs disk, then `rclone check`
(0 differences, 14 matching) and HTTP 200 + byte-exact Content-Length on all 14 URLs.

### LoRA licences → `licences.md`

All ten community weights resolved by SHA256 and **all ship** (user call 2026-07-26,
re-verified 2026-07-27). Method, table, bundle-flag reasoning, and how the one credit
obligation is discharged in data: **`licences.md`**. Note **the outpaint LoRA must be
the comfy-converted file** (`diffusion_model.*` prefix, rank 16 — all 68 target keys
bind); the plain diffusers file does NOT work in ComfyUI.

**VRAM, int8 — rough status-bar readings, estimates not measurements: ~5 GB for most ops, low teens for a multi-reference edit.** `sizeTier` stays `'low'`. **Every op was in fact
verified with only ~6 GB of the card free** (an LLM held the rest): peaks spilled to system RAM and completed, slower but correct — so the low teens is staging filling free VRAM, not
a floor, and Klein runs under the 8 GB the Model Library's `tradeTable()` quotes as minimum. `MpiClearVram` 570 precedes `Output_Image`; without it peak roughly doubled across ops.

## Graph shape — ONE master template, all ops

Every op lives in a **single graph** selected at run time by an injected
`Input_wf_type` int (1 t2i, 2 i2i, 3 depth, 4 edit, 5 inpaint, 6 detail, 7 upscale).
It drives an `MpiAnySwitch10` at the output plus internal gates (`is_i2i = wf_type==2`,
`is_remove` via `MpiBooleanCompare`). **No pruning converter is needed**: lazy
evaluation was confirmed empirically — a t2i run took 4.03 s against a depth run's
7.46 s on the same 196-node graph carrying four samplers, so only the selected branch
executes. `Input_wf_type` is just another injected control (an `MpiInt` with a title),
riding the same path as `Input_Seed`.

Two footguns, both now caught by `generate_klein.py` asserts: an op that forgets to set
`Input_wf_type` fails **silently** (runs the default branch, returns a plausible wrong
image); and ComfyUI validates every node's inputs at submit time even when a branch is
lazily skipped — which the graph survives only because image loads use
`MpiLoadImageFromPath` with `block_if_empty: false`. Keep that on every new branch.

Chain: `UNETLoader` → `LoraLoaderModelOnly` → `CFGGuider` → `SamplerCustomAdvanced`,
with `Flux2Scheduler` sigmas, `KSamplerSelect(euler)`, `CLIPLoader(type=flux2)`
on `qwen_3_4b`, `VAELoader` on `flux2-vae`.

**Shipped config: cfg 1.0, euler, 4 steps.** At cfg 1.0 there is no classifier-free
guidance, so the **negative prompt is bit-identical** (max diff 0) and gets
`ConditioningZeroOut`. For the ModelDef: **`negativePrompt` FALSE**, `turboToggle`
FALSE. Klein's TE is **Qwen3-4B, an LLM — not CLIP**, so CLIP-era keyword-soup
negatives are out of distribution anyway; positive-side suppression is the only lever
and measured better regardless (MPI-353: invented blemishes down 21%).

**WIDGET-VS-LINK TRAP (burned an afternoon).** `Flux2Scheduler.steps` and
`CFGGuider.cfg` have INPUT LINKS here, so their on-node widget values are DEAD and
editing them does nothing — the real values live in `MpiMath` nodes. Check for a
connected input before trusting any widget number in this graph.

## Operations — all proven on the bench (2026-07-26, ComfyUI 0.28)

| op | time | how |
|---|---|---|
| op | `Input_wf_type` | time | how |
|---|---|---|---|
| t2i | 1 | 10s | `EmptyFlux2LatentImage` → sampler |
| i2i | 2 | — | `is_i2i` gate |
| depth | 3 | — | → **`refcontrol.md`** |
| edit, 1 ref | 4 | 20s | `ReferenceLatent` + `VAEEncode`(source); sampler starts from source latent |
| edit, 2 / 3 refs | 4 | 30s / 44s | chain more `ReferenceLatent` (~+14s per ref) |
| removal | 5 | **~4s** | green plate → **`removal.md`** |
| detail | 6 | ~7s (23s worst) | second pass, area capped 1024² |
| upscale | 7 | — | `UltimateSDUpscale` + `4x-NMKD-Siax` |

### Multi-reference works

`ReferenceLatent` sets `reference_latents` with `append=True`
(`comfy_extras/nodes_edit_model.py`), so **chaining the node stacks reference
images**. Verified: fox from ref-2 composited beside the woman from ref-1 with
correct scale, lighting and floor contact. Each extra ref costs real time, so the
op should cap the slot count deliberately rather than expose unlimited refs.

### Removal → `removal.md`

Green plate (`EmptyImage(color=65280)` + `ImageCompositeMasked`, all builtin nodes),
outpaint LoRA, crop/stitch, **4 steps** — ~4 s. Ships as TWO baked stages (removal then
detail), no user toggle, and **hides the prompt field**: paint, click Remove.
Full measurements, the crop-helps-locally/hurts-globally rule, and the two traps
(native-resolution cap, and why removal must stay on the fast config) in `removal.md`.
**Inpaint-as-add measured BAD and is likely dropped** — retest before wiring it.

## Step count (REVISED 2026-07-27 by live measurement)

Per-op, on the shipped distilled weight: **t2i = 4** (8 overcooks), **detail = 2**,
**upscale = 2**, **inpaint = 2 + 2** (inpaint phase then detail phase). Roughly
half-steps for any second-pass op.

The old base-checkpoint sweep, for history: 4/6/8/12/16/20 steps → 12/8/10/14/16/20 s
at 1024², detail (lapvar) 95 → 236, with the 20-step gain being **film grain, not
structure**. That sweep is why "8 steps is the knee" was written; it does not describe
the weight we now ship.

## Which checkpoint ships

**Distilled int8_convrot. One tier, no turbo LoRA.** Decided 2026-07-27 — this
**reversed** the previous day's base+turbo call after per-op step counts were measured
live on distilled.

| candidate | size | verdict |
|---|---|---|
| **distilled int8_convrot** | **4.07 GB** | **SHIPS.** cfg 1.0 / 4 steps out of the box |
| base int8_convrot | 4.26 GB | dropped — needs cfg 5 / 20 steps to win, ~35-40 s |
| base bf16 | 7.75 GB | dropped — int8 equals it for 3.5 GB more |
| distilled bf16 | 7.75 GB | dropped |

**Verify a distilled quant is genuinely distilled** — the two files differ by 190 MB
and nothing else obvious. Read the safetensors header: the shipped weight records its
quant source as `flux-2-klein-4b.safetensors` via `OTUNetLoaderW8A8`
(`outlier_method=convrot`), and its dtype split is **80 I8 / 80 U8 / 80 F32 / 69 BF16**
— the documented distilled **80/69** split. The base quant is the conservative one at
**70/79** (70 layers quantized, 79 left BF16); that is where its extra 190 MB goes.
Both carry native `comfy_quant` markers, so stock `UNETLoader` loads them with no
custom-node dep.

The turbo LoRA (`klein4b_turbo_r128`, 0.79 GB, CivitAI 2324315) is **dropped, not a
dep** — with no base leg there is nothing to accelerate. Its node survives in the
template bypassed and severed so the two-tier wiring is recoverable if Klein 9B lands;
do not re-add the dep on the strength of that node alone.

### This decision flipped twice — don't re-run the sweeps

MPI-353 closed base off on the **removal/fill** op at cfg 4.0 / 28-50 steps
(distilled 8st cfg 1.0: 20 s, lapvar 19.6, drift 10.60 — vs base 28st: 92 s, 14.6,
12.10), where base is over-guided (`docs/models/krea2/editing.md` § cfg pathology).
It flipped to base on **t2i at cfg 5.0 / 20 steps**, a config that pass never ran, then
flipped **back to distilled** on 2026-07-27 once per-op step counts landed. All three
results stand — different ops, different settings. **The deciding axis was
speed-per-op, not image quality.**

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

- **Outpainting ships as an App**, not a model op — users already do it with the resize
  tool + "fill the black bars with …" prompting (proven with Boogu and Krea2).
- **`MpiInpaintHeal`** (bench-only, not released) and the **ReplaceSubject LoRAs**
  (App candidates, too specific for a model op) → `removal.md`.
