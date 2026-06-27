# MPI-97 Plan — Parallel model installs (no shared-dep collision)

App-side only (remote + local). NO image rebuild. Branch: RunPod. Files: `routes/downloadManager.js`, `routes/remoteModels.js`, renderer download-error surfacing.

## Code reality (read before coding)

The brief's phrase "the per-dep guard is coarse + not refcounted" is **only half true** — `routes/downloadManager.js` already refcounts deps (`depJob.refCount`) and the LOCAL path already dedupes (`_startPendingDeps` skips a dep when `_activeDownloaders.has(dep.id)`). The actual collision is in the **REMOTE** path:

- `_startRemoteDownload` has **no in-flight guard**. For every `toInstall` dep it unconditionally calls `remoteModels.remoteInstallDep(dep)`.
- When the dep is already installing for model A, the **wrapper** (Pod-side) answers non-202/200, `remoteInstallDep` throws `... already downloading`, the `.catch` marks the dep `failed`, and `_checkModelJobsComplete` fails model B's WHOLE job → "Download Failed" + Report-on-GitHub dialog.

So the error string lives on the Pod, not in app source. The fix is to never send the second wrapper call: ATTACH instead.

## Phase 1 — Remote dep attach (the core fix)

In `_startRemoteDownload`, when building `toInstall`, treat a dep that is already in-flight as already-handled:

- In-flight test: `_remoteDepIds.has(dep.id)` (true while a wrapper install is running) OR an existing `_depJobs` entry whose `status === 'downloading'`.
- If in-flight: refcount up (already done by `depJob.refCount += 1`), push onto `modelJob.deps` (already done), but do **NOT** add to `toInstall` → no second `remoteInstallDep`. The shared SSE in `_onRemoteInstallEvent` already loops EVERY `modelJob` whose `deps` contain that dep id, so B's bar fills from A's stream and B settles via `_checkModelJobsComplete` when the dep completes.
- Verify: queue I2V while T2V's `umt5_xxl_fp8_e4m3fn_scaled` + `wan_2.1_vae` mid-install → both cards reach 100%, no Download-Failed dialog, no second wrapper call in app.log.

## Phase 2 — Don't cancel a shared in-flight dep out from under another model

`/comfy/models/download/cancel` decrements `dep.refCount` then, when `refCount <= 0`, cancels. The `_remoteDepIds` wrapper-cancel branch must respect that count: only `remoteCancelInstall(dep.id)` when `refCount <= 0` (last owner). It's already inside the `if (dep.refCount <= 0)` block — **confirm** the attach in Phase 1 increments refCount so a shared dep's count is ≥2 and B's cancel leaves A's install running. Add a test.

## Phase 3 — Collision/benign-transient never shows error+GitHub dialog

Find the renderer path that turns `download:failed` into the Download-Failed + Report-on-GitHub dialog (MPI-94 G1 / MPI-81 #6 family). With Phase 1 the collision no longer reaches `download:failed`, but harden: a dep-attach event is silent (no toast), genuine install failures still surface. Confirm no new toast for the (now-absent) collision per `[[feedback_no_toast_user_stop]]` discipline — collision resolution is silent, the user's intent (dep fetched) is satisfied.

## Phase 4 — SSE-recover (paired scope)

`remoteModels.openInstallEventStream` logs `remote install SSE closed` on stream drop and the async loop just returns — the card hangs at its last %. Add recovery while installs are outstanding:

- On non-aborted stream end/error, if `_remoteDepIds.size > 0`, reconnect the stream (small backoff) OR poll `/wrapper/models/install/active` (GET) to settle dep states, then re-broadcast `download:complete`/`download:failed`.
- Driver lives in `downloadManager.js` (`_ensureRemoteEventStream` / `_teardownRemoteEventStreamIfIdle`); the reconnect belongs there or as a callback from `openInstallEventStream`. Keep teardown idle-safe (don't reconnect once `_remoteDepIds` empties).
- Verify: kill the stream mid-install (or observe a live `remote install SSE closed`) → card recovers to a terminal state, no permanent 100%-hang.

## Out of scope (note, don't do)

- Wrapper `.part` orphan cleanup on abort + `models/status` ignoring `.part` (MPI-81 #9) = **wrapper-side**, future image build. Leave a note; do not rebuild image here.

## Verify (whole card)

Queue 3+ models including deps-sharing pairs (Wan T2V + I2V) on a remote Pod: all install, no collision dialog, correct final installed state, cancel of one shared model leaves the other's shared dep intact, and a mid-install SSE drop self-recovers. USER live-verifies on a Pod before close (this card needs a real Pod — yellow/validating until then).
