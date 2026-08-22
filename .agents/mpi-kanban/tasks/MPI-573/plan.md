# Audio in Vision — mic recorder + audio output type

## Context

Cubric Audio was scoped as a separate Electron app (own tech stack, own engine
decision). Its open decision — *"TTS engine: ComfyUI vs straight Python"* — has
effectively resolved to **ComfyUI**, which removes the reason for a second app:
a standalone Audio app would have to rebuild Vision's engine provisioning,
model registry, download manager, RunPod remote, injection layer, queue and
gallery, in a different tech stack.

Meanwhile good audio models (music, SFX, voice-clone TTS) exist in ComfyUI
today and Vision cannot use any of them — useful audio for video is passing us
by while Audio-the-app is not close to starting.

**Decision:** audio generation lands in Vision as **Flows**, not as a new
workspace and not as a separate app. A DAW surface (tracks, mixer, VST) is the
only thing that would still justify a separate app or workspace, and that call
is deferred. `c:\AI\Mpi\Cubric-Audio\` stays as the placeholder for it.

Vision already treats audio as first-class on the way **in** — audio gallery
cards with hover playback (MPI-132), audio items in `project.json`, audio media
slots, `MpiLoadAudioFromPath`, an audio filter tab in the media picker. What is
missing is the way **out** (an audio-typed generation result) and any way to
capture the user's voice.

**This card is the enabling layer only.** Flow cards come later, after bench
research settles which workflows are worth shipping.

---

## Scope — one card, two halves

### A. Mic recorder popup

A modal with one big mic button: click to record, click again to stop, then
Accept → the clip lands in the gallery as a normal audio card, reusable
anywhere (LTX reference audio, any future audio slot).

1. **`js/components/Compounds/MpiAudioRecorder/`** (`.js` + `.css`) —
   `ComponentFactory.create()` over the `MpiModal` primitive.
   Exports a promise-returning helper `showAudioRecorder()` → `Promise<File|null>`,
   mirroring `showLicenceGate()` in
   [MpiLicenceGate.js:217](js/components/Compounds/MpiLicenceGate/MpiLicenceGate.js#L217).
   Three states: **idle** (big mic) → **recording** (elapsed timer + live level
   meter) → **review** (playback, Accept / Re-record / Discard).
   `getUserMedia({ audio: { deviceId } })` + `MediaRecorder` → Blob → `File`.
2. Register the CSS in [preloadStyles.js](js/shell/preloadStyles.js); document
   props in [types.js](js/components/types.js).
3. Add a **`mic`** icon to [icons.js](js/utils/icons.js) — only `stop` exists
   (line 45). Never inline SVG.
4. **`main.js`** — `session.defaultSession.setPermissionRequestHandler` allowing
   the `media` permission, alongside the existing session wiring
   ([main.js:350](main.js#L350)). **Not optional:** without it `getUserMedia`
   fails silently in Electron and the recorder looks broken.
5. **Save path — reuse, write nothing new.** The returned `File` goes through the
   existing import route `POST /project-media/:projectId/upload`
   ([projects.js:1363](routes/projects.js#L1363)) — the same one drag-drop uses.
   It already detects audio by extension ([projects.js:90](routes/projects.js#L90))
   and writes a `type: 'audio'` item ([projects.js:1394](routes/projects.js#L1394)).
6. **Entry point now:** a mic button in
   [MpiMediaPicker](js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js)
   when `mediaType === 'audio'`, beside the existing upload card. The picker is
   already *"the single entry point for filling a slot"*, so one wiring serves
   every audio slot. The exported helper means any future surface can call it.

### B. `MEDIA_TYPE.AUDIO` as a generation output type

Nothing can emit audio today: the enum is frozen to `IMAGE`/`VIDEO`, and a
collected `Output_Audio` URL is only ever muxed into a video.

1. **[commandRegistry.js:16](js/data/commandRegistry.js#L16)** — add
   `AUDIO: 'audio'`; widen the `mediaType` jsdoc unions.
2. **[commandExecutor.js:1745-1749](js/services/commandExecutor.js#L1745-L1749)** —
   `audioOutputUrl` is already collected. When the op's output `mediaType` is
   `audio`, pass it as the **primary** output instead of a video side-channel.
3. **[projects.js:1748](routes/projects.js#L1748)** (`/project/save-generation`) —
   audio-primary branch: download `audioViewUrl` as the item's own file and skip
   the video download + mux at [1825](routes/projects.js#L1825).
4. **Duration probe** — add a `probeAudio` export beside `probeVideo` in
   [services/ffprobeVideo.js](services/ffprobeVideo.js) (same file, ffprobe is
   already wired). [projects.js:1426-1429](routes/projects.js#L1426) names this
   gap explicitly. Serves recorded clips too, so a card can show length.
5. **[flowsRegistry.js](js/data/flowsRegistry.js)** — widen the `mediaType`
   jsdoc union so a future `FlowDef` can declare `'audio'`.

### C. Settings — Audio Input

- New `<section>` in
  [MpiSettings.js](js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js#L42):
  input-device `<select>` (`enumerateDevices`, kind `audioinput`) + input gain slider.
- Two keys in [storageKeys.js](js/core/storageKeys.js): `AUDIO_INPUT_DEVICE`,
  `AUDIO_INPUT_GAIN`.
- **The level meter lives in the recorder, not in settings** — that is where it
  is actually read.

---

## Explicitly out of scope

- **Flows** (voice-clone TTS, text→music, text→SFX) — separate `/mpi-add-flow`
  cards, after bench research.
- **Speaker output device selection** — not asked for; a gallery volume slider
  already exists.
- **DAW** — deferred. Add a short note to `c:\AI\Mpi\Cubric-Audio\README.md`
  recording this decision and https://github.com/MadPonyInteractive/daw-tools as
  future source material.
- **Model licences** (MiniMax territory restrictions) — a per-model concern
  handled by the existing `MpiLicenceGate` (MPI-451), not this card.

## Follow-ups to raise at close-out

- `project_product_scope` memory says *"standalone audio-creation tools = NOT
  Vision"*. That flips once a Flow emits audio; heal it then, not now.
- No new operation is registered by this card, so no op-registry entry and no
  version bump is implied by `MEDIA_TYPE.AUDIO` alone.

---

## Current State (2026-08-22, after the placement + format pass)

**A and C are built, verified and committed** — `9cf4fc90`, `a7bc9de5`. Evidence
table in `validation.md`; do not re-derive it.

**Both of Fabio's post-build notes are now closed** — the Record button moved to
the grid toolbar beside the volume, and the recording rate dropped to 48 kHz mono.
Evidence in `validation.md` § "Placement + format pass". `npm test` 680 ✓,
`npm run test:desktop` 25 ✓.

**B is static-only and stays open.** No workflow emits audio as its primary
output, so the save path has never run. Unblocks with the first audio Flow.

**A third pass landed the same day: `MpiLevelMeter` + a testable Audio Input
section.** Fabio, on seeing the shipped settings: an input-gain slider with no way
to test it and no number is a guess. Evidence in `validation.md` § "MpiLevelMeter +
the mic test".

- **New Primitive `js/components/Primitives/MpiLevelMeter/`** — horizontal or
  vertical, dBFS scale with fixed colour zones and a numeric readout. Built as a
  Primitive rather than inline in Settings because the Flows Fabio is heading for
  (TTS, voice clone, music) all need a meter, and a meter that reads differently
  where you set the gain than where you record is worse than none.
- **Zones: green < -12, amber -12…0, rose ≥ 0, top of scale +12.** Fabio suggested
  amber 0…+6 and rose +6…+12; moved down one step because **0 dBFS is the digital
  clip point** — amber starting at 0 would paint "already distorting" as the safe
  colour. The +12 headroom is kept, and is what shows HOW far past.
- **`getFloatTimeDomainData`, not Byte.** Byte data clamps at ±1, so a boosted
  signal reads exactly 0.0 dB and the rose zone is unreachable — the meter would
  have silently lied about the one case it exists for.
- **The gain slider is now in dB (-6…+12) with a visible readout**, stored value
  still the linear multiplier every consumer already reads. Applies on `input` so
  dragging moves the live meter.
- **Test microphone plate** — a toggling button running the recorder's own graph.
  Nothing connects to the destination: monitoring an open mic through the speakers
  is a feedback loop, and "am I being heard, and how hot" needs no sound.
- **Dev component gallery card** (`templates/tpl-components.html` Primitives section
  + `js/pages/components.js`) — both orientations plus the no-readout variant, off
  one driving slider. A real meter only reaches the rose band while clipping, so
  without a driver the zones cannot be inspected without deliberately distorting.
  Reached through the dev radial menu; gated on `dev_mode`, NOT `test_styles`
  (that flag only drives dev page-restore, so it stays `false`).

**Meter defect found by Fabio and fixed:** the vertical readout carried
`min-width: 0`, so the whole column resized between `-4.0 dB` and `-30.0 dB` — a
strip that twitches on every sample. Both orientations now hold a fixed 4.5rem plus
`tabular-nums`; measured constant across the full scale.

**Fader vs meter — the distinction that came out of it (2026-08-22).** Fabio asked
whether green should run to 0 with amber only above it. That is the FADER scale
(0 dB = unity, the neutral middle), not the METER scale (0 dBFS = full scale, the
ceiling). Green-to-zero on a level meter would mean no warning until the signal is
already clipped. Zones stay as built. What the exchange really surfaced is that
**`MpiFader` does not exist** — and it is what Fabio's planned vocals+foley mixing
Flow needs, two of them, beside two meters. Decided: build the **fader Primitive**
next (dB scale, unity detent, snap tolerance), and let the channel-strip Compound
be shaped by the Flow rather than guessed now. `MpiProgressBar` has no snap and no
dB semantics; adding them there would need a sweep of every consumer in the app.

**Next action:** `MpiFader` in a fresh session (Fabio, 2026-08-22). On MPI-573
itself, nothing but B, which is a Flow away.

## Plan Drift

1. **The recorder re-muxes to WAV** (`js/utils/wavEncoder.js`) — not in the plan.
   MediaRecorder here yields `audio/webm;codecs=opus` (measured), and `.webm` is
   VIDEO by extension in five server lists, so a native-container recording would
   be re-typed to video on the first project reload. **Fabio has questioned WAV —
   see the open question below. This is the first thing to settle next session.**
2. **The permission handler needed two more entries.** Installing one at all
   inverts Electron's default; `fullscreen` and `pointerLock` were riding that
   default and both fail silently. Swept and allowlisted.
3. **The planned entry point was unreachable** (no Flow has an audio slot; the
   PromptBox is drag-only). Fabio chose the gallery. Both entry points now share
   `recordAudioIntoProject()`.
4. **The gallery Record button is in the wrong place** — fixed, see below.
5. **The 96 kHz recording was an UPSAMPLE, not a capture** (2026-08-22). Opus always
   encodes at 48 kHz, so the webm MediaRecorder produced was 48 kHz whatever the mic
   ran at. `_toWavFile` then decoded it through a live `new AudioContext()`, which
   runs at the HARDWARE rate — 96 kHz on this machine — so `decodeAudioData`
   resampled the 48 kHz opus UP to 96 kHz and `encodeWav` wrote it. Four times the
   bytes carrying no extra information. Measured again in the browser this session:
   the page's default AudioContext also reports 96000, and a 2.16 s take that would
   have been 829,440 B came out 207,404 B. **The size complaint was never about the
   container.**

## Settled 2026-08-22 — both of Fabio's notes are closed

### 1. Move the Record button — DONE

Landed **next to the volume**, Fabio's recommended home. `MpiGalleryGrid` mounts the
button into a new `__record-slot` in `zone--center` after `__volume-wrap` and emits
`'record'`; `MpiGalleryBlock` handles that emit and still owns `recordAudioIntoProject`.
The grid owning the button and the block owning the action is the shape the other 20
`grid.on(...)` handlers already use — the floating bar was the anomaly.
`.mpi-gallery-block__actions` is deleted from both block files, and the `mountButton` /
`on` imports it orphaned went with it (`ce` was dead BEFORE MPI-573 and is left as it
was — do not "fix" it here).

Measured in the running app: Record spans x 603–700, the volume ends at 591, the filter
zone starts at 866. No overlap with the filters or the grid.

**Not chosen: the FLOWS top bar.** It is app chrome, so Record would render outside the
gallery where there is no project media context to record into.

### 2. WAV vs a compressed format — RESOLVED, and the premise was wrong

**Kept WAV. Cut the rate instead.** `_toWavFile` now decodes through
`OfflineAudioContext(1, …, 48000)` and renders mono: `decodeAudioData` resamples to the
context's rate, rendering into a 1-channel destination downmixes. Five lines, no new
dependency, no container change, so the `.webm`-retype bug stays fixed.

**48 kHz / 1 ch / 16-bit — 94 KB/s, 5.5 MB/min. Verified off the RIFF header of a real
recording, not computed.** Was 96 kHz stereo = 22 MB/min. **4x, losslessly.**

Why not MP3/m4a, so this is not re-litigated:

- **The RAM argument does not hold.** ComfyUI decodes audio to float32 PCM before any
  node sees it, so a reference clip costs the same RAM whatever the container — MP3
  slightly more, for the decoder. Compression only buys disk and the per-generation Pod
  upload (`_uploadRemoteMedia`).
- A 10 s voice-clone reference is now ~960 KB. MP3 would make it ~160 KB and cost a new
  dependency (Chromium's MediaRecorder cannot emit MP3) plus a lossy round trip in front
  of a voice clone — the one workflow the recorder exists for.
- `.m4a`/AAC is the zero-dependency compressed route if it is ever wanted: check
  `MediaRecorder.isTypeSupported('audio/mp4')` first. Not chased; 960 KB is not a problem.
- **No settings toggle.** Nobody has measured a case where lossy wins, and the graphs trim
  the reference anyway (`TrimAudioDuration` in the foley flow). Add one when a real
  workflow asks for it.

---

## Historic — the note as Fabio raised it

### 1. Move the Record button (Fabio, 2026-08-22, with a screenshot)

It currently overlaps the filter row (`ALL / IMAGES / VIDEOS / AUDIO / PREVIEWS /
FAVS`) at the grid's top-right. Fabio: *"needs to go next to the flows. I think
either there or next to the volume."*

The visible toolbar is **`MpiGalleryGrid`'s `__tabs` row**, not
`MpiGalleryBlock`'s header — that one never reaches the DOM at all, because
`MpiGalleryGrid.mount(el, …)` sets `el.innerHTML` and wipes the block's template
(its crumb / filters / sort slots are dead markup with live CSS; pre-existing,
worth its own card). That mistake is what put the button in a floating bar.

Two candidate homes:

- **Next to the volume** — `MpiGalleryGrid.js:117-122`,
  `.mpi-gallery-grid__zone--center`, after `__volume-wrap`. **Recommended:** it is
  already the media-controls zone, it has room, and it cannot collide with the
  filters. Costs a claim on the shared `MpiGalleryGrid`.
- **Next to FLOWS** — the app top bar, `js/shell/projectUI.js:81` /
  `js/shell/navigation.js:340`. App-level chrome, so Record would show outside the
  gallery too, which may or may not be wanted.

Then delete `.mpi-gallery-block__actions` (JS + CSS) — it exists only for the
placement being replaced.

### 2. WAV vs a compressed format (Fabio, 2026-08-22)

*"I'm not entirely sure that is the best format for the workflows at hand,
considering it's a lot bigger than an MP3. That could influence timing for voice
clone workflows and for video workflows that use audio as reference."*

What is already known, so next session does not re-derive it:

- **Size:** WAV 48 kHz/16-bit mono ≈ 96 KB/s (5.8 MB/min). MP3 128 kbps ≈ 16 KB/s.
  ~6x. The upload is base64, which inflates another 33% on the wire.
- **The constraint that forced the change of container was the EXTENSION, not the
  codec.** `mp3`, `m4a`, `ogg`, `flac`, `aac`, `opus` are all in the server audio
  lists — any of them is equally safe from the video-retype bug. Only `webm` is not.
- **`.m4a` is the zero-dependency compressed option**: check
  `MediaRecorder.isTypeSupported('audio/mp4')` in this Electron — if true, AAC comes
  out natively with no transcode and no encoder library. Verify before designing on it.
- **MP3 needs a new dependency** (Chromium's MediaRecorder cannot emit it; lamejs
  or equivalent). Weigh against the ladder.
- **Argument for keeping WAV:** ComfyUI audio loaders take it without a transcode,
  and a lossy round-trip before a voice clone costs quality in exactly the workflow
  Fabio named. Reference clips are also short — seconds, not minutes.
- **Not yet measured:** whether decode time on the Pod actually differs enough to
  matter. That is the number that should decide this, and nobody has it.

If the format changes, the pieces to touch are `wavEncoder.js`, `_toWavFile` in
the recorder, and the two format assertions in `tests/audio-media-type.test.cjs`.

---

## Verification

Own instance only — never the user's `:3000`:
`CUBRIC_MODELS_ROOT="G:/CubricModels" npm run app:isolated`, drive the printed
`READY <url>`.

**A — mic (fully provable now):**
1. Open a project → any audio slot → media picker → mic button → recorder opens.
2. Click to record ~3s, click to stop, play back, Accept.
3. A new **audio card appears in the gallery**; hover plays it; the card shows a
   duration (proves `probeAudio`).
4. Re-open the picker: the recording is listed and fills the slot.
5. Cold-profile check that the permission handler fires — no silent
   `getUserMedia` failure. Grep `%APPDATA%\Cubric Vision\logs\app.log` by
   category, never whole.
6. `npm test` + `npm run test:desktop` (both gate the release).

**B — audio output type (cannot be live-proven yet):**
No workflow in the repo emits audio as its primary output, so the save path has
no live run available. Prove statically (`node --check`, unit/injection level)
and **leave this half `validating`** until the first audio Flow exercises it —
per the root-cause/DoD rule, an unrun path is not "done".
