# MPI-573 Validation

## A — mic recorder (PROVEN)

Own instance on `http://127.0.0.1:49497` (`npm run app:isolated`), driven with
playwright-cli. The user's app on :3000 was left alone and answered 200 after the
instance was killed by PID.

| Check | Result |
|---|---|
| Record card renders on an AUDIO slot | 1 card, label `RECORD`, mic glyph, beside the 1 upload card |
| Click → recorder dialog | mounts, CSS loaded, title "Record audio", 88x88 mic |
| Idle-state gating | Accept disabled, Re-record hidden, meter opacity 0 |
| What MediaRecorder actually produces here | `audio/webm;codecs=opus` — the container that would be re-typed as VIDEO. The WAV re-mux is measured, not assumed |
| webm → decode → `encodeWav` on real browser bytes | 10922 B webm → 0.66 s / 2ch / 96 kHz → 253484 B WAV, header valid, duration preserved |
| Upload through the real path | `recording_001.wav`, server returned `duration: 2` for a 2 s take |
| Sidecar on disk | `type: "audio"`, `duration: 2`, `thumbPath: null`, `operation: "recorded"` |
| Full gallery round trip (3 s take) | group `type: audio`, item `type: audio`, `duration: 3`, one `<audio>` element rendered |

### Electron permissions (PROVEN in real Electron)

`tests/desktop/audio-permission.spec.js` — plus a one-off probe that printed what
the calls returned rather than only that they passed:

```
{"mic":"granted","query":"granted",
 "tracks":["Default - SteelSeries Sonar - Microphone (…)"],
 "inputs":[7 LABELLED devices]}
```

Labels appear only when the permission is held, so that line proves the
`setPermissionCheckHandler` half too — the Settings picker will list real device
names, not blank rows.

**Blast radius swept.** Installing a handler inverts Electron's default for every
permission, so the codebase was grepped for the ones the app already used:
`fullscreen` (`MpiVideoControlBar`, `focusModeService`, `MpiModelManager`) and
`pointerLock` (`MpiRadialMenu`). Both are silent when refused; both are in the
allowlist and asserted by the spec. Desktop notifications are main-process
(`new Notification` in `main.js`) and never consult the renderer session.

### Suites

- `npm test` — **680 passed**, 0 failed (672 before, +8 new).
- `npm run test:desktop` — **24 passed**, incl. F11 fullscreen and the settings
  slide-over, which now mounts the new Audio Input section.

## B — `MEDIA_TYPE.AUDIO` (STATIC ONLY — stays open)

No workflow in the repo emits audio as its primary output, so the save path has
no live run available. What IS proven: the enum, and that every image/video-only
branch in `save-generation` excludes audio (asserted in
`tests/audio-media-type.test.cjs`, which also pins the promotion's ORDER relative
to the empty-output cancel guard).

Per the DoD rule an unrun path is not done. **This half stays `validating` until
the first audio Flow exercises it** — the music / TTS / voice-clone Flows Fabio
named on 2026-08-22, none of which are carded yet.

## Entry points — RESOLVED

The plan put the mic in `MpiMediaPicker` on the grounds that the picker is "the
single entry point for filling a slot". That is true for **Flow** slots, and no
Flow declares an audio media group today; the PromptBox's audio slots
(`inputAudio` on the LTX ops) are filled by DRAG only and never open the picker.
So as planned, the recorder would have shipped unreachable.

Fabio chose the **gallery toolbar** (2026-08-22). A clip lands as an ordinary
audio card, which the user drags into an LTX audio slot — the workflow audio
already has. Both entry points funnel through one `recordAudioIntoProject()`, so
a recording is saved identically whichever surface reached it.

Proven on a second instance (`:50545`), gallery workspace:

| Check | Result |
|---|---|
| Record button in the gallery | present, `RECORD`, mic glyph, 97x34 at the grid's top-right |
| Inside the viewport | yes |
| `elementFromPoint` at its centre | hits the button — nothing overlays it |
| Click | recorder dialog opens, one backdrop, idle hint correct |

**Found on the way (pre-existing, left alone):** `.mpi-gallery-block__header`
never reaches the DOM. `MpiGalleryGrid.mount(el, …)` sets `el.innerHTML`, so the
block's own template — crumb, filters and sort slots — is wiped at mount. That is
why the Record bar is its own absolutely-positioned element mounted AFTER the
grid, rather than the `__sort` slot that looks like it was made for it. Worth a
card of its own: three header controls exist in markup and CSS and render
nothing.

## Placement + format pass (PROVEN 2026-08-22)

Own instance on `http://127.0.0.1:53780` (`npm run app:isolated`, killed by the PID
launched). The user's app on :3000 answered 200 afterwards.

`getUserMedia` is refused in a playwright browser, so the mic was replaced with a
synthetic **stereo** `MediaStreamAudioDestinationNode` — the encode is what is under
test, not the capture. Everything downstream of that stub is the real path: the real
button, the real recorder, the real `_toWavFile`, the real upload route.

| Check | Result |
|---|---|
| Record button home | `.mpi-gallery-grid__record-slot` in `zone--center`, after the volume |
| Old floating bar | `.mpi-gallery-block__actions` — gone from the DOM and from the CSS |
| Geometry | Record x 603–700; volume ends 591; filter zone starts 866 |
| Overlap with the filter row | **none** (rect test, not eyeballed) |
| Overlap with the card grid | none — inside the 54 px `__tabs` row |
| Click → recorder | opens; 2 s take; DISCARD / RE-RECORD / ACCEPT; Accept enabled only in review |
| Accept → gallery | group `type: audio`, item `type: audio`, `duration: 2.16` |
| **Page AudioContext rate** | **96000** — the same rate that produced the old oversized file |
| **WAV header on disk** | **RIFF/WAVE, 1 channel, 48000 Hz, 16-bit, 94 KB/s** |
| File size | 207,404 B for 2.16 s. At the old 96 kHz stereo it would have been 829,440 B — **exactly 4x** |

The old path's 96 kHz was an UPSAMPLE: opus always encodes at 48 kHz, and decoding it
through a live `AudioContext` at the hardware rate resampled it up. No information was
lost by dropping back to 48 kHz — there was none there to lose. Stereo to mono is a real
downmix, and a mic is one capsule.

### Suites

- `npm test` — **680 passed**, 0 failed. `encodeWav`'s own tests still assert a 2-channel
  48 kHz buffer and still pass: the encoder is unchanged, only what is handed to it moved.
- `npm run test:desktop` — **25 passed**, incl. the gallery workspace mount.

### Left behind

A throwaway project at `Documents\Cubric Vision\Projects\Untitled` ("Untitled Project",
~200 KB, one recording) — created for this check. The recursive delete was blocked by the
shell guard, so it needs removing by hand.

## MpiLevelMeter + the mic test (PROVEN 2026-08-22)

Own instance on `http://127.0.0.1:56433`, killed by PID; the user's :3000 answered 200
after. Mic stubbed with a synthetic tone at a KNOWN level, which is what makes the dB
numbers below assertions rather than impressions: a 0.25 linear source is -12.04 dBFS,
and the meter must say so.

### The component

| Check | Result |
|---|---|
| Zone gradient (min -70, warn -12, danger 0, max +12) | `ok 0-70.73%`, `warn 70.73-85.37%`, `heat 85.37-100%` — the arithmetic, not a guess |
| `setDb(-70 / -12 / 0 / +6 / +12)` | clip `100% / 29.27% / 14.63% / 7.32% / 0%` hidden |
| Readout | `-∞ dB / -12.0 dB / 0.0 dB / +6.0 dB / +12.0 dB` |
| Over-range `setDb(99)` | bar pins at full, readout still reads `+99.0 dB` (honest, not clamped) |
| Silence | `-∞ dB`, bar empty |

### Settings — Test microphone

| Check | Result |
|---|---|
| Button | `TEST`, toggling. **First build shipped `text:` and rendered a BLANK button** — icon-mode MpiButton takes `label:`. Caught here, fixed |
| Test on, 0.25 source, unity gain | meter reads **-12.0 dB** — matches the source exactly |
| Track while testing | `live` |
| Toggle off | meter to `-∞`, button `is-active` cleared, track **`ended`** |
| Toggle on again | second track opens and meters (a fresh stream, not the dead one) |
| **Close the panel mid-test** | panel gone, **both tracks `ended`** — the mic does not survive the slide-over |

### The gain chain, measured end to end

| Slider | Readout | Meter | Expected |
|---|---|---|---|
| 0 dB | `0.0 dB` | -12.0 dB | source level |
| +6 dB | `+6.0 dB` | **-6.0 dB** | +6 |
| -6 dB | `-6.0 dB` | **-18.0 dB** | -6 |

Stored value is still the LINEAR multiplier every consumer already reads: `0.5011872`
after the -6 dB commit (10^(-6/20)). Reopening the panel restores slider `-6` and readout
`-6.0 dB`, so the dB↔linear round trip through storage holds.

Gain applies on `input`, not `change`: dragging the slider moves the live meter as you
drag, which is the entire point of pairing them.

### Recorder

| Check | Result |
|---|---|
| Uses the component | yes; `.mpi-audio-recorder__meter-fill` gone from DOM and CSS |
| Numeric readout | suppressed (`showValue: false`) — the recorder wants a glance, not a number |
| Idle / recording wrapper opacity | `0` / `1` (the reveal still works) |
| 0.5 linear source while recording | 78% filled = **-6 dB**, matching the source |
| Discard | recorder gone, mic `ended` |

### Suites

- `npm test` — **680 passed**, 0 failed.
- `npm run test:desktop` — **25 passed**, incl. "settings slide-over mounts and closes",
  which now mounts the meter and the test button.
- `npx eslint` on all three components — clean.

## Dev component gallery card (PROVEN 2026-08-22)

`templates/tpl-components.html` (Primitives section) + `js/pages/components.js`. Three
meters off ONE driving slider, because the zones cannot otherwise be inspected: a real
meter only enters the rose band when you are clipping, and nobody should have to
reproduce that to check a colour.

**How to reach it:** the dev radial menu -> Components. It is gated on `dev_mode`
(true for any source run), NOT on `test_styles` — that flag only drives dev page-restore
persistence, so it does NOT need flipping and was left `false`.

| Check | Result |
|---|---|
| Card in the Primitives section | present, `data-name="mpilevelmeter"` |
| Meters mounted | 3 — vertical, horizontal, horizontal with `showValue:false` |
| Vertical track | 8x170 px inside a 200 px box — fills its container |
| Horizontal track | 306x8 px |
| Driving slider | -70..+12, step 0.5 |
| Drag to -30 / -6 / +6 | all three track together; readout `-30.0` / `-6.0` / `+6.0 dB` |
| Vertical fill direction | clips from the TOP (`inset(7.32% 0 0)`) — fills upward from silence |
| **Zone gradient, computed** | `oklch(0.78 0.13 150)` 0-70.73%, `oklch(0.78 0.14 60)` 70.73-85.37%, `oklch(0.76 0.17 355)` 85.37-100% — green/amber/rose resolve from the tokens, nothing hardcoded |
| Dim / lit opacity | `0.18` / `1` |

Screenshot at -4 dB confirms it reads correctly: green body, amber cap, the dim rose
tail visible ahead of the level so the user can see where red begins before reaching it.

**Fixed while building it:** the vertical variant was `flex-direction: column-reverse`,
which puts the readout ABOVE the bar, and had no height, so it collapsed to the track's
6rem minimum instead of filling its container. Now `column` + `height: 100%` — the
consumer sizes it, which is the only thing a consumer may do to a Primitive.

`npm test` — **680 passed** after the change.

### Width jitter — FIXED (2026-08-22, Fabio)

The vertical readout carried `min-width: 0`, so its container resized between
`-4.0 dB` and `-30.0 dB` — a column that twitches on every sample. Both orientations
now hold a fixed 4.5rem (widest string the scale can make, `-70.0 dB`) plus
`tabular-nums`. Measured across `-inf / -4.0 / -30.0 / 0.0 / +12.0 / -6.5`: vertical
root pinned at **72 px**, horizontal track at **264.39 px**, one distinct value each.
