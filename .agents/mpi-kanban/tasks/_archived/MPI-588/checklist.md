# MPI-588 — checklist

Scope re-measured at the start: **26 warnings, 11 files** — not the 29/13 in [brief.md](brief.md).
MPI-589 had already cleared `MpiProjectName` (2), and `MpiFlowLibrary`'s single one was gone too.

## The shared helper

- [x] `mountButton(props, children)` exported from `js/components/Primitives/MpiButton/MpiButton.js`
      — one home for the mount-into-a-throwaway-div trick, next to the Primitive it mounts.
      `MpiBaseFlow.js` and `MpiProjectName.js` each carry a private copy of the same one-liner;
      both were left alone (MpiBaseFlow is claimed live by MPI-504 and MPI-531). Folding them
      onto the shared export is a follow-up, not this card.

## The 11 files

- [x] `MpiSlideOver` (1) — header close → ghost icon button, appended after the title span.
- [x] `MpiAutoMaskThumbs` (1) — segment tiles → ghost buttons keeping their own 2px frame.
- [x] `MpiContextMenu` (1) — menu rows → ghost buttons, appended one at a time.
- [x] `MpiLicenceGate` (1) — licence links → ghost buttons styled back to links.
- [x] `MpiModelSettings` (1) — LoRA bypass → ghost icon button, still publishing aria-pressed.
- [x] `MpiQueuePanel` (2) — clear/close head buttons + the stop/cancel action.
- [x] `MpiToolOptionsPrompt` (2) — frame swap (id preserved) + the thumb clear chip.
- [x] `MpiModelManager` (3) — filter tags, the search field (now a real `MpiInput`), drawer close.
- [x] `MpiEngineInstall` (4) — both Phase-0 choice cards, the back link, the repair hatch.
- [x] `MpiMediaPicker` (6) — filter tabs, upload card, tile media, expand, preview close,
      and the hidden file input, which is the one control with no component answer.
- [x] `MpiPromptBox` (4) — media-strip role toggle + remove, the `@ref` picker rows, and the
      offscreen height probe, which is the second no-component-answer case.

## The two `eslint-disable`s

- [x] `MpiMediaPicker` — hidden `<input type="file">`: never rendered, never styled, exists only
      so a click opens the OS dialog. `MpiInput` has no file type.
- [x] `MpiPromptBox` — offscreen `<textarea>` height probe: aria-hidden, untabbable, never
      painted; its only job is to report a `scrollHeight`.

Both carry the house `-- reason` suffix, matching the existing
`// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener` in `shell.js`.
The brief expected the PromptBox `<textarea>` at line 1153 to be the main prompt input; it is not
— the main input has been an `MpiInput` all along.

## Verify

See [validation.md](validation.md).
