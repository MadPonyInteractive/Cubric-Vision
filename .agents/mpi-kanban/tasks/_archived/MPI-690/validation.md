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

## Live evidence — `vcpuCount` accepted by RunPod (2026-09-05)

The one field that could not be proven offline is now proven **against RunPod
itself**. Smoke run started 2026-09-05T08:07:57Z against the app restarted at
07:51:56Z (fix commit `819ab084` landed 07:47:46Z, so the running main process
carries it).

Runner log:

```
  CPU download Pod: create (attempt 1/3)…
.... remote mode active on nssc9f1vfy8v6v
  volume: MEASURED used 60.6 GB of 340.0 GB - free 279.4 GB
  installing 102 deps on a CPU Pod (download mode)…
```

**Attempt 1/3** — no 400, no MPI-667 flavour walk, no fallback.

`GET /runpod/pods`:

```json
{"id":"nssc9f1vfy8v6v","desiredStatus":"RUNNING","vcpuCount":8,"memoryInGb":16,"costPerHr":0.24}
```

`GET /remote/pod/stats` (the wrapper's own view, inside the container):

```json
{"ram":{"total":16000000000,"used":603619328,"percent":3.8}}
```

16.0 GB against the **3.725 GiB** box that OOM-killed the previous run — 4.3x the
RAM, on the same `cpu3c` family, from `CPU_DOWNLOAD_VCPUS = 8` alone.

## Live evidence — the concurrency cap (CLOSED)

The full matrix ran 2026-09-05 08:07–08:57Z: **102 deps across 12 models, every
one installed, zero failed.** Two independent witnesses agree the cap held, one of
them outside the app's own bookkeeping:

- **The app's log.** `[download]` since the 07:51:56Z restart contains exactly one
  line — `curated python deps already installed`. No `N dep(s) outstanding`, no
  `silent-stall`, no `reconcile failed`, no `re-issuing`.
- **The Pod's disk.** Sampling `/remote/pod/ls`, the number of `.part` files never
  exceeded **3** — `REMOTE_DOWNLOAD_CONCURRENCY` visible in the filesystem rather
  than inferred. The pre-fix run spawned 17 aria2c at once.

| | 2026-09-04 (pre-fix) | 2026-09-05 (post-fix) |
|---|---|---|
| throughput | 40 GB / 27 min = **~25 MB/s** | 207.3 GB / 13 min = **265 MB/s** |
| peak Pod RAM | OOM-killed at 3.725 GiB | **0.66 / 14.9 GiB (4.4%)** |

The 4.4% was sampled *during* `minimax-h3` — the 17-dep, 50.1 GB model that killed
the box the day before. Flat, not a wobble. Both Pods torn down clean at the end
(`count: 0`, `$0/hr`).

Final matrix: **PASS 37 · SKIP 0 · FAIL 0**, `npm run release:check` passes.

For contrast, the pre-fix run is in `app.log` verbatim:

```
[2026-09-04T22:10:38.397Z] [WARN] [download] remote install SSE closed (error); 17 dep(s) outstanding — recovering
[2026-09-04T22:43:06.274Z] [WARN] [download] remote target inactive (remote inactive); failing 17 outstanding dep(s)
```
