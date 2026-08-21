# MPI-474 Checklist

## Done — `npm test` 482/482, lint clean

### Component
- [x] `MpiButton.setIcon(name)` — the primitive was strictly boolean (`iconActive`
      is only a CSS swap on `is-active`), so a third state had no way to reach a
      third icon. Additive, mirrors `setLabel`, no consumer changed.
- [x] `MpiPromptBox`: `isNegativeMode` boolean → `promptMode` tri-state. Zero
      `isNegativeMode` references remain.
- [x] `_readMode` / `_writeMode` / `_placeholderFor` / `_iconFor` accessors.
- [x] `_applyMode()` — the single place a mode changes. Textarea value,
      placeholder, button icon, active flag and the `mode-change` emit had been
      duplicated across three call sites; that is how they drifted.
- [x] Third draft slot (`negativeAudio`) in `_saveDraft`.
- [x] Cycle gated on `capabilities.audio`; without it the button cycles two ways.
- [x] Stranded-edit guard placed BEFORE `_refreshNegToggle`'s
      `show === !!_negBtn` early return — the button neither appears nor
      disappears when only the capability changes, so the return would skip it.

### Dispatch path
- [x] `getRunPayload` sends `negativeAudio`, blanked for a model that cannot take
      it so a stale draft never rides along.
- [x] `MpiGalleryBlock` + `MpiGroupHistoryBlock` payload → config pass-through.
- [x] `generationService` config destructure → executor payload.
- [x] `commandExecutor._buildParams` → `Input_Negative_Audio`, always emitted
      including empty (the graph gates NAG on the string being non-empty, so a
      cleared box must reach the node to turn it back off).

### Reuse round-trip — closed both directions
- [x] `generationService` saves `meta.negativeAudioPrompt` at all FOUR meta
      writes (single, saved, extend-source, extend).
- [x] `promptReuse.js` reads it back, falling through to `''` for items generated
      before this shipped.
- [x] `injectPrompts({positive, negative, negativeAudio})` + the
      `workspace:inject-prompts` bridge.
- [x] All four block `injectPrompts` call sites pass the third field.

### Docs
- [x] `js/components/types.js` — `negativeAudioValue` prop.
- [x] `docs/component-contracts.md` — new PromptBox contract section (file 153
      lines, under the 200 limit).

## Not done

- [ ] **Live proof.** Nothing has run through the app. Needed: type into the audio
      stop, generate, and confirm the dispatched graph on `:48188` carries the text
      in `Input_Negative_Audio` — read off `/history`, not off the run finishing.
- [ ] **Reuse verified in the app** — round-trip all three fields from a gallery
      card. Wired and unit-green, but unproven by hand.
