# Audio cards draw their waveform and scrub on click

## Current State

Project mode: scalable-foundation.

Vision generates music and songs now, and every audio card in the gallery is the same
blank grey 1:1 tile with a centred play icon. No visual identity, no progress, no way to
reach the chorus. The hover contract was built for 2-second SFX and TTS lines, not
3-minute songs.

What is there today:

- `_swapThumbToAudio()` (`js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js:806`)
  builds a `<div class="mpi-group-card__thumb--audio">` holding one centred play/stop icon.
- `_ensureAudioCardControls()` (`MpiGalleryGrid.js:829`) owns the hidden
  `<audio preload=metadata>`: `mouseenter` plays from 0, `mouseleave` pauses +
  `currentTime = 0`, card click toggles play/stop.
- `_getAspectRatio()` (`MpiGalleryGrid.js:1743`) falls through to `1.0` for audio — audio
  has no `pixelDimensions`.
- **Exactly two** routes write an audio sidecar, and both set `metaContent.thumbPath = null`
  by hand: `POST /project-media/:projectId/upload` (`routes/projects.js:1478`) and
  `POST /project/save-generation` (`routes/projects.js:2149`).
  `grep -n "thumbPath = null" routes/projects.js` is the discovery command — it must stay
  at two hits.
- `POST /backfill-media-derivatives` (`routes/projects.js:1594`) skips anything that is not
  `image` or `video`.
- `services/ffmpegThumb.js` owns every derivative: `extractImageThumb`, `extractVideoThumb`,
  `extractVideoProxy`, `writeVideoDerivatives`, `imageThumbPath`, `videoProxyPath`.
- `DERIVATIVE_RE` (`routes/projects.js:101`) matches `<id>.thumb.*` / `<id>.proxy.*` /
  `<id>.splat.*` **by prefix**, so a new `.thumb.` file needs no new GC or delete list.

Design was settled with Fabio in brainstorm. Do not re-litigate it — build it.

## Implementation

- [ ] **Bake the waveform derivative.** Add `extractAudioWaveform(inputPath, outPath, …)`
      to `services/ffmpegThumb.js` beside its siblings and export it: `ffmpeg -i` →
      `aformat=channel_layouts=mono,showwavespic=s=<W>x<H>:colors=white` → `-frames:v 1`
      → `libwebp`, written through `imageThumbPath()` so it lands as `<id>.thumb.webp`
      and inherits `DERIVATIVE_RE`. **White-on-transparent — it is an alpha MASK, not a
      picture**; the card colours it with CSS vars. Bake at 21:9 (≈1260x540 covers the
      widest card at slider level 4; no ladder — a waveform is a flat graphic, one
      rendition is enough, and a second tier would be dead bytes). Wire it into both
      `thumbPath = null` sites and add an `audio` branch to `/backfill-media-derivatives`
      (follow the route's existing patch-on-CHANGED-value contract — see `docs/gallery.md`;
      an item left holding a deleted URL 404s its card until the next project load).
      **Verify:** a Node test on a real audio file asserts the written `.webp` has a
      transparent pixel and an opaque one — precedent `tests/image-thumb-alpha.test.cjs`,
      and the reason is the same trap `docs/gallery.md` already documents: alpha is the
      whole mechanism, so assert on a PIXEL, never on the extension. Confirm lossy
      `-quality 82` does not fringe the mask; fall back to `-lossless 1`, and record the
      measured file size either way.

- [ ] **Geometry and paint.** Branch `_getAspectRatio()` to `21/9` for audio, keyed off the
      same `selected?.type === 'audio' || group.type === 'audio'` test `_render` uses — the
      justified packer handles mixed aspects natively, so nothing else in the layout moves.
      Rebuild `_swapThumbToAudio()`: **remove the centred play/stop icon** (it existed only
      because the tile was empty) and mount two layers, both using the baked WebP as
      `mask-image`, both coloured with CSS vars — **no baked hex**. One `clip-path: inset(…)`
      boundary driven by `timeupdate` splits them: played = filled background tint +
      `--accent-heat` wave; unplayed = `--surface-3` + `--ink-2` wave. **The card BACKGROUND
      fills too, not just the wave strokes** — it has to read as a progress bar with the
      wave sitting inside it. Fabio was explicit about this. Playhead = a 1px rule at the
      boundary; a second, dimmer 1px rule (`--ink-3`) tracks the cursor's x so the user sees
      where a click will land, hidden on `mouseleave`. A mask rather than a pre-coloured
      image buys themes, the fill, and one derivative instead of two — and keeps Web Audio
      decoding out of the renderer, which would re-open the MPI-631/633 memory doctrine.
      **Verify:** desktop spec with a **real** audio fixture — `docs/gallery.md`'s own
      precedent is that made-up media 404s into the missing-media path, which empties the
      thumb, so a fake fixture passes green against a broken build.

- [ ] **Click to seek, and stop opening nothing.** Click anywhere on the card seeks to that
      x and keeps playing; `mouseenter` still plays from 0 and `mouseleave` still stops and
      resets, so `_ensureAudioCardControls`' audio lifecycle is otherwise untouched. A plain
      click currently also emits `open-group` (`MpiGalleryGrid.js:1361`) → History workspace;
      the audio handler's `e.stopPropagation()` (`MpiGalleryGrid.js:857`) does **not** stop
      it, because both listeners sit on the same `cardEl` and `stopPropagation` never stopped
      same-node siblings. **Confirm that live before fixing it** — it is read from the source,
      not a reproduced bug. Suppress it with a type check in the generic click handler, not
      listener-ordering games and not `stopImmediatePropagation`. Shift / ctrl / selection-mode
      clicks must still select. Leave a **short** note there, one line, roughly
      `// Audio cards never open: no audio workspace exists yet. Click = seek.` — Fabio asked
      for a small note, not an essay. It comes out when an audio workspace exists, which is
      not soon. **Verify:** spec asserts a click at 75% width lands `currentTime` at ~75% of
      duration and fires no navigation; ctrl-click still selects.

## Completed

- [ ] Nothing yet.

## Remaining Work

- All three implementation items.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

`npm run test:desktop` for the two specs above, plus the Node alpha test. Then Fabio looks
at it in his own app — the fill, the two rules, and whether a 21:9 card sits right in a
mixed gallery are his eyes, not an assertion. Spin an isolated instance for agent-side
checks (`npm run app:isolated`); never touch `:3000`.

Out of scope, deferred until an audio workspace exists: latch / pause-in-place, a transport
control strip, a play/pause button, a card size floor, a player overlay.

## Preservation Notes

- `docs/gallery.md` gains the audio-card section: the 21:9 aspect branch, the
  mask-not-picture decision and why, the single-rendition call, and the click-never-opens
  suppression with its expiry condition. It is the doc that already owns the thumb ladder
  and the alpha trap.
- `.claude/rules/` only if component wiring changed — ask Fabio first, never edit unprompted.
- Rejected and worth keeping rejected: a latch that survives `mouseleave`. If hover restarts
  at 0 a kept position buys nothing, and clicking a 0px-wide target to get back to the start
  is worse than re-hovering. The waveform is what makes reset-on-leave cheap — 1:40 is now
  one click away.
