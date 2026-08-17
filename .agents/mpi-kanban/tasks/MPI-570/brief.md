# MPI-570 — the mechanism, proven (2026-08-17)

Fabio restated the bug precisely, and it is **not** the one the card description traces.
Read this before the description.

## What he actually reported

> "I open the reuse box, I press the flow button, and whatever video is underneath the mouse
> at that point plays in a loop while the flow overlay is visible and ready to proceed."

The looping clip is **not** the card he was hovering when he opened the reuse box. It is
whatever card the closing popup UNCOVERS under his stationary cursor.

## The load-bearing fact, measured

`mouseenter` **does** fire on a stationary cursor when the element covering it is removed.
Verified live in an isolated app (2026-08-17): a counter div under a cover div, real cursor
parked on the cover with playwright's `hover`, cover removed with no mouse movement —
`mouseenter` went 0 → 1.

That is the whole bug. Everything else follows.

## The sequence

1. Click the flow button in the reuse box.
2. `openFlowFromReuse` seeds `s_flowInputs` and defers `flow:open` **by a tick**
   (`js/services/flowService.js:141`) — deliberately, because the popup teardown emits a bare
   `ui:close-all-popups` AFTER it returns, which the overlay would otherwise obey and hide.
3. The popup hides → a gallery card is revealed under the stationary cursor → `mouseenter`
   fires → `_onCardEnter` → `_videoHoverPlay` (`MpiGalleryGrid.js:932`) → it plays, and
   **unmuted** whenever `_volume > 0`.
4. *Next tick*, the Flow overlay mounts over it.
5. No `mouseleave` ever fires — the cursor never moves and the card is now covered. It loops
   with sound for as long as the overlay is up.

## THE TRAP — do not take the card description's first suggestion

The description names `ui:close-all-popups` as a fix candidate. **It fires at step 3 BEFORE
the reveal.** The play happens after it. Wiring the stop there would look correct, pass a
casual test, ship, and change nothing — Fabio's bug survives it untouched.

## The fix

One choke point, after the reveal: `OverlayManager.push()` calls `instance.show()` then
`_notifyDepthChange()` (`js/managers/overlayManager.js:45-57`). Stack depth 0 → 1 IS "the
gallery stopped being the visible surface", it happens at step 4, and every overlay goes
through it — Flow, Model Manager, Flow Library, History. That makes it the shared fix rather
than the per-caller one the root-cause rule bans.

`_stopOtherGalleryMedia(null)` (`MpiGalleryGrid.js:24`) is already the correct
stop-everything helper — it pauses, rewinds and re-mutes every `audio[data-src]` and
`video.mpi-group-card__thumb--video`. It is not broken and does not need touching. It is
simply never called on overlay open.

**Also cover minimise and focus loss**, which Fabio reported in the same breath ("they keep
playing when the app screen opens"): same call, triggered from `window` `blur` /
`visibilitychange`.

## Second symptom, probably a different bug — do not merge them

Same report: hovering a gallery video sometimes does NOTHING, and sometimes plays with the
audio arriving late.

- *Nothing*: `_onCardEnter` early-returns while `_isScrolling` (MPI-321, deliberate — a
  scroll-past must not play), and a scroll-idle handler is supposed to play the card the
  cursor settled on (`MpiGalleryGrid.js:~1816`). Verify that handoff actually fires; a missed
  one reads exactly as "hover does nothing".
- *Late audio*: `_videoHoverPlay` unmutes and calls `play()` on an element that may still be
  buffering, so sound starts when data arrives rather than on hover.

Different mechanisms. Fix the overlay bug first; do not assume one change covers all three.
