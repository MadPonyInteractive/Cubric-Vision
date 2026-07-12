# MPI-186 — DECISION (the spec MPI-189 builds to)

Status: DRAFT. Cause + shrink measured 2026-07-04 (agent-side, no Pods). One live number
(GHCR-vs-DockerHub pull) still owed by the USER. Serverless OUT.

## 1. Cold-start cause (SETTLED, docs — research/runpod-coldstart-docs.md)
RunPod caches image layers PER-HOST. Popular images (RunPod's own) sit on nearly every host →
instant. Our private image cold-pulls from GHCR on every fresh host. Weights are already on the
volume → the ~5min IS the image pull. "Official" is unobtainable popularity, not a tier.
DEAD levers (do not pursue): template registration, Official-chasing, FlashBoot (Serverless-only).

## 2. Registry: GHCR → Docker Hub  [DECISION: move]
GHCR has documented pull-stall issues on RunPod hosts; Docker Hub is the tested path.
- App change: `POD_IMAGE_BASE` (routes/remotePodLifecycle.js L93) points at
  `ghcr.io/madponyinteractive/cubric-vision-pod` → repoint to the Docker Hub repo. CI push
  target changes too (mpi-ci workflow).
- **OWED (USER, live):** cold-pull seconds GHCR vs Docker Hub for our image on a fresh RunPod
  host → confirms the magnitude. Everything else is decided.

## 3. Placement (SETTLED — user-confirmed, no action)
Already on Secure Cloud (200-400 Gbps NIC). Stop-not-Delete already in the app (rarely lands
the same host; bonus only — do not over-invest).

## 4. SHRINK cut-list (MEASURED via `docker history`, 2026-07-04) — applied in MPI-189

**Size clarification (three different numbers — don't confuse them):**
- `docker images` on-disk UNCOMPRESSED: cu128 = 50.2GB, cu124 = 42.2GB.
- **What RunPod actually PULLS = COMPRESSED (gzip) registry blob ≈ 18-20GB** (cu128). This is
  the number that matters for cold-start (the host downloads compressed, then unpacks to 50GB).
  A prior agent's "under 20GB" = this compressed pull size; both readings are correct.

Biggest UNCOMPRESSED layers + verdicts (cuts apply to both compressed pull and disk):

| Layer | Size (cu128) | Action |
|---|---|---|
| Base's **nightly torch** (`whl/nightly/cu128`) baked by the runpod base | **6.94GB** | 🔴 CUT — we `pip uninstall` it then install our pinned torch. Dead weight. A multi-stage/leaner base avoids ever baking it. |
| CUDA **`-dev` toolkit** (cudart-dev, cublas-dev, cusparse-dev, nsight, nvprof, nvml-dev) | **5.96GB** | 🔴 CUT from runtime — needed only to BUILD sage (nvcc/headers). **Multi-stage: build sage in a `-devel` stage, ship on a `-runtime` base.** The single biggest clean cut. |
| cuDNN **dev** half | part of 1.05GB | 🔴 CUT from runtime (build-only) |
| Our pinned torch trio (2.11+cuXX) | 7.04GB | ✅ KEEP (arch-bound) |
| CUDA runtime libs (cuda-libraries) | 3.11GB | ✅ KEEP (torch needs) |
| Node packs (locked custom_nodes) | 4.26GB | ✅ KEEP |
| ComfyUI core + deps | 1.19GB | ✅ KEEP |
| Baked node weights (RIFE/upscale/yolo/sam) | 537MB | ✅ KEEP |
| taesd vae_approx | 19.7MB | ✅ KEEP |
| Jupyter / notebook / nginx / openssh (runpod base extras) | ~0.9GB | 🟡 EVALUATE — Jupyter is used (we warn never `pkill main.py` kills Jupyter). Keep Jupyter; nginx/ssh may be droppable. Low priority. |

**cu124-only:** carries a **6.11GB `/opt/conda`** (pytorch/pytorch conda base) — pure dead
weight. MPI-189 collapses cu124/cu128 into ONE cu130 image, so pick the cu130 base to AVOID
both the conda blob AND the nightly-torch double-install from the start.

**Estimated cut:** ~6.94 (nightly torch) + ~6 (dev toolkit via multi-stage) ≈ **~13GB
uncompressed** → ~5-6GB off the COMPRESSED pull → **~18GB pull → ~12GB (~30% smaller
cold-start download)**, before the Docker Hub speed gain. Do NOT touch: pinned torch trio + sage.

## 5. Serverless: OUT (research/serverless-fit.md)
Breaks live-preview streaming + warm session (our core UX); FlashBoot is warm-only + Serverless-
only. cu130 fixes the same pain (session open time) without losing interactivity. Only ever a
FUTURE additive "batch export" feature — separate card, not here.

## 6. Sequence
MPI-189 builds the SINGLE cu130 image THIS way, once: cu130 `-runtime` base + multi-stage sage
build (nvcc only in the build stage) + push to Docker Hub + app repoint. MPI-188 (driver floor)
already done. Do NOT rebuild twice.

## RESOLVED (2026-07-04)
- Standalone GHCR-vs-DockerHub pull measurement → **FOLDED INTO MPI-189** (user decision). No
  throwaway push. The cu130 rebuild pushes to Docker Hub + ships shrunk; the first cu130 Pod
  deploy IS the real before/after measurement vs today's ~5min. Docker Hub setup is agent-side
  during 189 (user has no Docker account — free public repo, no cost).
- Decision is complete: (1) GHCR→Docker Hub, (2) cu130 -runtime base + multi-stage sage
  (~30% smaller pull), (3) placement already settled. MPI-189 is startable from this doc.
