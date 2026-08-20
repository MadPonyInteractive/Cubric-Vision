# MPI-582 Checklist

Derived from `plan.md` phase titles (2026-08-20).

- [x] The three remaining bare inputs — `select` -> MpiDropdown, `toggle` -> MpiCheckbox, `number` -> MpiInput
- [x] The CSS both consumers carry — delete both `accent-color` blocks, rework the bare-input selectors
- [x] One slider in the app — MpiToolOptionsMaskAdjust + MpiMaskStrip longhand onto MpiProgressBar
- [x] The words — add-flow playbook, `FlowStepField` typedef, `declaredFields.js` header, `.claude/rules/components.md`

## Arrived done (peer MPI-504 session, 2026-08-20 01:52Z)

- [x] `button` -> MpiButton
- [x] `slider` -> MpiProgressBar
- [x] `text` -> MpiInput

## Closed without work

- [x] Revise the Flows — Fabio inspected all three on 2026-08-20 and confirmed
      they already use components as they should. No audit needed.

## Noticed, not actioned

- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.css:446` — a raw group-card
  checkbox with `accent-color: var(--accent-heat)`. Same law, not a declared field,
  outside this card's four fix items.
- Every declared field's `:focus-visible` ring is still `--accent-frost` app-wide
  (flagged by MPI-504's plan). Phase 2 removes it from the field blocks it touches;
  the app-wide sweep is its own job.

## Follow-up Fabio asked for in the same message

- [x] Extend Video's missing middle step - `ltx-extend` now declares one `preview`
      step on role `video1` carrying the two prompt boxes, so the carousel is
      supply -> describe -> run, matching `ltx-foley`. `Input_Duration` stays on the
      run slide beside Generate (Fabio's call).
