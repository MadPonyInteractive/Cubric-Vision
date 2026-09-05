# MPI-692 — Smoke runner is blind to the app's own `[download]` warnings

## The gap

Yesterday's smoke run (2026-09-04) died after ~36 minutes of a Pod that had
already OOM-killed itself. The app **diagnosed it correctly and early**:

```
[22:07:45] [WARN] [download] remote install SSE closed (bad-response); 7 dep(s) outstanding — recovering
[22:09:45] [WARN] [download] remote install silent for 94s with 1 dep(s) outstanding — treating as stalled
[22:10:38] [WARN] [download] remote install SSE closed (error); 17 dep(s) outstanding — recovering
[22:43:06] [WARN] [download] remote target inactive; failing 17 outstanding dep(s)
```

The first warning landed at **22:07:45**. The run was abandoned at **22:43**.
Thirty-six minutes of a paid Pod, with the answer sitting in `app.log` the
whole time — because `scripts/smoke-workflows.mjs` prints a dot per dep and
never looks at the app's log.

## What to build

The runner surfaces the app's `[download]` WARN/ERROR lines inline in its own
output while the install phase runs. Nothing more.

```
  [2/12] minimax-h3
  ........
  ⚠ [download] remote install SSE closed (error); 17 dep(s) outstanding — recovering
  ⚠ [download] remote install silent for 94s with 1 dep(s) outstanding — treating as stalled
```

No new detection logic. The app already owns the diagnosis, the thresholds and
the vocabulary; MPI-691 made a genuine stall terminal after 3 rounds. The
runner just has to stop hiding it.

## Rejected: a throughput floor

The first design was a rolling MB/s floor. It is wrong on both axes and must
not be revived without reading this:

- **Too low to catch degradation.** Real sustained rate on 2026-09-05 was
  **265 MB/s average** over 13 min (207.3 GB), peaking past 400 and settling
  ~200. A floor low enough not to false-alarm is far below any rate that
  indicates a problem — a run degrading 400 → 60 MB/s is badly broken and
  clears a 50 MB/s floor comfortably.
- **It false-alarms when nothing is wrong.** A measured 91s window on the
  healthy run read **22.3 MB/s** — below yesterday's broken 25 — because the
  window caught aria2 finalization and sha256 verification (`.part` files
  3 → 1, 47.3 GB → 1.2 GB, CPU pinned at 100%). Bytes stop landing during
  verify. Any window-based rate check has this hole.

## Verify

Replay a known-bad condition (or a synthetic `[download]` WARN in a fixture
log) and confirm the line appears in runner stdout within one poll interval.

## Constraints for whoever picks this up (2026-09-05, read first)

**`scripts/smoke-workflows.mjs` is executing right now.** A peer session holds
it: `GPU 0 busy … pid 17864 … node scripts/smoke-workflows.mjs --keep-volume`,
since 09:07:58, running the 1.4.5 release smoke matrix. Node read the file at
import, so editing it on disk will not crash that run — but claim it in
`files.json` at `todo -> doing` before touching it.

**You cannot verify this live, and must not try.** Two reasons:

1. The runner is GPU-lease gated and GPU 0 is held by the release run. Your
   invocation would block on the lease, or worse, be "fixed" by bypassing it.
2. A live run rents a CPU Pod and pulls ~290 GB. This card does not justify
   that spend. Verify against a fixture log, as `## Verify` says.

**Do not touch `dev_configs/node_lock.json` or `dev_configs/smoke-evidence.json`.**
`npm run release:check` fails when `smoke-evidence.json` is older than
`node_lock.json`'s last commit. The release run is about to write
`smoke-evidence.json`; a commit touching `node_lock.json` behind it silently
invalidates the evidence and blocks 1.4.5.

Shared tree — commit by explicit pathspec (`git commit --only <paths>`), never
`git add -A`.

## Origin

Found during MPI-690 live validation, 2026-09-05. Raised by the user watching
the RunPod console: yesterday's 40 GB / 27 min against today's 6 GB / 14 s,
and asking why the runner did not flag it.
