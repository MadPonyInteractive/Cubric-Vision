# MPI-321 — Gallery hover-intent delay

## Problem
Hovering a gallery video/audio card plays it instantly. While scrolling, the
cursor drags across many cards → each fires `play()` → stutter + audio blares on
scroll-past (worst with videos that have audio). Annoying + reads as lag.

## Fix
200ms hover-intent dwell before hover playback. On `mouseenter` schedule a timer;
the timer re-checks `cardEl.matches(':hover')` when it fires — so a card the
cursor scrolled away from never plays even when `mouseleave` didn't fire
(scrolling moves the card, not the pointer; see the MPI-132 scroll-stop handler).
`mouseleave` clears the pending timer. Click-to-play (audio) is unchanged —
intentional, no dwell.

`HOVER_PLAY_DELAY_MS = 200` in MpiGalleryGrid.js. Poster frame / first paint is
unaffected — only `.play()` waits.

## Status
Code complete, syntax-checked. Pending live in-app test (scroll fast over
video/audio cards → no playback; settle 200ms → plays).
