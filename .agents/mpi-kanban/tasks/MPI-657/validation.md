# MPI-657 — validation

## What shipped

`js/services/downloadService.js`, `_awaitDownloadDone`. The flat 30-minute ceiling became
an IDLE ceiling: `arm()` clears and re-sets the timer, and every `download:progress` tick
matching the model calls it. `IDLE_CEILING_MS` is a named module constant; the MPI-395 WARN
survives, reworded to "no progress for … within 30min".

Not a `timer.refresh()` — this is renderer code, where `setTimeout` returns a number, not a
Node `Timeout`. `clearTimeout` + re-set is the browser equivalent.

`let timer` moved above `finish()` so the re-arm can reassign it; `finish()` still
`clearTimeout(timer)`s and remains the single cleanup path for `cancel()` and every
terminal listener.

One deliberate behaviour change: `match(d)` treats a payloadless event as "mine", so a
`download:progress` with no payload now re-arms rather than being ignored. That is the
right reading — it is still a progress signal.

## Why not the bytes-derived fix the card originally proposed

It needs an assumed transfer rate, and the card's own measurements span 0.66–5 MB/s (8×).
That is the same guess as the constant it replaces. It also makes a genuinely lost signal
release proportionally later — 10h on `ltx23-transformer-bf16` — which is the exact
objection the card raises against "just raise the constant".

## The belt this depends on, verified in code

An idle ceiling only weakens the net if a dead-but-quiet transport keeps emitting ticks, or
if nothing else catches a stall. Neither holds:

- `downloader.onProgress` is byte-driven (`routes/downloadManager.js` `_wireProgress`), not
  timer-driven — no ticks without bytes.
- `_startStallWatchdog` (MPI-291) calls `forceStall()` on a socket that has not moved a byte
  in `STALL_MS` (60s, `routes/downloadManager.js:1020`), swept every 15s
  (`:1029`) — so detection takes up to ~75s, not 15s. It routes into the existing `'error'`
  → `_setDepStatus('failed')` path and broadcasts `download:failed`, which `finish()`es this
  wait. NDH's own `timeout:30000` does not fire on a mid-stream quiet socket (v2.1.11),
  which is why that watchdog exists.

So the renderer ceiling is left doing only its MPI-395 job: releasing the chain when the
terminal EVENT is lost.

## Evidence

`tests/install-queue-wedge.test.cjs` — extended, not replaced. Its existing MPI-395 ceiling
test was re-pointed at `IDLE_CEILING_MS` (it asserted on the inline `30 * 60 * 1000`, which
moved to the constant). New test pins: `arm()` clears before re-setting, the progress
handler calls it, the `verifying` finish survives, nothing size-derived leaks into the
body, and the ceiling still touches no job state.

```
node --test tests/install-queue-wedge.test.cjs   → 5 pass, 0 fail
node --test tests/install-*.test.cjs tests/download-*.test.cjs → 20 pass, 0 fail
```

Mutation negative control (both mutations applied to the real source, test run, source
restored byte-for-byte):

| mutation | result |
|---|---|
| drop `arm()` from the progress handler (back to a flat total-time ceiling) | exit 1 — DETECTED |
| drop `clearTimeout(timer)` from `arm()` (timers leak, first one still fires) | exit 1 — DETECTED |

## Limits of this evidence

The assertions are source-text, not runtime: this suite has no jsdom (stated in its own
header), and `downloadService.js` imports the component tree, so loading it in `node --test`
is not cheap. The mutation control is what stops that being a vacuous pass. The 30-minute
timer itself was not observed firing or not-firing in a live app — that would need a
multi-hour real download.

## Board note

The brief was corrected before any code was written. Two errors in the original evidence:
the ceiling fired on the MODEL `minimax-h3-ref2va`, not the dep `h3-qwen3vl-32b-clip`
(`_awaitDownloadDone` is keyed by model id); and it deleted nothing — the partial went to a
user cancel at 08:49:36Z, 52 minutes later, proven by the six entries that rejected that same
cancel as already `complete` (five weight deps plus the `ComfyUI-MpiNodes` pack, app.log
176-181). Nothing was queued behind the install, so the firing cost the user nothing on the
day; the harm it fixes is the broken one-stream-at-a-time invariant and the false wedge
report.

## Corrections after the claim audit

The close-out audit caught two claims that were wrong when b15c179e was written. Both are
corrected above; neither changes the fix, and both are recorded here because the COMMIT
MESSAGE still carries them and cannot be amended — it is pushed to a shared master.

| claim as committed | truth |
|---|---|
| "five deps rejected that cancel" (also in the first draft of this file and of brief.md) | SIX entries rejected it, app.log 176-181: five weight deps plus the `ComfyUI-MpiNodes` pack. `h3-qwen3vl-32b-clip` is still correctly absent, so the reasoning it supports is unaffected. |
| commit body: "a quiet socket is still caught in 15s by _startStallWatchdog (MPI-291)" | 15s is the SWEEP INTERVAL (`:1029`). The threshold is `STALL_MS = 60_000` (`:1020`), so detection takes up to ~75s. Still orders of magnitude under the ceiling, so the belt argument holds. |
