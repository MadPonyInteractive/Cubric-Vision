# MPI-98 Brief - Truthful pod VRAM/RAM in the status-bar memory monitor

**Origin:** explicit user request on 2026-06-15. The issue was noted but not carded when MPI-64 closed.

## The problem

The bottom status-bar memory monitor (`MpiMemoryMonitor`) is hardwired to `GET /system/stats`, which reports the **local machine's** RAM/VRAM usage. That is correct for local generation, but false when RunPod is connected: the hero/footer and idle status already say the app is running on a remote Pod, while the monitor still shows the local 4060 Ti / host RAM as if that hardware were doing the work.

This was explicitly captured in the closed RunPod epic:

- `tasks/MPI-64/plan.md` noted that the bottom-bar VRAM/RAM live monitor still shows local stats while connected to a remote L4 and should show the Pod's VRAM/RAM instead (or otherwise stop implying the local GPU is doing the work).

## What exists today

1. `js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js`
   - Polls `/system/stats` every 2s.
   - Renders two progress bars (VRAM, RAM).
   - Applies local Apple/unified-memory hiding to the VRAM row.

2. `routes/system.js`
   - `/system/stats` is strictly local: `os.totalmem/os.freemem` + `nvidia-smi`.

3. Remote connection truth already exists elsewhere:
   - `js/shell.js` `_initRemoteConnectionFeed()` emits `remote:connection`.
   - `routes/remoteProxy.js` `/remote/pod/specs` returns static Pod badge data (`gpuName`, `vramGb`, `ramGb`, uptime, price).
   - This is **static capacity**, not live usage.

## Investigation question

The missing piece is **live remote usage telemetry**:

- Remote total capacity is already known (`/remote/pod/specs`).
- The monitor needs **current used/total VRAM and RAM** for the connected Pod.

So the first implementation step is to add/fetch a remote stats payload rather than reusing `/remote/pod/specs`.

## Intended direction

1. **Backend:** add a remote stats route under the RunPod proxy layer that returns live Pod usage suitable for the monitor.
2. **Frontend monitor:** make `MpiMemoryMonitor` mode-aware.
   - Local mode -> keep polling `/system/stats`.
   - Connected remote mode -> poll the new remote stats route instead.
3. **Connection truth source:** derive mode from the existing `remote:connection` feed rather than inventing a parallel state silo.
4. **Fallback behavior:** if remote live usage is unavailable, do not silently keep showing local usage as if it were Pod usage.

## Constraints

- Preserve the current local monitor behavior unchanged when not remote-connected.
- Preserve Apple unified-memory hiding locally.
- Use the existing event bus and shell connection feed; do not create new global state outside `state.js`.
- Keep the change narrowly scoped to telemetry truth, not broader RunPod UX.

## Wrapper contract (proven live on an L4 — Codex msg 8505bcbd, 2026-06-15)

RunPod REST `GET /runpod/pods/:id` returns capacity/metadata ONLY — no live RAM/VRAM. `/remote/pod/stats` currently falls back to `{success:false, reason:"telemetry_unavailable"}` → monitor shows "Pod N/A". The only correct source is a NEW wrapper endpoint (proven from inside the Pod):

- **VRAM truth:** `nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits` (MiB → bytes).
- **RAM truth:** cgroup v2, NOT `free -h`: `/sys/fs/cgroup/memory.current` (used), `/sys/fs/cgroup/memory.max` (limit; if `"max"` → report null, don't lie), optional working-set = `memory.current - inactive_file` (`inactive_file` from `memory.stat`).

**Requested wrapper change (NEEDS AN IMAGE REBUILD — not in v0.4.2):** add token-gated `GET /wrapper/stats` to `c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper\wrapper.py`. Response:
```
{ "success": true, "source": "wrapper",
  "ram":  { "total": <bytes>, "used": <bytes>, "percent": <num> },
  "vram": { "name": "...", "total": <bytes>, "used": <bytes>, "percent": <num>,
            "gpuUtilPercent": <num>, "available": true } }
```
On failure return a truthful unavailable envelope, never fake 0s. Record which RAM-used definition shipped (strict `memory.current` vs working-set). App half (`/remote/pod/stats` poll + "Pod N/A" fallback + `MpiMemoryMonitor` mode-awareness) is already wired by the Codex session — this endpoint is the build seam.

## LIVE VERIFICATION (2026-06-16) — v0.4.3 on an L4 Pod

- ✅ **taesd previews** — beautiful (user-verified). Prebake works; no more blocky latent2rgb.
- ✅ **VRAM** — real, tracks the gen (wrapper nvidia-smi `total` = 22.5 GiB, the TRUE card total; `used`/`percent`/`util` all live).
- 🔴 **RAM was null → FIXED in v0.4.4.** v0.4.3 read cgroup **v2** only; RunPod Pods are cgroup **v1** (`stat -fc %T /sys/fs/cgroup` = `tmpfs`; `memory.current`/`memory.max` ABSENT). So the RAM block came back all-null → monitor showed `RAM 0.0 / 62GB`. Wrapper 0.2.7 adds a v1 fallback: `used = memory.usage_in_bytes - memory.stat:total_inactive_file`, `total = memory.limit_in_bytes` (unless the int64 unlimited sentinel). VALIDATED against the live Pod's own files: `15064158208 - 17829888 = 15046328320 = 14.01 GiB`; `limit 61999996928 = 57.74 GiB` → `24.3%` — EXACT match to the RunPod console (14GiB/57.74GiB/24%). Ships in **image v0.4.4 / wrapper 0.2.7** (mpi-ci `9dc17b9`, app `b17cc64`).

### 🐞 Cosmetic backlog (NOT blocking, frontend-only, no rebuild)
The app's VRAM bar TOTAL shows 24GB (the RunPod-advertised spec, from the connection feed) while the wrapper's nvidia-smi `vram.total` is the TRUE 22.5GiB. Minor denominator mismatch — the bar's used value is right, only the total is the spec not the real card. Fix = `MpiMemoryMonitor` use `vram.total` from `/wrapper/stats` (when present) instead of the connection-feed spec total in remote mode. Low priority.

## IMPLEMENTATION STATUS (2026-06-15) — code DONE, awaits v0.4.3 build

Both halves written (MPI-98 is fully owned here; Codex finished MPI-92 + handed off):

- **Wrapper (`mpi-ci/cubric-vision-pod/wrapper/wrapper.py`):** `GET /wrapper/stats`
  added — token-gated, watchdog-touched. RAM = cgroup v2 working-set
  (`memory.current - inactive_file`; total from `memory.max`, null if `"max"`).
  VRAM = `nvidia-smi` (name/total/used/util, MiB→bytes; `available:false` on CPU
  Pod / failure). Truthful 503 envelope when neither source has telemetry — never
  fake zeros. Endpoint listed in the wrapper docstring. `py_compile` OK.
- **taesd prebake (`mpi-ci/cubric-vision-pod/Dockerfile`):** `COPY vae_approx/` +
  sha256-verify of all 8 decoder/encoder pairs (copied from the verified local
  engine — the split ComfyUI format has no clean single-file HF URL; upstream
  `madebyollin/*` ship a different diffusers-format file). GPU image only.
- **App (`routes/remoteProxy.js`):** `/remote/pod/stats` now tries the wrapper
  FIRST (`proxyUrl + /wrapper/stats`), REST fallback only for an old pre-stats
  image (almost always `telemetry_unavailable`). Frontend `MpiMemoryMonitor`
  already reads `ram.used/percent` + `vram.used/percent` (Codex-wired) — the
  wrapper response shape matches, no frontend change. `node -c` + eslint clean.
- **Versions:** image `v0.4.2→v0.4.3`, wrapper `0.2.5→0.2.6` (app refs bumped;
  mpi-ci gets them via build args).

**REMAINING:** commit+push mpi-ci, commit app on RunPod, then BUILD v0.4.3
(cu128 local + cu124/cpu CI) — USER-gated. Live-verify on a Pod: memory monitor
shows real RAM/VRAM (not "Pod N/A"); taesd previews are crisp.

## 🔑 SECURITY — RunPod API key rotated ✅ (2026-06-15)
Codex (MPI-92) found `GET /runpod/pods/:id` leaked RunPod env secrets (API key + pod token) in the raw Pod JSON. App-side redaction patched (`routes/secretRedaction.js` + `tests/runpod-remote-hardening.test.cjs`). **DONE:** user revoked the old SHARED key and created SEPARATE per-app keys (one Cubric Vision, one OneTrainer — the two apps previously shared one account key); new Cubric key saved in Settings → RunPod. The `OneTrainerKey` Secret on the Secrets page is an unrelated S3 key (not the RunPod API key). Pod token cycles automatically on fresh-Pod create.
