# MPI-95 Plan — F3: HEAD true-total + indeterminate-until-ready

## Goal
Remote model install bar crawls smooth 0→100 with no instant ~80% jump.

## Steps
1. **True denominator (HEAD).** In `_startRemoteDownload` (`routes/downloadManager.js`),
   after resolving `toInstall`, HEAD every to-install dep URL in parallel via
   `_getFileSizeFromUrl`. Seed `depJob.totalBytes` with the real content-length.
   Fallback to `_parseSizeToBytes(dep.size)` when HEAD returns 0/error. Recompute
   `modelJob.totalBytes` from real dep totals before the first broadcast.
   → verify: denominator equals summed real content-lengths.
2. **Indeterminate gate.** Add an `indeterminate` flag to the broadcast while any
   active dep total is still unknown (HEAD pending/failed). Clear it once all
   resolved. Emit on `download:started` / `download:progress`.
   → verify: payload carries `indeterminate:true` until totals known.
3. **Renderer.** Download card shows animated "Preparing…" (indeterminate) bar
   while `indeterminate`, then a real % bar. Reuse existing MpiProgressBar
   indeterminate mode if present; else minimal add.
   → verify: UI shows Preparing… then smooth bar.
4. **Verify end-to-end** in remote mode on a big + small model.
   → verify: no ~80% jump; one smooth crawl.

## Out of scope
- Wrapper (`mpi-ci`) — no change.
- Local download path — unchanged.
- Post-download hash "verifying" UX — separate concern, not this card.
