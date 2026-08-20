# MPI-583 — validation

## Root cause

`_stopOtherGalleryMedia(except)` is called by the grid `scroll` handler on every
scroll event. It swept every `audio[data-src], video.mpi-group-card__thumb--video`
and did `pause()` + `currentTime = 0` + `muted = true` with no check for whether
the element was already stopped.

Blink does not short-circuit a seek to the position the element already holds.

## Measured — off-app harness, 100 `<video>` on a real mp4

Static page, 100 elements built with the app's own class + attributes, real
`flow-ltx-extend.mp4`, all 100 at `readyState >= 2`, driven with playwright-cli.

| | 60 sweeps (sync JS) | `seeking` events / 10 idle sweeps |
| --- | --- | --- |
| before (unguarded) | 23.7 ms | 1000 |
| after (guarded) | 0.5 ms | 0 |

1000 seeks for 10 sweeps = every element seeks every sweep. A scrollbar drag
fires ~60-100 scroll events/s, so a 100-video gallery was doing thousands of
frame-0 decodes per second.

## The fix does not break stopping

Same harness, guarded sweep, on a genuinely playing element:

- before sweep: `currentTime 0.41`, `paused false`, unmuted
- after sweep: `currentTime 0`, `paused true`, `muted true`, exactly 1 seek

So idle elements cost nothing and a playing card still stops correctly.

## Regression scope

`git show v1.4.2:js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`
contains both the unguarded sweep and the per-scroll-event call, so the lag is
in the released build. Introduced by MPI-321 (`453450f1`); MPI-570 (`25a7cbfe`)
added `_overlayOpen` and did not touch the sweep.

## Suite

`npm test` -> 630/630 pass, 0 fail. `npx eslint` on the changed component ->
clean.

## User confirmation

Fabio: "I verified it. It's good now."
