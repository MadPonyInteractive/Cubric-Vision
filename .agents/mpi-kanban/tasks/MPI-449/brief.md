# MPI-449 Brief — MiniMax H3 research on the bench

Goal: find out whether MiniMax H3 is usable for Cubric Vision **before** spending an
engine bump on it. The bench is the sandbox; the engine stays pinned at 0.29.2 until
this card returns a go.

## What is already done (2026-08-05)

The bench at `G:/ComfyUi` was bumped **0.29.2 -> 0.30.2** (latest tag). Verified live
against the running server, not the files:

- `/system_stats` reports `0.30.2`
- **zero** custom-node import failures across all 20 packs
- `bg_removal` and `controlnet` dropdowns still enumerate (yaml did not drift)
- H3 nodes registered: `EmptyMiniMaxH3LatentAV`, `MiniMaxH3ImageToVideo`,
  `MiniMaxH3ReferenceToVideo`, `MiniMaxH3SigmaShift`
- `minimax` is present as a `CLIPLoader` type

Python deps moved: frontend 1.47.11 -> 1.47.12, workflow-templates 0.11.20 -> 0.11.31,
comfy-kitchen 0.2.22 -> 0.2.26, comfy-aimdo 0.4.10 -> 0.4.11. **torch untouched.**
The pre-bump yaml is backed up at `G:/ComfyUi/ComfyUI/extra_model_paths.yaml.bak-v0292`.

No repo file changed. Nothing to commit from the bump itself.

## The blocking question: does it fit?

Weights: `https://huggingface.co/Comfy-Org/MiniMax-H3` (ungated). Sizes measured from
the HF API, not estimated:

| File | Size |
|---|---|
| `diffusion_models/minimax_h3_{fl2va,ref2va}_bf16` | 66.28 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_pruned_bf16` | 40.23 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_int8_convrot` | 34.04 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_pruned_int8_convrot` | 20.97 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_pruned_fp8_scaled` | 20.96 GB |
| `text_encoders/qwen3vl_32b_minimax_h3_bf16` | 51.51 GB |
| `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot` | 27.14 GB |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq` | 15.69 GB |
| `vae/minimax_h3_video_vae_fp16` | 5.21 GB |
| `vae/minimax_h3_audio_vae_fp32` | 0.61 GB |

Local hardware: **RTX 4060 Ti, 16 GB VRAM**; `G:` has **53.7 GB free**.

Smallest set that avoids nvfp4 = 20.96 + 27.14 + 5.21 + 0.61 = **53.92 GB**. That is
already ~200 MB over the free space on `G:`, before any headroom. And the DiT alone at
fp8 is 21 GB against 16 GB of VRAM, so even once it is on disk ComfyUI is offloading
both the DiT and a 27 GB text encoder to system RAM every step.

`nvfp4_awq` (15.69 GB) is the only encoder that would change the arithmetic, but nvfp4
is a Blackwell (RTX 50-series) format and this card is Ada (sm_89). **Whether ComfyUI
dequantises nvfp4 on Ada, and at what speed, is unverified — do not assume either way.**

Two honest options, and the card should pick one rather than half-trying both:

1. **Free disk and try the fp8 + int8 set locally.** Cheapest to start, most likely to
   end in an OOM or a multi-minute-per-step crawl. Worth it only to get a real number.
2. **Run it on a Pod instead.** `docs/builder/README.md` is the existing route and the
   Builder Pod already exists for exactly this. Settles runnability without clearing
   54 GB off `G:`, and it is the only way to see H3 at bf16.

## What the nodes tell us about the model

From `comfy_extras/nodes_minimax_h3.py` at v0.30.2 — H3 is **not** a drop-in for a
WAN or LTX graph:

- Latents are `NestedTensor` **pairs**: video `[B,24,T,H/16,W/16]` + audio `[B,32,2,T40]`.
  It generates picture and sound together.
- 24 fps; audio latent runs at 40.
- Canvas is 768 short edge with a 768x1344 pixel cap, each axis rounded to a multiple
  of 32.
- Frame count is snapped to `n % 17 == 5`.
- Conditioning carries Qwen3-VL-32B hidden states with per-token modality tags, plus
  keyframe/reference condition latents that are re-injected every step and never
  denoised.
- Sampling runs on the flat pack with any stock sampler; the model handles the audio
  stream's shifted schedule internally.
- `fl2va` = first/last-frame to video+audio (`MiniMaxH3ImageToVideo`),
  `ref2va` = reference to video+audio (`MiniMaxH3ReferenceToVideo`). Two separate DiT
  files — you cannot serve both from one download.

There is **no bundled workflow template**: `comfyui_workflow_templates` 0.11.31 ships
none for H3, so the first graph is hand-built.

## Engine bump — deliberately out of scope for this card

The app engine is pinned at `0.29.2` in `dev_configs/system_dependencies.json`. The
bench is now **ahead** of it, so any H3 graph authored on the bench cannot run in
Cubric Vision yet. That is intended: prove H3 is worth having first.

When the bump is considered, it is its own card and it carries the standing risk from
`.claude/rules/comfy_engine.md` — a core bump can break version-sensitive custom nodes,
so the node-floor pairing check runs before the tag is picked.

## The audio half IS a product decision — and it is new ground

Vision's audio line is **input yes, creation no** (confirmed by the user 2026-08-05):
the app accepts audio files and feeds them to video models, but it synthesises no
audio and no audio-creation tooling is scheduled — that is Cubric Audio's job.

LTX is the shipped example and it is the CONSUMING side: `docs/models/ltx/audio-input.md`
(the `LTXVReferenceAudio` wiring, concluded under MPI-4) takes a user's `Input_Audio_File`
as reference and lip-syncs video to it. Nothing in that path generates sound.

H3 is the opposite. `EmptyMiniMaxH3LatentAV` allocates an audio latent, the audio VAE
decodes it, and the model returns a soundtrack it invented. **Shipping H3 would make
Vision an audio-generating app for the first time.** That is a product call for the
user, and it must be answered before any wiring work — not discovered afterwards.

Two things follow. Do not assume the LTX audio I/O or the `Input_Use_Input_Audio` gate
transfer; they are built for audio arriving from disk, not audio leaving the sampler.
And a no on the product question does not automatically kill H3 — dropping the audio
stream and keeping the video may be viable, but whether the model is usable that way is
itself untested and belongs in this card's findings.
