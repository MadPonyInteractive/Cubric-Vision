# MPI-378 validation

Status 2026-07-29: **USER-VERIFIED in the running app. Card complete.**

## Proven before the live test

- `tests/tab-flip-target.test.cjs` — 3/3 pass.
  - `resolveFlipTarget` across every branch the acceptance list names: null project, zero
    cards, one card (with and without a stale `lastGroupId`), many cards with the remembered
    one present / deleted / absent / explicitly null, and the audio cases.
  - The Tab handover itself, as source-text invariants. This is not decoration:
    `Hotkeys.bind()` on an id that is no longer in the registry logs a warning and returns a
    no-op, so a half-finished handover leaves Tab silently dead with nothing thrown anywhere.
    The test asserts `workspace.flip` exists and is bound in `navigation.js`, that
    `radialMenu.toggle` is gone from the registry AND from `MpiRadialMenu`, and that
    `radialMenu.devToggle` survived.
  - That `lastGroupId` appears in `projectService.js` and in NEITHER Block — the acceptance
    criterion that the clear must not be patched into the four `removeGroup` call sites.
- Full `node --test tests/*.test.cjs`: 265 pass / 9 fail. The 9 are the known pre-existing set
  (optional-media-placeholder, permodel-key-allowlist ×3, resolve-model-deps, remoteProxy ×4) —
  none reference a file this card touched.
- `npx eslint` clean on every touched file. The two remaining warnings in `hotkeyRegistry.js`
  are the pre-existing `document.querySelector('.mpi-overlay--body')` overlay gates, carried
  over verbatim from the entry this card replaced.
- App booted in a browser dev session with **0 console errors**, which is what proves the module
  graph survived: `navigation.js` now imports `projectService.js` and `projectModel.js`, and an
  import cycle or syntax error there would have blanked the shell at boot.

## Live test (user, 2026-07-29) — PASS, first round, no defects

User confirmed the flip works in the app, and deliberately **spammed the key rapidly** to test
repeated presses. No wedge, no stuck view. That is the case the `_navSeq` guard in `_loadView`
already covered — each press bumps the token, and a superseded async mount returns before it
touches `_currentBlock` or the breadcrumb.

## Decisions taken during implementation

1. **No `SCHEMA_VERSION` bump.** `.claude/rules/versioning.md` says a project data-shape change
   bumps `SCHEMA_VERSION` + migration + Major app version. That rule targets BREAKING shape
   changes. `lastGroupId` is optional and absent already means "nothing to flip to", so there is
   nothing to migrate to — a bump would run a no-op migration over every project on disk purely
   to stamp a number, and drag a Major version with it. Added to the `Project` typedef and to
   `createProject` defaults instead. (Noticed while there, NOT fixed, not this card's mess:
   `createProject` stamps `schemaVersion: 2` while `SCHEMA_VERSION` is 4, so every new project
   runs migrations 2→3→4 on first open.)

2. **The flipper is bound in `_showShell()` and unbound in `_showLanding()`, not app-lifetime.**
   `hotkeyManager._handle` suppresses native Tab traversal for ANY `down:tab` keydown, but only
   after an early return when no handler is registered for that key. So an app-lifetime binding
   would have killed tabbing through the landing page's project form — which has real text
   inputs — where Tab is native today. Binding to shell visibility preserves the exact
   before/after behaviour on both pages.

3. **Audio groups excluded from the flip.** `MpiGalleryBlock` refuses to open an audio group as
   a history workspace (`if (group?.type === 'audio') return;`). The record point can never
   store one, but the single-card shortcut could have handed one back, so `resolveFlipTarget`
   filters them.

## Phase 2, deliberately not built

Gallery ↔ apps ↔ card waits for the App Library to un-gate (MPI-332). Nothing in v1 blocks it:
the flip target is one resolver call, so a third stop is a change to that function plus a cycle
in `_flipWorkspace`, not a rework.
