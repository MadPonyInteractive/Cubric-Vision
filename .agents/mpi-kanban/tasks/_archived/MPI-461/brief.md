# MPI-461 — a failed generation strands its lane until the app restarts

## The symptom (what a user reports)

"The app is stuck." A gallery card sits on **QUEUED…** forever, the **CUE** counter
climbs, and nothing happens. Checking further:

- the engine `/queue` is **empty** — nothing was ever dispatched
- `app.log` has **no** `got prompt`, no error, no warning
- the status bar reads **IDLE**

It reads as a dead button or a hung app. It is neither: it is one generation that
already failed, holding a lane open. Only an app restart or a renderer reload clears it.

## Root cause

`commandExecutor.js` registers the job in the store early:

```
generationStore.register({ … })          // commandExecutor.js:1293
```

and then has **twelve** early-return paths before the first `settle`, each of which
calls `exec.onError?.(err)` and returns without marking the job terminal:

`cancelled_before_dispatch` · `operation_not_installed` · `arch_weight_missing` ·
`model_missing` · `required_media_slot_empty` · `model_not_local` · the workflow
fetch · the trimmed-video prep · and the surrounding catches.

Lane accounting is store-derived (deliberately — "entirely store-driven now"):

```js
function _laneBusy(lane) {                                   // generationService.js
    return generationStore.getSnapshot().running.some(j => j.lane === lane);
}
// running = jobs where !TERMINAL_PHASES.has(job.phase) and the lane's activeJobId
```

A registered-but-never-settled job is never terminal → `_laneBusy` stays true →
`_dispatchNextCue` hits `if (_lanes[lane].active || _laneBusy(lane)) continue;` and skips
that lane on **every** subsequent pass. The cue queue grows and never drains.

`cancelled_before_dispatch` is the only path that touches the phase at all, and it
`advance`s rather than `settle`s.

## Seen live

2026-08-06, during MPI-452. A workflow fetch 404'd (H3's `_stage2` twin, since fixed).
That threw at the fetch, `exec.onError` fired, the block rolled its UI back — and the lane
stayed pinned. The next Finish then queued behind a job that had already failed, which is
what made the app look wedged. The 404 was fixed; **this was not**.

## Fix shape

**One helper that settles `PHASES.ERROR` before returning**, replacing all twelve bare
`exec.onError` calls. Per the ROOT-CAUSE RULE: do **not** patch only the path that was
reported — this is a shared shape, and the next unlucky path strands the lane identically.
Check whether `activeGenerations` needs the same treatment.

Second, smaller half: the user saw **no error at all**. A stranded `QUEUED…` card with no
toast is the reported symptom, so whatever settles the job should also surface why it
failed.

## Scope note

**Not downloads.** The download manager (`routes/downloadManager.js`, `downloadService`)
is a separate subsystem; the "Download Failed" dialog from the same session was MPI-459
(curated pip vs a running engine), unrelated to this.

## Verify

A test that enqueues a job which errors before submit, then asserts the **next** job on
that lane still dispatches. That is the whole contract, and nothing today covers it.
