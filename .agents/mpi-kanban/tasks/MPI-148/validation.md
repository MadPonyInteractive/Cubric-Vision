# MPI-148 Validation

## SHIPPED + VERIFIED (agent, this session, 2026-07-03)
- ComfyUI core v0.26.0 -> v0.27.0 (commit bb131be9, VERIFIED = the v0.27.0 tag). Changelog (29 commits): int8 support + Krea2 merge (#14621) + Ideogram bbox (#14537); rest = unused partner/cloud nodes. No breaking API for our stack.
- node_lock.json bumped in BOTH consumers (app dev_configs + Pod copy): core tag+commit, frontend 1.45.20, templates 0.11.1. mpi-ci pushed bc649a7.
- App pin routes/remotePodLifecycle.js: POD_IMAGE_VERSION + _CPU -> v0.11.0 (commit 54a62ce, local RunPod branch - not pushed, per push-is-user-op).
- 3 images built + PUBLIC (pull-verified via docker manifest inspect):
  - v0.11.0-cpu  (CI)    digest fec8c430 - boot smoke PASS (/health 200, wrapper 0.2.23, download_mode)
  - v0.11.0-cu128 (local) digest 4d97255b - verify PASS (torch 2.11.0+cu128, sage OK)
  - v0.11.0-cu124 (local) digest 9a79e618 - verify PASS (torch 2.11.0+cu126, sage OK)

## BONUS FIX (in-scope, folded in): weight-prebake HF-Xet 403 build break
- cu124 first build FAILED: HF Xet CDN 403s ranged aria2 on prebake weights -> docker build dies. cu128 survived same 403 by luck (aria2 retry). NOT a v0.27 issue.
- Root cause: Dockerfile prebake still on huggingface.co while dependencies.js moved to R2 (MPI-129). Weights also on local disk G:/CubricModels (SHAs verified match).
- Fix: 4 non-RIFE prebake urls HF -> R2 (models.cubric.studio), SHAs unchanged, RIFE stays HF (non-Xet). Dockerfile+README commit 1911aef. PROVEN: cu124 rebuild pulled all from R2 clean, 0x403, ~2x faster.
- Guidance patched so no agent repeats: docs/builder/01-environments.md (G:/CubricModels), docs/runpod-troubleshooting.md (403 trap), pod README gotcha, auto-memory (commit 71da6a9 + memory file).

## OPEN - USER live ops (why card = validating, not done)
- Redeploy a fresh Pod on v0.11.0; confirm app.log image line + /health wrapper_version; run gen smoke LTX-2.3 + Wan 5B + PiD on v0.27, kornia 0.8.2 pin intact.
- Swap app local portable engine engine/ComfyUI_windows_portable -> v0.27 (gitignored, out-of-repo).
- Builder image bump split to MPI-183 (deferred).

## CLOSE CONDITION (2026-07-03) — the ONLY thing blocking done
- Wan 5B + PiD already gen'd clean on v0.27 (cu124 24GB 4090) → partial gen-verify exists.
- LTX-2.3 i2v OOM'd on that 24GB card = MPI-185 (GGUF BF16 dequant spike, headroom-starved). Root cause pinned as **24GB-inherent, NOT a v0.27 regression** (GGUF path untouched by the core bump).
- **DECIDER (user running now):** LTX-2.3 i2v on a **32GB 5090 Pod** (Blackwell → v0.11.0-**cu128** image — first gen-verify of that image too). Clean gen → move MPI-148 to done; MPI-185 stays open as 24GB-tier hardening.
- If LTX also OOMs on 32GB → MPI-148 stays validating; escalate MPI-185.

## CLOSED — LTX i2v clean on 32GB 5090 (2026-07-03, user live)
- **LTX-2.3 i2v gen'd clean on v0.27** (32GB RTX 5090, 85GB RAM, v0.11.0-**cu128** image). 5s video @ 1920×1080: preview 3:50 (cold Pod boot + weight-load), finalize/continue 57s. No OOM. First gen-verify of the cu128 image too.
- v0.27 gen-verify now COMPLETE across the shipped set: Wan 5B ✓, PiD ✓ (cu124 24GB), LTX-2.3 i2v ✓ (cu128 32GB).
- Confirms the 24GB LTX OOM = headroom-inherent (MPI-185), NOT a v0.27 regression. MPI-148 → done.
- Perf (3:50 cold preview @ 1080p) is a cold-boot cost, not a v0.27 issue; datapoint in pod-perf-investigation.md.
