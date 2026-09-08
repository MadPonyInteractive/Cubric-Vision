# MPI-565 — Gallery cards removed without teardown

## Symptom

Hundreds to thousands of `net::ERR_FILE_NOT_FOUND` on `blob:http://127.0.0.1:3000/<uuid>`
in the DevTools console. They start after deleting a card (or after a generation
completes) and never stop; a later app restart is slowed by the accumulated console
volume.

## Root cause

`_makeCard()` in `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` gives every
card two self-perpetuating timers:

- `_previewTimer` — `setInterval(_paintNextPreviewFrame, 1000 / rate)`, the latent-preview
  clip loop (MPI-508), which repaints the rolling frame buffer until told to stop.
- `_mascotFlipTimer` — a `setTimeout` that re-arms itself every 4–8 s.

Neither removal path stopped them, and the card element never defined `destroy()` at all:

- `el.removeCard(groupId)` (called on generation complete for every temp id, and on
  delete for every deleted group) only did `entry.el.remove()`.
- `_cleanupDetachedState(activeIds)` did the same for cards that leave the visible set.
- The grid's own `el.destroy` called `card.el.destroy?.()` — an optional call on a method
  that did not exist, so it was a silent no-op.

A detached card is still a live JS object with a live interval. It keeps painting its clip
frames onto its detached `<img>`, which still issues real requests. When the generation
ends, `activeGenerations.end()` revokes `latestPreviewUrl` — a URL that orphan still holds
— so every pass through its loop re-requests a dead blob. The per-`img` dead-URL latch
from MPI-277 cannot help: it remembers one URL, and a cycling clip presents a different
one on the next tick. Every removed generating card adds another permanent stream, which
is why the noise grows through a session and never stops.

## Fix

`cardEl.destroy()` — clears `_generating`, calls `_stopPreviewPlayback()` (kills the
interval and revokes the clip's blobs) and `_stopMascotFlip()`. Called from `removeCard`
and `_cleanupDetachedState`; the grid's `el.destroy` call now resolves.

## Evidence

- `tests/gallery-card-teardown.test.cjs` — asserts `destroy()` exists and stops both
  timers, and that every `entry.el.remove()` is preceded by a destroy call.
- Mutation check: the same assertions run against `git show HEAD:` of the file report
  `destroy defined: false`, `guarded: 0/2` — the test fails without the fix.
## Part 2 — the residual burst (same card, different bug)

After the teardown fix the stream stopped, but a handful of one-shot errors remained,
starting at step 1–2 of an H3 reference-to-video run. Instrumented live (probe wrapping
`createObjectURL`/`revokeObjectURL` and the `HTMLImageElement.src` setter, Playwright on
:3000) rather than reasoned about, and the trace named it in one run:

```
t=271801  mint
t=271801  set    ← _setPreviewImageSrc ← _paintNextPreviewFrame ← _armPreviewTimer
t=271802  revoke ← _revokePreviewUrl ← _enqueuePreviewFrame (ring eviction)
```

Self-inflicted, single owner. `_setPreviewImageSrc` preloads each frame through a
detached `new Image()`. A burst previewer appends frames faster than a decode, so the
ring evicts the frame the play head started on 1 ms earlier and revokes it mid-load.
Nothing else ever held the URL — no second consumer, and unrelated to the paint work in
MPI-566 (that commit contains no blob code at all).

`_revokePreviewUrl` now aborts a matching pending preload — handlers detached, `src`
removed — before revoking, which covers eviction, `resetPreviewClip` and teardown alike.

### Evidence (live A/B, same harness)

| run | frames | evictions | paints | console errors |
|---|---|---|---|---|
| patched | 40 | 32 | 227 | **0** |
| patched, 120-frame burst | 120 | — | — | **0** |
| abort disabled (`__AB_OFF`) | 40 | — | — | **1** |

A still-mode krea2 run (6 frames, ~9 s apart) never hit the window — which is why this
only ever appeared on video models. 608/608 tests, eslint clean.

