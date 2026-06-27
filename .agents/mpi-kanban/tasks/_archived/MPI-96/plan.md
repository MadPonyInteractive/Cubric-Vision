# MPI-96 Plan

## Approach

No new endpoint. Enrich the existing `/remote/comfy/status` route (renderer
already polls it every 4s) to also report the **RunPod Pod runtime status** when
the wrapper `/health` is not yet ready and we're mid-boot (`_starting`). The
backend `client.getPod` + `desiredStatus` field already exist
([routes/runpodRemote.js:159](../../../../routes/runpodRemote.js#L159)).

### Backend — `routes/remoteProxy.js`

In `GET /remote/comfy/status`, when `_mode.active && _mode.podId` and the
wrapper `/health` is NOT ready (the `!r.ok`, catch, and `ready:false` branches):

1. Call `client.getPod(key, _mode.podId)`, **throttled** to ~1 call / 12s
   (module-level `_lastPodStatusAt` + cached `_lastPodStatus`) so the 4s poll
   loop doesn't hammer the RunPod API.
2. Read the runtime state defensively across REST shape variants:
   `p.desiredStatus || p.currentStatus || p.status` (RunPod REST v1 uses
   `desiredStatus`: CREATED, RUNNING, EXITED, TERMINATED, PAUSED, DEAD).
3. Return it as `podStatus` on the JSON so the renderer can branch.
   `running:true` when status === RUNNING is informational only; readiness still
   gates on the wrapper `/health.ready` (a RUNNING Pod whose wrapper hasn't
   booted is still "creating…").
4. Best-effort: a getPod failure leaves `podStatus: null` (current behaviour, no
   regression).

### Renderer — `MpiSettings.js` `_pollEngineReady`

1. On each tick read `data.podStatus` from `/remote/comfy/status`.
2. Treat `EXITED`, `TERMINATED`, `DEAD` as **not-running-after-create**. Apply a
   short grace (`notRunningGraceMs ~30s` from poll start) so a normal
   `CREATED→RUNNING` transition is never flagged.
3. On a confirmed not-running terminal status past grace: stop the loop, return a
   sentinel (`{ failed:true, reason:'pod-not-running' }` or similar), and have
   the caller surface **"Pod failed to start on host — Cancel and pick another
   GPU."** Keep the Cancel button live (already is). Stop emitting the fake
   `remote:connect-progress` creep.
4. Healthy slow-boot (`podStatus === RUNNING` but wrapper not ready) keeps
   waiting the full timeout — unchanged.

### Renderer mirror — `js/shell.js`

`_connectPct` / heroStats GPU-slot bar: if a `pod-not-running` failure is
surfaced, stop the creeping % there too (don't imply progress). Confirm the
event path during implementation; may be covered by the existing
connect-failure path.

## Verify

- `node --check` on both edited JS files.
- ESLint clean on `js/components/.../MpiSettings.js`.
- Settings panel mounts no-error (desktop or browser dev).
- USER live-verify: reproduce a phantom Pod (create on a flaky GPU that 201s but
  never boots) → bar must stop early with the host-failure message instead of
  crawling to 99%. Yellow card until then.

## Out of scope

- No Pod image rebuild (app-side only).
- No change to the MPI-86 watchdog (it already works); this is complementary —
  watchdog = time-based nudge, this = status-based hard signal.
