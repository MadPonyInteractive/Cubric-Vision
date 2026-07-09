# No-volume "Any region" ephemeral GPU Pod (user-sized container disk)

## Current State

Project mode: file source-of-truth (no scalable-foundation profile).

Mirrors RunPod console **flow #2**: Secure Cloud + Network volume "none" + region
"Any region". User picks container-disk size; models download to ephemeral container
disk; **Terminate** ends all spend (no idle volume bill between sessions). Target
persona: mostly-local user who needs a remote GPU occasionally (e.g. weekly video) —
connect → download → long session → terminate → zero spend until next time.

**No image rebuild.** Verified `mpi-ci/cubric-vision-pod/start.sh`: `/workspace` is just
a mount point; `mkdir -p` creates every model/cache/custom_node dir unconditionally and
ComfyUI loads them via the same `extra_model_paths.yaml`. With no volume, `/workspace` is
plain container-local disk — identical code path. sage recompiles per fresh Pod
(no `/workspace/cubric/.sage_arch` sentinel persistence; non-fatal SDPA fallback,
~5-15 min one-time per session). The GPU cu124/cu128 images run unchanged. (Optional
future optimization: bake sage into the GPU image so no-volume users skip the recompile —
**out of scope for this card**, do NOT couple to any rebuild batch.)

What is already in place (backend, no change needed to enable):
- `_createPodInternal` already gates volume: `if (volumeId) spec.networkVolumeId = volumeId`
  (`routes/remoteProxy.js:444`). A no-volume Pod is already creatable.
- `containerDiskInGb` is a free spec field (`routes/remoteProxy.js:422`, currently hardcoded
  `CONTAINER_DISK_GB = 50`).
- GPU availability already supports a DC-unbound call: `gpuTypes(apiKey, undefined)` →
  `input:{gpuCount:1}` global floor (`routes/runpodRemote.js:122-129`). Known caveat:
  no-DC `lowestPrice` UNDER-reports system RAM (e.g. A4500 reads 29GB vs 62GB in EU-RO-1).

What blocks it today:
- `/remote/pod/create` hard-rejects no datacenter (`datacenter_required`,
  `routes/remoteProxy.js:564`); spec always sets `dataCenterIds: [datacenter]` (`:417`).
- Frontend Connect requires `cfg.volumeId` (`MpiSettings.js:552`) and a pre-Connect guard
  refuses no-volume outright (`MpiSettings.js:632-633`). No disk-size input exists.

## Implementation

- [ ] Add a "no network volume" path end to end so a user can Connect to a Secure-Cloud
  GPU Pod with NO volume and NO data center, choosing the container-disk size (default
  **100 GB**, user-chosen, clamped to a sane min/max), with the GPU dropdown showing the
  DC-unbound "Any region" availability list. **Verify:** see `## Verification`.

  Scope (all app-side, no image rebuild):
  1. **Backend create spec** (`routes/remoteProxy.js`): thread a `containerDiskGb` param
     through `/remote/pod/create` body → `_createPodInternal`; when no `volumeId`, OMIT
     `dataCenterIds` (RunPod auto-places) and OMIT `networkVolumeId` (already conditional);
     drop/relax the `datacenter_required` guard for the no-volume case (keep it required
     when a volume IS selected, since a volume is DC-locked). Use the user disk value for
     `containerDiskInGb` (clamp; do not exceed a safe ceiling — surface RunPod's
     `_createRejectReason` if a host caps lower). `/remote/pod/reconnect` similarly tolerant
     of missing datacenter.
  2. **GPU availability "Any region"** (`routes/runpodRemote.js` + `MpiSettings.js`): when
     no volume is selected, fetch availability with no `dataCenterId` (the existing global
     call) and present the full GPU list with aggregate stock across DCs (best status wins).
     Surface the known no-DC RAM-floor under-report as a small note, not a blocker.
  3. **Frontend no-volume mode** (`MpiSettings.js`): when no volume selected, show a
     container-disk **GB number input** (default 100); change the Connect guard to allow
     `gpuType + diskSizeGb` (today it requires `volumeId`, `:552`); remove/relax the
     no-volume refusal (`:632-633`); pass `containerDiskGb` + `volumeId:null` +
     `datacenter:null` in the create payload (`:665-666`). Add an "ephemeral — models are
     deleted when the Pod is terminated; first generation includes a one-time accelerator
     compile" warning. No DC picker shown in this mode.
  4. **Persistence** (`js/core/storage.js` runpodConfig normalizer): persist the chosen
     `containerDiskGb` (and tolerate `volumeId:null` + `datacenter:null` as a valid saved
     config) so reconnect/boot reuse the same size.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement the no-volume ephemeral-Pod path end to end (backend spec + GPU "Any region"
  list + frontend disk-size input/guard + persistence).
- Live-verify (the only real unknowns — not architectural):
  - Models download to ephemeral `/workspace/mpi_models`, ComfyUI finds them, a generation
    completes.
  - sage recompiles cleanly on a fresh no-volume Pod (warn, non-fatal).
  - Per-model custom nodes (e.g. PainterI2V) install to container-local
    `/workspace/comfyui/custom_nodes` and load after the warm `restart-comfy`.
  - Terminate leaves zero billable resource (no orphan volume, no running Pod).

## Plan Drift

- 2026-06-16 — **Live test 2 found a real bug: ephemeral Pod was getting a hidden 20GB
  volume.** Telemetry on the first ready Pod showed the 7GB SDXL model landing on a
  "Volume usage 7GB/20GB" tile while "Disk usage" stayed 31MB/60GB — the user's chosen
  60GB container disk was unused. Root cause: `_createPodInternal` set
  `volumeMountPath: '/workspace'` UNCONDITIONALLY; RunPod reads `volumeMountPath` (even
  with no `networkVolumeId`) as a request for a Pod-local volume and provisions a default
  ~20GB one at that path. `start.sh` writes models to `/workspace/mpi_models`, so models
  hit that hidden 20GB volume, not the container disk — silently capping ephemeral mode at
  20GB and ignoring the user's size. **Fix (remoteProxy.js):** set `volumeMountPath` only
  when `volumeId || noGpu` (real network volume or CPU download-mode). For an ephemeral
  GPU Pod, omit it → `/workspace` is a plain directory on the user-sized container disk.
  App-side only, no image change. Re-test on a fresh Pod after app restart.
- 2026-06-16 — **Live test 3: the volumeMountPath omission did NOT work — SCOPE GREW to need
  an image change.** Re-tested on a fresh ephemeral Pod (volumeMountPath omitted): model STILL
  landed on a 20GB volume (Disk 31MB/60GB, Volume 7GB/20GB). Proven: **RunPod auto-mounts a
  ~20GB default Pod volume at /workspace on EVERY Pod regardless of the spec**, and start.sh
  hardcodes all model paths to /workspace — so the user's container-disk size was always
  ignored, capped at 20GB. The original "no rebuild" assumption (no volume → /workspace falls
  to container disk) was WRONG. **Real fix is in the image:** `mpi-ci/cubric-vision-pod/start.sh`
  now switches `CUBRIC_ROOT` to `/cubric-data` (container disk) when `CUBRIC_EPHEMERAL=1`, and
  exports `CUBRIC_MODELS_DIR`/`CUBRIC_MANIFEST_PATH` so the wrapper's install target follows.
  App (remoteProxy.js) sends `CUBRIC_EPHEMERAL=1` on ephemeral Pods. **Needs a cu124 image
  rebuild** (handed to the MPI-103 image-owner; no version bump — reuse v0.4.6, cu128/cpu not
  shipped yet). Verify blocked on that rebuild.

## Verification

1. In Settings, leave network volume unselected. The GPU dropdown shows the full
   "Any region" Secure-Cloud GPU list (not DC-filtered) with stock badges. A container-disk
   GB input appears, defaulting to 100, with the ephemeral warning.
2. Connect with a small model picked: a GPU Pod is created with NO `networkVolumeId` and NO
   `dataCenterIds` (RunPod auto-places), `containerDiskInGb` = the chosen value. Confirm in
   the RunPod console the Pod has no attached volume and the expected container disk.
3. Download a model, run one generation remotely → it completes (models on ephemeral disk).
4. Terminate the Pod from Settings → no Pod left running, no volume created/left, spend
   stops. Reconnect creates a fresh Pod (models re-download by design).
5. Regression: the existing volume + DC flow is byte-identical when a volume IS selected
   (datacenter still required in that path; DC-scoped GPU RAM still shown).

## Preservation Notes

- On close-out, update `docs/runpod-remote-engine.md` §5 (Volume / data center rules) to
  document the no-volume ephemeral mode as a supported second flow, and add a short row to
  §10 verification status. Ask before editing `.claude/rules/*` (CLAUDE.md drift rule).
- Add a project-memory note: no-volume mode confirmed app-side only (start.sh works on
  ephemeral `/workspace`); decouple from any image-rebuild batch. Link
  [[project_runpod_download_mode]] (the inverse: CPU persistent-download mode) and
  [[project_runpod_remote_engine_doc]].
