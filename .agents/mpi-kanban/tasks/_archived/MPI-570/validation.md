# MPI-570 Validation

## Automated

- `npm test` — **606/606 pass**, 0 fail (2026-08-17).
- `npx eslint js/managers/overlayManager.js js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` — clean.

## Live, in an own isolated instance

Own profile `cubric-mpi570-profile`, own port 58231, `CUBRIC_MODELS_ROOT=G:/CubricModels`.
Project "The Failed Heist" (folder `cowboys`), 97 cards / 66 video groups, 4 promoted
`video.mpi-group-card__thumb--video`. The user's app was not touched. No GPU used.

**The bug was measured BEFORE the fix**, so the fix is provably not a no-op:

| Probe | Pre-fix | Post-fix |
|---|---|---|
| Hover-play a video card, then push an overlay | `paused:false muted:false`, `currentTime` **0.54 → 1.73** at `depth:1` — **BUG** | `paused:true muted:true t:0` at `depth:1` |
| `mouseenter` arriving **while** an overlay is up | (n/a — no gate existed) | stays `paused:true muted:true` |
| **Fabio's real path**: `flowService.openFlowFromReuse(<ltx-foley item>)` while a card hover-plays | — | playing unmuted at `t:3.78` → `paused:true muted:true t:0`, `depth:1` |
| `window` `blur` while a card hover-plays | — | `paused:true muted:true` |
| `document` `visibilitychange` with `hidden:true` | — | `paused:true muted:true` |

Regression checks (all pass):

- Hover **still plays** after a blur stop — no permanent lockout (`replayStillWorks: true`).
- Overlay close → `depth 0` → hover plays again (`HOVER_RESTORED: true`, `t:1.74`).

## Measured along the way — corrects the brief

`brief.md` predicted `mouseenter` fires on the card revealed by the closing popup, then the
overlay mounts a tick later. Measured directly with a real cursor parked on a cover div
(cover removed, then `flows:open` on `setTimeout 0`): **`card-mouseenter` never fired** —
only `overlay-depth-1@10.2ms`. The overlay covered the card before the browser's hit-test
pass ran, so the boundary event went to the overlay instead.

So the ordering is not fixed, and it is *not* knowable from the call graph — it depends on how
long the overlay takes to mount. That is exactly why the fix is **stop AND gate** rather than
stop alone: the stop covers a `mouseenter` that lands before the push, the gate covers one that
lands after. Either half alone would have been the "looks right, ships, changes nothing" no-op
the brief warns about — just for a different reason than the brief expected.

## Still needs Fabio's eyes (verify mode: user-ux)

This is a hover/sound surface. Check in the app:

1. Hover a gallery video with the volume up → it plays with sound.
2. Right-click it → Reuse → **Apply to App** on a Flow card → the Flow overlay opens and
   **nothing keeps looping or making sound** behind it.
3. Close the overlay, hover again → sound comes back (the gate is not sticky).
4. With a video hover-playing, minimise the app or click another window → sound stops.

A running app must be **reloaded** to pick up the change (frontend JS is served from disk).

## Not covered — deliberately

The second and third symptoms in the card (hover sometimes does nothing; audio arrives late)
are separate mechanisms per `brief.md` and were not touched.

## Confirmed by Fabio

2026-08-17 - checked in the app and confirmed fixed (option 1).
