# MPI-648 — checklist

- [ ] **Re-read the source material, do not paraphrase the card.**
      `.agents/mpi-kanban/tasks/MPI-647/validation.md` (the confirmed mechanism) and
      `tests/desktop/flow-reuse-opens-without-model.spec.js` (the two MPI-647 comment
      blocks, at the `Events.on('models:checked', …)` re-stub and at the
      `Events.emit('models:checked', { installedModelIds: [] })` provocation).
      Verify the cited symbols still exist: `js/shell.js` `_initDataRegistries`,
      `js/events.js` synchronous `Set` fan-out, `js/data/flowsRegistry.js`
      `flowAvailability`, `js/services/flowService.js` `openFlowFromReuse`.

- [ ] **Make room before writing.** `docs/testing.md` is 289 lines against the ≤200-line
      rule (`docs/README.md` § MPI-170) and it is NOT on the exempt list. Split the
      spec-authoring half (`### UI smoke specs` onward) into
      `docs/testing-desktop-specs.md`; `testing.md` keeps the suites, CI, the unit suite
      and the desktop-suite mechanics. Both halves must land under 200 lines WITH the new
      entry in place.

- [ ] **Write the trap as a SHAPE, not as one spec's story.** The thing to look for is the
      triple: a `state.*` key + its sole async writer + a DEFERRED read. Both durable
      rules must be in it — (1) suppress by re-applying the stub from a listener
      registered after the app's, because the bus fans out synchronously; (2) provoke the
      CI condition by emitting the app's own event with the CI payload, because a dev box
      can never reproduce it by waiting. Say explicitly that widening the sleep only moves
      the flake.

- [ ] **Fix every pointer the split breaks.** `docs/README.md` map row,
      `docs/DEVELOPMENT.md` (two refs), `docs/testing-harnesses.md` (three refs),
      `.claude/skills/cubric-vision/SKILL.md`, `CLAUDE.md`. Grep for `testing.md` and
      check each hit still points at the half that holds the answer.

- [ ] **Verify.** `wc -l` on both docs ≤ 200; `validate_board.py .` from the repo root;
      no code touched, so no suite to run — say so rather than implying one ran.
