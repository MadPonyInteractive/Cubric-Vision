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

## OPEN — the entry point is not reachable yet

The plan put the mic in `MpiMediaPicker` on the grounds that the picker is "the
single entry point for filling a slot". That is true for **Flow** slots, and no
Flow declares an audio media group today. The PromptBox's audio slots
(`inputAudio` on the LTX ops) are filled by DRAG only — the box has no
click-to-add affordance and never opens the picker.

So the recorder is built, wired and proven, but a user cannot reach it yet. A
second entry point on a surface that exists today is needed, and where it goes is
Fabio's call — raised with him 2026-08-22.
