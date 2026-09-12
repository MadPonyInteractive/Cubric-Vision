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

## Outstanding

- Items 2 and 3 not started. No visible change in the app yet — nothing paints the mask.
- User-ux sign-off (Fabio, in his own app) is owed once item 2 lands: the fill, the two rules,
  and whether a 21:9 card sits right in a mixed gallery.
- Not yet exercised end to end against a running app: the three route call sites are wired and
  lint/test clean, but no audio item has been imported or generated through them in a live
  instance. Do that on `npm run app:isolated` during item 2, when there is something to see.
