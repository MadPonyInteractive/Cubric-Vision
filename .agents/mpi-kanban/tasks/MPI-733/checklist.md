# MPI-733 Checklist

Derived from `plan.md`, four phases. The MPI-730 claim that blocked Phase 2 has CLEARED —
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

- [x] Phase 2 — the menu entry **(verified in a real Electron window, see `validation.md`)**
  - [x] `cue-all` entry beside `add-to-project`, `layers` icon, labelled `Cue all (N)` off
        the eligible count (bare `Cue all` at zero), disabled at zero, `data-info` carrying
        the reason. Emits `{ groups, skipped, reason }`. No new import at all in the grid
  - [x] **Op source corrected after Fabio's app test:** reads the LIVE op via a
        `getCueContext()` callback from `MpiGalleryBlock.js`, not `s_selectedOpByModel`.
        The memory is only written on user-driven picks, so a drag-in (which auto-selects
        i2i programmatically) greyed it, and a cleared chip left it wrongly enabled
  - [x] Info strings reworded per Fabio: `No operation selected` /
        `Cue all does not support the current operation` /
        `No selected card matches the current operation`. **These are status-bar text —
        this app has no tooltips, and none was written**

- [x] Phase 3 — the dispatch loop **(built; queue/sidecar legs need Fabio's app)**
  - [x] `_cueAllDispatch` in `MpiGalleryBlock.js`: one `getRunPayload()` read, then one
        `enqueueGeneration` per eligible group with `mediaItems` replaced by that group's
        item alone. Refuses under `state.loopArmed`. Reports queued + skipped counts. No
        `getNextGeneration` — a batch job must not re-fire itself
  - [x] Subscribed ONCE outside `_wirePromptBox` (which runs at two mount sites), so a
        PromptBox remount cannot stack a second listener and cue every job twice
  - [x] Item built in the same shape a dragged card produces. New sweep test proves none of
        the 67 batchable combinations can be refused by `enqueueGeneration`'s required-slot
        guard
  - [x] **Fabio's follow-up:** the batch varies the slot the ROLE PILL expressed, not the
        op's required slot — so a pill-tagged `endFrame` sweeps end frames while a staged
        start frame rides along. `buildCueAllJobItems()` in `commandRegistry.js`, pure and
        unit-tested; substitutes in place so ORDINAL-slot ops keep their base image at
        index 0

- [ ] Phase 4 — regression spec + docs
  - [ ] Desktop spec under `tests/desktop/`, stubbed at the dispatch boundary (no GPU)
  - [ ] `docs/gallery.md` selection section: trigger, eligibility rule, remembered-op
        read, click-order caveat, loop refusal. Keep the file under 200 lines

## Verification

Per-phase verifies live in `plan.md`. End to end (`user-ux`, Fabio's eyes): five imported
photos with `upscale` remembered → five queued jobs, each traceable to its own source
image through its `.meta` sidecar.
