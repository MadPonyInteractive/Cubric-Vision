# MPI-89 — Remote input-asset transfer for non-image inputs

> Promoted from MPI-64 Phase 4 (plan.md line 140) / OPEN-ITEMS B1. App feature.

## Problem (local-coupling inventory item 5)

Images + masks already upload to ComfyUI (`/upload/image`, static filenames) and work remotely. But:
- **Video/audio inputs** are injected as ABSOLUTE LOCAL filesystem paths (`_resolveMediaPath`,
  `comfyController.js`) that VHS nodes read from disk → broken on a remote Pod (the path doesn't exist there).
- **Trimmed video inputs** are written as local temp files by `POST /api/video/trim-input` → same problem.
- **Multi-stage preview latents** are copied into the local ComfyUI `input/` dir by
  `POST /comfy/stage-preview-latent` → broken remotely.

## Scope

1. **Video/audio upload** replacing local-path injection → wrapper `/wrapper/upload/media` (exists, Phase 2);
   the injected path becomes the uploaded remote path. NOTE the MPI-64 B3 design: `Input_Video` may now feed an
   `MpiString` fan-out (to the VHS loader AND `MpiHasAudio`) — the upload + title-injection must respect that.
2. **Trimmed-video flow:** trim locally via the existing `/api/video/trim-input`, THEN upload the trimmed clip
   (not the full source) → remote path injected into `Input_Video`.
3. **Remote `.latent` staging** replacing `/comfy/stage-preview-latent` → wrapper `/wrapper/upload/latent`
   (exists) for the per-preview `<uuid>.latent` (stage-2 / Continue / Finish path).

## Likely files

- `js/services/comfyController.js` — `_resolveMediaPath` remote branch → upload + return the remote path.
- `js/services/commandExecutor.js` — trimmed-input prep already runs before `_buildParams`; route the upload.
- `routes/remoteProxy.js` / `routes/remoteModels.js` — proxy the wrapper upload endpoints with auth + browser-UA.
- The stage-preview-latent route → remote staging branch.

## Status / caveat

Code is PARTIALLY shipped + uncommitted + NOT live-verified (see MPI-64 current-architecture.md §10 "Remote
input-asset transfer"). Confirm what's actually in the tree before extending. Branch RunPod is the shared trunk —
stage by explicit path.

## Verify

- An I2V workflow with a TRIMMED local video input runs remotely with the correct (trimmed) input.
- A two-stage preview-latent workflow runs remotely with the correct staged latent (Continue/Finish).
- Re-running with unchanged inputs preserves ComfyUI exec-cache where the static-filename convention allows.

## Related

- MPI-64 (epic), B3 SaveVideo split (Input_Video MpiString fan-out — respect it on upload).
- Unblocks remote: videoUpscale / resizeVideo / interpolate / extend with a real video input.
