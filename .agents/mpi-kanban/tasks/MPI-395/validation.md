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

## USER-VERIFIED LIVE 2026-07-29 (22:5xZ) — the three residuals. CARD CLOSED.

Run on CPU Pod `omi9588i0gymlu`, volume at 139.4/150GB (10.6GB free). A = SDXL Realistic
(~9.6GB, the only uninstalled model that fits), B = SDXL NSFW.

1. **The legitimate queue — PASS.** A installed; B clicked ~5s later read `Queued…` with the
   waiting mascot.
2. **Cancel-while-queued — PASS.** B cancelled from its detail-panel footer while still
   `Queued…`; A downloaded on to completion unaffected. Then B clicked again the moment A
   finished: it went **Starting… → a real install attempt**, and was rejected by the volume-full
   pre-flight (`POST /comfy/models/download/start` → 400, `[Errno 28] No space left on device`,
   the correct gate at `downloadManager.js` ~L1874 with only ~1GB left). **The 400 is the pass,
   not a defect** — a rejected POST is a POST that *fired*.
3. **OS notification when unfocused — PASS.** Renderer reloaded with the app unfocused (latch
   reset ⇒ the engine-asset heal genuinely re-ran). The only OS toast was the legitimate
   `Pod connected — No GPU (download) ready.` No `engine:assets`.

### The timing is the proof, and it had to be — the queue is INVISIBLE server-side

`/comfy/downloads/status` was polled at 2s throughout. It never showed an `sdxl-nsfw` job during
A's download, and that is **correct**: MPI-184's queue is client-side, so a `Queued…` tile has no
server job at all (see memory `tool_read_download_state_without_console`). Residuals 1 and 2
therefore rest on direct observation plus this transition log:

```
20:35:04  sdxl-realistic = queued
20:35:09  sdxl-realistic = downloading      (35s)
20:35:44  sdxl-realistic = complete
20:36:04  sdxl-nsfw      = queued           <- step 5's POST reached the server
20:36:07  sdxl-nsfw      = idle             <- volume-full rejection
```

Pre-fix, the cancel at step 2 leaked the listener and left `_inFlight` pinned, so the step-5
click would have parked on `Queued…` and **no POST would ever have reached the server** — for 30
minutes. It reached it in seconds. The chain released. That is the `done.cancel()` path, live.

### Caveat on the reproduction, worth keeping

The reload trigger is a **developer** shortcut — a shipped user cannot reload the renderer. It
does not weaken the result: `_didFirstConnectDriftCheck` latches per **app session**, so a real
user hits the identical first-connect path on every launch → connect. Reload just reaches it
without a restart.

### Found while closing this card

Two Model Library defects, both surfaced by the uninstall in step 6 — see **MPI-396** (a
terminal DONE job survives uninstall for the full 120s `DONE_TTL_MS`, so the tile draws a 100%
bar instead of Install, and it survives Ctrl+R because the store is main-process) and **MPI-397**
(the grid only flips after a remote disk-stat round trip). Neither is a regression from this
fix; both predate it.
