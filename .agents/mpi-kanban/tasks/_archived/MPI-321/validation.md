# MPI-321 Validation

## Automated
- `node --check MpiGalleryGrid.js`. PASS.

## Manual (needs running app, Ctrl+R — frontend only)
1. Move the mouse onto a video card WITHOUT scrolling. EXPECT: plays instantly
   (no dwell/wait).
2. Scroll fast up/down over video/audio cards. EXPECT: nothing plays, no audio,
   no stutter; anything that was playing stops the instant you scroll.
3. Scroll, then STOP with the cursor resting on a card. EXPECT: that card starts
   playing ~150ms after the scroll settles (no mouse wiggle needed).
4. Hover an audio card without scrolling. EXPECT: plays instantly; leave → stops.
5. Click an audio card. EXPECT: plays immediately (click never gated).
6. Toggle play-audio-on-hover OFF → hover video plays muted, still instant.
7. A video scrolling INTO view under the cursor mid-scroll. EXPECT: does not
   autoplay until the scroll settles (promote-autoplay is scroll-gated).
