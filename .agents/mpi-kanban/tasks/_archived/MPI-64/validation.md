# MPI-64 Validation — RunPod Remote Engine (epic)

> Closeout validation, 2026-06-15. MPI-64 closes as the **epic/tracker** for the RunPod
> remote engine. Its core architecture is built + live-verified; discrete features and the
> remaining verification/polish residue were spun out to their own cards (below). The
> durable architecture is promoted to `docs/runpod-remote-engine.md`.

## What was delivered (live-verified on real Pods)

| Capability | Evidence |
|---|---|
| Backend-proxy topology (renderer → Express `/proxy/*` → RunPod proxy; token server-side; renderer-direct binary-preview WS) | live, all sessions |
| Pod lifecycle: create-on-Connect / warm-resume / delete-fallback / `_starting` race guard | ✅ live-verified |
| Stop-not-delete on quit (OFF) + delete-on-quit (ON) | ✅ live-verified 2026-06-14 |
| Single-Pod invariant (stray Pod reaped before/after create) | ✅ live-verified (stray reaped) |
| Remote IMAGE generation + project save | ✅ live-verified (A4000 + L4) |
| Remote model install onto the volume (Wan 2.2 78GB) | ✅ live-verified (survives Pod recreate) |
| Remote model UNINSTALL (`/wrapper/models/delete`, v0.4.0) | ✅ live-verified (files wiped from volume) |
| **Remote VIDEO gen (I2V, SaveVideo, no NVENC)** | ✅ live-verified L4 2026-06-15 — saves + plays + respects input subject (M2/M3) |
| OOM detection (forced exit-137 container OOM, twice) | ✅ live-verified (modal + toast + `IDLE·DISCONNECTED` + WS-cap + no flood) |
| OOM container self-heal mechanism | ✅ confirmed via Telemetry (Uptime never resets; Memory 98%→2%; ComfyUI restarted in-place) |
| Secrets (safeStorage API key, per-Pod wrapper token, redaction) | built, no secret in localStorage/logs/bug-reports |

## Key fixes proven this epic

- **NVENC → SaveVideo conversion (B3):** all 7 video workflows + every video output node
  (final `Output_Video` + preview `Preview`) converted off `VHS_VideoCombine`/`nvenc_h264`
  to `CreateVideo → SaveVideo`; zero `VHS_VideoCombine` remain. 6 ops bumped
  latestVersion 1.0→1.1. App capture unchanged (reads `videos[]`). Committed 656831f.
  LIVE-VERIFIED remote on L4.
- **OOM recovery / transient-503 classification (A2/A3):** `comfy_not_ready` 503 → soft
  toast; `engine_error` 503 → surface `detail.comfy_body`; `shell.js` gates `connected` on
  `comfyReady`. Committed 12992c3 / 31eb419. Detection PASS live; OOM-toast live-verify
  deferred → MPI-93.
- **dep url/sha cross fix (C1):** corrected weights → remote I2V respects the dragged
  subject (was feeding T2V weights into I2V files). Live-verified.

## Spun-out cards (no longer MPI-64 scope)

- **MPI-85** — local fallback when no Pod + auto-connect-on-start checkbox — ✅ DONE (committed).
- **MPI-86** — cancel button during an in-progress connection + boot watchdog (was K1/F5).
- **MPI-87** — surface Pod image-pull/extraction progress (was L7).
- **MPI-88** — no-GPU "download mode" Pod (was F6).
- **MPI-89** — remote input-asset transfer for video/audio/.latent (was B1).
- **MPI-90** — manifest compatibility gate + repair/reinitialize (was F1/Step 5).
- **MPI-91** — GPU-picker CUDA-floor auto-filter (was F3/Step 5.2; later archived as superseded once
  cu124-default removed the broad refusal class and the residual tail risk proved non-filterable from
  RunPod picker data).
- **MPI-92** — Phase-5 hardening: tests + secret-hygiene audit + cost/responsibility docs (was F7).
- **MPI-93** — remote live-verification checklist (M4 cancel-gen, M5 higher-res T2V, A3
  OOM-toast, F8 crash-watchdog, G5 volume-delete) — code shipped, needs a live Pod to tick.
- **MPI-94** — RunPod UX polish + fresh-volume init (F4, L3, L4, L5, G1, G2, G4, G6).

## Connected cards (tracked separately)

- **MPI-75** — Pod-image rebuild batch (USER-run): `/wrapper/free`, `--cache-lru 2`, aria2c,
  cu130 Blackwell. **MPI-81** — image weight-bake (RIFE, yolo/SAM auto-mask, upscale) —
  interpolate/upscale/auto-mask 503 remotely until shipped. **MPI-74** — per-model engine
  routing (BLOCKED on MPI-64; now unblocked). **MPI-71/69/72** — Vast.ai fallback /
  high-VRAM variants / OS notifications.

## Knowledge promoted (durable)

- `docs/runpod-remote-engine.md` — full architecture reference (new subsystem doc).
- `docs/PROJECT.md` — subsystem table row added.
- `docs/comfy.md` — remote-engine + SaveVideo touchpoint.
- `.claude/rules/comfy_injection.md` — Preview row + `Output_Video`/`Output_Audio` (committed 656831f).
- Project memory: `project-runpod-remote-engine-doc`, `project-savevideo-split-contract`,
  `project-oom-container-self-heal`.

## Residual / accepted

- ~30s connect-display lag (H1) — user-flagged not-a-concern, left as-is.
- Pod-DEATH recovery (whole Pod terminated, vs container-OOM self-heal) — NOT tracked as a
  validation item; reactive if it ever recurs (user decision 2026-06-15).

## Status

Core remote engine = built + live-verified. MPI-64 closes as the achieved-architecture epic;
all remaining work is carded (MPI-86..94) or connected (MPI-75/81/74/71/69/72). The detailed
narrative lives in `current-architecture.md` + `OPEN-ITEMS.md` in this workspace.
