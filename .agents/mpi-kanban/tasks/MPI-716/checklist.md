# MPI-716 Checklist

Umbrella MPI-717, Phase 1. Plan: `plan.md`. Evidence the thresholds come from: `brief.md`
and `C:/AI/Mpi/_private/cubric-download-telemetry/`. Executed evidence: `validation.md`.

Three log lines on the local download path. No behaviour change — the risk is log volume,
not regression.

## Phase 1: Free space on the volumes that matter

- [x] `_diskSpace()` is the single statfs primitive, returning free AND total from one call; `_freeDiskBytes()` kept as the free-only wrapper the MPI-99 gate consumes (no rename, so nothing downstream drifts)
- [x] Boot line in `server.js` beside `Server started`: models root + `userData` volume, free/total/percent, category `download`. Placed OUTSIDE the axios dynamic import so a failed import cannot cost the telemetry
- [x] Install-start line: models root, after the disk gate passes and before `_startPendingDeps()`
- [x] **Verified in a real app boot** (`npm run app:isolated`, own profile + port 50666): both lines land right after `Server started`, and the models root read 93.9% used — a genuinely near-full volume, not a contrived one. User's `:3000` untouched

## Phase 2: Slow-stream WARN

- [x] `_slowSince` / `_slowWarned` latch in `FileDownloader._checkSlowStream()`, called from the `'progress'` handler off NDH `stats.speed` — NOT `_modelSpeedLabel` (that is the per-MODEL EMA)
- [x] Both reset in `_rearm()` — retry, mirror failover and resume all pass through it
- [x] Line carries rate, host read AT WARN TIME off `depJob.url` (MPI-429 mutates it on failover), peer IP + `cf-ray` stashed off NDH's `__response` in the `'download'` handler — no `dns.lookup`
- [x] Stash sits ABOVE the `isResumed` early return — a resumed stream has a peer too
- [x] NDH pin (2.1.11) named in the comment, same class of dependency as `__isResumed`. Verified against the installed package: `__downloadRequest` assigns `__response` before it emits `'download'`
- [x] Floor 1 MB/s sustained 60 s — catches all three run-2 deps with room on both sides
- [x] Logs and returns. A fourth observer, never merged with the ceiling / watchdog / retry (MPI-657 § Watch out for)

## Phase 3: Timed write probe

- [x] `fs.open` → 8 MB → **`fsync`** → close → unlink, timed end to end, logged as MB/s
- [x] Gated on the Phase 2 latch — at most once per dep, never on a timer
- [x] Skipped, and said so in the line, under `PROBE_MIN_FREE_BYTES` (1 GB) so it can never trip the `ENOSPC` cancel-all in `server.js`. **Inspection only** — no harness here can fake a near-full volume
- [x] Temp file gone even when the write throws — unlink is in `finally`, and the case is tested
- [x] Written into the dep's own directory: same volume by construction, already writable, measures the exact path in use

## Tests

- [x] `tests/download-retry.test.cjs` extended with a throttled body on the EXISTING local server — no second harness
- [x] Exactly one WARN per dep, and it names a rate
- [x] No `cf-ray` from the test server degrades cleanly to `cf-ray: -`; peer IP still comes off the real socket
- [x] Probe asserted too: one line, an fsynced rate, no leftover file, and a failing probe resolves instead of rejecting
- [x] `_setSlowStreamThresholdsForTests` compresses the 60 s window for the test only (same contract as `_setTrashFnForTests`)
- [x] 4 passed standalone · **917/917 full suite** · eslint exit 0

## Docs

- [x] `docs/download-manager.md` § "A slow install must be readable from the log alone (MPI-716)" — the three lines, their grep patterns, the question each answers, and the NDH pin to re-check on a bump

## Definition of done

- [x] Re-read the two captured logs and named, per addition, the line it WOULD have written and the question that line answers — `validation.md` § Definition of done. **All three shorten the investigation.** Sharpest result: two of the three crawling deps produce NO diagnostic line at all in the capture today, and the one that does arrives 3 min 15 s later than the WARN would have
