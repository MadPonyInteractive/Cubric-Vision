# MPI-221 — Pod volume fills with orphaned model files

## Symptom
- RunPod Pod volume: **138 GB used / 150 GB** (`du -sb /workspace`, wrapper `/wrapper/disk`).
- App Model Library: **3 models, ~50 GB tracked**.
- **~88 GB untracked** on the volume.
- Installing Chroma showed a false **"disk full"** toast even after the user thought space was freed.

## Root cause (from LIVE code, not the stale repo copy)
Remote uninstall is **best-effort fire-and-forget with no retry and no reconciliation.**

`routes/downloadManager.js` `POST /comfy/models/uninstall` (remote branch, ~L1752-1805):
- Per dep → `remoteModels.remoteUninstallDep(dep)` → `POST /wrapper/models/delete`.
- `remoteUninstallDep` (`routes/remoteModels.js` L319-345):
  - network/proxy fail → `{status:'unsupported'}` → file **left on volume**, no retry.
  - wrapper non-ok (e.g. `delete_failed`, busy/locked file) → **throws** → caught (L1786) → `anyUnsupported=true`, file **left**, no retry.
- If **any** other dep in the same call deleted OK → `removed.length>0` → L1792 false → whole uninstall returns **`success:true`**, model job dropped, UI says "uninstalled".
- The failed-delete file is now **orphaned on the volume, invisible to the app** — no record, never retried, and **no route lists volume files vs the known-dep universe**, so it can never be seen or cleaned.

Repeated across models/sessions → tens of GB of stranded weights.

### Symptom chain to the false toast
Remote install pre-flight gate: `free = volumeSizeBytes − du(/workspace)`. `du` is inflated by orphans → free reads near-zero → gate blocks legitimate installs with the disk-full message.

## Ruled out (verified against live wrapper 0.2.31)
- **Failed installs** — clean. Download → `dest + ".part"`, `os.replace(part, dest)` only on success; `os.remove(part)` on **both** error and cancel. No stranded weight from a failed/cancelled install.
- **input/output dirs** (`/workspace/comfyui/{input,output}`) — app clears them on close; user does not generate enough video to reach ~88 GB. Not the bulk. (A wrapper-side purge is still worth doing as hygiene, but it's not this bug.)
- **hot-store duplicates** — copy to the **container** disk (`/opt/ComfyUI/models`), not the volume.
- **shared-dep over-keep** — possible minor contributor, not the ~88 GB.

## Key infra (so no future session re-learns it)
- **Pod `wrapper.py` + `start.sh` run from R2, fetched at boot by `bootstrap.sh` — NOT the image.** Image `COPY`s them only as fallback. See memory `project_pod_wrapper_runtime_from_r2`.
- Live wrapper: `https://pod.cubric.studio/vision/stable/wrapper.py` — **v0.2.31, 2156 lines**. Repo copy `mpi-ci/cubric-vision-pod/wrapper/wrapper.py` is **stale/shorter** = fallback only.
- Publish: `mpi-ci/cubric-vision-pod/publish-runtime.sh [channel]` — derives version from `wrapper.py`'s `CUBRIC_WRAPPER_VERSION` default, computes shas, writes `manifest.json`, pushes `start.sh`+`start-cpu.sh`+`wrapper.py`+`manifest.json`, verifies URLs. rclone at `~/.secrets/rclone-r2.conf`.
- **MUST edit the LIVE 0.2.31 file, not the stale repo copy** — publishing the repo copy would regress the wrapper. Bump version on edit (→ 0.2.32).
- A **fresh Pod boot** pulls the new R2 wrapper (user's chosen path). `POST /wrapper/restart-comfy` restarts ComfyUI only — a full wrapper reload needs a Pod recreate (or restart).

## Plan
1. **Diagnose** — add `GET /wrapper/ls` to the live wrapper (walk `mpi_models`, return `[{path, size_bytes}]`), bump to 0.2.32, `publish-runtime.sh stable`. User builds a fresh Pod → it pulls the new wrapper → hit `/wrapper/ls` through the app proxy → diff against the app's known-dep universe → **exact orphan list + GB**. *(reversible; minutes)*
2. **Reclaim** — delete confirmed orphans (existing `/wrapper/models/delete`, or a scoped cleanup route).
3. **Durable fix** — remote uninstall **reconciles instead of fire-and-forget**: retry failed deletes, and/or a reconcile pass that lists the volume and removes any file not owned by an installed model. This stops the leak at the source.

## Status
- **doing** — root cause established from live code; starting step 1 (add `/wrapper/ls`, publish to R2).
