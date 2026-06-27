# Pod fast model loading (torch 2.8 → aimdo) + externalize start.sh/wrapper to R2

## Current State

**Interop mode:** file. **Branch:** RunPod (mpi-ci separate repo via `git -C`).

Live-verified this session on RunPod Pods (v0.10.1 images):

- **CRASH FIXED:** sage-attention crashes the LTX-2.3 forward on Ada sm_89
  (`CUDA error: unspecified launch failure`) but runs clean on Blackwell sm_120.
  v0.10.1 gates sage off sm_89 (SDPA), on sm_120. 4090 + 5090 both generate.
- **6-MIN MODEL LOADS — ROOT-CAUSED + CONFIRMED FROM THE LIVE POD LOG:**
  ```
  WARNING: Unsupported Pytorch detected. DynamicVRAM support requires Pytorch
  version 2.8 or later. Falling back to legacy ModelPatcher.
  comfy-aimdo version: 0.4.10
  ```
  ComfyUI v0.26's dynamic-vram allocator (`comfy-aimdo`, JIT-faults weights,
  keeps the encoder on GPU = near-instant "load") **is installed (0.4.10) but
  refuses to init because torch < 2.8.** It falls back to legacy ModelPatcher;
  with `--lowvram` active, the 15GB Gemma encoder goes to CPU and the 42GB
  transformer streams through system RAM → 6-min cold loads. Multi-model app =
  every model switch reloads = ~7min per 2s gen. **Unusable.**
- **Why torch is old (not the user's doing):** the Pod Dockerfile pins torch per
  profile — cu124 → `torch 2.6.0+cu124` (cu124 wheel ceiling), cu128 →
  `torch 2.7.1+cu128` which **deliberately UNINSTALLS the base image's torch 2.8
  nightly** and replaces it with 2.7.1 stable (MPI-70, for a "fixed known
  release"). That downgrade is exactly what kills aimdo. Both profiles fail the
  `< 2.8` gate.
- **Rebuild treadmill:** nearly every Pod rebuild this session was a `start.sh`
  or `wrapper.py` edit (sage gate, VRAM threshold, version stamps) — both files
  are `COPY`'d into the image (Dockerfile:304-305) and run as `CMD`
  (Dockerfile:313). Each shell edit = a full ~25-min image rebuild + 16GB push.
  The image has `git` + `curl` + `aria2`; the Pod mounts a persistent
  `/workspace` volume; the wrapper exposes `POST /wrapper/restart-comfy`
  (wrapper.py:597) to relaunch ComfyUI without a Pod reboot — all the pieces for
  externalizing these two files exist.

**Decisions locked with the user:**
- **Externalize FIRST**, then torch-2.8 (so aimdo iteration is fast R2-push, not
  rebuild).
- **Separate R2 bucket** for Pod runtime files (NOT `cubric-builds`, which holds
  build artifacts + models that MPI-137 is already moving to `cubric-models`).
  New bucket e.g. `cubric-pod-runtime`, public-read (no secret in Pod env).
- Confirm aimdo via the live Pod log BEFORE the torch rebuild — **done, confirmed.**

**Key constraints:**
- RunPod branch only — no master merge / GitHub release / git tag (MPI-131).
- mpi-ci is a separate repo (`git -C c:/AI/Mpi/mpi-ci`); push IS part of the build.
- Pod ops + image builds are USER-GATED. cu124 + cu128 build LOCAL only (sage
  overflows CI); cpu via CI. An image/version bump needs an app restart + fresh Pod.
- cu124 torch ceiling: PyTorch cu124 wheels stop at ~2.6 → cu124 **cannot reach
  torch 2.8 on cu124 wheels.** Options weighed in Phase 2.
- Logic of start.sh (gate, threshold, probe) is testable LOCALLY on the Windows
  box (already caught the 31GiB bug pre-build); only the "does the flag make a
  real GPU behave" check needs a Pod.

**Cross-links:** MPI-145 (sage gate, this batch's sibling), MPI-146 (VRAM mode —
reframed by this work, see Phase 3), MPI-137 (R2 bucket reorg / convention),
MPI-129 (HF→R2 dep migration), MPI-155 (local-engine per-card VRAM, separate).

## Completed

- [x] Root-caused the 6-min load to torch < 2.8 disabling aimdo; CONFIRMED from
  the live cu124 Pod log (`DynamicVRAM ... requires Pytorch 2.8 ... Falling back
  to legacy ModelPatcher`, `comfy-aimdo version: 0.4.10`).
- [x] Researched aimdo: silent default in v0.26 when nvidia + not-WSL + torch≥2.8;
  no enable flag needed; `--lowvram` does NOT disable it (it's the fallback when
  aimdo is already off); fp8 transformer+encoder fit 24GB with aimdo's JIT fault-in.
- [x] Confirmed externalize feasibility: git/curl/aria2 in image, /workspace
  volume, `/wrapper/restart-comfy` live-reload, existing rclone→R2 setup.
- [x] v0.10.1 built (sage Ada-gate + VRAM threshold >=28) — the crash-fix baseline.

## Remaining Work

> Sequential phases (NOT a parallel batch): each phase depends on the previous —
> externalize must land before fast aimdo iteration; the torch rebuild must land
> before aimdo can be verified; the reframe depends on the verified aimdo behavior.
> Ownership cannot be made disjoint, so no `## Parallel Batch`.

## Phase 1: Externalize start.sh + wrapper.py → R2 runtime bucket

Goal: stop rebuilding the image for shell/wrapper edits. After this, edits = R2
upload + Pod (or wrapper) restart, no rebuild.

- [ ] Create a dedicated public-read R2 bucket for Pod runtime (e.g.
  `cubric-pod-runtime`), following MPI-137's per-product-prefix convention.
  Decide the path layout (e.g. `pod-runtime/<channel>/start.sh`,
  `.../wrapper.py`, `.../manifest.json` carrying the wrapper version + a content
  hash). **Verify:** `curl` the published `start.sh` URL from the dev box returns
  the file (200, correct bytes).
- [ ] Add a tiny image **bootstrap** entrypoint that, at boot: curls
  start.sh + wrapper.py (+ manifest) from R2 into the image's runtime dir,
  validates them (hash/non-empty + `bash -n` start.sh), falls back to the
  baked-in copies if the fetch fails (resilience if R2 is down), then execs
  start.sh. Replace `CMD ["/opt/cubric-wrapper/start.sh"]` with the bootstrap.
  Keep baked copies as the fallback. **Verify:** locally, `bash -n` the bootstrap;
  simulate fetch-OK and fetch-fail paths (stub curl) and confirm it execs the
  fetched file on OK and the baked file on fail.
- [ ] Decide the version-pinning model: the app's `POD_IMAGE_VERSION` pins the
  image, but start.sh/wrapper now float from R2. Add an R2 `channel` (e.g.
  `stable` vs the image tag) so a given image always fetches a compatible runtime,
  and the `/health` `wrapper_version` stays honest (the fetched wrapper.py
  self-reports its version). **Verify:** `/health` reports the R2-fetched
  wrapper's version, not the baked one.
- [ ] Add a publish helper (rclone push of start.sh + wrapper.py + manifest to
  the bucket) — script or documented one-liner in the pod README + the
  build-pod-image doc. **Verify:** running it updates the bucket; a fresh Pod
  boot picks up the change with NO image rebuild.
- [ ] ONE image rebuild to ship the bootstrap (user-gated, cu128 first). After
  this, Phases 2-3 iterate start.sh via R2, no rebuild. **Verify (user-ux, live):**
  fresh Pod boots, fetches runtime from R2, `[cubric]` log lines appear, a gen
  runs; then edit start.sh → R2 push → `POST /wrapper/restart-comfy` (or Pod
  restart) → the change is live WITHOUT a rebuild.

## Phase 2: torch 2.8 → enable aimdo (the load-speed fix)

Goal: aimdo initializes → model "load" becomes a near-instant JIT mmap → drop
6-min loads to seconds/tens-of-seconds. With externalize done, the `--lowvram`
drop + tuning is R2-fast.

- [ ] Pin **torch 2.8.0 stable + cu128** in the cu128 Dockerfile branch (replace
  `torch==2.7.1+cu128` → `torch==2.8.0+cu128` with matching torchvision/torchaudio;
  the base ships 2.8 nightly — install 2.8 STABLE, keep the uninstall-first trick
  for runner disk). Re-verify the baked sage source-build still compiles against
  torch 2.8 (sage is torch-version-sensitive). **Verify:** image build prints
  `torch 2.8.x cuda 12.8` + `sage OK`; cu128 rebuild succeeds.
- [ ] Decide cu124's fate (cu124 wheels can't reach 2.8). Options, settle with
  data/user: (a) move cu124 to a torch-2.8+cu128 base too (raises host-driver
  floor 12.4→12.8, drops old-driver-4090 compat — but Ada runs fine on 12.8);
  (b) keep cu124 at 2.6 = no aimdo on cu124 = stays slow (unacceptable per the
  user); (c) evaluate **cu130** (the live log hinted `pytorch with cu130 ... for
  optimized CUDA operations`; the local engine already runs cu130) as the single
  modern base for all GPU profiles. **Verify:** the chosen base builds + a fresh
  4090 Pod boots with torch ≥ 2.8 (no `requires Pytorch 2.8` warning).
- [ ] In start.sh, once aimdo is confirmed initializing, **DROP `--lowvram`**
  (it's a no-op under aimdo and forces the CPU encoder when aimdo is off). Let
  aimdo manage memory. Keep a guarded fallback for the no-aimdo case. (R2 edit,
  no rebuild after Phase 1.) **Verify (live):** boot log shows aimdo init line
  (`DynamicVRAM support detected and enabled` / `aimdo inited for GPU`), NOT the
  fallback warning; ComfyUI cmdline has no `--lowvram`.
- [ ] Tune if needed: if VAE-decode OOM appears under aimdo (known LTX edge,
  ComfyUI #12784), add `--reserve-vram` / `--vram-headroom`. (R2 edit.)
  **Verify:** gen completes without VAE-decode OOM.

## Phase 3: Reframe MPI-146 + measure

- [ ] Update MPI-146: the per-card `--lowvram`/`--normalvram` split is largely
  MOOT under aimdo (lowvram is a no-op; aimdo handles memory per-card itself).
  Reframe MPI-146 to "drop the vram flags, let aimdo manage" and record what, if
  anything, still needs per-card handling (e.g. `--reserve-vram` on small cards).
  **Verify:** MPI-146 card + task.json reflect the aimdo reality; no stale
  lowvram/normalvram threshold logic claimed as the fix.
- [ ] Measure the win: same 2s low-res LTX gen, before (v0.10.1, ~6min load) vs
  after (torch-2.8 aimdo). Record load + total time. **Verify (user-ux, live):**
  cold model load drops from ~6min to seconds/tens-of-seconds on a fresh Pod;
  a model switch (e.g. Wan→LTX) reloads fast, not in minutes.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Per phase: Phase 1 final step = user-ux (live Pod boot + no-rebuild reload proof).
Phase 2 torch-build steps = auto (build prints torch/sage), but the aimdo-init +
drop-lowvram steps = user-ux (live Pod boot log + behavior). Phase 3 measure =
user-ux. The earlier mechanical steps (Dockerfile pins, bootstrap `bash -n`,
local probe tests) self-verify (auto).

End-to-end DONE when:
1. start.sh + wrapper.py edits ship via R2 with NO image rebuild (Phase 1).
2. A fresh Pod boots with torch ≥ 2.8 and the log shows aimdo INITIALIZING (not
   the `requires Pytorch 2.8` fallback).
3. Cold model load drops from ~6min to seconds/tens-of-seconds; a model switch
   reloads fast — confirmed by the user on a live Pod.
4. MPI-146 reframed; the v0.10.1 crash-fix baseline is unregressed.

## Preservation Notes

- docs/gotchas.md: "ComfyUI v0.26 dynamic-vram (comfy-aimdo) needs torch ≥ 2.8 —
  the Pod Dockerfile downgraded the base's torch 2.8 nightly to 2.7.1 stable
  (MPI-70) which DISABLED aimdo → legacy ModelPatcher + --lowvram CPU-encoder =
  6-min loads. Fix: torch 2.8 stable. aimdo is the default (no enable flag);
  --lowvram does NOT disable it, it's the fallback behavior when aimdo is off.
  Confirm via the boot log: `DynamicVRAM support requires Pytorch 2.8 ... Falling
  back to legacy ModelPatcher` = off; `aimdo inited for GPU` = on."
- docs/gotchas.md / build-pod-image doc: "start.sh + wrapper.py are R2-fetched at
  boot (bucket cubric-pod-runtime) — edit + rclone push + restart wrapper, NO
  image rebuild. Image only rebuilds for torch/sage/node/base changes."
- Update the pod README version block + the build-pod-image command doc (Step 0
  reclaim + the externalize publish flow).
- Cross-link MPI-137 (bucket convention), MPI-146 (reframe), MPI-155 (local VRAM).
- After torch 2.8 lands, re-check kornia 0.8.2 pin + the baked node set still
  import (torch bump can break pinned deps — MPI-149 lesson).
