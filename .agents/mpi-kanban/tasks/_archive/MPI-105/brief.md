# MPI-105 — Remote Pod: request NVMe disk

## Problem
The app's `_createPodInternal` (`routes/remoteProxy.js`) builds the Pod spec with NO
disk-type preference. RunPod then places the Pod on any host with free storage —
frequently slower SSD. NVMe is materially faster for loading big model weights
(Wan/Flux/Qwen), which dominates remote gen warm-up time.

## Key finding (needs confirmation)
In the RunPod console the **NVMe / SSD** control lives under the GPU picker's
"Additional filters" — it is a **host-availability filter** (narrows which hosts
the picker offers), NOT an obvious field on the Pod create payload. So:

- RunPod REST `POST /pods` may have **no** `diskType` field. (Confirm against the
  current REST schema — `runpodRemote.js` has no disk-type handling today.)
- If unsupported as a field, the fix is to **filter the GPU/datacenter list** the
  app deploys onto to NVMe-capable hosts (the picker data the app already reads in
  `/runpod/gpu-availability`).

## Scope
- Investigate REST `/pods` for any disk-type / storage-class hint.
- If present: set it in `_createPodInternal`.
- If absent: filter the deploy host list to NVMe; surface in the GPU picker.
- Applies to BOTH the product image Pods and the new `cubric-vision-builder`
  authoring image (deploy-time concern — **no image rebuild**).

## Notes
- Raised during the cubric-vision-builder authoring-image work (2026-06-16).
- Low risk, perf-only. Not blocking.
