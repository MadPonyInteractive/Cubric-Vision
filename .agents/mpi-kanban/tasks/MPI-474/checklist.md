# MPI-474 Checklist

## Done — code written, `npm test` 482/482, lint clean

- [x] `MpiButton.setIcon(name)` — the primitive was strictly boolean, so a third
      state had no way to reach a third icon. Additive, mirrors `setLabel`.
- [x] `MpiPromptBox` — `isNegativeMode` boolean → `promptMode` tri-state.
      Zero `isNegativeMode` references remain.
- [x] `_readMode` / `_writeMode` / `_placeholderFor` / `_iconFor` accessors, so a
      fourth mode is not a ternary hunt.
- [x] `_applyMode()` — the single place a mode change happens. Textarea value,
      placeholder, button icon, active flag and the `mode-change` emit had been
      duplicated across three call sites; that is why they drifted.
- [x] Third draft slot (`negativeAudio`) in `_saveDraft`.
- [x] Cycle gated on `capabilities.audio`; a model without it cycles two-way.
- [x] Stranded-edit guard: losing `capabilities.audio` while in audio mode snaps
      back to `negative` (the early return would otherwise skip it).
- [x] `getRunPayload` sends `negativeAudio`, blanked when the model can't take it.
- [x] `MpiGalleryBlock` payload → config pass-through.
- [x] `generationService` config destructure → payload.
- [x] `commandExecutor._buildParams` → `Input_Negative_Audio`, always emitted
      (including empty, so clearing the box turns NAG back off).

## Not done

- [ ] `MpiGroupHistoryBlock` — same payload pass-through as the gallery block.
- [ ] **Reuse round-trip** — frozen-prompt capture (4 sites) and the
      `injectPrompts({positive, negative})` calls in both blocks still carry two
      fields. This is the quiet failure mode named in the brief.
- [ ] `js/components/types.js` props documentation.
- [ ] `docs/component-contracts.md` — PromptBox contract.
- [ ] **Live proof**: dispatched graph on `:48188` carries typed audio-negative
      text in `Input_Negative_Audio`. Nothing has run through the app yet.
