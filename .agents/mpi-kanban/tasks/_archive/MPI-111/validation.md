# MPI-111 validation

## Live repro session (2026-06-18, Pod L4 → RTX 5090, debug ON)

Goal: reproduce the stale gallery thumbnail after Stop-at-completion, find root cause, fix.

### What the logs proved (TEMP-DEBUG-111 instrumentation, now removed)

1. **Every Stop-at-completion takes the empty-output path.** The engine interrupt
   beats the save → ComfyUI returns no urls → `onComplete([])` →
   "Generation completed but no output returned." (8× across the session). The
   Stopped job produces no card; surviving cards are correct.
2. **Double `generation:cancelled`, second neutered.** Stop →
   `activeGenerations.cancel(id)` emits cancelled WITH the real tempId AND ends the
   registry entry. Then the empty `onComplete` re-emitted a SECOND cancelled, but
   read tempId from the now-deleted entry → `tempId=null` → the gallery block
   swallowed it (`!_myGenIds.has(id)`).
3. **Timer leak.** A stuck `m:ss` (`9:11`) showed at idle on a fresh project,
   surviving project reopen + reconnect.

### Stale-thumbnail (Bug A — the carded core): NOT REPRODUCED

7 hand Stops across L4 + RTX 5090 (both ~2s gens) + a force-race hook (skip engine
interrupt) all produced clean results — `refresh=true` never fired, no card painted
another group's file, all thumbnails matched their saved image. The save-vs-teardown
collision that strands a card needs a sub-100ms window between ComfyUI writing output
and the WS "completed" event that a human can't reliably hit; the force hook skipped
the wrong interrupt (output discard is engine/WS-layer, not `exec.cancel()`).

Likely the original sighting came from a code path changed by MPI-74 P6 (which landed
after the card was written 2026-06-17), matching the reporter's own hunch that "some
other earlier generation influenced that card."

## Fixes shipped

### Bug 1 — null-tempId swallowed cancelled  (generationService.js)
Empty-output, cacheHit, and onError branches read tempId from the registry AFTER a
Stop ended the entry → null → gallery block swallowed the placeholder-teardown event.
Fixed with a stable `_stableTempId`/`_stableExtraTempIds` snapshot from `opts` (lives
the whole call). All three branches now emit the real tempId.

### Bug 2 — stuck status-bar timer  (statusBar.js)
Rapid Cue Stop→promote bumps `_completionToken`; a superseded job's
`complete()`/`cancel()` early-returns without clearing its interval → a frozen mm:ss
ticking at idle. `_setIdle()` now hard-stops the timer (single funnel to idle).

## Verification (USER live, post-reload, 2026-06-18)

- Bug 1: after reload, a Stop on the cat/dog batch hit "no output returned" but
  produced NO new SWALLOWED line — the cancelled now reconciles. Grid rebuilt cleanly
  (groups 11→12→13). PASS.
- Bug 2: status bar reads `IDLE · REMOTE` with no stuck timer (was 9:11). PASS.
- Bug A: all 3 cat/dog cards + glasses show the correct image in their history
  workspace; no stale thumbnail. (Not reproduced; documented above.)

## Instrumentation

All TEMP-DEBUG-111 lines + the force-race hook removed. Pre-existing MPI-64 "TEMP-DEBUG
B" lines left untouched. 5 touched files pass `node --check`.
