# MPI-101 Brief — Build Pod image v0.4.5 (all 3 profiles)

**Origin:** spun off from the MPI-100 session (2026-06-16). MPI-100 bumped the app to
`POD_IMAGE_VERSION = 'v0.4.5'` but only the `-cpu` tag was built. `-cu124` / `-cu128`
at v0.4.5 do NOT exist → a GPU connect returns `IMAGE_NOT_FOUND`. This card rebuilds
all three clean.

## Why v0.4.5 exists at all (read first)

MPI-100 tried a remote disk-full PRE-FLIGHT gate. It added a `statvfs` `disk` block to
`wrapper.py` `/wrapper/stats` and shipped it as `v0.4.5-cpu` (mpi-ci commit `58ff0fc`).
**It was then REVERTED** — live-tested, `statvfs('/workspace/mpi_models')` reports the
multi-PB container overlay (722 TB free), NOT the 80 GB RunPod network-volume QUOTA.
statvfs is blind to the quota, so the gate was useless. Disk-full is now handled
REACTIVELY app-side (downloadService catches the wrapper's `[Errno 122] Disk quota
exceeded` → toast). See [[feedback_error_dialog_vs_toast]].

So v0.4.5's wrapper is functionally identical to **0.2.7**. The only reason to rebuild is
to give all three profiles a matching v0.4.5 tag (the existing `v0.4.5-cpu` carries the
now-reverted disk block; rebuilding it clean is tidy but optional — the block is inert).

## Working-tree state to commit

In `c:\AI\Mpi\mpi-ci` the file `cubric-vision-pod/wrapper/wrapper.py` is reverted
(UNCOMMITTED): the `_read_volume_disk` function + the `disk` line in `/wrapper/stats`
are removed; a warning comment is left ("Do NOT re-add statvfs here expecting
volume-quota truth — it cannot see the quota"). `python -m py_compile` passes; the
functional diff vs commit `9dc17b9` (the 0.2.7 baseline) is zero — comment only.

## Steps

1. **mpi-ci: commit the reverted `wrapper.py` + push `main` FIRST.** The
   `gh workflow run` dispatch builds the PUSHED GitHub ref, not the local tree
   (#1 gotcha). Verify LF (`git show :cubric-vision-pod/wrapper/wrapper.py | tr -cd '\r' | wc -c` → 0).
2. **CI build cpu+cu124** — dispatch with `only_profile` **BLANK**:
   ```
   cd c:\AI\Mpi\mpi-ci
   gh workflow run cubric-vision-pod-image.yml --ref main \
     -f manifest_version=0.4.5 -f wrapper_version=0.2.7 \
     -f comfyui_ref=master -f push_latest=false
   ```
   **GOTCHA:** `only_profile=cpu` SKIPS the cu124 leg (job still reports `success`),
   which is exactly how v0.4.3-cu124 was never pushed → `IMAGE_NOT_FOUND`. Dispatch BLANK.
3. **cu128 LOCAL** — the cu128 matrix row is CI-disabled (runner disk ceiling). Build on
   the Windows Docker box per `mpi-ci/cubric-vision-pod/README.md` "Build cu128 LOCALLY":
   `gh auth token | docker login ghcr.io -u <user> --password-stdin`, then
   `docker build --build-arg BASE_IMAGE=runpod/pytorch:2.8.0-...-cuda12.8.1... --build-arg CUDA_PROFILE=cu128 --build-arg CUBRIC_MANIFEST_VERSION=0.4.5 --build-arg WRAPPER_VERSION=0.2.7 -t ghcr.io/madponyinteractive/cubric-vision-pod:v0.4.5-cu128 .`,
   smoke-check, `docker push`, then `wsl --shutdown` to free the Docker VM RAM.
4. **Make GHCR package PUBLIC** + **anon-pull-verify ALL 3 tags** before telling the user
   to connect: `docker logout ghcr.io; docker manifest inspect ghcr.io/madponyinteractive/cubric-vision-pod:v0.4.5-cpu` (and `-cu124`, `-cu128`).

## App pin

The app pin (`routes/remoteProxy.js`: `POD_IMAGE_VERSION='v0.4.5'`, `WRAPPER_VERSION='0.2.7'`)
is committed by the MPI-100 owner — do NOT re-edit it.

## Authorization

Image BUILDS are fine to trigger once the user OKs. NEVER run autonomous live Pod
create/delete — the user drives live Pod ops. See [[project_mpi_ci_pod_build_procedure]],
[[project_pod_v043_stats_taesd]], [[project_disk_layout_c_constrained]] (C: drive tight —
prefer CI; cu128 local build balloons the Docker vhdx on D:).
