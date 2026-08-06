# MPI-460 - A stalled download never retries its own url

## Symptom (live 2026-08-06, user-reported "downloads are broken")

LTX 2.3 balanced install. 11 of 12 deps completed at ~18 MB/s. The 25 GB
`ltx23-transformer-fp8` reached 8.4 GB and then:

```
[2026-08-06T21:54:48.338Z] [WARN] [download] stall watchdog: ltx23-transformer-fp8 no byte movement in 60000ms - forcing failure
```

Model job -> `failed`, and the user got the "Download Failed - Download stalled,
no data received." report dialog. One 60-second hiccup discarded a 9-minute
download from the user's point of view.

The origin was never at fault: a `HEAD` and a `Range: bytes=8446279680-` request
against the same object returned `200` (25226571988 bytes, `Accept-Ranges: bytes`)
and `206 Partial Content` respectively, measured minutes after the failure.

## Root cause

1. `FileDownloader.forceStall()` (downloadManager.js) synthesises
   `Error('Download stalled - no data received.')` and routes it into the
   `'error'` handler, exactly as MPI-291 designed.
2. The handler asks `_describeTransportError(err, url)` whether this is a
   network-blocked condition. That string matches **none** of
   `_TRANSPORT_ERROR_PATTERNS` (`econnreset`, `etimedout`, TLS strings, ...), so
   `blocked` is null - no mirror failover (MPI-429's branch is skipped).
3. There is **no same-url retry anywhere**. The next statement is
   `_setDepStatus(depJob, 'failed')`. Terminal, on the first blip.

MPI-291's own acceptance criterion said the dep should transition to
`failed` *"(or auto-retries)"* and that the watchdog would "force the downloader
into its `error` path so the EXISTING failed/retry logic runs". That logic is
**manual only**: MPI-427 made `failed -> queued` a legal transition
(`installStore.requeueDep`) for an explicit user retry click. Nothing automatic
was ever built. The watchdog had never fired in the wild before today
(memory: "code-verified only, never seen fire"), so the dead end went unnoticed.

## Second defect found in the same handler (MPI-429 half-wire)

The mirror-failover branch re-enters `download()` but never re-adds the
downloader to `_activeDownloaders` - only `_startPendingDeps` does
(`_activeDownloaders.set`, one call site). After any failover the live stream is
therefore invisible to:

- the stall watchdog (`_watchdogSweep` iterates `_activeDownloaders`),
- user cancel / uninstall (`_activeDownloaders.get(dep.id)`),
- shutdown `cancelAllDownloads`,

and it frees a concurrency slot it is still occupying. No duplicate-stream risk
(`_startPendingDeps` filters `status === 'queued'` and a failing-over dep stays
`downloading`).

## Fix

In the `'error'` handler, before the terminal fail:

1. Bounded same-url retry - re-enter `download()`, which goes through the
   MPI-317 resume contract and picks up from the on-disk partial via `Range`.
   Retries are spaced by a backoff and capped; only the exhausted budget is
   terminal. A definite 4xx (other than 416, which scrubs and restarts clean) is
   not retried - it would fail identically every time.
2. Re-register in `_activeDownloaders` and reset the byte-flow stamp on BOTH the
   retry and the mirror-failover branch, and let `cancel()`/`stopKeep()` clear a
   pending retry timer so a user cancel during the backoff cannot be resurrected.

## Out of scope

- Changing `STALL_MS` (60s) or NDH's `timeout: 30000`. The watchdog behaved
  correctly; what it routed into did not.
- A Retry button on the failure dialog. Re-clicking Install already requeues and
  resumes (MPI-427 + MPI-317) - a separate UX card if wanted.
- MPI-320's write-flip (retiring `_modelJobs`/`_depJobs`). Same handler region,
  independent work.

## Evidence trail

- `%APPDATA%\\Cubric Vision\\logs\\app.log`, 2026-08-06 21:41-21:54Z.
- Partial kept and resumable: 8446279680 bytes on disk plus a `.cubricdl` marker
  whose `sha256` matches `sha256Expected`, so `_shouldResumePartial` returns
  true and the next Install click resumes rather than restarts.
