# MPI-128 — LTX-2.3 next-release (app follow-up)

> Spawned from MPI-127 (LTX-2.3 first app integration, shipped **single-stage**).
> This is the APP follow-up. MPI-4 remains the LTX **authoring/research** card.
> Carries everything MPI-127 deliberately deferred to hit the ship deadline.

## Deferred items (from MPI-127, in priority order)

### 1. Dual-latent stage-2 staging → unlocks LTX preview→Continue/Finish
**The blocker that made MPI-127 ship single-stage.** LTX saves TWO latents
(`Output_Video_Latent` + `Output_Audio_Latent`) and stage-2 loads BOTH
(`Input_Video_Latent` + `Input_Audio_Latent`). The current mechanism stages a
SINGLE file:
- `commandExecutor._buildParams` `_ms` block emits `Input_Video_Latent` only
  (audio-latent left unwired — see the NOTE comment there, ~line 474).
- `/comfy/stage-preview-latent` route + `loadLatentName` + `previewLatentFilePath`
  handle one latent.
- `_stagePreviewLatent` (commandExecutor ~line 112) stages one file.

**Work:** preview run persists BOTH latents; stage-2 payload carries both names;
the stage route stages both; `_buildParams` emits both. Then re-enable the
`previewStage` component + branching-continue for LTX ops.
**Verify:** LTX preview → Finish reuses both staged latents; final ≈ preview.

### 2. Self-host the 5 upstream base files
MPI-127 shipped these from upstream to avoid a 39 GB upload under deadline:
- `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` (39 GB) — Kijai
- `LTX23_video_vae_bf16` / `LTX23_audio_vae_bf16` — Kijai
- `ltx-2.3_text_projection_bf16` — Kijai
- `ltx-2.3-spatial-upscaler-x2-1.1` — Lightricks

The 4 community files already mirror to `Mad-Pony-Interactive/cubric-studio`
(gemma, soft-enhance, transition, talkvid). Upload these 5, swap the `url` in
`js/data/modelConstants/dependencies.js`, set `sha256` back to null + recompute.
Re-host rule carve-out (MPI-127): trust stable first-party/Kijai mirrors for the
huge base files; mirror when convenient, not as a ship blocker. With hundreds of
models coming (terabytes), self-hosting everything is not viable — mirror the
deletion-risk community files, link the stable upstreams.

### 3. Kill the `_ms` key-suffix magic
`String(op).endsWith('_ms')` gates multi-stage behavior in several
`commandExecutor` spots (preview, latent injection, capture title). Replace with
an explicit `command.isMultiStage` flag on the op def. Wider blast radius — its
own change, not under a deadline.

### 4. Multimodal input UI (5+ images)
LTX upstream will accept up to 5+ images + audio (and video on some ops). The
`{key, mediaType, min, max}` media-slot seam is already in place from MPI-127;
`max` reads from model capacity. When upstream lands it, bump the data + build the
multi-image UI. No op/executor rewrite needed — data change + UI.

### 5. Deferred LTX branch workflows (separate templates each)
- lipdub v2v (`LTX_lipdub_v2v_template.json`, LoadVideoUpload-split bug)
- lipsync-v2v-2
- video extend
- CTRL / pose (IC-LoRA union control + SDPose wholebody)
- head-swap (BFS nodes — `ComfyUI-BFSNodes`, dropped from MPI-127 ship set)

Each is its own `LTX_*_template.json` + `generate_ltx.py` already fans
template→files, so most reuse the existing handler.

## What MPI-127 shipped (do not redo)
LTX-2.3 single-stage i2v + t2v with audio (Reference/Original modes), 9 ship
deps, ComfyUI-LTXVideo node (pinned), tier-2 param feed (dual-emit alias),
capture fix, audio-mode UI. WAN bumped to tier-2 in the same release.
