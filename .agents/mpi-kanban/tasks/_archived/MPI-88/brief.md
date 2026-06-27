# MPI-88 — No-GPU "download mode" Pod

> Promoted from MPI-64 Phase 4 (plan.md line 145) / OPEN-ITEMS F6. User request 2026-06-12. A feature, not validation.

## Problem / goal

Downloading a large model set (e.g. 78 GB) to the network volume currently requires a GPU Pod running the
whole time → the user pays GPU billing just to download. A no-GPU (or cheapest CPU-only) Pod can mount the
volume at `/workspace` and run the wrapper's `/wrapper/models/install` exactly as a GPU Pod does — landing
files on the volume with NO GPU cost. The user then disconnects and reconnects a real GPU for generation
(volume + models persist — Design A).

## Open questions (resolve FIRST — investigation before build)

a. **Does `client.createPod` accept a CPU-only / `gpuCount:0` spec on Secure Cloud?** Or is a separate CPU-Pod
   RunPod API path required? (Check the RunPod create API + Secure Cloud CPU instance offerings.)
b. **UI affordance:** a distinct "Download only (no GPU)" action in Settings, separate from Connect? Or
   auto-pick the cheapest instance when the only pending action is a model download?
c. **Gate generation OFF in download-mode:** no GPU means a sampler workflow fails / CPU-crawls. Even if
   `/health.comfy_ready` is true, surface "connect a GPU to generate" and block gen dispatch.
d. **Idle-watchdog still applies** (the wrapper self-stops after N min idle — same as a GPU Pod).

## Likely files

- `routes/runpodRemote.js` / `routes/remoteProxy.js` — the createPod spec (CPU/gpuCount:0 path) + a
  download-mode create variant.
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — the "Download only" affordance.
- The gen-dispatch gate (comfyController `_ensureRemoteReady` / commandExecutor) — block gen in download-mode.

## Verify

- User provisions a no-GPU Pod, downloads a large model to the volume with ZERO GPU billing (only volume +
  minimal CPU instance cost), disconnects, reconnects a GPU Pod, and the model is present + usable without
  re-download.
- Generation is clearly blocked while in download-mode with a "connect a GPU to generate" message.

## Related

- MPI-64 (the remote-engine epic this spun out of), Design A (volume persists across Pods).
- MPI-86 (cancel-connect), MPI-87 (pull-progress) — sibling Phase-4-UX cards spun out of MPI-64.
