# MPI-352 Validation

**User-verified 2026-07-26** ("ok, it's verified").

## Symptom

Pressing Stop on a running generation fired the success toast + chime:
"Generation finished". Reported as "extremely annoying and doesn't make sense".

## Root cause (NOT the obvious one)

The Stop path itself was already clean — `cancelRunningCueJob` emits only
`tool:cancelled`, never `tool:idle`.

**ComfyUI's interrupt is advisory.** Stop marks the store job `cancelling` and
sends the interrupt, but ComfyUI usually completes its in-flight step and
returns real output anyway. `generationStore` deliberately honours that save
(§ late-settle, R09 — "the output SAVES"). That output reached `exec.onComplete`,
which had no knowledge of the Stop, so it walked the full success path and fired
BOTH user-facing completion signals:

- `tool:idle` -> `statusBar.js` -> "Generation finished" toast + chime
- `generation:complete` -> `notificationService` counter -> "Generation finished." toast

The empty-output branch already gated its console warning on the same
`cancelling` flag. The success terminals never did — that was the gap.

## Fix

One flag read (`generationService.js` `_wasCancelled()`), gating both signals:

- Terminal routes to `tool:cancelled` instead of `tool:idle` — the status bar
  still releases its latch, without the completion flash/toast/chime.
- All three `generation:complete` emits stamp `cancelled: <bool>`;
  `notificationService` skips counting those toward the coalesced batch toast.

**The item still saves.** Gallery repaint, placeholder teardown, float-latent
bridge, and stats refresh all ignore the new field and run normally — the media
really is on disk, so suppressing them would trade a bad toast for a lost result.

## Evidence

- 5 assertions pass (scratchpad `check-stop.mjs`): normal completion counts;
  Stopped does not; mixed batch reports only survivors; terminal routing correct;
  an absent flag defaults to a real completion (back-compat).
- Both edited modules parse and load (import chain resolves past the edits; the
  only error is an unrelated `EventSource` browser-API dep under node).
- ESLint clean on both files.
- Blast-radius sweep: all 8 other `generation:complete` consumers grep-checked —
  none read the new field, all still fire.

## Known gap (deliberate, not shipped)

A Stop that still produced an image now surfaces NO toast, so the saved card
appears silently. If that reads as "did it work?", an info-variant
"Stopped — partial result saved" is a small follow-up. Left out rather than
guessed at; raised to the user.
