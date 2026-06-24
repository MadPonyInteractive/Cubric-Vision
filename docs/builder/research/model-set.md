# LTX-2.3 Model & LoRA Set

> The weights + LoRAs under evaluation/ship for the LTX-2.3 workflow, plus how they
> load and where they're mirrored. Live download URLs for the Builder Pod are in the
> install script + the parent README's EXTRAS block — this file is the *what & why*.

## Base weights (~68GB, in `install_models_ltx23.sh`)

NerdyRodent FINAL set, post-A/B:
- **Diffusion: full bf16 ONLY** (`ltx-2.3-22b-distilled-1.1_transformer_only_bf16`).
  fp8 dropped ("quality is crap on fp8"); mxfp8 = Blackwell-only → unusable on 3090/4090.
- **Encoder: heretic gemma fp8_scaled** (`anongecko/gemma-3-12b-it-heretic-fp8-comfy`,
  14.5GB) — video+audio. fp4 hurts, full over-influences.
- text projection, video + audio VAEs, spatial **+ temporal** upscalers, IC-LoRA
  union, SDPose, abliterated heretic LoRA, 2× BFS head-swap.
- Needs **16GB+ VRAM + ~32GB+ RAM** (full bf16 via offload).

## Capability LoRAs (all MODEL-ONLY — load via `MpiLoraModel`)

See [lora-strength-law.md](lora-strength-law.md) for the strength conclusions.
Default 0.5, sweep 0.3–0.7.

> **VERDICTS (2026-06-23):** capability LoRAs decided — see
> [lora-strength-law.md](lora-strength-law.md) and [tested-loras-versions.md](tested-loras-versions.md).
> **Ship = base + prompt-contract, NO capability LoRAs.** Table below = status.

| LoRA | Role | File | Size | Status |
|---|---|---|---|---|
| VBVR **I2V** (V4 Sulphur) | reasoning/sequencing for i2v | `LTX2.3_reasoning_Sulphur-2_I2V_V4` | 786MB | ❌ **DROPPED** — base follows prompts; marginal; Sulphur-base mismatch |
| VBVR **T2V** (V1) | reasoning/sequencing for t2v | `LTX2.3_Reasoning_V1` | 658MB | ❌ **DROPPED** — inconsistent across scenes |
| Singularity OmniCine V1 | anatomy + fast-motion + lip-sync, kills subtitles | civitai `3001143` | 2.5GB | ❌ **DROPPED** — degrades audio (no doc fix), ethnicity bias, +size/time |
| Enhancers **Soft** | autofocus/DoF + desaturated polish (Soft only, skip Crisp) | civitai `2849706` | 344MB | ⏳ **UNDER TEST** — leaning keep; MERGE candidate; @0.5 (1.0 hallucinates) |
| Transition | i2v↔i2v / FL transition, on/off toggle | valiantcat HF | — | ⏳ UNTESTED this session; switchable dep, stays separate, FL home |

- **VBVR is MODE-DEPENDENT** (not a version A/B): dev ships I2V=V4, T2V=V1. Load
  the one matching the op. Dev: VBVR is NOT a motion LoRA — "stacks with motion
  LoRAs" → VBVR + Singularity complement, stack both.
- ❌ Fight LoRA SKIPPED (civitai `2489766`) — fighting still bad; this model is weak
  at fight scenes, don't build fight ops on it.
- ❌ Gore/blood LoRA: NONE EXIST for 2.3 (confirmed gap) — train-own or prompt-via-heretic.
- Bonus to test: OmniNFT-RL LoRA (Kijai mirror) fixes audio/video desync + lip-sync
  — relevant to input-audio work. `huggingface.co/Kijai/LTX2.3_comfy`.

## Local LoRA folder convention

All LTX LoRAs nest under `C:/AI/loras/LTX2.3/` (rgthree "Auto Nest Subdirectories")
→ LoRA-name strings carry the `LTX2.3\` prefix (e.g.
`LTX2.3\LTX2.3_Reasoning_V1.safetensors`). Use prefixed names in template + dep
manifest. ⚠️ The NerdyRodent monolith still points at the old ROOT paths — repath
before reusing it.

## Delivery architecture (merge vs switch — DECISION 2026-06-21)

- **Always-on quality LoRAs (VBVR / Singularity / Soft)** → **MERGE INTO MODEL** if
  kept. Bake into shipped diffusion weights: no extra dep, no runtime strength
  stacking, and it kills the mirror-risk for merge-ables. Caveat: VBVR is
  always-on-*but-mode-specific* → either PER-MODE merged models, or keep VBVR as a
  LoRA auto-SWITCHED by `Input_Mode` (not user-toggled).
- **Toggleable LoRAs (transition)** → STAY SEPARATE (need runtime on/off). Mirror them.
- **Heretic gemma** → stays separate (text encoder, different merge target). Mirror it.

## ⚠️ Supply-chain / mirroring TODO

`anongecko/gemma-3-12b-it-heretic-ltx` is a small low-following HF repo — author
could delete it and our default encoder vanishes. **MIRROR the heretic encoder +
Singularity to our own repo before shipping as deps.** (anongecko verified this
session as the real heretic source.)
