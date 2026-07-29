# MPI-395 Validation

## How it was found

Live, while validating MPI-394 on a fresh CPU Pod. The user pressed Install on SDXL NSFW
and the tile parked on `Queued…` with nothing else installing.

## Evidence from the running app (not inference)

- `GET /comfy/downloads/status` → jobs = `engine:assets` (complete), `klein-4b` (complete).
  **No `sdxl-nsfw` job at all.** The POST never fired.
- `GET /comfy/downloads/active` → `{"models":[],"engine":false}`. Nothing was downloading.
- `logs/app.log` ends at Pod-create. No `remote drift heal:` line → MPI-393 held, nothing
  was drifted. The whole remote install path logged nothing.
- The tile text discriminates the state: `Queued…` is reachable only from
  `job.status === 'queued'`, which `start()` sets only when `_inFlight > 0`.

## Root cause

Installs serialise through a client-side promise chain gated on `_inFlight`
(`downloadService.js`, MPI-184). `start()` armed the terminal listener **inside** the
post-POST `.then()`:

```js
const run = () => this._firePost(modelId, dependencies)
    .then((fired) => fired ? this._awaitDownloadDone(modelId) : undefined);
```

But `routes/downloadManager.js` calls `_startPendingDeps()` **before** `res.json()`
(register-before-respond, G8), and a fully-satisfied install goes terminal right there —
`_startPendingDeps` finds 0 queued deps because every dep was already marked
`complete` on registration. So `download:complete` is broadcast **before the response
lands**, and a listener armed after `await res.json()` misses it.

`_awaitDownloadDone` then waits out its full **30-minute** ceiling with `_inFlight` pinned
at 1. Every install clicked in that window sits at `queued` — and `downloadService.js:90`
arms the revert timer **only for `pending`**, so a wedged `queued` job has no timeout, no
toast, no error. Silent for half an hour, then recovers on its own, which is why it reads
as "install just never started".

Closing the inference: `engine:assets` was the **only** other `start()` in the session
(drift heal logged nothing, no generation ran, App Library never opened), and its
completion toast proves `download:complete` fired. A fired event with an unsettled chain
link is only possible if the listener was armed after it.

## Why it reaches users, and why a fresh volume would hide it

`_installRemoteEngineAssets()` (`shell.js`) runs on the **first connect of every app
session**, unconditionally. Once the volume already holds the weights it is a pure no-op —
i.e. the wedge fires on every session *after* the first, and its victim is the first model
install after connecting to a Pod, which is the normal thing to do.

On a **fresh** volume the engine-asset install is a real ~1.76GB download, which always
finishes long after the listener is armed. Deleting the volume would therefore make the
bug stop reproducing without fixing anything. That was considered and rejected.

## Fix

1. **Arm the terminal listener before the POST.** `_awaitDownloadDone` now returns
   `{ promise, cancel }`; `run()` arms it first, then POSTs. Ordering can no longer matter.
2. **`cancel()` for an unfired POST.** A cancel-while-queued emits `download:cancelled`
   *before* `run()` arms, so the old `fired ? … : undefined` guard was load-bearing — the
   listener set is now torn down explicitly instead. Same `finish()` the events use, so
   there is one cleanup path, not two.
3. **The 30-minute ceiling logs.** Its silence is what made this undiagnosable.
4. **`engine:assets` suppressed in `notificationService`**, joining `__universal_workflow__`.
   It had been announcing a raw internal job id as a toast — and as an OS notification when
   unfocused — on every connect, despite `shell.js` stating the heal runs silently. The
   literal is carried rather than imported to keep shell.js's deliberately lazy
   `await import('./services/downloadService.js')` out of boot; a test pins the two in sync.

## Verified

- `node --test tests/*.test.cjs` → **293/293, 0 fail**.
- eslint clean on `downloadService.js`, `notificationService.js`.
- **Negative control:** with both sources stashed, `tests/install-queue-wedge.test.cjs` is
  **1 pass / 3 fail**. The one that passes both ways is deliberate — it pins the *route's*
  unchanged register-before-respond ordering, which is the premise the fix rests on, so a
  future refactor that moves `res.json()` earlier cannot silently invalidate the reasoning.

## USER-VERIFIED LIVE 2026-07-29 — the two headline items

Same session that found it, after a renderer reload (both fixes are renderer files, so
Ctrl+R suffices; the reload also reset shell.js's `_didFirstConnectDriftCheck`, so the
reconnect genuinely re-ran the engine-asset heal — the wedge condition).

1. **No `engine:assets` toast on the reconnect.** The heal definitely ran (latch reset), so
   this is the suppression working, not the heal being skipped.
2. **Install started immediately.** SDXL Realistic went straight to a live progress bar —
   `243.5 MB/s · 0.9 / 9.0 GB · under 1 min left`, footer on Cancel — and ran to completion
   (volume 139.4 → 149GB). Pre-fix, that same click parked on `Queued…` with no server-side
   job at all.

## STILL NOT verified — three residuals

Structurally sound and covered by the guard test, but not exercised live:

1. **The legitimate queue.** Start one install, click Install on a second: it *should* read
   `Queued…` and then start when the first finishes downloading. Needs volume headroom —
   the uninstall has since freed ~9GB, so this is now cheap to run.
2. **Cancel-while-queued.** Cancel a legitimately-queued install; the chain must release,
   not stall. This exercises the new `done.cancel()` path, which is the one piece of the fix
   with no live coverage — a `download:cancelled` fired before `run()` arms is exactly what
   the old `fired ? … : undefined` guard existed for.
3. **OS notification when unfocused.** Only the in-app toast half was observed.
