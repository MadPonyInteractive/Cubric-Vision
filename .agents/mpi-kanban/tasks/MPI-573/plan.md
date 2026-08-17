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
