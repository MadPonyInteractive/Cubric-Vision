# MPI-690 Validation

## What changed

`routes/remotePodLifecycle.js`
- `CPU_DOWNLOAD_VCPUS = 8` + `spec.vcpuCount` on the `noGpu` branch. `cpu3c` is
  2 GB RAM per vCPU, so 8 vCPU = 16 GB against the observed 3.725 GiB. The MPI-667
  flavour walk is untouched; a fallback to `cpu3g` (4 GB/vCPU) gets more headroom.
- Corrected the comment that justified the bug ("a model download is
  network/disk-bound") — right about CPU, wrong about memory.

`routes/downloadManager.js`
- `REMOTE_DOWNLOAD_CONCURRENCY = 3`, the twin of the local cap that has existed
  since MPI-140. `_remoteInstallQueue` + `_pumpRemoteInstalls()`; `_remoteDepIds`
  is the slot counter, so no parallel bookkeeping.
- `_enqueueRemoteInstall` / `_issueRemoteInstall` / `_releaseRemoteDep` split out
  of the old inline dispatch loop. Every settle path funnels through
  `_releaseRemoteDep`, so a freed slot can never be forgotten.
- Queued deps read `queued`, not `downloading` — a dep with no wrapper install
  behind it must not paint a live bar (MPI-539's lesson).
- Queue-aware: `_remoteWorkOutstanding()` replaces the `_remoteDepIds.size === 0`
  checks in `_onRemoteStreamClosed` and `_teardownRemoteEventStreamIfIdle`;
  `_failOutstandingRemoteDeps` drains the queue into its terminal sweep; cancel
  splices a queued dep out before the pump can fire it.

## Evidence

`npm test` — **897/897 pass** (887 baseline + 10 new), `npm run lint` clean, both
run 2026-09-05.

New `tests/remote-install-concurrency.test.cjs` (4 cases), driving the real
`_startRemoteDownload` with every wrapper call stubbed:
- 10 deps in → exactly 3 wrapper installs issued, 7 queued (the 17-concurrent
  fan-out that OOM-killed the Pod is now impossible).
- settle one → the slot refills from the front of the queue, still at the cap.
- `_failOutstandingRemoteDeps` drains the queue; all 10 deps reach `failed`.
- a 2-dep model (the ordinary case) still installs both at once — the cap costs
  normal users nothing.

`tests/pod-cpu-flavors.test.cjs` (+2 cases): the CPU spec carries
`vcpuCount >= 4` and still `computeType: 'CPU'`; a GPU spec carries no
`vcpuCount`.

## Not yet verified

RunPod's REST `POST /pods` accepting `vcpuCount` is asserted against our spec
builder, not against RunPod. It cannot be proven offline. If RunPod rejects the
field the create 400s and the MPI-667 walk exhausts all four flavours — a **loud,
immediate** failure at the first step of the smoke run, not a silent fallback.

Closing evidence is the live smoke matrix on volume `uebvm3350f`: the CPU Pod must
create, and the run must pass 60.6 GB with no `exit code 137` in the RunPod
**System** log.
