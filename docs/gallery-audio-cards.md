# Audio cards — the waveform, and what a click does

Split out of `gallery.md` (MPI-730) because that file was at its 200-line budget. Everything
here is about how an AUDIO item is drawn and driven in the gallery. Hover/scroll playback
mechanics it shares with video cards stay in `gallery.md` § "Hover audio + scroll-stop".

## The derivative is an alpha MASK, not a picture

`extractAudioWaveform()` (`services/ffmpegThumb.js`, beside its image/video siblings) bakes
`aformat=channel_layouts=mono,showwavespic=…:colors=white` to **white-on-transparent WebP**,
written through `imageThumbPath()` so it lands as `<id>.thumb.webp` and inherits
`DERIVATIVE_RE` — no new GC entry, no new delete list.

A mask rather than a coloured image is what buys themes, the progress fill, and **one**
rendition instead of two. It also keeps Web Audio decoding out of the renderer, which would
re-open the MPI-631/633 memory doctrine.

Every number below was measured once, on 2026-09-12, while choosing these settings (MPI-730
Plan Drift); none of them is derivable from the repo, so re-measure rather than trust them if
you are changing the filter.

- **`scale=sqrt`, not the default `lin`.** Linear amplitude draws anything below a mastered
  level as a thin band: at 1260x540 a -24 dBFS clip fills 4% of card height on `lin` against
  20% on `sqrt`, while a hot master only moves 65% → 80%. Half of what this app makes — a TTS
  line, a foley hit — is not mastered. `cbrt` lifts quiet content further but crushes a song's
  loud/quiet ratio from 11x to 4.9x.
- **Lossless, and not for the reason you'd guess.** libwebp keeps the alpha plane lossless
  either way (byte-identical read-back at `-quality 82`), so fringing was never the question.
  Lossless won on SIZE — 2.9 KB vs 5.4 KB on a 90s song — because a waveform is two flat colours.
- **One 21:9 rendition, stretched.** ≈1260x540 covers the widest card at slider level 4, and
  `mask-size: 100% 100%` stretches it into whatever box mounts it. A short wide transport strip
  is still the right wave. **Do not bake a second rendition for the player** (MPI-731).

Three routes write it, and all three must stay wired: the upload site, the save-generation site,
and the `audio` branch of `/backfill-media-derivatives`. None of them touches `thumbPath`
directly - all three call the route-local `writeAudioWaveform()` helper, which is the one place
that assigns it. `grep -n "writeAudioWaveform" routes/projects.js` is the discovery command and
must stay at **four** hits: the definition plus those three call sites.

## The paint is a component, because two surfaces need it

`MpiWaveform` (`js/components/Compounds/MpiWaveform/`) — two full-bleed layers split by one
`clip-path`, each painting a **background fill** as well as the mask on a `::after`, so the
surface reads as a progress bar with the wave inside it rather than as strokes that change
colour. Plus a playhead rule at the boundary and a dimmer cursor rule tracking the pointer, so
you can see where a click will land.

**It owns no `<audio>`.** The consumer drives `setProgress()` from its own `timeupdate` and the
component reports a `seek { fraction, time, modified }` back. That split is the whole reason it
is reusable: the gallery card mounts it as a tile, MPI-731's player mounts the same component
against a wide transport strip. Do not move playback into it.

`modified` is the shift/ctrl/meta state of the originating click. The component cannot know
that a gallery card treats a modified click as *select* rather than *scrub*, and the card's own
handler cannot see the event — hence one boolean on the payload.

The card side: `_getAspectRatio()` branches to **21/9** for audio (the justified packer handles
mixed aspects natively, so nothing else in the layout moves), and `_swapThumbToAudio()` mounts
the component AS the thumb, keeping `mpi-group-card__thumb--audio` and `draggable` so drag-out
still binds. The instance is reused across re-renders so an in-flight playhead survives.

## What a click does, and what it deliberately does not

| gesture | result |
|---|---|
| hover | plays from 0 (volume 0 skips it — see `gallery.md`) |
| leave | stops and rewinds, **even when parked at the end** |
| click | seeks there and keeps playing |
| shift / ctrl / selection-mode click | selects; never scrubs |
| click | **never opens a workspace** |

There is no play/stop toggle and no centred play icon: the fill IS the feedback.

**Click never opens.** A plain click used to also emit `open-group` → History workspace. The
audio handler's `e.stopPropagation()` did **not** stop it, because both listeners sit on the
same `cardEl` and `stopPropagation` never stopped same-node siblings. The suppression is a type
check in the generic click handler (`!_isAudioNow`), not listener ordering and not
`stopImmediatePropagation`. **It comes out when an audio workspace exists**, which is not soon.

**A finished clip HOLDS the fill at the end.** `ended` used to reset `currentTime = 0` and empty
the fill, which made a click in the last few pixels — a seek to an end that arrives immediately —
read as "the card died": clicked, silent, untouched-looking tile. It now holds. The paired half
is `mouseleave`'s `&& !audio.currentTime`: without it, holding the end becomes the latch this
card deliberately rejected. Change one and you must change the other.

Rejected and worth keeping rejected: a latch that survives `mouseleave`. Hover restarts at 0, so
a kept position buys nothing, and clicking a 0px-wide target to get back to the start is worse
than re-hovering.

## The colour, and a `color-mix` trap that reads as the wrong bug

The played layer paints `--accent-audio` (`oklch(0.84 0.11 170)`, greenish-cyan) — **Cubric
Audio's** accent, not Vision's `--accent-heat`. Values are mirrored from the Cubric Studio
(Website) repo and never invented here; MPI-736 owns landing the rest of the family.

**`color-mix(in oklch, …)` interpolates the HUE.** The surface family sits at hue 350 and the
audio accent at 170 — exactly antipodal — so a 22% mix walks the hue right past the colour and
lands on a yellow. The symptom is a played half that looks *more rose* than the unplayed one,
which reads exactly like "the new token never loaded". **Mix in `oklab`.** Vision's rose hid
this for the life of the app (355 is 5° from the surface hue), so no existing
`color-mix(in oklch, var(--accent-heat) …)` call site proves the pattern safe, and
`--accent-video` (48) and `--accent-prompt` (102) will hit it too.

Never reach for `--accent-ok` (`oklch(0.78 0.13 150)`) — close enough to tempt, and it is the
success/ready semantic; reusing it would tie a brand colour to a status.

## Testing an audio card (four traps, all of them cost a run)

`tests/desktop/gallery-audio-waveform.spec.js` reads real pixels off a rendered card.

1. **A boot modal dims every pixel.** A fresh `CUBRIC_E2E_USER_DATA` profile has not
   acknowledged the 18+ gate, and Continue CHAINS the changelog (MPI-333) — two
   `.mpi-modal-backdrop` layers over the whole window. This spec once measured the waveform at
   r≈11 against a real r≈140 and read as "the mask never painted". `clearBootModals()` does it;
   DOM-only specs never notice, because `evaluate` sees straight through a backdrop.
2. **The fixture must be REAL, both halves.** Made-up media 404s into the missing-media path,
   which empties the thumb — so a fake fixture passes green against a broken build. Use
   `voices/child_1.opus` (11.1s), **not** `assets/sounds/notify.wav` (319ms, already ended
   inside a settle). Bake the mask with the real `extractAudioWaveform()`, not a stand-in still:
   the whole mechanism is alpha, so a mask with the wrong polarity is invisible to any assertion
   about the URL.
3. **A step after a ctrl-click measures SELECTION MODE, not your feature.** A plain click there
   is a deselect, not a seek. A probe written this way reported the seek as a no-op and looked
   exactly like a real bug. Clear selection first and assert it cleared.
4. **Never point-assert a moving playhead.** The clip keeps playing during the settle, so
   `t / duration` drifts past a tight `toBeCloseTo` tolerance — red on one run, green the next.
   Use ranges.

ffmpeg's `sine` lavfi source peaks around -18 dBFS, so a bare sine draws a thin band and every
envelope assertion reads as a broken filter when the filter is fine. The Node test
(`tests/audio-waveform-alpha.test.cjs`) drives it with `volume=` for that reason — do not
"simplify" the gain away. It asserts on a PIXEL (one transparent, one opaque), never on the
extension.
