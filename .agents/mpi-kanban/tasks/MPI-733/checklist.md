# MPI-733 Checklist

Derived from `plan.md`, four phases. **Phases 2–3 are blocked on a live peer claim** —
see this card's Plan Drift and `tasks/MPI-732/plan.md`.

- [x] Phase 1 — eligibility, as a pure function **(auto-verified, see `validation.md`)**
  - [x] `selectCueAllTargets(operation, model, groups)` in `js/data/commandRegistry.js` —
        returns eligible groups in selection order, the skipped ones, and a `reason` when
        nothing qualifies. Reads slot capacity through `getCommandMediaInputs` /
        `filterMediaInputsForModel`; no hardcoded op list. Pure — no DOM, no dispatch, no
        generation import. **Rule tightened to "exactly one REQUIRED slot, type matching"**
        after enumerating every op's slots; the plan's looser rule dispatched broken jobs
  - [x] `tests/cue-all-eligibility.test.cjs` — 9 tests, all pass. The plan's four cases
        plus four the enumeration turned up. **Proven non-vacuous by falsification**: a
        broken helper turns 3 of the 9 red

- [ ] Phase 2 — the menu entry *(BLOCKED: `MpiGalleryGrid.js` under a live peer claim)*
  - [ ] `cue-all` entry beside `add-to-project`, labelled `Cue all (N)` off the eligible
        count, disabled at zero with a tooltip. Grid imports nothing new from the
        generation layer; it emits the eligible groups, the skipped ones, and the reason

- [ ] Phase 3 — the dispatch loop
  - [ ] Handle `cue-all` in `MpiGalleryBlock.js`: read `_pb.el.getRunPayload()` once, then
        one `enqueueGeneration` per eligible group with `mediaItems` replaced by that
        group's item alone. Refuse with a toast when `state.loopArmed`. Toast the skipped
        ones. Pass no `getNextGeneration` callback — a batch job must not re-fire itself

- [ ] Phase 4 — regression spec + docs
  - [ ] Desktop spec under `tests/desktop/`, stubbed at the dispatch boundary (no GPU)
  - [ ] `docs/gallery.md` selection section: trigger, eligibility rule, remembered-op
        read, click-order caveat, loop refusal. Keep the file under 200 lines

## Verification

Per-phase verifies live in `plan.md`. End to end (`user-ux`, Fabio's eyes): five imported
photos with `upscale` remembered → five queued jobs, each traceable to its own source
image through its `.meta` sidecar.
