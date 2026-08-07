# MPI-466 - Collapse LTX to ONE card

## What we ship today

| card | weight | size |
|---|---|---|
| `ltx-23` (High) | `ltx-2.3-22b-distilled-1.1_transformer_only_bf16` | 41GB |
| `ltx-23-balanced` | `..._fp8_scaled` (RTX 40 & older) / `..._mxfp8_block32` (Blackwell) | 25.2 / 24.1GB |

Both cards are **distilled-1.1**. The Balanced card carries a `variants.arch` block, which is
also what produces the `_fp8` / `_mxfp8` workflow-file suffixes.

## What changed upstream

`Kijai/LTX2.3_comfy` now publishes int8 for both model lines, and the distill delta as a LoRA:

```
diffusion_models/ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors           21.5GB
diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot.safetensors 21.5GB
loras/ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors      2.74GB
loras/ltx-2.3-22b-distilled_lora-dynamic_fro09_avg_rank_105_bf16.safetensors          2.59GB
```

The two LoRAs are the **same artifact for two distill generations** — `distilled` (original) and
`distilled-1.1` — mirroring the two full checkpoints. `loras/README.md` says only *"Distill loras
from Lightricks/LTX-2.3, rank reduced for smaller size"*: they are Lightricks' official distill
deltas, rank-reduced by Kijai. **We ship distilled-1.1, so the rank-111 file is the matching one.**
(The `dynamic` / `fro09` / `avg_rank` tokens read as per-layer dynamic rank at a 0.9 Frobenius
energy threshold, average rank 111 — that decode is from the naming convention, NOT stated in the
README.)

## The plan

**One card**: `ltx-2.3-22b-dev_transformer_only_int8_convrot` (21.5GB) + the rank-111 distill LoRA
(2.74GB), toggled at runtime. LoRA **off** = dev quality (real CFG, more steps); LoRA **on** =
distilled speed. **24.25GB replaces ~66GB of card-pair.**

This is not a new mechanism — **Krea 2 already does it**, and `models.js` says so:

> *"The old separate Turbo card is GONE: the `Accelerator Lora` (turbo-distill, an SVD delta
> extracted FROM Raw) reconstructs the Turbo transformer at runtime rather than a second ~12GB
> download. `capabilities.turboToggle` drives it."*

The wiring to copy: `capabilities.turboToggle: true` → the `krea2Turbo` PromptBox control
(`MpiPromptBox.js:1413`) → injects `Input_is_Turbo` (MPI-365) → the `Accelerator Lora` node's
MpiMath (`0.0 if a == 1 else 1.0`) sets strength. Krea2's card is `sizeTier: 'balanced'` on the
grounds that *"the accelerator LoRA means one install now covers both"*.

Krea2 also answers two questions in advance: the toggle drives **more than LoRA strength** (it moves
steps and discards the negative), and `negativePrompt` stays **`true`** on the card — turbo computes
the negative and throws it away, rather than the flag flipping per mode.

## Evidence so far (bench, 2026-08-07)

The user A/B'd the **distilled-1.1 int8** against our shipped fp8: **better in every way — sound,
hands, eyes — and 10 s faster.** Measured on a 2 s clip at 320x640, so the margin is small-clip
inflated and needs re-checking at a shipping tier.

That evidence supports the **safe subset**: swap Balanced's fp8/mxfp8 → distilled-1.1 int8, no LoRA,
no card change. If the full plan stalls, ship that alone — it is strictly better and nearly free.

## The gate that decides the whole plan

**Does a bf16 rank-111 LoRA patch cleanly onto int8 weights, at quality?** Turbo mode *is* that
operation. The A/B above does NOT prove it — the distilled int8 runs *without* a distill LoRA.

Cheap partial proof already available: those runs had `ltx23-lora-merged` (3.87GB),
`ltx23-lora-transition` and `ltx23-lora-talkvid` in the graph. **If any were live in those
generations, LoRA-on-int8 patching works**, and the only remaining question is whether a rank-111
distill delta specifically survives it. Check which slots were active before designing anything.

## Other open items

- **Arch.** int8 should run on Ada/Ampere where mxfp8 cannot. One run on a non-Blackwell card
  decides whether `variants.arch` (and the `_fp8`/`_mxfp8` workflow suffixes) can be deleted.
- **dev needs its own sampler tune.** `LTXVScheduler` over `ManualSigmas`, the split-sigma
  two-stage, and the stage-2 `0.85` fix were all measured on **distilled**. Non-distilled dev wants
  real CFG and more steps; `docs/models/ltx/workflow-authoring.md` already parks this.
- **The three baked LoRAs were tuned against a distilled base** — re-check them on dev.
- **R2.** LTX deps serve from `models.cubric.studio` with HF as `mirrorUrl`, so adoption means
  uploading, not just re-pointing a URL. LTX's licence permits re-hosting (unlike H3).
- **Sequencing vs the LTX workflow migration (MPI-456).** That migration is already collapsing 12
  workflow files toward 3 via `MpiStageLatents` + the i2v/t2v merge. Killing the arch axis would take
  it further. Decide whether this rides along or lands after — doing both blind at once is how a
  silent half-wire gets in.
