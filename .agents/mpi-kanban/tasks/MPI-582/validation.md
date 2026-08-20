# MPI-582 Validation

**Verify mode:** user-ux — Fabio caught the defect on sight, so the visual half
is his.

## Automated — ALL PASSED 2026-08-20

- [x] `node --test tests/declared-fields.test.cjs` — PASSED. The gate that
      mattered: this module is imported in BARE NODE, so any Primitive whose
      import chain needs a DOM would break it. `MpiDropdown` pulls
      `js/events.js`; that import is clean (pure class, no module-level DOM).
- [x] `npm test` — **630 passed, 0 failed.** Run twice: after the code phases and
      again after the doc/typedef edits.
- [x] `npm run test:desktop` — **18 passed** (own port 64714, the dev app on 3000
      left alone). Includes `flow-close-destroys-instance`, so a Flow still mounts
      and tears down cleanly.
- [x] `npx eslint` on every touched file + `node --check` on every touched JS — clean.

## Live probe — own `app:isolated` instance, port 57806

Neither test suite mounts a declared field or the mask panels, so this is what
actually proves the branches run.

**Every field type mounts a Primitive, nothing bare, no native tint:**

```
select:mpi-dropdown  radio:mpi-radio-group  button:mpi-btn  toggle:mpi-checkbox
number:mpi-input     slider:mpi-progress    text:mpi-input
accentColorEls: 0
```

Selector used for the bare check was `input:not([class*=mpi-]), > select,
> textarea, > button` — zero hits on all seven. `accentColorEls` counts elements
whose COMPUTED `accent-color` is not `auto`: zero, which is the defect gone at
the pixel rather than at the stylesheet.

**Both mask panels mount and drive:**

```
maskStrip:  ok progress=1 bareRange=0 label=70%
maskAdjust: ok progress=4 bareRange=0 labels=0 px|0 px|0 px
afterDrag:  +20 px
```

`progress=4` on Adjust is its own three sliders plus the nested MpiMaskStrip's
opacity. `label=70%` is `DEFAULTS.opacity` seeding correctly through the new
mount path. `afterDrag` drove the grow slider's inner input to 20 and read the
label back — the `vals` bookkeeping that replaced reading `.value` off the DOM
works end to end.

## Fabio's eyes — PASSED 2026-08-20

**"okay, it looks good"** — Fabio, after looking at the running app. The user-ux gate is met.

What he checked:

- [x] History workspace, upscale panel — Denoise and Prompt strength render as the
      app's slider, not Chromium's native range widget.
- [x] Every Flow, step row AND run slide — declared controls in both the row layout
      and `--stacked`. The `text` field is the one to look hardest at: it was
      already an MpiInput when this session started but had lost its `field-text`
      class, so its row `:has()` column, its 120px height and the `--work` step's
      type scale were all matching nothing. Rehooked here.
- [x] Mask Adjust (grow / shrink / edge band) and the mask strip opacity. **These
      change appearance on purpose:** MpiProgressBar draws a `--surface-3` rail with
      an `--accent-heat` FILL and a 16px handle, where the longhand was a `--line`
      rail, no fill, 14px thumb. That is the cost of there being one slider.

## Where this card's work actually lives (claim-auditor, 2026-08-20)

**MPI-582 is split across TWO commits, and the second one's message overstates
what it carries.** Anyone auditing this card later needs both:

- `25a96d14` — titled for MPI-504, but it swept in this card's uncommitted edits
  to `js/utils/declaredFields.js`, `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.css`
  and `js/data/flowsRegistry.js`. That is where the `select`/`toggle`/`number`
  branches, the `field-text` rehook, and MpiBaseFlow's deleted `accent-color` and
  `:focus-visible` blocks are.
- `78e7dd7a` — titled for MPI-582. Carries the mask-tool sweep, the upscale panel
  CSS, `.claude/rules/components.md`, the playbook, and the card workspace. Its
  message describes the three changes above as if it carried them; it does not.

The message was not amended — it is pushed on a shared tree with live peer
sessions, and rewriting published history to fix an attribution line is a worse
trade than recording it here. Every change is real at HEAD; the auditor confirmed
16 claims PROVEN, this one OVERSTATED, and two UNVERIFIABLE because their evidence
was runtime-only (the 18-test desktop count and the `label=70%` probe reading).

Cause: a live MPI-504 session committed while this one was mid-work. Known
hazard, already recorded in memory `feedback_concurrent_sessions_same_file`.

## Closed without work

Card item 3, "REVISE THE FLOWS": Fabio, 2026-08-20 — "I already had a look at all
three current flows, and they already have components as they should." No Flow
audit was run and none is owed.


## Follow-up he asked for in the same message

Extend Video has no middle step and should have one shaped like Add Foley's.
Carried into `plan.md` § Current State and handed to a fresh session; the
card stays in `doing` for it.

## The follow-up - Extend Video's middle step - VERIFIED 2026-08-20

**"looks good. This is verified."** - Fabio, after looking at the carousel in the
running app. That closes the card's last item.

Automated half, run before he looked:

- `npm test` -> 630/630 pass.
- `npx eslint js/data/flowsRegistry.js` -> clean.
- Import probe: `getFlowById('ltx-extend').steps` reads
  `[{preview, video1, tickerLabel Describe, fields [positive:text:3, negative:text:2]}]`
  and flow-level `fields` reads `['Input_Duration']` - the same shape as `ltx-foley`.
- `preview` is registered in `stepKinds.js`, so `isFrameKind` cannot drop the step.
- `npm run release:check` -> passed. `validate_board.py` -> passed.
  `scripts/overtaken-cards.py` -> 0 candidates.

Placement is not a payload change: `_collectInputs` folds `stepValues[role].fields`
into the same `declared` / `injectionParams` bins as a flow-level field, which is
why foley's prompts already reach the op from a step.
