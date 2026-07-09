# MPI-108 — Re-stage local preview latent after an ephemeral-Pod engine restart

> Follow-up carved off **MPI-89** (remote input-asset transfer; leg 3 verified
> 2026-06-17). App feature/bug.

## Symptom (observed live 2026-06-17)
On an **ephemeral** L40S Pod (image v0.4.8-cu124), a **local-origin** preview →
remote **Continue** failed to load the preview latent:
- Toast 1: `Loading new nodes — restarting the remote engine…` (per-model node
  install triggered a ComfyUI restart).
- Toast 2: `Preview latent missing — running stage 1 from saved snapshots, then
  stage 2.` (fallback).
- Toast 3 (next attempt): `Stage 1 rerun finished but latent was not produced.`
  → stage-2 had nothing to load.

## Root cause
The preview `.latent` lives in the local project (`<project>/Media/.latents/`).
On a remote Continue it is uploaded to the Pod's ComfyUI `input/` dir via
`commandExecutor._stagePreviewLatent` → `/comfy/stage-preview-latent` remote branch
→ `/wrapper/upload/latent`. On an **ephemeral** Pod (container disk, no volume) a
ComfyUI **restart for a node install** clears the `input/` dir, so the just-staged
latent is gone by the time stage-2 submits. The fallback ("rerun stage 1 from
snapshots") is graceful UX but bypasses the exact preview latent — and was observed
to finish without producing a latent at all in one run.

NOTE: this is NOT a transport bug. MPI-89 proved the staging/upload + the
produce-on-Pod → return-to-app round-trip all work. The gap is purely **ordering /
persistence**: a restart between stage and stage-2 on an ephemeral Pod.

## Scope
1. After an ephemeral-Pod engine restart (per-model node install), **re-stage**
   (re-upload) the preview latent to the Pod `input/` dir BEFORE the stage-2 submit,
   so Continue reuses the exact preview latent instead of falling back.
2. Tighten the fallback: if "rerun stage 1" is taken, it must actually produce a
   latent (or surface a precise warning) — never silently leave stage-2 with nothing.

## Likely files
- `js/services/commandExecutor.js` — `_stagePreviewLatent` (~107), the `_ms` submit
  flow (~807), and the restart-comfy / node-install gate that precedes stage-2.
- `routes/comfy.js` — `/comfy/stage-preview-latent` remote branch (~177-209).
- The restart-comfy path (`POST /wrapper/restart-comfy`) ordering vs. staging.

## Verify
- Local-origin preview → connect to an **ephemeral** Pod that needs a node install
  → Continue → stage-2 loads the **exact** preview latent (no "latent missing"
  fallback, no regen).
- Remote-origin preview → Continue still works (MPI-89 regression check).

## Related
- **MPI-89** (parent; legs 1+2+3 verified, this edge carved off).
- [[project_remote_comfy_restart_v042]] — wrapper owns+supervises ComfyUI;
  `POST /wrapper/restart-comfy` reloads only ComfyUI on a per-model node install.
- MPI-78 family — no-volume "Any region" ephemeral Pod (the disk mode that exposes this).
