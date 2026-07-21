# Loop won't stop + silent save-loss desyncs project.json

## Current State

Project mode: scalable-foundation. Surfaced live 2026-07-08 during a Loop-driven
t2i batch (Rossifi project). Diagnostic only — **no data lost on disk** this
incident; media + surviving sidecars intact. This card is investigation-first;
the two bugs likely share one root (a save/persist race in the 208/213 queue
refactor) and MAY subsume the MPI-225 404.

## The two observed bugs

**Bug A — Loop won't stop.** User pressed Stop mid-loop; the loop kept re-firing
new gens and could not be stopped. Suspects:
- `generationStore._loopCallbacks` lane-drain re-fire (`generationStore.js:242-249`)
  firing AFTER a Stop instead of being consumed/cleared by cancel.
- `state.loopArmed` not cleared on Stop, so `_seedLoopIfIdle`
  (`MpiPromptBox.js:1101`) re-kicks the loop.
- Interaction: Stop cancels the running job but the once-per-lane callback still
  fires on drain → next gen dispatches → appears un-stoppable.

**Bug B — silent save-loss / project.json desync.** Evidence:
- Media PNGs wrote (t2i_001-005, 14:35-14:38) but `project.json` last persisted
  at **13:41** and registered only 1 of ~8 gens.
- `save-generation` failures are caught and swallowed as a `warn`
  (`generationService.js:923-925`) — flow continues using the comfy URL, emits
  `generation:complete`, adds the item to in-memory `itemGroups`, but **no sidecar
  on disk** and (apparently) no durable project.json commit.
- On reload: stale project.json loads → `projectReconciler.js:121` fires
  `load-meta?id=<ghost>` for the memory-only ids → **404 (Not Found)** (console).
- Net: renderer memory and disk diverge; cards vanish on reload; ghost 404s.

## Hypothesis — one root, and it may subsume MPI-225

The MPI-225 reuse-404 (`Input_Start_Frame` source 404) was pinned to a t2i
phantom chip and TWO fixes shipped + one live-confirmed (Reuse "Use Images"
grays). BUT the same swallowed-save / persist-race could ALSO strand a
preview-asset frame: if an i2v item's save half-completes (media/frame written,
sidecar or project.json entry lost to the race), a later Reuse pointing at that
item's `.preview-assets/<id>/` frame 404s — the exact MPI-225 symptom via a
different path. **Do not assume MPI-225 is fully closed until this race is
understood.** Keep MPI-225's shipped fixes (they are correct and independently
verified for the phantom case); this card investigates whether the race is a
second, deeper cause.

## NOT the cause (ruled out, do not re-investigate)

- MPI-225 changes. Proven: (1) `routes/projects.js` server edit never ran during
  the incident (server not restarted — only renderer reloaded, so old projects.js
  executed); (2) the `generationService.js` `_opScopedMediaItems` filter is a pure
  predicate, runs AFTER save-generation's media write, and only reshapes the
  sidecar's `generationSettings.mediaItems` metadata — it cannot break persistence
  or the loop; (3) `promptReuse.js` change is read-path only.

## Investigation (do FIRST, before any fix)

- [ ] Reproduce: arm Loop, dispatch several rapid gens, press Stop mid-loop.
      Confirm both symptoms (loop keeps firing; some saves lost). Capture the
      renderer console (clientLogger + network) — the `[project]`/save errors are
      NOT in `logs/app.log` (that file is comfy/download/server stdout only).
- [ ] Trace the Stop → cancel → lane-drain → loop-refire sequence in
      `generationStore.js` (`releaseLane`/`_loopCallbacks`) + `MpiPromptBox` Cue/Loop
      handlers. Determine why Stop doesn't consume the loop callback / clear
      `loopArmed`.
- [ ] Trace the save chain under concurrency: `save-generation` (server,
      `routes/projects.js` — writes media THEN sidecar THEN project.json via
      `updateProjectJson` per-file queue) vs the client swallow at
      `generationService.js:923-925`. Find where a failure or race drops the
      sidecar/project.json entry while media survives.
- [ ] Decide: should the swallowed save-failure (`:924`) surface to the user /
      mark the job errored instead of silently continuing with a memory-only item?
- [ ] Re-examine MPI-225 under this lens: can the race strand a preview-asset
      frame independent of the phantom-chip path? If yes, note whether MPI-225
      needs a follow-up.

## Verification

**Verify mode:** user-ux + data-integrity.
- Loop can always be stopped by Stop (loop disarms, no post-Stop re-fire).
- Under a rapid loop batch, every completed gen either (a) fully persists
  (media + sidecar + project.json) or (b) is clearly marked failed to the user —
  never a silent memory-only ghost that 404s on reload.
- Reload after a loop batch shows exactly the gens that persisted; no
  `load-meta` 404s in console.

## Preservation Notes

- Persistence/reconciler durable home: `docs/project-integrity.md` (project.json,
  .meta sidecars, reconciler). Queue/store contract: `.claude/rules/comfy_engine.md`
  + MPI-208 `requirements-archaeology.md`. Note the swallowed-save + loop-refire
  findings there once understood.
- `logs/app.log` is comfy/download/server stdout ONLY — renderer clientLogger and
  `[project]` route logs are NOT there. Note this so future debugging doesn't
  waste time grepping app.log for save errors.
