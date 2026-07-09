# MPI-136 — Remote download stall watchdog (wrapper + app SSE)

## Symptom (caught live 2026-06-25)
Installing LTX-2.3 on a fresh Pod (`yjax3iotxkzw78`, image `v0.5.0-cu128`,
wrapper `0.2.11`). Download ran to **60.1/63.0GB @ ~26MB/s**, then went silent.
Telemetry net/CPU dropped to idle; Container log showed only `/wrapper/stats` +
`/health` polls, no further install activity; app card froze at the last byte
showing a **stale** speed. Only recovery: **Cancel → Install** (remote has no
`.part`, so Pause/Resume is a no-op → restart from byte 0).

## Root cause — two-sided
### A. Wrapper (mpi-ci `wrapper.py`, v0.2.11)
- `_download_httpx`: `httpx.Timeout(30.0, read=300.0)`. A **zombie/half-open HF
  socket** (CDN stops sending without RST/FIN) can defeat the read timeout →
  `aiter_bytes` await suspends indefinitely.
- `emit_progress()` is called **inline from the download loop** → bytes stop =
  SSE progress stops instantly, but `/wrapper/events/stream` stays open → silent
  frozen stream, **no `models:install-error` emitted**.
- `_download_aria2`: `--max-tries=5 --retry-wait=3` but **no** `--timeout` /
  `--connect-timeout` / `--lowest-speed-limit`, and **no `--continue`** → a
  stalled aria2c hangs then retries **from byte 0**.
- **No Range-header resume** on either path. **No SSE heartbeat.**

### B. App (`routes/downloadManager.js`)
- MPI-97 added SSE **close** recovery (`_onRemoteStreamClosed` → reconcile +
  reconnect w/ backoff). But there is **NO watchdog for a stream that stays OPEN
  but stops emitting** `models:install-progress`. `_onRemoteInstallEvent` only
  reacts to events that arrive; ticks merely ceasing triggers nothing → ghost bar.

## Why this matters even after MPI-129 (R2)
- MPI-129 (HF→R2) reduces the **throttle** that triggers stalls but does **not
  eliminate** them — one dropped socket still hangs.
- Per MPI-129 scope guard, the **upstream LTX base files** (`Kijai/LTX2.3_comfy`
  22B transformer + VAEs, `Lightricks` spatial-upscaler) **stay on HF** until
  **MPI-128 item 2** self-hosts them → the biggest, most-stall-prone file keeps
  coming from throttle-prone HF. This watchdog is the defense-in-depth that
  survives R2.

## "Why now / specific file" (open question — investigate first)
User reports never hitting this before, locally or remote — suspects a **specific
file**. Strong candidate: the **LTX-2.3 22B transformer** is the largest single
dep ever shipped (~50GB), and the stall hit near the END (60/63GB) → longest
single stream = highest odds of an HF wave-throttle / socket reap. Also the Pod
image was freshly pulled (`v0.5.0-cu128`) this session. CONFIRM before assuming a
generic bug: is it always the same dep/byte-range that stalls? (See research/.)

## Proposed fix (confirm behaviour before each)
**App-side** — silent-stall watchdog in the remote install driver: when
`_remoteDepIds` is non-empty and no `models:install-progress` has arrived for
~60–90s, treat as stalled → `_reconcileOutstandingRemoteDeps()`, abort+reconnect
the SSE, and fail cleanly if genuinely stuck (never a frozen bar).

**Wrapper-side (mpi-ci)** —
- aria2c: `--lowest-speed-limit=1M --timeout=30 --connect-timeout=30 --continue`.
- httpx: wrap the stream iteration in an `asyncio` per-chunk wall-clock deadline.
- **Range-header resume** so a retry continues from partial bytes.
- (optional) SSE **heartbeat** so a frozen download is visible to the app even
  when the download loop is blocked.

**Converge on:** a stalled remote download self-recovers OR fails cleanly within
~1–2 min — never a permanent ghost bar.

## Related (do not conflate)
- **MPI-129** — HF→R2 migration (reduces trigger, doesn't remove failure mode).
- **MPI-128** item 2 — self-host the 5 upstream LTX base files → R2.
- **Pre-existing separate bug** (MPI-129 event 2026-06-25T10:30): a **local**
  download stream error is **unhandled → kills the server**
  (`ERR_STREAM_WRITE_AFTER_END`) instead of failing just the dep. Different path
  (local, not remote SSE) but same family of missing download error-handling.

## Verify (done = all)
- [ ] Force a stall (kill the Pod's network mid-download, or block the HF host)
      → app recovers or fails cleanly within ~2 min; no frozen bar.
- [ ] Wrapper aria2c stall → detected via `--lowest-speed-limit`, resumes via
      `--continue` from partial (not byte 0).
- [ ] httpx path: stalled chunk hits the wall-clock deadline → error emitted.
- [ ] App silent-stall watchdog fires when ticks cease on an open stream →
      reconcile + reconnect; dep settles or fails.

## PICKUP NOTE (2026-06-29, after MPI-140 done) — RE-FRAME against R2 FIRST

The original stall (2026-06-25) was caught installing LTX-2.3 **from Hugging
Face**. The root cause named here (HF/Xet CDN zombie/half-open sockets that stop
sending bytes without RST/FIN, defeating httpx read-timeout) is an **HF
pathology**. As of MPI-129 (DONE), all MPI-owned weights are on **Cloudflare R2**,
which does NOT exhibit the HF/Xet throttle-to-death + half-open behaviour. MPI-140
(the sibling "progress lie" card) was largely RESOLVED simply by the R2 move —
the lie was the same HF symptom.

**So before building the two-sided watchdog: re-test whether the stall still
reproduces on R2 at all.** Likely MPI-136 shrinks to a thin defensive belt rather
than the full wrapper-resume + app-SSE-recovery system described above:
- The remaining HF deps are UPSTREAM only (Comfy-Org/Kijai/Lightricks/Bingsu — not
  ours), so a stall risk persists ONLY for those files until MPI-128 self-hosts
  them to R2.
- A cheap defensive minimum may suffice: aria2c `--lowest-speed-limit` (already
  partly there) + an app-side silent-SSE-stall timeout that surfaces a clean
  failure (Cancel→Install) instead of a frozen bar. The full wrapper httpx
  read-deadline + resume-from-.part may be over-engineering for an R2-only world.
- Verify on a CPU download Pod (cheap, no GPU bill) — the MPI-140 session proved
  that path works (CPU image pinned to v0.10.2-cpu in remoteProxy.js).

See MPI-140 validation.md for the full R2-root-cause framing + the 9 download
fixes that shipped alongside.
