# MPI-105 — Investigation result: WON'T FIX (no clean API lever)

**Decision (2026-06-18):** Parked in Done without implementation. The RunPod
public API exposes no way to request NVMe that matches the console's NVMe/SSD
toggle, and the only available proxy (`minDiskBandwidthMBps`) is a hard host
filter that risks silently dropping GPUs the user would otherwise get.

## What was investigated

1. **REST `POST /pods` create schema** (`rest.runpod.io/v1/openapi.json`,
   `PodCreateInput`). Every field reviewed. **No disk-type / storage-class
   field exists.** Disk-related fields only:
   - `containerDiskInGb`, `volumeInGb`, `networkVolumeId`, `volumeMountPath`
     — size/mount, not type.
   - `minDiskBandwidthMBps` (number, MBps) — the *only* disk-perf lever, a
     bandwidth floor, not a type/class selector.
   - Host filters that exist: `dataCenterIds`, `dataCenterPriority`,
     `countryCodes`, `minDownloadMbps`, `minUploadMbps`, `minVCPUPerGPU`,
     `minRAMPerGPU`. None is storage-class.
   - Confirms the brief's hunch. RunPod's own `runpod-python` issue #330
     ("Add option for selecting disk type (SSD/NVME)") is still OPEN/unimplemented
     — RunPod does not surface this in the API.

2. **GraphQL `dataCenters{ storageSupport }`** (the field the app already reads
   in `routes/runpodRemote.js:142` and filters on in
   `MpiSettings.js:1156`). Per the RunPod GraphQL schema, `storageSupport` is a
   **`Boolean`** — "does this DC support storage at all", NOT an NVMe/SSD enum.
   So there is **no NVMe signal in any field the app can read**; we cannot
   replicate the console toggle by filtering the deploy host list.

3. **Console NVMe/SSD toggle** is a host-availability filter internal to
   RunPod's deploy UI. It is not surfaced as a create-payload field or in the
   public GQL availability data. We cannot map it.

## Why not implement the `minDiskBandwidthMBps` floor

It's the only lever, but it's a **hard filter** with two real downsides:

- **Silently drops GPUs.** A GPU in stock only on SSD/throttled hosts → create
  rejects ("no instances available") while the picker (which doesn't know the
  floor) still shows it as available. Worse UX than a slow model load.
- **Wrong mechanism.** Bandwidth floor ≠ the console's storage-class toggle. A
  shared/throttled NVMe host can read below the floor; a fast SSD can pass it.
  Imperfect proxy.

User (Fabio) always enables NVMe in the console manually, so a default-on
server floor is exactly the behavior we DON'T want — it could remove the very
GPUs he'd otherwise pick.

## If revisited later

- **Cheapest viable version:** an OPT-IN picker toggle "Prefer NVMe (faster,
  may reduce GPU availability)" that sets `minDiskBandwidthMBps` only when on.
  Mirrors the console habit, never silently filters stock. ~1 spec field in
  `_createPodInternal` (`routes/remoteProxy.js:516`) + a Settings control.
- **Better, if it ever lands:** watch runpod-python #330 / the REST schema for a
  real `diskType`/`storageClass` field. If RunPod adds one, that's the clean fix
  (matches the toggle exactly, no false filtering). Re-check the create schema
  before re-opening.
- **No image rebuild** under any path — pure deploy-time/host concern.

## Files reviewed (no code changed)

- `routes/remoteProxy.js` — `_createPodInternal` (line 516), pod spec builder.
- `routes/runpodRemote.js` — REST `_rest`/`createPod` (line 158), GQL
  `dataCenters` (line 141).
- `js/components/.../MpiSettings.js` — DC picker, `storageSupport` filter (1156).
