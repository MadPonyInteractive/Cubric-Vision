# MPI-644 — checklist

- [x] Read the brief's traps before designing. The two that shaped the fix: the predicate
      matches per media TYPE not per role (MPI-466), and a later step can DERIVE the media
      that satisfies the slot, after the boundary being guarded.
- [x] Confirm which flows the gate would actually touch — dumped `mediaInputs` for all
      twelve flow ops. Character Sheet declares none, DramaBox's voice is `required: false`,
      Scribble's `image1` is required *and* derived. Everything else is a plain refusal.
- [x] Export `findMissingMediaSlot` from `generationService.js` rather than copying it —
      three guards answering the same question must not be three predicates.
- [x] Gate in `_goTo`, not on each button: the arrows, the ticker's direct jumps and the
      step hotkeys all funnel through it, so one place covers all three. Forward-from-0 only;
      backward is never gated.
- [x] `_stepDerivesOwnMedia` (a step declaring `composite`) exempts the flow, so Scribble
      still runs from a blank canvas.
- [x] Generic copy on the flow surface; `_warnMissingMediaSlot` left alone for the PromptBox.
- [x] New spec `tests/desktop/flow-step-gate.spec.js` — both directions in one launch.
- [x] Regression: all nine flow desktop specs green, node suite 775/775, eslint clean.
- [x] Docs: `docs/toasts.md` (new row + the stale line refs on the two files touched),
      `docs/playbooks/add-flow/02-media-io.md` (§ Self-gating inputs — the step gate).
- [x] No `UNRELEASED.md` entry — Flows debut in the next release, so a fix to a flow is not
      a fix to anything a user ever had (that file's own § Fixes note).
- [ ] Fabio's eyes on the toast copy in the running app.
