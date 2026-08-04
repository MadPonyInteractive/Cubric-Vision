# MPI-425 Checklist

Derived from `plan.md` (compact plan, four implementation items).

## Implementation

- [x] Collapse tool-def entry — Detect owns `points` / `text` / `auto` instead of
      activating a mode; Mask group becomes `maskBrush` + that entry
- [x] Dismissal and conflict rules — pick / Escape / any tool activation /
      unhovered timer (one tunable constant), rail tooltip suppressed while the
      strip is open, strip never stored in `_tip`
- [x] Teardown and guard — listeners + timer in `_unsubs`, and
      `tests/mask-tool-registry.test.cjs` extended to fail on a sub-mode missing
      from `_MASK_TOOLS` or `TOOL_OPTIONS_REGISTRY`
- [x] Docs and the stale comment — taxonomy + PromptBox rule into
      `docs/masking.md` (200-line cap, trim first); update the MpiHistoryTools
      comment that still says Shapes "does not become a switcher"

## Validation

- [x] `node --test tests/` green, `npm run lint` + `npm run lint:components` clean,
      guard test negative-controlled both directions
- [x] **USER-ONLY (verify mode `user-ux`)** — verified in the app 2026-08-02. All
      four dismissal paths behave; `STRIP_DISMISS_MS = 1500` accepted as-is
      ("1.5 seconds is fine, works well as it is") — no retune needed
