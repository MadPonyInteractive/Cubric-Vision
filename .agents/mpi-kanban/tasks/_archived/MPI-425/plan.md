# Mask group with a floating Detect strip

## Current State

Project mode: scalable-foundation.

- `MpiHistoryTools` is the left toolbar. Groups ALREADY render as a label plus
  stacked flat buttons (`_mountTool` / `_renderGroupSlot`), with per-mode
  disabled-with-reason and a `_subToGroup` reverse map. The structural half of
  the taxonomy exists; only the collapse behaviour is new.
- `IMAGE_TOOLS` Mask group is four buttons today: `maskBrush`, `maskPoints`,
  `maskText`, `maskDetect`. Three of those four are the same job with a
  different engine.
- `MpiPopup` is already used in this same file for the rail's hover tooltip:
  portals to body, `position: 'right'`, `triggerEl: btn`, glass variant
  ([MpiHistoryTools.js:299](../../../../js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js#L299)).
  The Detect strip is that primitive with three buttons inside it — no new
  positioning code.
- `tests/mask-tool-registry.test.cjs` scrapes `mode: 'maskXxx'` out of the rail
  SOURCE and asserts each one appears in `_MASK_TOOLS` and
  `TOOL_OPTIONS_REGISTRY`. A nested collapse def keeps matching as long as the
  key stays `mode:`.
- Architecture agreed 2026-08-01, recorded in `tasks/MPI-424/brief.md`.
- **2026-08-02: code + docs + guard are DONE** (see `## Completed`). Only the
  `user-ux` pass is left. Files touched: `MpiHistoryTools.js` / `.css`,
  `js/managers/hotkeyRegistry.js`, `tests/mask-tool-registry.test.cjs`,
  `docs/masking.md`.

Decisions settled with the user before planning, so implementation stops for
nothing:

1. **Clicking Detect opens the strip and activates nothing.** Whatever tool was
   active stays active until a method is picked. The button keeps a fixed Detect
   icon — it does not take on the last-used method's identity.
2. **PromptBox rule for the future groups:** Paint keeps the box up (paint →
   mask → detail is one operation, the MPI-372 logic), Composite does not (it
   ends at its own Apply and needs the column for its two slots). Recorded here
   for MPI-375 / MPI-373; this card adds NO dead branches for modes that do not
   exist yet.
3. **Only working tools ship.** This card delivers the Mask group as brush plus
   the Detect strip. Adjust, Shapes, Paint and Composite buttons arrive with
   their own cards. No greyed placeholders advertising unbuilt features.

## Implementation

- [x] Add a collapse entry to the tool-def shape and use it for Detect: a group
      member that owns sub-modes instead of activating one, rendered as a single
      button that opens an `MpiPopup` anchored right of itself holding
      `points` / `text` / `auto`. Mask group becomes `maskBrush` + that entry.
      **Verify:** `npm run lint:components` clean, and
      `node --test tests/mask-tool-registry.test.cjs` still resolves all three
      detect modes through the nested shape.
- [x] Dismissal and conflict rules: the strip closes on pick, on Escape, on any
      tool activation, and on an unhovered timer (ONE tunable constant, start at
      1500ms) that cancels when the pointer re-enters either the strip or its
      button. Suppress the rail hover tooltip for the collapse button while its
      strip is open — both anchor `position: 'right'` off the same element and
      would overlap. Keep the strip in its own variable, never `_tip`, which is
      destroyed on every hover.
      **Verify:** all four dismissal paths by hand in the running app; after
      `destroy()` no popup remains in the DOM and no timer is live.
- [x] Teardown and guard: every listener and the timer collected in `_unsubs`
      and cleared in `destroy()` per the component contract. Extend
      `tests/mask-tool-registry.test.cjs` so a sub-mode declared in the collapse
      def but missing from `_MASK_TOOLS` or `TOOL_OPTIONS_REGISTRY` fails.
      **Verify:** negative control both directions — drop one entry, test fails;
      restore, test passes.
- [x] Docs and the stale comment: record the taxonomy in `docs/masking.md`
      (artifact per group, method per button, engine shared across groups) plus
      the PromptBox rule for the future Paint/Composite groups. Update the
      MpiHistoryTools comment that still says Shapes "does not become a
      switcher".
      **Verify:** `docs/masking.md` at or under its 200-line cap (trim first);
      the comment matches the code.

## Completed

All four implementation items, 2026-08-02. What actually shipped:

- **Tool-def shape** — a group member may carry `collapse` + `sub[]` instead of
  `mode`. Detect is `{ collapse: 'detect', icon: 'search', sub: [points, text,
  auto] }`; the Mask group is now `maskBrush` + that entry. `_defsByMode` /
  `_subToGroup` index the leaves against the outer group, so `setMode` and
  `setDisabled` reach a collapsed mode exactly as before.
- **Strip** — `MpiPopup`, `position: 'right'`, `triggerEl` = the button wrapper,
  held in `_strip` / `_stripDef` / `_stripAnchor`, never `_tip`. Opening
  activates nothing; the button shows active while it owns the active mode but
  keeps its own icon.
- **Dismissal** — pick, Escape, any `_activate()`, and `STRIP_DISMISS_MS` (1500)
  once unhovered. Hovering the strip or its anchor cancels; the rail tooltip is
  suppressed for the anchor while open.
- **Escape** — new registry id `historyTools.collapseStrip.close`, bound only
  while the strip is open. The workspace's return-to-gallery Escape already
  stands down against an `.mpi-popup.is-active` (`ESCAPE_DISMISSABLE_SELECTORS`),
  so the two do not fight.
- **Guard** — `mask-tool-registry.test.cjs` gains two tests: collapsed modes must
  be in `_MASK_TOOLS` + `TOOL_OPTIONS_REGISTRY`, and a collapse entry must not
  declare a `mode:` of its own (which would demand registry entries that must not
  exist). Negative-controlled both directions.
- **Docs** — `docs/masking.md` gains `## Canvas tool taxonomy (MPI-425)` with the
  group/artifact/engine/PromptBox table; trimmed back to exactly 200 lines. The
  MpiHistoryTools "does not become a switcher" comment now carries the new
  reasoning.

## Remaining Work

- The `user-ux` pass in the running app (see `## Verification`), including tuning
  `STRIP_DISMISS_MS`.

## Plan Drift

- **2026-08-02 — the dismiss timer is NOT armed when the strip opens.** The plan
  said "an unhovered timer ... that cancels when the pointer re-enters"; arming at
  open would have dismissed the strip out from under a cursor that never moved
  after the click. `mouseout` on the anchor arms it instead, so the constant
  measures unhovered time, which is what it was for.
- **2026-08-02 — `MPI-425/brief.md` corrected.** It said new modes "may ship
  disabled-with-a-reason"; decision 3 (later, and on the card) says only working
  tools ship. Brief now states the correction and labels its toolbar diagram as
  the end state of the whole MPI-424 set, not of this card.
- **2026-08-02 — Escape is not on the hotkeys cheat-sheet page.**
  `hotkeyRegistry.js` asks that `mpi-hotkeys.js` HTML be updated alongside; a
  transient popup dismiss is not a shortcut anyone looks up, so it was
  deliberately left off. Reverse it if the user disagrees.
- **2026-08-02 — `docs/masking.md` roadmap healed.** It still listed MPI-379 as
  pending; that card is closed `rejected`.

- None yet.

## Verification

**Verify mode:** user-ux

The whole card is a toolbar interaction — the strip's placement, its timing and
its dismissal are things the user has to feel, and the auto-dismiss constant is
almost certainly wrong on the first guess. Before asking for that pass: full
`node --test tests/` suite green with no new failures, `npm run lint` and
`npm run lint:components` clean, and the guard test negative-controlled.

## Preservation Notes

- `docs/masking.md` is capped at 200 lines — trim before adding the taxonomy.
- MPI-382 / 368 / 375 / 373 each add their own button to these groups. The
  PromptBox rule is written down here so none of them has to re-decide it.
- The architecture this implements lives in `tasks/MPI-424/brief.md`; that
  umbrella closes when the last of the five ships.
