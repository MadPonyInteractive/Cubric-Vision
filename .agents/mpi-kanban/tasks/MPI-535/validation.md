# MPI-535 Validation

## What was wrong

MiniMax H3 latents played the whole clip **once per sampler step at burst speed**, then
froze until the next step, instead of looping at the clip's own rate. Reported on an
image-to-video run.

Not an H3 bug and not a single-pass bug. The gallery card has two playback modes, and
CLIP mode was a **one-shot latch** (`let _isClipMode`) on the card ELEMENT, armed by the
`VHS_latentpreview` marker — which a burst previewer sends **exactly once per sampler
run**. Miss it and the run is still-mode for its whole life with no recovery:

- the card may not be in `_cardMap` yet when the marker lands, and
- `setGenerating(null)` on any grid render → `_clearPreviewImage()` →
  `_stopPreviewPlayback()` cleared the latch — reachable between the marker and the first
  frame, before `latestPreviewUrl` is set.

It read as "single-pass only" because a **multi-stage H3 run dispatches two prompts**
(preview, then Finish) and gets a second arming. A later single-pass run worked fine,
which confirmed a race rather than a mode. Log evidence: 03:37 = one prompt, 6 steps
(broken); 03:44 + 03:47 = two prompts, 3 steps each (fine).

Second defect found on the way: `commandExecutor` called `exec.onPreviewReset?.()` with
**no arguments**, discarding the marker's `{ length, rate }`. So playback ran at a
hardcoded 8fps (H3 announces 24, KJNodes' LTX override 16) on a 48-frame ring (H3's clip
is 56 — the head was being dropped and only the tail replayed).

## The fix

Clip-ness is a property of the RUN, so `activeGenerations` owns it (`_previewClip`, same
lifetime as `_lastPreview`, dropped in `end()`), the marker payload is carried through
`commandExecutor` → `generationService` → the bus, and `MpiGalleryBlock` hands it to the
card with **every frame**. The card mirrors it instead of latching, so a missed marker
self-heals on the next frame. Playback is paced by the announced `rate` and the ring
sized by the announced `length`.

## Evidence

**1. Durable state, headless — `node --test tests/preview-clip-state.test.cjs`, 6/6 pass.**
Covers: no marker = no clip state; the payload survives repeated reads; a second stage
marker replaces rather than stacks; a marker with an unusable payload still marks the run
as clip-bursting; state dies with the gen and never leaks into the next; a marker for an
unknown gen is ignored.

**2. Card playback in a real renderer** (own isolated instance on :54026, `MpiGalleryGrid`
mounted with a generating placeholder, bursts of 32 distinguishable frames, `<img src>`
sampled every 10ms). This is the decisive one — case A delivers the frames with **no
marker at all**, which is the bug:

| case | delivered | result |
|---|---|---|
| A — race: clip meta on the frames only, marker never seen | 32 frames, rate 24 | **24 painted frames in 1000ms** = 24fps, looping |
| B — `setGenerating(null)` wipe mid-run, then more frames | 32 frames, rate 24 | **16 transitions in 700ms** = ~23fps, recovered |
| C — announced rate honoured | 32 frames, rate 8 | **7 transitions in 1000ms** = 8fps |
| D — no clip meta (SDXL/Wan-style still run) | 32 frames, no clip | **1 transition in 500ms, frozen on frame 31** — still mode intact |
| E — ring sized by announced length | 32 frames, length 16 | 17 distinct frames seen, tail retained |

Pre-fix, A and B are still mode by construction (the latch was never set), which is
exactly what the user saw.

**3. No regressions** — `npm test` 552/552 pass; `npx eslint` clean on all five changed
JS files.

## Not covered

Real H3 GPU run of the fixed build. The failure was an intermittent race the user could
not reproduce on demand (their next single-pass run worked), so a passing generation
would prove nothing a losing one didn't already. The renderer probe reproduces the loss
deterministically instead. Worth a glance at the next H3 single-pass run: previews should
now loop continuously at clip speed (24fps) rather than at 8fps.

Other preview surfaces are unchanged and still paint on arrival: the Flow pane
(`MpiBaseFlow`), the queue-panel thumbnail, and the group-history video viewer (which
skips latents entirely). Only the gallery card has clip playback.
