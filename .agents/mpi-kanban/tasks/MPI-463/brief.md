# MPI-463 - A failed dispatch strands its lane forever

## Symptom (seen live during MPI-452, 2026-08-06)

The app looks wedged. A generation sits on **QUEUED** and never starts, while the
**engine's own queue is empty** and the server log says nothing at all. Nothing recovers
it — not Stop, not a new Cue on that lane. Only restarting the app clears it.

That combination is what makes it read as an engine fault: an empty engine queue plus a
silent server is exactly what a dead ComfyUI looks like. The engine was fine. The app
simply never dispatched.

## Root cause

`generationStore.register()` (in `runCommand`'s dispatch body, `js/services/commandExecutor.js`)
**takes a lane slot**. From that moment, the store is the lane-accounting authority:

- `generationService._laneBusy(lane)` is *derived* from the store's `running` list — never a
  private mirror (that is INV-6, and MPI-208 made it deliberate).
- `_dispatchNextCue()` skips any lane that reads busy.

So a registered job that never reaches a terminal phase (`done` / `cancelled` / `error`)
keeps `running` non-empty **for the rest of the app's life**, and that lane is dead.

**Eleven failure exits between `register()` and the `/prompt` POST did exactly that** — each
called `exec.onError` and returned without settling:

| # | Bail | Error |
|---|---|---|
| 1 | operation's weights not installed (MPI-453 gate) | `operation_not_installed` |
| 2 | arch-variant weight missing (MPI-209 guard) | `arch_weight_missing` |
| 3 | no workflow registered for model+operation | resolver throw |
| 4 | trimmed-video input prep failed | prep throw |
| 5 | selected LoRA/upscale model not found | `model_missing` |
| 6 | required media slot empty | `required_media_slot_empty` |
| 7 | model not installed on the local engine | `model_not_local` |
| 8 | workflow JSON fetch failed | fetch throw |
| 9 | op injector threw | injector throw |
| 10 | workflow input defaults failed | prep throw |
| 11 | preview-latent staging failed (stage 2) | staging throw |

`_abortedBail` was never part of the bug — it settles to `CANCELLED` and was the model for
the fix. The **post-dispatch** catch was never part of it either: it settles once at its own
top (`generationStore.settle(jobId, PHASES.ERROR, ...)`) before branching, which is why its
nine `exec.onError` branches are legitimate.

## Fix

Structural, not eleven patches. `_failBail(err)` settles the job to `PHASES.ERROR` and then
reports, and every pre-dispatch bail routes through it — the pre-dispatch twin of what the
post-dispatch catch already did. A **new** bail added to that region is then safe by
construction, which matters because this is precisely how the eleven accumulated.

Settling to `ERROR` releases the lane, promotes any pending job, and fires the loop re-fire
callback — identical to what an errored dispatch already does today via the post-dispatch
catch, so the fix introduces no behaviour that error handling did not already have.

## Pinned

`tests/lane-settle-on-bail.test.cjs` — 4 tests. It bounds the pre-dispatch region by its two
anchors (`generationStore.register({` → `.runWorkflow(`) and fails if any `exec.onError` in
it is not accompanied by a settle. **Negative control run:** reverting one site to the buggy
shape fails the test with the exact line (`1468: exec.onError?.(new Error('model_missing'));`).
Suite 467/467, lint clean.

## Still open — the one acceptance criterion left

**Not proven live.** The wedge was observed live; the fix has not been. `js/services/*.js` is
RENDERER code, so it needs **Ctrl+Shift+R** (a plain Ctrl+R can serve a cached ES module).

Cheapest live proof: force bail #6 — Cue an op with a required media slot and no media —
then Cue a normal generation on that same lane. Before the fix the second one sits on QUEUED
forever; after it, it dispatches.
