# MPI-100 Brief — Remote disk-full pre-install gate

**Origin:** spun off from the MPI-99 session (2026-06-16). The user asked for a new
verification: pressing **Install** on a model when the Pod volume has no room should
**not** start a doomed download — it should toast "disk full". The LOCAL side ships in
the MPI-99 session (app-only, no image). The REMOTE side needs a Pod image / data-source
change, so it lives here for a dedicated agent.

## The data-source problem (read first)

There is **no truthful remote volume-free-space source in the app today.**

- `GET /wrapper/stats` (Pod `wrapper.py`, ~line 500) returns **RAM + VRAM only** — no disk.
  See [[project_pod_v043_stats_taesd]].
- The RunPod **web console** DOES show live volume usage (user screenshot: "Volume usage
  79 GB (99%) / 80 GB", container disk "17 MB (0%) / 20 GB"). So RunPod has the number;
  the question is whether their **REST** `getPod` exposes it in a shape we can read.
- History warning: REST `getPod` has lacked live usage telemetry before (uptime/RAM were
  GraphQL-only). See [[project_runpod_pod_shape_rest]]. **Verify the field is real and
  live before trusting it** — do not ship an app-side estimate dressed up as truth
  ([[project_remote_install_progress_truth]] is the cautionary tale).

## Two implementation options (agent picks after verifying)

**Option A — wrapper reports disk (truthful, needs image rebuild).**
- Add `statvfs('/workspace')` to `wrapper.py` `/wrapper/stats` → return
  `{ disk: { total, used, free, available: true } }` alongside `ram`/`vram`.
- Rebuild + push the Pod image via **mpi-ci** (separate private repo;
  cu124/cu128/cpu matrix; commit+push mpi-ci main BEFORE `gh workflow run` — the dispatch
  builds the pushed ref). See [[project_mpi_ci_pod_build_procedure]]. Bump image version.
- App `/remote/pod/stats` already prefers wrapper stats first — just forward the new
  `disk` block.

**Option B — read volume usage from RunPod REST (no image, IF the field exists).**
- In `routes/remoteProxy.js` `/remote/pod/stats` REST fallback, pull volume used/total via
  `_metricFromPod` path-probing (mirror the RAM/VRAM pattern at ~line 861).
- ONLY valid if `getPod` actually carries live volume bytes. If it returns the *configured*
  volume size but not live *used*, this option is dead — fall back to Option A.

## The gate (both options share this)

In `routes/downloadManager.js` `_startRemoteDownload` (~line 761), before kicking off the
wrapper install:
1. Sum bytes of deps **not already installed** (the `toInstall` set already computed there).
2. Fetch remote free volume bytes (from whichever source above).
3. If `required > free` (apply a safety margin, e.g. require `free >= required * 1.05`),
   respond `400 { error: 'Not enough space on the Pod volume to install <model> (<X> needed, <Y> free).' }`
   WITHOUT starting any download.
4. `downloadService.start()` already turns a non-ok response into
   `Events.emit('ui:error', { title: 'Download Start Failed', message: err.error })` →
   the toast appears for free. **Keep the error message shape identical to the LOCAL gate
   from MPI-99** so local + remote read the same.

## Pairs with MPI-99 (local gate)

The MPI-99 session ships the local-mode gate in the same `start` route (local branch) using
`fs` free-space on the models-root drive. Re-read what that session committed and match the
error wording + toast title so the two paths are indistinguishable to the user.

## Verify

Live on the no-GPU Pod **p3tayimai7po9t** (image `v0.4.4-cpu`), volume ~79/80 GB. Press
Install on any not-yet-installed model that is bigger than the ~1 GB free → expect a
"disk full" toast and NO download. Then free space (uninstall) and confirm install works.
