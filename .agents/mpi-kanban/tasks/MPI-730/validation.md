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

## Item 3 - click to seek, and the audio card never opens (2026-09-12)

Same spec, two new steps (7 and 8), same real fixture. Run:
`npx playwright test --config=playwright.desktop.config.js tests/desktop/gallery-audio-waveform.spec.js`
-> **1 passed**. Node suite **934/934**. eslint clean. Neighbouring gallery specs
(`gallery-media-release`, `gallery-renditions`, `media-picker-cards`, including its
"an audio tile plays on hover and stops on leave") **11 passed** - removing the click
toggle broke none of the hover lifecycle.

The plan asked for the `open-group` double-fire to be CONFIRMED LIVE rather than read from
source. It was, by falsifying the fix and re-running:

| Break | Result |
|---|---|
| `!_isAudioNow` removed from the generic click handler | FAILS - "an audio card never opens", received **1**. The double-fire is real: one click, one `open-group`, exactly as read from source - the audio handler's `stopPropagation` never stopped a same-node sibling |
| `wf.on('seek', ...)` wiring disabled | FAILS - "a click seeks to where it landed", received 0.026 against 0.75. Without the card consuming it, the click does nothing to the playhead |

### The colour, and the trap under it

`--accent-audio: oklch(0.84 0.11 170)` added to `styles/01_base.css`, mirrored from the
website repo. Fabio chose the single token; the rest of the family is **MPI-736**.

The first run after the repaint FAILED on "the played half tints the card background" with
the played half reading *more rose* than the unplayed one, which looks exactly like "the new
token never loaded". It had loaded. **`color-mix(in oklch, ...)` interpolates the HUE**, and
the surface family sits at 350 against the audio accent's 170 - exactly antipodal - so the mix
walked the hue right past the colour and landed on a yellow. Fixed by mixing in `oklab`,
which has no hue to walk. Vision's rose never showed this because 355 is 5 degrees from the
surface hue, so no existing `color-mix(in oklch, var(--accent-heat) ...)` call site in the app
proves the pattern safe. `--accent-video` (48) and `--accent-prompt` (102) will hit it too -
recorded on MPI-736.

## The end-of-clip bug Fabio found in his own app (2026-09-12)

He clicked the far right of a card: the fill vanished and the card stopped, reading as dead.
Reproduced in the harness, and the first repro was WRONG in a way worth recording.

**The false repro.** The probe clicked the end and saw a no-op - no seek, still paused. That
was the probe's own fault: the step before it ctrl-clicks, which puts the grid in SELECTION
MODE, and a plain click there is a deselect, not a seek. The card was behaving correctly and
the test was measuring itself. Clearing selection first is now part of step 9, with a `cleared`
assertion so it cannot silently regress into measuring nothing again.

**The real defect.** With selection cleared, a click at `W - 2`:

| click | before the fix |
|---|---|
| 20% | `t=2.565`, playing, fill at 22% |
| far right | `t=0`, **paused**, **progress 0**, clip back to `inset(0 100% 0 0)` |

A click in the last pixels is a seek to an end that arrives immediately. `ended` fired, and the
handler reset `currentTime = 0` and emptied the fill - so the card showed an untouched, silent
tile a moment after being clicked. Nothing was broken underneath: no media error, no `--missing`,
mask intact, and a later click still played.

**The fix.** `ended` now HOLDS the fill at the end (`setProgress(1)`) instead of emptying it, so
a finished clip reads as played rather than untouched. `mouseleave` gained `&& !audio.currentTime`
so a card parked at the end still resets on leave - without that, holding the end becomes exactly
the latch this card rejected.

Both halves proven by falsification:

| Break | Result |
|---|---|
| `ended` restored to the old reset-to-0 | FAILS - "a clip that reached its end holds the fill there", received **0** |
| `mouseleave` guard back to `if (audio.paused) return` | FAILS - "leaving a card parked at the end empties the fill", received **1** |

**A flake caught and fixed in the same pass.** Step 7 and step 9 first asserted
`toBeCloseTo(0.75, 1)` on `t / duration`. The clip keeps PLAYING during the settle, so the
playhead had moved ~0.054 by the time it was read - just outside a 0.05 tolerance. It went red
once, green the next run. Both are ranges now (0.70-0.85, 0.35-0.55): wide enough to survive a
slow machine, tight enough to prove the seek landed. A point assertion on a moving playhead is
a flake by construction.

Step 9 order matters and is commented in the spec: the mouseleave check must run while the card
is PARKED AT THE END, before the revive click. Run after playback resumes, it passes against a
deliberately broken guard - it did, the first time.

Final: audio spec **3 consecutive clean runs**, plus `gallery-media-release` and
`media-picker-cards` - **6 passed**. Node suite **935/935**. eslint clean.

## Outstanding

- **User-ux sign-off (Fabio, in his own app) is OWED and is what this card now waits on**: the
  fill, the two rules, and whether a 21:9 card sits right in a mixed gallery. An agent-side
  capture of a mixed gallery at 42% played looked right, but that is not the sign-off.
- The gallery demo page: **asked and answered 2026-09-12 — no**, `MpiWaveform` does not go on
  `js/pages/components.js`. Closed, not outstanding.
- Still not exercised end to end against a running app: no audio item has been imported or
  generated through the three route call sites in a live instance. Do it on
  `npm run app:isolated` — the derivative path and the paint path have only met in a spec.
