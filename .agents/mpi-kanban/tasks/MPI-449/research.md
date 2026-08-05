# MPI-449 — MiniMax H3 weight research (2026-08-05)

Scope of this pass: **what to download and why**, int8 only. Nothing downloaded yet — the
user pulls the files by browser. Runtime measurement is the next pass.

## 0. The blocker that outranks everything technical

The **MiniMax H3 Community License Agreement** (release date 2026-08-02) defines:

> "Excluded Territories" means the European Union, the United Kingdom, the Republic of
> Korea and the United States of America.
> "Applicable Territory" means worldwide, excluding the Excluded Territories.

The licence grant is "expressly limited to the Applicable Territory", and the trigger is
"using, reproducing, modifying, distributing, running, or displaying any portion". Governing
law: Hong Kong. Commercial threshold: separate written authorisation above USD 20M/yr.

This machine is in the UK. So H3 is **not** a model Cubric Vision can ship the way LTX or
WAN ship — bench research is one thing, shipping weights or a graph to users is another.
Decide the licence question before any engine bump or `dependencies.js` entry.

Same clause is why no turbo LoRA exists yet (§4).

### Mitigations assessed (2026-08-05)

| Idea | Verdict |
|---|---|
| Don't re-host the weights; point the dep straight at Comfy-Org's HF repo | **Real, partial.** Kills the §III redistribution claim outright — the clearest and most enforceable one. Leaves our own §V.4 use, and §II's "encourage or permit any person to violate". Mechanically free: `downloadManager._mirrorUrlsFor` already allows arbitrary `url` + `noMirror`, and 65 existing deps already point at third-party HF repos |
| Free / open source / donation-funded | **No effect on rights.** §II's carve-out is territorial, not commercial. Drops us below §IV.1's USD 20M threshold and makes damages theoretical, so it lowers the stakes without changing the position |
| Watermark the output | **Nothing.** No provision anywhere trades marking for territory. §V.4 bars Outputs regardless. §III.3.b (AI identifier) and Exhibit A #12 are obligations layered on a licence you'd have to already hold, never a substitute |
| Apply for a licence | **The actual fix, and it worked.** §II ¶2 invites it, and MiniMax runs an official request form for excluded territories — linked from `docs/QA-about-License.md` in the H3 repo. Authorization was granted on 2026-08-05, same day as the request. **This repo is public and the request carries a confidentiality undertaking, so the request, the approval and the applicant details are held OUTSIDE it:** `C:/AI/Mpi/_private/minimax-h3-licence/`. Do not copy any of it back in |

The snag in an application is §V.5: safeguards that must be implemented, maintained, tested,
and not "permit the circumvention" of. An open-source local app cannot honestly promise
that. The draft states this plainly rather than agreeing to a term we can't meet.

**Precedent that the ask is not hopeless.** Comfy Org is in San Francisco — the USA is an
Excluded Territory — yet it hosts `Comfy-Org/MiniMax-H3` (distribution under §III), did the
pruning and int8 convrot quantisation (Model Derivatives under §I.11), and shipped day-zero
support, which needed pre-release access. And `realrebelai/MiniMax-H3_GGUFs` states verbatim:
"i have permission under a license agreement with MiniMax." MiniMax grants case-by-case
arrangements to both funded companies and lone contributors.

## 1. What the two DiTs actually are

Two separate 24-B-ish DiTs, one file each, **not interchangeable**:

| DiT | ComfyUI node | Covers |
|---|---|---|
| `fl2va` | `MiniMaxH3ImageToVideo` | **T2V** (no image connected), **I2V** (first frame), last-frame, and first+last-frame interpolation |
| `ref2va` | `MiniMaxH3ReferenceToVideo` | Omni-reference: <=9 images, <=3 videos (each may carry its own audio), <=3 standalone audio clips, <=12 files total. Prompt addresses them by tag `<Picture 1>` / `<Video 1>` / `<Audio 1>` |

`fl2va` is the everyday workhorse (three of the four ops). `ref2va` is the character /
style / voice-lock model — the one that matters for the LoRA-free character bet.

Both emit **video + native stereo 32 kHz audio in one pass** (NestedTensor latent pair:
video `[B,24,T,H/16,W/16]` + audio `[B,32,2,T40]`), 24 fps, 4–15 s.

Not in the open weights: **H3-Context-IR** (the hosted prompt-refinement front end MiniMax
calls "critical to quality") and **H3-Regenerate-2K** (the 768p→2K second pass). Local =
H3-Base only, 768p short edge. The "2K" headline is an API-only feature today.

## 2. `pruned` and `convrot` decoded

- **`pruned`** — Comfy pruned the modulation weights (~40% of params) and replaced them
  with lookup tables. Comfy states **no quality loss**. 66% smaller. There is no reason to
  take a non-pruned file; the 34.04 GB `int8_convrot` and 40.23 GB `pruned_bf16` are
  strictly worse deals than `pruned_int8_convrot` at 20.97 GB.
- **`convrot`** — rotation-based (Hadamard-style) quantisation, group size 256, applied
  row-wise before int8. **Native ComfyUI core**, no custom node: `comfy/ops.py` handles
  `int8_tensorwise` + `convrot` and `convrot_w4a4`, `comfy/quant_ops.py` registers the algo.
  Runs on Ada — it is not a Blackwell format.
- **`nvfp4_awq`** — Blackwell (RTX 50xx) native format. The official templates default the
  text encoder to it, which is wrong for a 4060 Ti (sm_89). Swap it for `int8_convrot`.

## 3. The download list — int8, RTX 4060 Ti 16 GB + 64 GB RAM

All from `https://huggingface.co/Comfy-Org/MiniMax-H3` (ungated).

| File | Size | Target folder |
|---|---|---|
| `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20.97 GB | `C:/AI/diffusion_models/` |
| `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | 20.97 GB | `C:/AI/diffusion_models/` |
| `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | 27.14 GB | `C:/AI/text_encoders/` |
| `vae/minimax_h3_video_vae_fp16.safetensors` | 5.21 GB | `C:/AI/vae/` |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB | `C:/AI/vae/` |

Both DiTs = **74.90 GB**. One DiT (start with `fl2va`) = **53.93 GB**.

**Revised recommendation — int8 DiT, int4 text encoder.** Swapping the encoder for
`qwen3vl_32b_minimax_h3_int4_convrot.safetensors` (14.95 GB, from
`Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot`; there is no int4 encoder in Comfy-Org's repo)
drops the one-DiT set from 53.93 to **41.74 GB** and takes real pressure off system RAM
during the encode pass. int8 is kept where it matters — the DiT. Arrived at by reverse-
engineering a shipping third-party pack whose stated footprint is "about 40GB for Text to
Video and Image to Video, plus 20GB if you add Reference to Video": 20.97 + 14.95 + 5.21 +
0.61 = 41.74, and the "+20GB" pins the second DiT at pruned int8 rather than int4 (11.34).
Same source claims 12 GB VRAM minimum / 16 GB recommended, and that system RAM matters more
than VRAM — consistent with Comfy's own 8–12 GB + dynamic-offload claim. Unverified here.
`C:` has **205.8 GB free**, so the 53.7 GB ceiling on `G:` recorded in the brief no longer
applies — the storage half of the card is answered.

`extra_model_paths.yaml` on the bench had **no C:/AI mapping for text_encoders or vae** —
added under `comfyui_external` on 2026-08-05, and `C:/AI/text_encoders/` + `C:/AI/vae/`
created. Needs a bench restart to take effect.

**Text encoder note:** Comfy-Org's 27.14 GB encoder already omits Qwen3-VL language layers
50–63, the final norm and the LM head — H3 consumes the *unnormalised* hidden state after
layer 49. So it is not a "full 32B" download; there is nothing further to trim without
dropping precision.

### Deliberately skipped

| File | Why not |
|---|---|
| `*_bf16` (66.28 GB), `*_pruned_bf16` (40.23 GB) | No headroom, and pruned int8 is the shipped default |
| `*_int8_convrot` unpruned (34.04 GB) | Pruning is free; 13 GB for nothing |
| `*_pruned_fp8_scaled` (20.96 GB) | Same size as int8_convrot, and convrot is the format Comfy's own templates ship with |
| `qwen3vl_32b_..._nvfp4_awq` (15.69 GB) | Blackwell format; the templates' default is a 50-series assumption |
| `qwen3vl_32b_..._bf16` (51.51 GB) | Would not fit alongside a DiT in 64 GB RAM |

### Community mirrors — checked, not needed

- `Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot` — biggest community hub (43k dl). Its int8
  files are byte-identical in size to Comfy-Org's. Adds **int4_convrot** DiT (11.34 GB),
  **mixed int4/int8** (15.90 GB, ~15.5 GB VRAM) and an **int4 text encoder** (14.95 GB).
  Out of scope while int8-only, but this is the fallback if int8 turns out to crawl.
- `Gluttony10/MiniMax-H3-INT8-CONVROT` — 47 GB unpruned int8. No.
- `realrebelai/MiniMax-H3_GGUFs` (84k dl combined with Abiray's) — Q2_K/Q3_K_M/Q4_K_M,
  15.6–19.9 GB. Needs ComfyUI-GGUF and goes in `unet/`. Not int8; parked.
- `ethanfel/Qwen3-VL-32B-Ultra-Heretic-...-INT8-ConvRot` — uncensored/abliterated Qwen3-VL
  encoder, 26.36 GB, plus a 7.61 GB "generation tail" (layers 50–63 + LM head) that only
  the author's `ComfyUI-MiniMax-H3-Guide` node uses for prompt enhancement. Interesting for
  prompt-rewriting later; irrelevant to base generation.
- `Kijai/MiniMax-H3-TAE` — README only, no weights yet. Watch it: a tiny AE would give
  cheap latent previews on a model where a full video VAE decode is 5.21 GB.

## 4. Turbo / lightning LoRA — none exists

- Searched HF by name for lora / lightning / turbo / distill against H3: **zero hits.**
- The official `MiniMaxAI/MiniMax-H3` repo has no distill or LoRA folder.
- H3 is **guidance-distilled but not step-distilled**. That is why the templates use
  `BasicGuider` + `SamplerCustomAdvanced` with no CFG node — CFG is baked in, one forward
  pass per step.
- Comfy-Org discussion #11: "Ostris is already working on a 4-step LoRA for H3." Same
  thread notes the Excluded-Territories clause is what stops LightX2V and other EU/US/UK
  authors from publishing a turbo LoRA at all. Expect a slow, non-Western trickle.
- Community step advice today: **15 steps is reportedly indistinguishable from 20**, plus
  the `easycache` node. That is the only speed lever until a distill lands.

## 5. Sampling recipe from the official templates

Templates exist upstream at `Comfy-Org/workflow_templates@main` —
`video_minimax_h3_{t2v,i2v,r2v}.json` — but are **not in the installed
`comfyui_workflow_templates` 0.11.31** (that is also the latest on PyPI). So they will not
appear in the bench's template browser; pull the JSON from GitHub raw and drag it in.
Copies fetched to the session scratchpad during this research.

- Sampler `res_multistep`; scheduler `simple` (the r2v note says **`beta` or `normal` beats
  `simple` for reference-heavy prompts**); 20 steps, denoise 1.0
- `BasicGuider` (no CFG), `RandomNoise`, `SamplerCustomAdvanced`
- The single joint LATENT feeds **both** `VAEDecode` (video VAE) and `VAEDecodeAudio`
  (audio VAE)
- Frame count must satisfy `n % 17 == 5`. The templates do it with a
  `ComfyMathExpression`: `max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17`
  where `a` = duration in seconds. 5 s → 124 frames.
- Canvas: 768 short edge, 768x1344 cap, each axis a multiple of 32. `ResolutionSelector` at
  0.4 MP → 864x480 for 16:9.
- `ref_image_size`: `match` = downscale refs to output res (fast); `max` = up to 2048 short
  edge for identity fidelity, but reference tokens ride along **every** step.
- **Sage Attention roughly doubles speed** per Comfy's docs (some layers fall back).

## 6. Runnability — what is known vs what still needs measuring

Known: Comfy claims 8–12 GB VRAM is workable via dynamic offloading (an RTX 3060 is cited),
with **64 GB system RAM strongly recommended**. This machine has **68.5 GB** — it clears
that bar. One third-party report: 194 s for 20 steps at 864x480, 5.17 s of video (GPU
unstated). Comfy notes pruned int8_convrot costs ~14% more time per step than the smaller
formats, in exchange for quality.

Still unmeasured here, and the reason the card stays open:

1. Peak RAM with the 27 GB encoder plus a 21 GB DiT resident in the same run.
2. Seconds/step on the 4060 Ti at 864x480, 5 s.
3. Whether ComfyUI unloads the encoder before the DiT loads, or holds both.
4. Whether audio decode adds meaningful time.

## 7. Sources

- <https://huggingface.co/Comfy-Org/MiniMax-H3> (file tree + README, via HF API)
- <https://huggingface.co/MiniMaxAI/MiniMax-H3> (README + LICENSE)
- <https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui>
- <https://docs.comfy.org/tutorials/video/minimax/minimax-h3>
- <https://huggingface.co/Comfy-Org/MiniMax-H3/discussions/11>
- `github.com/Comfy-Org/workflow_templates` `templates/video_minimax_h3_*.json`
- Bench source: `G:/ComfyUi/ComfyUI/comfy/ops.py`, `comfy/quant_ops.py`,
  `comfy/text_encoders/minimax.py`, `comfy_extras/nodes_minimax_h3.py`
