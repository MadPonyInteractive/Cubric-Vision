# MPI-321 Validation

## Automated
- `node --check MpiGalleryGrid.js`. PASS.

## Manual (needs running app)
1. Scroll fast up/down over a project with video/audio cards. EXPECT: no
   playback, no audio blaring, no stutter from scroll-past.
2. Hover a video card and hold ~200ms. EXPECT: plays (unmuted if the hover-audio
   setting is on). Move off → pauses + resets.
3. Hover an audio card and hold ~200ms. EXPECT: plays; leave → stops + resets.
4. Flick the cursor across several cards quickly without settling. EXPECT: none
   play.
5. Click an audio card. EXPECT: plays immediately (click is not delayed).
6. Toggle the play-audio-on-hover setting off → hover video plays muted after the
   dwell (no regression).
