# MPI-690 Plan — CPU download Pod OOMs

## Current State

The CPU download Pod is created 2 vCPU / ~4 GB and the app fires *every* remote
dep install at once. On the 1.4.5 smoke matrix (102 deps, 340 GB) that was 17
concurrent aria2 processes on a 3.725 GiB box; the container was OOM-killed
twice (`exit code 137`, RunPod **System** log only).

Two independent causes, both app-side:

1. `routes/remotePodLifecycle.js:838` sets `spec.cpuFlavorIds = [CPU_FLAVORS[0]]`
   and never sets `vcpuCount`, so RunPod lands the family minimum. `cpu3c` is
   compute-optimised at 2 GB RAM per vCPU, minimum 2 vCPU → 4 GB, exactly what
   was observed. `minMemoryInGb` is deliberately excluded from the `noGpu`
   branch and is not the lever here.
2. `routes/downloadManager.js` `_startRemoteDownload` loops over `toInstall` and
   POSTs `/wrapper/models/install` for all of them with no cap. The LOCAL twin
   has had `LOCAL_DOWNLOAD_CONCURRENCY = 3` and a queue since forever; the
   remote path never grew one.

Fixing only (1) leaves the box size a lottery — the fan-out is unbounded, so a
bigger dep set re-reaches any ceiling. Fixing only (2) leaves a 4 GB box with no
headroom. Both.

## Remaining Work

1. `remotePodLifecycle.js` — set `spec.vcpuCount` on the `noGpu` branch.
   `CPU_DOWNLOAD_VCPUS = 8` → 16 GB on `cpu3c`. The MPI-667 flavour walk is
   untouched and still works (a fallback to `cpu3g` gives 32 GB — more headroom,
   more cost, only on a stock-out).
   **Verify:** `tests/pod-cpu-flavors.test.cjs` asserts the field is in the spec.
2. `downloadManager.js` — `REMOTE_DOWNLOAD_CONCURRENCY = 3` plus a queue and a
   pump. `_remoteDepIds` is already the in-flight set, so it *is* the slot
   counter; no new bookkeeping. Queued deps read `queued`, not a lying
   `downloading`. Every path that reasons about "nothing outstanding"
   (`_teardownRemoteEventStreamIfIdle`, `_onRemoteStreamClosed`,
   `_failOutstandingRemoteDeps`) must learn about the queue or a queued dep is
   orphaned.
   **Verify:** new test — 10 deps in, at most 3 wrapper installs issued; settle
   one, a 4th is issued.

## Verification

**Verify mode:** auto

- `npm run lint`
- `npm test`
- Live: the resumed smoke matrix on volume `uebvm3350f` must pass 60.6 GB
  without a 137 in the RunPod System log.

## Current State (2026-09-05)

Both edits shipped in `819ab084` (pushed). 897/897 tests, lint clean, card
`doing`/`validating`. Only the LIVE leg is outstanding.

Blocked on one thing the agent must not do itself: the app on `:3000` needs a
RESTART. Both fixes are in `routes/` — main-process Express, not the renderer —
and the smoke runner drives the app's own routes, so an unrestarted app rebuilds
the same 4GB Pod with the same 17-way fan-out and proves nothing. The user is
restarting it now.

Found while checking the resume path: `smoke-workflows.mjs` installs models one
at a time through the normal per-model route with NO force flag, so the 60.6 GB
and the aria2 control files on the volume are picked up, not re-downloaded. The
17 concurrent downloads were the deps *within* one model — exactly what the cap
of 3 bounds.
