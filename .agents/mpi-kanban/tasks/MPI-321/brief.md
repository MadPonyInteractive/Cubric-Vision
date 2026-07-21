# MPI-321 — Gallery hover playback vs scroll

## Problem
Hovering a gallery video/audio card plays it. While scrolling, the cursor drags
across many cards → each fires `play()` → stutter + audio blares on scroll-past
(worst with videos that have audio). Annoying + reads as lag.

## Approach (v2 — scroll-gate, no dwell)
First tried a 200ms hover-intent dwell — user disliked waiting to play. Replaced
with: **hover plays instantly when NOT scrolling; while scrolling nothing plays
and everything stops; settling the scroll on a card plays it.**

- Setup-scope `_isScrolling` flag + `_scrollIdleTimer`.
- Scroll handler: set `_isScrolling = true`, `_stopOtherGalleryMedia(null)`
  (stop ALL, including under cursor), restart a 150ms idle timer.
- Idle timer fires (scroll stopped): clear the flag, then call
  `qs('.mpi-group-card:hover')?._hoverPlay?.()` — replays the card the cursor
  came to rest on (mouseenter won't re-fire; the scroll moved, not the pointer).
- `mouseenter` (audio + video): `if (_isScrolling) return;` else play instantly.
- Each card exposes `cardEl._hoverPlay` (video/audio play logic; no-op for image)
  so the idle handler can trigger the settled card.
- `_promoteVideo` hover-autoplay also gated on `!_isScrolling`.

150ms idle threshold in MpiGalleryGrid.js. No wait on a real hover — the delay
only applies to the moment scrolling stops with the cursor already on a card.

## Status
Code complete, syntax-checked. Pending live in-app test.
