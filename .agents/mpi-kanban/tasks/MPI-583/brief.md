# MPI-583 — brief

Fabio reported the gallery scroll bar lagging in a project full of videos, and
guessed the cause was videos under the cursor trying to play. It is not: the
`_isScrolling` gate (MPI-321) already blocks every hover-play mid-scroll, and a
cursor parked on the scroll bar never fires `mouseenter` on a card at all.

The cost is in the STOP path. The grid `scroll` handler calls
`_stopOtherGalleryMedia(null)` on EVERY scroll event, and that sweep walked every
`<video>` in the DOM doing `pause()` + `currentTime = 0` + `muted = true`
unconditionally — including on videos already sitting idle at frame 0.

`currentTime = 0` is NOT a no-op at position 0. Blink fires a real seek, each
queuing a demux + decode of frame 0.

Shipped in v1.4.2, so users have this today. Introduced by MPI-321
(`453450f1`), not by MPI-570 — MPI-570 only made it easier to notice.
