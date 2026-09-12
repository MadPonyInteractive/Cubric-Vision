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

**Where it stands (2026-09-12):** item 1 is built and machine-verified — every audio sidecar
written from now on carries a baked waveform mask at `<id>.thumb.webp`, and an existing
project backfills one per audio item on its next load. Nothing paints it yet: the card still
renders the blank grey icon tile, so there is no visible change until item 2. Next action is
item 2, and it now has to produce a reusable `MpiWaveform` component because the custom
player Fabio is planning needs the same waveform.

## Implementation

- [x] **Bake the waveform derivative.** Add `extractAudioWaveform(inputPath, outPath, …)`
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

- [ ] **Geometry and paint. Build the paint as a REUSABLE component, not grid-private DOM**
      (Fabio, mid-session 2026-09-12): the default Electron player is being replaced with our
      own, and that player needs this same waveform. So the two mask layers + playhead +
      cursor rule land as a `MpiWaveform` compound through `ComponentFactory.create()`, with
      the card passing `{ mask, progress, duration }` and getting a seek back — the future
      player mounts the same component against a different box. ONE derivative still serves
      both: a 21:9 mask stretched into a short wide transport strip is still the right wave,
      so do NOT bake a second rendition for the player.
      Branch `_getAspectRatio()` to `21/9` for audio, keyed off the
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

- [x] **Bake the waveform derivative** (2026-09-12). `extractAudioWaveform()` +
      `AUDIO_WAVEFORM_PX` in `services/ffmpegThumb.js`; route-local `writeAudioWaveform()`
      in `routes/projects.js` beside `writeImageRenditions` and called from all THREE sites
      (upload :1478 site, save-generation :2149 site, and a new `audio` branch in
      `/backfill-media-derivatives`). `tests/audio-waveform-alpha.test.cjs` asserts the
      `.webp` name, a transparent pixel AND an opaque one, the 21:9 baked size, and that the
      envelope both fills the card and varies. Green; 930/930 node suite green; eslint clean.

## Remaining Work

- Item 2 (geometry and paint, now as a reusable `MpiWaveform` component) and item 3
  (click to seek + suppress open-group).

## Plan Drift

- **2026-09-12 — `scale=lin` would have shipped a flat line.** `showwavespic` defaults to
  linear amplitude, so a clip well below a mastered level draws as a thin band: measured at
  1260x540, a -24 dBFS clip fills 4% of card height on `lin` against 20% on `sqrt`, while a
  hot master only moves 65% -> 80%. `cbrt` lifts quiet content further but crushes a song's
  loud/quiet ratio from 11x to 4.9x. Shipped `scale=sqrt`. This matters because half of what
  this app makes — a TTS line, a foley hit — is not mastered.
- **2026-09-12 — the lossy/lossless question resolved the other way round.** The plan asked
  whether `-quality 82` fringes the mask. It does not: libwebp keeps the alpha plane lossless
  either way (byte-identical read-back). Lossless won on SIZE instead — 2.9 KB vs 5.4 KB on a
  90s song-shaped source — because a waveform is two flat colours.
- **2026-09-12 — Fabio, mid-session: a custom player is coming.** The default Electron player
  is being replaced and will need this same waveform, so item 2's paint must be a reusable
  component rather than DOM built inside `_swapThumbToAudio()`. Folded into item 2 above.
  The derivative itself needed no change — a player reads the same sidecar `thumbPath`.
- **2026-09-12 — test-fixture trap worth keeping.** ffmpeg's `sine` lavfi source peaks at
  about -18 dBFS, so a bare sine fixture draws a thin band and every envelope assertion reads
  as a broken filter when the filter is fine. The test drives it with `volume=` for that
  reason; do not "simplify" the gain away.

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
