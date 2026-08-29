# MPI-657 — checklist

- [x] `_awaitDownloadDone` resets its ceiling on every `download:progress` tick for the
      matched model, so a streaming download can never trip it.
- [x] The `phase === 'verifying'` finish still fires from that same handler (it is the
      download-done signal for the remote path).
- [x] The MPI-395 WARN survives, reworded to say 30 minutes of NO PROGRESS, and still
      names the model id.
- [x] `finish()` stays the single cleanup path — `cancel()` and every terminal listener
      keep resolving through it, and `clearTimeout` still runs.
- [x] Nothing about job status, cancel or file deletion changes — the ceiling stays a
      chain release only (asserted in the test).
- [x] Test covers both directions, by mutation rather than by runtime: dropping the
      re-arm and dropping the `clearTimeout` each fail the suite.
- [x] `node --test tests/install-*.test.cjs tests/download-*.test.cjs` — 20 pass, 0 fail.
- [x] Checked the belt this leans on: backend progress ticks are byte-driven, and
      `_startStallWatchdog` (MPI-291) still catches a quiet socket in up to ~75s
      (`STALL_MS` 60s, swept every 15s). See
      `validation.md`.
