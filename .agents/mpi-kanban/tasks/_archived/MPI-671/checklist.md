# MPI-671 checklist

- [x] `uploadMediaFile` emits `media:import-started` before the upload and
      `media:import-settled` in a `finally`, carrying a `tempId`. Emitting from the
      shared service — not from the gallery's drop handler — is what makes every
      caller benefit: the PromptBox drop, the snapshot path and the recorder all
      route through this one function.
- [x] `media:import-started` / `media:import-settled` documented in the `js/events.js`
      catalogue beside the other `media:` events.
- [x] `MpiGalleryBlock` holds a `_importPlaceholders` Map (tempId → placeholder group)
      and prepends it to the grid on every rebuild.
- [x] The placeholder is the shape the grid already renders for a generation, plus an
      `isImporting` flag.
- [x] `MpiGalleryGrid.setImporting()` — the import twin of `setGenerating`, showing the
      SPINNER and suppressing the mascot. `setGenerating` deliberately hides the
      spinner ("Mascot replaces the spinner as the waiting indicator"), which is right
      for a model run and wrong for a file copy.
- [x] Every `setGroups` call site goes through one `_leadingGroups()` helper. All 10 —
      six already spread `_placeholdersForFirst()` by hand, and two (combine, and the
      `media:imported` handler) dropped it entirely, which is the bug the helper
      prevents.
- [x] A failed import removes its placeholder — `settled` fires from a `finally`, so
      the card cannot be left spinning next to MPI-670's `ui:danger` toast.
- [x] Verified against a real drop event on the real overlay: placeholder up within
      200 ms, replaced by the finished card at 1.6 s, no gap. Evidence: validation.md.
- [x] `npx eslint --max-warnings=0` exit 0 on all four files; `npm test` 831 pass.
- [x] **Human check** — the user drag-dropped the 474 MiB clip in their own app and
      captured both states: a spinner card labelled `PXL_20260829_232809577` while
      importing, then `imported_017 · 2160 x 3840 · 91S`, with the project going
      43 assets / 751.8 MB → 44 assets / 1.2 GB.
