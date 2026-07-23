# MPI-291 — Stalled download must self-heal + stay visible

## Symptom (live 2026-07-16, Chroma Flash install)

User pressed Install, navigated to a project to generate, came back to Model
Library. Chroma bar frozen at 65%. Server was actually still downloading
(later genuinely stalled). Two independent faults, same family: **a download
in trouble neither self-heals nor reports the truth.**

## Diagnosis (DevTools + server curl, verified)

**Fault 1 — FE SSE stream died, no reconnect.**
`downloadService._eventSource` was `null` (stream dropped, error-handler
reconnect never re-established). No live stream → no `download:snapshot` →
`state.downloadJobs` empty (`[]`), `downloadQueueActive: false`. The 65% bar
was orphan DOM the grid never repainted. Server snapshot (via a fresh console
`EventSource`) was perfect: `chroma-flash:downloading:93%`. Manually calling
`downloadService._connectSSE()` instantly refilled state + repainted the bar.
→ MPI-276 store/snapshot/reconciler are CORRECT. The gap is FE stream
**liveness** — nothing guarantees the SSE is alive while a download runs.

**Fault 2 — mid-stream byte stall not caught.**
Dep `t5xxl-fp16` wedged at `7691304960 / 9787841024` bytes (9.8 GB file),
zero byte movement across 24s+ polling — stalled since before the session.
NDH is configured `timeout: 30000` (routes/downloadManager.js ~L486) which the
comment claims is a socket-inactivity timeout (MPI-120), but on a **mid-stream**
quiet socket in NDH v2.1.11 it did NOT fire `error`. So the dep sat
`downloading` forever: no `failed`, no retry, no user signal. Recovery was only
possible by manual Cancel → reinstall.

## Fix (one card — two watchdogs, same reflex)

Mirror the existing self-idling backstop pattern already in
`MpiModelManager._pumpBackstop` (L1268): run only while a job is active,
self-idle when none.

1. **FE SSE liveness watchdog** (`js/services/downloadService.js`).
   While `state.downloadJobs` has an active job, periodically verify
   `_eventSource && _eventSource.readyState === EventSource.OPEN`; if
   null/CLOSED, call `_connectSSE()`. Self-idles when no active job. Does NOT
   touch the store, snapshot protocol, mirror-wholesale-replace, or version
   gate (MPI-276 untouched).

2. **Byte-flow stall watchdog** (`routes/downloadManager.js`, FileDownloader).
   Track last-progress-byte timestamp per active downloader. If no byte
   movement for N seconds (e.g. 60s — longer than NDH's 30s so it's a genuine
   backstop, not a double-fire), force the downloader into its `error` path
   (`_downloader.stop()` + emit error) so the EXISTING failed/retry logic runs.
   This is the real backstop the `timeout:30000` comment PROMISES but NDH
   doesn't deliver mid-stream.

## Acceptance criteria

- [ ] Navigate away during a download and back → bar always reflects live
      server progress (no orphan freeze). Reproduce the exact 65% scenario, confirm gone.
- [ ] Kill the FE SSE (`downloadService._eventSource.close()` in console) mid-
      download → within the watchdog interval the stream reconnects and the bar
      resumes ticking with no user action.
- [ ] A dep whose socket goes quiet mid-stream transitions to `failed` (or
      auto-retries) within the watchdog window instead of hanging forever.
- [ ] MPI-276 store/snapshot/reconciler contract untouched — no refCount, no
      snapshot merge, no version-gate change. Existing download tests green.

## Guard rails (MPI-276 — do NOT break)

- No `refCount`. No `/status`-fetch merge. Snapshot still REPLACES
  `state.downloadJobs` wholesale, version-gated.
- Byte-flow watchdog drives the EXISTING legal-transition path
  (`_setDepStatus`), never a raw store mutation.
- Both watchdogs self-idle when no active job (no forever-poll).

## Notes

- Fault 2 is higher priority: a silent server-side wedge is worse than a
  frozen bar. Fault 1 makes the wedge VISIBLE; without Fault 2 the user still
  has to cancel+reinstall manually.
- Confirm both engine paths per the repo's recurring one-twin-forgotten trap:
  the byte-flow watchdog belongs on the LOCAL FileDownloader; the REMOTE
  (wrapper) path already has MPI-136 stall/chunk-deadline handling — verify it
  covers the equivalent and note the gap if not.
