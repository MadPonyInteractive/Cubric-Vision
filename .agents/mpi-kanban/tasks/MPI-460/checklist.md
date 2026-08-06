# MPI-460 checklist

- [x] Bounded same-url retry in `FileDownloader.on('error')`, before the terminal
      `_setDepStatus('failed')`. Partial kept, resume via the MPI-317 contract.
      `RETRY_BACKOFF_MS = [2s, 5s, 15s]`.
- [x] Gate the retry on bytes already on disk (`depJob.downloadedBytes > 0`) so
      MPI-427's blocked user still gets his readable remedy immediately instead of
      22s of silence - and so the mirrors-exhausted -> failed contract survives.
- [x] Re-register in `_activeDownloaders` + reset the byte-flow stamp via `_rearm()`
      on the retry branch AND on the MPI-429 mirror-failover branch.
- [x] `cancel()` / `stopKeep()` clear a pending retry timer.
- [x] Definite 4xx not retried (416 excepted - it restarts clean).
- [x] Test: `tests/download-retry.test.cjs` - local server kills the connection
      mid-body, the retry re-requests with `Range: bytes=51200-` and the finished
      file matches the expected sha256.
- [x] `npm test` green: 463/463.
- [ ] Live proof on the real 25 GB dep: resume from 8.4 GB completes.
- [x] Pre-release reachability gate: `npm run release:deps`
      (`scripts/check-dep-urls.mjs`) HEADs every dep url + mirror, exits 1 on any
      failure. 215/215 reachable on 2026-08-06; negative control with a bogus
      mirror base exits 1. Wired into the mpi-version-bump pre-release step.
