# MPI-460 validation

## Live proof - the real 25 GB dep resumed and completed (2026-08-06)

The dep the bug killed is the one that proved the fix.

**Before:** `ltx23-transformer-fp8` failed at 8446279680 / 25226571988 bytes
(`Download stalled - no data received.`), partial + `.cubricdl` marker kept.

**After the restart:** the user clicked Install on LTX 2.3 balanced. The marker's
`startedAt` bumped to `2026-08-06T22:31:23Z` with the byte count intact, so the
attempt RESUMED rather than restarting - the MPI-317 contract driven by the new
retry path. It ran at 24.9 MB/s and finished.

**Confirmed installed:** the Model Library header moved to `6 installed` and
LTX 2.3 balanced left the Available grid. A direct `/comfy/models/check` probe
shows `ltx23-transformer-fp8` (25.2 GB) on disk alongside the other 11 deps.

## Automated

- `tests/download-retry.test.cjs` - a local server kills the first connection
  mid-body; the retry re-requests with `Range: bytes=51200-` and the finished file
  matches its expected sha256. Drives `forceStall()` directly because NDH v2.1.11
  does not emit `error` on a socket that dies mid-body (re-measured this session,
  the same finding MPI-291 built the watchdog on).
- `npm test` 463/463, including `tests/transport-error-message.test.cjs` - the
  bytes-on-disk gate is what keeps MPI-429's mirrors-exhausted -> failed contract
  and MPI-427's fast readable remedy intact.
- `npm run release:deps` - 215/215 dep URLs reachable; proven able to FAIL via a
  bogus `CUBRIC_MODEL_MIRRORS` base (exit 1, 34 mirror failures).

## Not proven

- The `_rearm()` half (re-registering in `_activeDownloaders`) is proven for the
  RETRY branch by the test above. The MIRROR-FAILOVER branch that shared the same
  defect is still only exercised by the offline unit test - no live failover has
  ever run, because `_MODEL_MIRRORS` only reaches a real second origin for a user
  whose primary route is blocked.
- The 3-retry budget exhausting into a terminal failure has not been seen live;
  only its first retry has.
