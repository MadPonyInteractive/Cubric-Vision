# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## Engine

- **ComfyUI engine updated to 0.28.0** (from 0.27.0). Brings Qwen3-VL tokenizer
  fixes (image describer + Krea2 edit CLIP), a text-model sampling speedup, and
  int8/int4 optimizations that mainly help local Turing/16xx-series GPUs. No
  workflow or behaviour changes — every shipped model was re-swept and passed.

## What's new

- **Depth Control for SDXL models.** The five SDXL generators (SDXL Realistic,
  SDXL NSFW, ILL Anime Beauty, ILL Anime, PONY Mix) can now follow the pose and
  composition of a reference image using a depth ControlNet. Pick the **Depth**
  op, drop in an image, and the result keeps its structure while your prompt
  drives the content.

- **New RunPod setting — "Stage all models on connect"** (off by default). When
  on, every installed model is copied to the cloud Pod's fast disk the moment it
  connects, so your first generation is instant instead of waiting on the
  first-use copy. Off keeps the default behaviour (models stage on first use,
  copying only what you actually generate with).

## Fixes

- **Cloud model installs verify almost instantly now.** After a model downloads
  to a RunPod engine, the app no longer re-reads every weight back off the slow
  network volume to checksum it — a completed multi-connection download is
  trusted directly, so the "Verifying…" step that could run longer than the
  download itself (~3 min on a 2 GB file) is now near-instant.

- **Cloud model switching is dramatically faster.** Switching between image
  models on a RunPod engine no longer re-reads the weights from the slow network
  volume every time — they're staged to the Pod's fast local disk, cutting a
  cold switch from ~2 minutes to a few seconds. The Pod's disk now auto-sizes to
  your network volume so the whole model set fits. Video models (LTX) that stream
  by design are unaffected.

- **Fixed: copying a mask dropped the auto-detected regions.** Copy mask only
  carried your brushed/erased strokes, so the auto-detected selection was lost
  on paste — and a mask made purely from auto-detect copied as nothing. It now
  carries the auto-detected regions too, matching what Download mask already
  exported.

- **Completion toast now fires reliably.** A single generation finishing while
  the app is focused now shows the "Generation finished." toast — previously
  only multi-generation batches did. Notifications are quieter overall: routine
  confirmations (importing a model, uninstalling, adding cards to a project,
  switching models to continue a preview) no longer play a sound, and returning
  to the app after a download finished no longer replays a duplicate toast.
