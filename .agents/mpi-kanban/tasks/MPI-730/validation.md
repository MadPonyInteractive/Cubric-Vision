# MPI-730 Validation

**Verify mode:** user-ux

## Item 1 — bake the waveform derivative (2026-09-12) — PASSED (machine)

- `node tests/audio-waveform-alpha.test.cjs` → PASSED. Asserts, on a real ffmpeg-decoded
  source: the file lands at `x.thumb.webp` (not the `.jpg` the caller passed, and no JPG
  written alongside), the alpha plane holds both a transparent pixel and an opaque one (the
  mask regression), the baked frame is exactly 1260x540 and 21:9, and the drawn envelope
  both fills over half the card height and varies across it.
- `npm test` → **930/930 pass, 0 fail** (18.0s). Includes the windowsHide scanner, which the
  new `execFileP` call satisfies.
- `npx eslint services/ffmpegThumb.js routes/projects.js tests/audio-waveform-alpha.test.cjs`
  → clean.
- `grep -n "thumbPath = null" routes/projects.js` → **0 hits**, by design: both sites now call
  `writeAudioWaveform()`, which is the one place the value is set. The discovery command for
  an audio sidecar writer is now `grep -n "writeAudioWaveform" routes/projects.js` → **4 hits**
  (the definition + the three call sites). If that ever returns fewer than 4, one was missed.

### Measurements recorded

| Encode | 90s song-shaped source | alpha plane |
|---|---|---|
| `-lossless 1` (shipped) | **2.9 KB** | identical |
| `-quality 82` | 5.4 KB | identical |

Lossless is both smaller and the safer mask — libwebp keeps alpha lossless either way, so the
lossy cost would have been paid in RGB the mask never uses.

| `scale=` | -24 dBFS clip | hot master | song loud/quiet ratio |
|---|---|---|---|
| `lin` (default) | 4% of card height | 65% | 11x |
| `sqrt` (shipped) | **20%** | 80% | 11x |
| `cbrt` | 34% | 86% | 4.9x |

## Item 2 — geometry and paint, as `MpiWaveform` (2026-09-12) — PASSED (machine), user-ux OWED

- `npm run lint` and `npm run lint:components` → clean.
- `npx playwright test tests/desktop/gallery-audio-waveform.spec.js` → **PASSED**. Both halves
  of its fixture are real: the audio is the shipped 11.1s `voices/child_1.opus`, and the mask
  is baked in the spec by the real `extractAudioWaveform()` off that same file — not a
  stand-in still. It pins six things: the thumb is an `MpiWaveform` carrying that mask and the
  icon tile is gone; the card lays out at 21:9; the mask PAINTS; the played half tints the
  card BACKGROUND; a real `<audio>` `timeupdate` moves the fill; a click reports its fraction.
- `npx playwright test gallery-renditions gallery-media-release media-picker-cards` →
  **11/11 pass**. The audio-tile hover spec still holds with the icon removed.
- `node --test tests/audio-waveform-alpha.test.cjs` → still PASSED.

### The pixel assertions were proven able to fail

A green pixel test that cannot fail is worthless, so each was run against a deliberately
broken build:

| Break | Result |
|---|---|
| `mask-image: none` on the layer | FAILS — "the waveform mask must actually paint ink in the middle of the card" |
| played layer background = `--surface-3` (no fill) | FAILS — "the played half tints the card background toward the accent" |
| `clip-path` removed from the CSS | still passes — and correctly so: `_applyProgress()` writes it inline on every mount, so the CSS declaration is only the pre-JS resting state |

### The trap this spec walked into first

The spec measured the waveform at r≈11 against a real r≈140 and read as "the mask never
painted". The mask was fine: a fresh `CUBRIC_E2E_USER_DATA` profile has not acknowledged the
18+ gate, so `_maybeShowMaturityWarning` fires on every run and Continue CHAINS the changelog
(MPI-333) — two `.mpi-modal-backdrop` layers dimming every pixel in the window. **Any desktop
spec that reads pixels must clear the boot modals first**; specs that only assert DOM never
notice, because `evaluate` sees straight through a backdrop. `clearBootModals()` in the spec
does it and asserts zero backdrops remain.

## Outstanding

- **User-ux sign-off (Fabio, in his own app) is OWED and is what this card now waits on**: the
  fill, the two rules, and whether a 21:9 card sits right in a mixed gallery. An agent-side
  capture of a mixed gallery at 42% played looked right, but that is not the sign-off.
- Item 3 (click to seek, suppress `open-group`) not started. The component already emits
  `seek`; nothing consumes it yet.
- The gallery demo page (`js/pages/components.js`) — the component rules require asking the
  user before adding a new component there. Not asked yet.
- Still not exercised end to end against a running app: no audio item has been imported or
  generated through the three route call sites in a live instance. Do it on
  `npm run app:isolated` — the derivative path and the paint path have only met in a spec.
