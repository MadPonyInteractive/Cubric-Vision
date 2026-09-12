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

**Where it stands (2026-09-12, after item 2):** items 1 and 2 are built and machine-verified.
An audio card is now a 21:9 tile painting its baked mask, filling toward `--accent-heat` as it
plays, with a playhead rule and a cursor rule. The paint lives in `MpiWaveform`
(`js/components/Compounds/MpiWaveform/`), which owns no `<audio>`: the card drives
`setProgress` from its own `timeupdate` and the component reports a `seek` back, which is what
lets MPI-731's player mount the same component against a wide box.

**Fabio looked at it (2026-09-12) and the behaviour passes: "it works as we wanted it to
work."** The 21:9 card, the wave, the fill and the rules are accepted. He raised exactly two
things, and NEITHER is a defect in what shipped:

1. **Clicking pauses instead of seeking.** That is item 3, which was deliberately not wired —
   `MpiWaveform` already emits `seek { fraction, time }` and nothing consumes it. He expected
   it to be done already. This is now the next action.
2. **The colour is wrong for the product.** The card paints `--accent-heat` (rose), which is
   *Cubric Vision's* accent. Audio has its own: the next release renames the product to Cubric
   Studio and each media type gets its own mascot and its own accent. **Cubric Audio is
   `oklch(0.84 0.11 170)` — the greenish-cyan** (see Plan Drift for where that lives and what
   may NOT be done with it).

Still owed regardless: the gallery demo page (`js/pages/components.js`) has not been asked
about, and the derivative path and the paint path have still only met in a spec, never in a
live app.

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

- [x] **Geometry and paint, as a reusable component** (2026-09-12). `MpiWaveform`
      (`js/components/Compounds/MpiWaveform/`, Compound, ~110 lines) — two full-bleed layers
      split by one `clip-path`, each painting a background fill plus the mask on a `::after`;
      the mask URL rides one custom property on the root so a swap is a single write. Props
      `{ mask, progress, duration }`, API `setMask/setProgress/setDuration/getProgress`, emits
      `seek { fraction, time }`, owns no `<audio>`. Registered in `preloadStyles.js` and
      `types.js`. Card side: `_getAspectRatio()` branches to `21/9` for audio,
      `_swapThumbToAudio(selected)` mounts the component AS the thumb (keeping
      `mpi-group-card__thumb--audio` and `draggable`, so drag-out still binds) and reuses the
      instance across re-renders so an in-flight playhead survives; the centred play/stop icon
      and its CSS are gone; `timeupdate` drives the fill and every stop path empties it.
      `tests/desktop/gallery-audio-waveform.spec.js` reads PIXELS off the rendered card, with
      both the audio and the mask real — and each pixel assertion was proven able to fail
      against a deliberately broken build (see `validation.md`). **Machine-verified only —
      the user-ux sign-off on this item is still owed.**

## Remaining Work

- **Item 3 — click to seek + suppress open-group.** The blocker Fabio actually hit.
  `MpiWaveform` already emits `seek { fraction, time }`; nothing consumes it. So this is
  card-side wiring only, not new paint: the card's own click handler currently toggles
  play/stop and wins, which is why a click reads as "it pauses".
- **Repaint in the Cubric Audio accent** (`oklch(0.84 0.11 170)`), not Vision's rose. Needs a
  token decision first — see the Plan Drift entry; do not hardcode it and do not reach for
  `--accent-ok`.
- Ask about the gallery demo page for `MpiWaveform` (`js/pages/components.js`).
- Run it once in a live app — the bake and the paint have only met in a spec.

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
- **2026-09-12 — the audio card is painted in the WRONG PRODUCT'S accent, and the right one
  already exists.** The plan said `--accent-heat` for the played wave and that is what shipped,
  but `--accent-heat` is *Cubric Vision's* app accent. The rename to Cubric Studio (MPI-708)
  gives each media type its own mascot and its own accent, and Fabio wants the audio card on
  Audio's. **Cubric Audio = `oklch(0.84 0.11 170)`**, a greenish-cyan. Found and confirmed at
  the SOURCE OF TRUTH, not a mirror:
  `c:\AI\Mpi\Cubric Studio (Website)\styles\landing.css:33` (`--audio-accent`), with the full
  family beside it — `--hub-accent oklch(0.78 0.028 80)`, `--vision-accent oklch(0.76 0.17
  355)`, `--prompt-accent oklch(0.88 0.13 102)`, `--video-accent oklch(0.78 0.15 48)`.
  `c:\AI\Mpi\MadPony-Identity\DESIGN.md:360-372` mirrors them and states the rule in as many
  words: *the website repo is the source of truth, mirror values here, never invent them.*
  **Two traps for whoever implements this.** (a) Vision has NO audio-accent token today —
  `styles/01_base.css` carries only `--accent-heat/-frost/-ok/-warn`, so this needs a new token
  and that is a product-wide decision, not a component-local one; do not hardcode the oklch
  into `MpiWaveform.css`, which would be the exact "no baked colour" violation the rules ban.
  (b) `--accent-ok` is `oklch(0.78 0.13 150)` — close enough to be tempting and WRONG; it is
  the success/ready semantic, and reusing it would tie the audio brand colour to status. Ask
  Fabio how the family lands in Vision's tokens before painting anything.
- **2026-09-12 — a boot modal dims every pixel a desktop spec reads.** `gallery-audio-waveform`
  measured the waveform at r≈11 against a real r≈140 and read as "the mask never painted". The
  mask was fine: a fresh `CUBRIC_E2E_USER_DATA` profile has not acknowledged the 18+ gate, so
  `_maybeShowMaturityWarning` fires every run and Continue CHAINS the changelog (MPI-333) —
  two `.mpi-modal-backdrop` layers over the whole window. Any desktop spec reading PIXELS must
  clear them first; the DOM-only specs never noticed because `evaluate` sees through a
  backdrop. Kept as `clearBootModals()` in that spec.
- **2026-09-12 — the CSS `clip-path` on the played layer is only a resting state.** Removing it
  does not fail the spec, because `_applyProgress()` writes it inline on every mount. Left in
  as the pre-JS default: a blank card is a better failure than a full-accent one.
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
