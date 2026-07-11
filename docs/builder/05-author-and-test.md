# 05 — Author & test the workflow

## The cooperative loop

User drives the ComfyUI GUI in the browser (proxy `:8188`); the agent edits the
template JSON on disk / guides Pod commands. **The agent cannot watch video — the
visual verdict is always the user.** The agent handles plumbing (JSON, downloads,
logs, settings capture).

⚠️ **Stale-disk rule:** always confirm the user has **SAVED + CLOSED** the ComfyUI
tab before any JSON write. Live ComfyUI state ≠ what's on disk.

## Before a workflow will RUN — required setup (2026-06-23)

- **Seed latents in `input/`.** The LTX template's `LoadLatent` nodes
  (`ltx_video_latent`, `ltx_audio_latent`, for continue/extend) need their seed
  `.latent` files present in `/opt/ComfyUI/input/` or the graph errors on load. Drop
  them there (Jupyter `input/` folder) before the first run. Example assets
  (`example.png`, audio for i2v tests) also live in `input/`.
- **Windows→Linux LoRA path mismatch.** A template saved on Windows stores LoRA
  names with a **backslash** (`LTX2.3\foo.safetensors`); Linux ComfyUI lists them
  with a **forward slash** (`LTX2.3/foo`) and string-matches literally → the node
  shows "missing" even though the file is present. Fix: re-select each from the
  dropdown (the file IS in the list), OR
  `sed -i 's#LTX2.3\\\\#LTX2.3/#g' the template JSON before loading. **Re-save the
  workflow on Linux** so the stored paths use `/` and the next load is clean.
- **Jupyter subfolder navigation is per-Pod.** Some Builder Pods let Jupyter expand
  subfolders + cd into them; others (the flaky ones) only show root. Don't assume —
  if the tree won't expand, use the RunPod Web Terminal instead.

## Node-naming law (HARD)

App-facing nodes MUST use the `Input_*` / `Output_*` prefix vocabulary. New nodes
not in the Tier-1 vocab MUST be `Input_*` / `Output_*` (MPI-116). MPI custom nodes
only in anything that ships — **never rgthree in the app** (rgthree is
authoring-only on the Builder; the app strips it). CFG locked at 1 (distilled).

The current LTX template's full `Input_*`/`Output_*` node inventory lives in the
MPI-4 spec §1 (`ltx-integration-spec.md`) — read it before re-wiring.

## Live latent previews (LTX / packed-latent video) — MPI-166

LTXAV (and any patch-packed video latent) shows NO live preview by default: the
in-loop sampler latent is packed transformer tokens, not a `[B,C,F,H,W]` grid, so
core ComfyUI's previewer (matmul OR taesd) produces nothing. Don't chase a taeltx
decoder — the working path is the KJNodes **`LTX2SamplingPreviewOverride`** node
with its own built-in LTXAV rgb-factors (cheap matmul, no extra model, zero added
per-step cost). When authoring an LTX-class video workflow:

- Wire the override AFTER the `Model_Connect` reroute so it wraps whichever loader
  the engine-split keeps: `UNETLoader → Model_Connect → LTX2SamplingPreviewOverride → rest`.
  Leave `vae`/`latent_upscale_model` for optional preview upscaling; do NOT connect
  a `taeltx` VAE (taeltx mode only triggers on a `TAEHV` vae and isn't needed).
- The node is title-driven friendly — `generate_ltx.py` carries it into all 8
  output files untouched.
- The node sends previews with VideoHelperSuite's **28-byte** binary header, not
  core's 8. The app already handles this (`comfyController._stripPreviewHeader`
  scans for the JPEG SOI marker) — but if previews show in ComfyUI's UI yet NOT
  in the app card, that header mismatch is the first suspect.

Full detail (why each dead end is dead, the SOI fix, multi-frame looping):
[../models/ltx/workflow-authoring.md](../models/ltx/workflow-authoring.md) § "Live latent previews".

## Strength defaults — don't blind-hunt

LoRAs default to **0.5**, sweep 0.3–0.7 (the distilled-LoRA law). See
[../models/ltx/lora-strength-law.md](../models/ltx/lora-strength-law.md). Watch total stacked
LoRA strength < ~1.5 or quality degrades.

## Save what you learn

When a test concludes:
1. **Save the workflow JSON** (and note the settings that produced a good result).
   Local home: `G:/ComfyUi/ComfyUI/user/default/workflows/`.
2. **Graduate concluded findings** into [research/](research/) (and leave a pointer
   in the task log). The live blow-by-blow stays on the task card; the *conclusion*
   comes here so the next session doesn't re-test it.
3. Before logging a FINAL workflow: unmute any test-muted nodes (e.g. the 2×
   SaveLatent), repath any LoRAs you moved folders, drop test-only overrides.
4. **Record the progress-bar stage count** (MPI-147). Run it, count how many times a
   tqdm bar restarts at 0 in the ComfyUI terminal (incl. the `0/1` model-load bar),
   and add the count per run mode to `js/data/progressStages.js`. Full procedure:
   [comfy_workflows/scripts/workflow_generation/README.md](../../comfy_workflows/scripts/workflow_generation/README.md)
   § "Progress stages". (UltimateSDUpscale / detailer self-declare; ESRGAN upscale
   pulses — no entry needed for those.)

## SaveVideo split contract

All video workflows output via the portable native pipeline `CreateVideo → SaveVideo`, NOT
`VHS_VideoCombine` / `nvenc_h264`. NVENC fails on Blackwell Pod containers
(`OpenEncodeSessionEx failed: unsupported device`). Capture-node titles: final =
`Output_Video` (+ optional `Output_Audio`); two-pass `_ms` preview = `Preview` (no audio).
The app captures by title workflow-agnostically via `_collectComfyOutputUrls` reading
`videos[]`. Converted ops bumped `latestVersion` 1.0→1.1 in BOTH
`js/core/operationRegistry.js` AND `operation_registry.json`. **Agents NEVER edit
`comfy_workflows/*.json`** — they are the user's external ComfyUI template.

## Flattening a LoRA stack into ONE file

To fold a live LoRA chain (e.g. SoftEnhance → Abliterated → Detailer) into a single
reusable `.safetensors` — the "make it ours" pattern — do NOT use CheckpointSave or the
native merge nodes (both are dead on LTX). Extract the combined delta with KJNodes
`LoraExtractKJ`, then union the model+clip halves. Full LIVE-PROVEN recipe + the four
dead ends: [../models/ltx/lora-merge.md](../models/ltx/lora-merge.md). Script:
[comfy_workflows/scripts/merge-loras/](../../comfy_workflows/scripts/merge-loras/).
