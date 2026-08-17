# MPI-570 Plan — stop gallery hover playback when the gallery stops being the visible surface

**Read `brief.md` first.** The card's own description traces a different mechanism and names a
fix candidate (`ui:close-all-popups`) that fires too early.

## Current State

Traced 2026-08-17, before any edit:

- `MpiReusePromptDialog.destroy()` → `modal.el.hide()` → `_backdrop.remove()` / `_wrapper.remove()`,
  **synchronous**, no transition (`MpiModal.js:98-107`).
- `openFlowFromReuse` defers `flow:open` by one macrotask (`flowService.js:141`), so the popup
  teardown and its reveal always land BEFORE the Flow overlay pushes.
- `Overlays.request()` also emits `ui:close-all-popups` itself, BEFORE `instance.show()`
  (`overlayManager.js:43`). Both close paths therefore precede `_notifyDepthChange()`, which
  fires last in `request()`.
- `onDepthChange` (`overlayManager.js:104`) has **zero consumers** — a designed hook, never used.
- `MpiGalleryGrid` is mounted in exactly one place, `MpiGalleryBlock.js:116`, and never inside an
  overlay. An overlay-depth gate therefore cannot suppress a nested gallery.

## Approach

Ownership: `js/managers/overlayManager.js`, `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`

1. `overlayManager.js` — `_notifyDepthChange()` passes `this._stack.length` to its subscribers.
   One line; no existing consumer to break.
2. `MpiGalleryGrid.js` — subscribe `Overlays.onDepthChange` and both **stop** and **gate**:
   - `depth > 0` → `_stopOtherGalleryMedia(null)` (already correct; untouched).
   - `_onCardEnter` and the audio-card `mouseenter` early-return while an overlay is up, the same
     shape as the existing `_isScrolling` gate.

   The gate is load-bearing, not belt-and-braces. `mouseenter` from a reveal is fired by the
   browser's hit-test pass, which can land AFTER the synchronous push. A stop-only fix would then
   be exactly the no-op `brief.md` warns about.
3. Same `_stopOtherGalleryMedia(null)` from `window` `blur` and `document` `visibilitychange`
   (minimise / focus loss, reported in the same breath). Pushed to `_unsubs`.

Out of scope, per `brief.md`: the second and third symptoms (hover sometimes does nothing; audio
arrives late). Different mechanisms; do not merge.

## Verification

**Verify mode:** user-ux

The bug is a real-browser event-ordering bug — a unit test cannot prove it. Measure it live,
before and after, in an OWN isolated instance (own profile + own `CUBRIC_PORT`,
`CUBRIC_MODELS_ROOT=G:/CubricModels`). No GPU: playback of existing media only.

1. **Pre-fix probe (must FAIL).** Reuse a video card → Apply to App → Flow overlay up → assert
   every `video.mpi-group-card__thumb--video` is `paused` and `muted`. If this passes before the
   fix, the repro is wrong and the fix would be unprovable.
2. **Post-fix probe (must PASS).** Same steps, same assertion.
3. `npm test` (606) + eslint clean.
4. Fabio's own eyes in the app — it is a hover/sound surface.

## Completed

Shipped 2026-08-17, uncommitted. Evidence in `validation.md`.

- `overlayManager.js` — `_notifyDepthChange()` passes the new stack depth to subscribers.
  `onDepthChange` had zero consumers, so nothing could break.
- `MpiGalleryGrid.js` — `_overlayOpen` (mirror of `_isScrolling`), set from
  `Overlays.onDepthChange`; `depth > 0` also calls the existing `_stopOtherGalleryMedia(null)`.
  Gated FOUR entry points, not two: `_onCardEnter`, the audio-card `mouseenter`, the
  `_promoteVideo` already-hovering autoplay, and the scroll-idle replay (that last one fires
  from a 150ms timer that can land after an overlay opened). Plus `window` `blur` and
  `document` `visibilitychange` → same stop.
- 606/606 tests, eslint clean, live pre-fix and post-fix measurements taken.

## Plan Drift

- **2026-08-17 — the brief's predicted event ordering did not reproduce, and the fix is right
  anyway.** `brief.md` expects `mouseenter` on the revealed card, then the overlay a tick
  later. Measured with a real parked cursor: `mouseenter` never fired — the overlay covered
  the card before the hit-test pass, so only `overlay-depth-1@10.2ms` was logged. The ordering
  depends on overlay mount time and is not knowable from the call graph, which is why the fix
  keeps BOTH the stop and the gate instead of choosing one. Written up in `validation.md`.
- **2026-08-17 — two more gated call sites than planned.** The plan named `_onCardEnter` and
  the audio `mouseenter`. Reading the file turned up two more paths that call `_hoverPlay`
  without going through them: `_promoteVideo`'s `cardEl.matches(':hover')` autoplay and the
  scroll-idle replay. Both would have leaked playback under an open overlay.
