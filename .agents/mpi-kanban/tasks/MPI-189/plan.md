# Rebuild the product Pod image on a SINGLE cu130 base (collapse cu124/cu126 + cu128) + multi-stage shrink + Docker Hub

## Current State

MPI-187 live-proved cu130 collapses the LTX fault-in ~10x (108-127s → ~11s). MPI-186 concluded
the cold-start fix (registry + shrink). MPI-188 (driver-floor guard) is DONE. This card executes
both on ONE new image. Implementation runs in a FRESH session; this is the plan only.

**PROVEN REFERENCE STACK (from MPI-187, the ~11s Pod — pin to THIS):**
- torch **2.10.0+cu130**, torchvision **0.25.0+cu130**, torchaudio **2.10.0+cu130**
  (`--index-url https://download.pytorch.org/whl/cu130`)
- CUDA **13.0**, driver floor **r580**, **py3.12**
- comfy-aimdo **0.4.10** (UNCHANGED — MPI-187 proved the fast Pod ran the SAME aimdo; the lever
  is the `+cu130` CUDA-13 build, NOT torch version or aimdo). comfy-kitchen unchanged.
- **NOTE the lever is the cu130 BUILD, not the torch minor** — torch 2.10+cu130 = ~11s;
  torch 2.11+cu126 = 126s. Do NOT "upgrade" torch past 2.10 thinking newer = faster.

**Decisions locked (user, this session):**
- Base = RunPod's **runpod/pytorch cu130 `-runtime`** variant (familiar base; cu128 already uses
  runpod/pytorch). Multi-stage: sage compiles in a `-devel` stage, runtime ships on `-runtime`.
- Sage: **ship cu130 regardless** — if the multi-arch build won't compile clean on cu130/torch2.10,
  ship with the existing SDPA graceful fallback and add sage later. MPI-187 got ~11s with NO sage,
  so sage is a bonus, NOT a blocker.

**ComfyUI version:** keep OUR **0.27** (the RunPod image ships 0.26.2; we do not downgrade — our
node lock + workflows target 0.27). Only the torch/CUDA base moves; ComfyUI/aimdo/nodes unchanged.

**Files (two repos):**
- `c:/AI/Mpi/mpi-ci/cubric-vision-pod/Dockerfile` — the rewrite (edit via `git -C c:/AI/Mpi/mpi-ci`).
- `c:/AI/Mpi/mpi-ci/.github/workflows/cubric-vision-pod-image.yml` — CI matrix (two profiles → one)
  + push target (GHCR → Docker Hub).
- `c:/AI/Mpi/Cubric-Vision/routes/remotePodLifecycle.js` — `POD_IMAGE_BASE` (L93, GHCR → Docker
  Hub repo), `podImageForCard` (L144, collapse two-profile branching → one cu130 tag),
  `allowedCudaVersions` (MPI-188, L159-166 map → flat `["13.0"]`).

## Implementation

- [ ] Rebuild the Pod image + app plumbing onto a single cu130 profile, multi-stage, Docker Hub.
  Sub-parts (one coherent flow, not separate cards):
  1. **Dockerfile → single cu130, multi-stage.** Base = runpod/pytorch cu130. Delete the
     cu124/cu126 profile block + the cu128 profile block (torch install ~L135-147, sage ~L164-180)
     and the stale MPI-156 cu126 reasoning comment (~L84-117) + the `TODO rename cu124→cu126`
     (MPI-187 disproved "torch-framework-not-cu130-toolkit"). Pin the proven stack (torch 2.10.0
     +cu130 trio). **Multi-stage:** a `-devel` build stage compiles sage (nvcc present) →
     `-runtime` final stage copies only the built artifacts + installs runtime deps. This drops
     the base's discarded nightly torch (~6.94GB) + the CUDA `-dev` toolkit (~6GB) from the
     shipped image (MPI-186 measured; ~30% smaller compressed pull).
  2. **Sage multi-arch, non-blocking.** `TORCH_CUDA_ARCH_LIST="8.6;8.9;12.0"` (Ampere+Ada+Blackwell
     in one build), pinned to a known-cu130-good SageAttention commit (NOT HEAD — sage can lag a
     new toolkit). Build in the `-devel` stage. Keep the `|| echo WARN … SDPA fallback` so a build
     failure ships cu130 anyway.
  3. **CI workflow → one profile.** Collapse the build matrix (cu124+cu128 → cu130); change the
     push registry GHCR → Docker Hub (needs a Docker Hub repo + CI credentials — agent sets up the
     free public repo; user has no Docker account). Keep the `-cpu` image as-is (separate, unaffected).
  4. **App collapse.** `podImageForCard` returns ONE cu130 tag (delete the sm-tier/suffix branching
     — also kills the enum-desync/wrong-profile bug class, cf MPI-135/70). `POD_IMAGE_BASE` →
     Docker Hub repo. `allowedCudaVersions` (MPI-188) → flat `["13.0"]` (no per-profile map). Bump
     `POD_IMAGE_VERSION` for the new tag.
  5. **Build + ship (USER-run live parts).** Build via the `build-pod-image` skill — watch for the
     CI-runner disk overflow the cu128 build hit (build-cu128-v040.log); use LOCAL Flow B if it
     overflows. Anon-pull-verify the pushed tag. First cu130 Pod deploy = the real cold-start
     before/after measurement (MPI-186's folded-in registry+shrink check).
  6. **Docs.** Update `docs/builder/02-image-and-rebuild.md` (baked-vs-runtime, single cu130) +
     the CUDA-matrix note (product Pod = cu130, all profiles collapsed) + lift/confirm the cu130
     banner in `docs/builder/research/pod-perf-investigation.md`.

  **Verify:** image builds + pushes to Docker Hub; anon `docker pull` of the new tag succeeds;
  `docker images` shows a materially smaller image than 50GB (target ~30% off compressed pull);
  `docker history` confirms no CUDA `-dev` toolkit / nightly-torch in the runtime layer. Then a
  USER live-deploy on BOTH a 4090 (sm_89) and a 5090 (sm_120) from the single cu130 tag:
  ComfyUI boots (aimdo active in log), an LTX gen runs, stage-1 fault-in ~11s (not ~120s), no
  driver-too-old crash (MPI-188 guard holds). Sage either active (log) or clean SDPA fallback.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Everything above (single implementation flow, fresh session).

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux — the decisive checks are live Pod deploys the USER runs (fault-in
timing on a real 4090 + 5090, driver-floor guard holding, sage active vs fallback). The agent
self-verifies the build/shrink/anon-pull (auto-checkable), but the ~11s fault-in and cross-arch
boot need a human on live Pods. All live Pod ops are USER-only.

Final: single cu130 image on Docker Hub, ~30% smaller pull, both arches boot from one tag, LTX
fault-in ~11s confirmed on a live Pod, MPI-188 guard prevents driver-roulette. Then MPI-190
(bf16 revert) unblocks.

## Preservation Notes

- After ship: `docs/builder/02-image-and-rebuild.md` + pod-perf-investigation.md banner; the
  memory index in-flight note for MPI-187/189 (cu130 rebuild) → mark shipped.
- MPI-190 (bf16 revert) is GATED on this + a live cu130 bf16 fault-in confirmation; note it's
  unblocked once a cu130 Pod confirms bf16 LTX faults ~11s + fits 32GB.
- The `-cpu` download image is unaffected — do not rebuild it here.
