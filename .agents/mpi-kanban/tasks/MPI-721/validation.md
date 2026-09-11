# MPI-721 — validation

## What closes this card

A masked edit with a reference image was unreachable anywhere in the app: the Gallery has
reference chips but `hasMask: false`, History has the full mask rack but discarded chips at
run. Fabio ran exactly that in his own app on 2026-09-11 — mask the subject, `+` a reference,
`krea2Edit` — and confirmed it: *"Verified, it works great."*

## Evidence

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run lint:components` | clean |
| `npm test` | 918 / 918 |
| `npx playwright test --config=playwright.desktop.config.js tests/desktop/electron-smoke.spec.js` | 1 passed — the changed modules boot |
| Live run, user's own app (image history group) | masked `krea2Edit` with a staged reference — **verified by Fabio** |
| Live re-check after the three UI fixes | **verified by Fabio** — rail clicks, chips clear the rail, labels read in full |

No sandbox could have produced the live legs: the renderer is served from the tree, so a
reload picks up uncommitted edits, which is why the user's own session is the only place a
real generation proves this.

## The thing a future reader must not undo

**MPI-351's clear-on-mount + discard-at-run is retired, and must not come back.** That
workaround closed a real bug — one stale INVISIBLE chip silently owned `Input_Image` for run
after run (upscale_002-007 all ran on a two-hour-old kleinEdit output while a fresh crop was
the active entry) — but it closed it by deleting the feature.

MPI-721 removes the *precondition* instead. The active entry is now an ordinary numbered,
pinned chip, and `workspaceKey: 'history'` persists nothing at all. So there is no invisible
chip to own a slot, and `mediaItems` handed to the dispatch IS the whole slot truth. Re-adding
a discard or a clear-at-mount would break the feature without protecting anything.

The invariant that keeps it true: **`_setCurrentIdx()` is the only place `_currentIdx` moves**
(ten sites funnelled). A new site that writes the field directly leaves the chip stale, which
is the same class of bug wearing different clothes.

## Follow-ups deliberately not done here

- **MPI-723** (`doing`, another session): a PromptBox drop outside the Gallery stages the chip
  but never builds an `ItemGroup` — `media:imported`'s only listener lives inside
  `MpiGalleryBlock` and one block is mounted at a time. Does not block this card.
- Two rule/doc proposals were raised at close-out and left for the user's call:
  `.claude/rules/component-state.md` (the `promptMedia` table's `history` half is now wrong —
  history persists nothing) and `docs/releases/UNRELEASED.md` (this is user-facing and has no
  changelog line yet). Neither was edited: rule files need explicit approval, and a 1.6.0 cut
  was live in a peer session.
