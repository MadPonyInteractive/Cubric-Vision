# Handoff — MPI-283 Frame-accurate video player (mediabunny hybrid)

**Session date:** 2026-07-14 · **Branch:** 1.2.0 · **Resume:** `/mpi-continue MPI-283`

## Recap — what happened this session

User reported a video player bug on a **combined** clip (`combined_002/003` in project
`Boogu image edit`): playhead stuck at frame 9, frame repeats, sound machine-gunning,
"23.6 FPS" on a 24fps combine. Investigation split into two root causes:

### 1. Concat fps corruption — FIXED + COMMITTED (`03a5bc8e`)
- Sources were clean (both source clips exactly 24/1 fps, frame-accurate).
- The **combine** used ffmpeg demuxer `-c copy`, which sums each clip's **container**
  duration (incl. mp4 edit-list/trailing offset), not frame-accurate duration →
  output `r_frame_rate = 283/12 ≈ 23.58` fps, 20 frames over 0.864s (should be 0.834s).
- Fix: `services/videoConcat.js` gained a `forceReencode` opt; `routes/videoConcat.js`
  `/combine-videos` passes `forceReencode: true` → routes combine through the filter
  path (`fps=N` + `setpts`) → clean CFR 24fps. **Verified by direct service test**
  (24/1, 20 frames, CFR YES). Changelog entry added to `docs/releases/UNRELEASED.md`.

### 2. Player frame-stepping / loop / trim bugs — ROOT CAUSE FOUND, fix = MPI-283
Even after the fps fix, symptoms persisted: no-movement on step (0→1, 9→10, 18→19),
sub-range loop freeze (in≠0 AND out≠end), out-handle can't reach true end.

**Root cause (confirmed by a 9-agent research sweep, 4 independent angles):**
`<video>.currentTime` is **NOT frame-accurate by spec**:
- Chromium drives `currentTime` from the **audio clock**, not video PTS.
- float→int PTS truncation → **~0.5% residual drift** — the exact 24-vs-23.98 mismatch.
- No framerate / frame-number API — everything was reverse-engineering a hidden number.

I proved on paper AND via ffprobe/frame-hash that the file is perfect (20 unique frames,
exact `n/24` PTS) and my step math "should" work — but it doesn't, because the browser
snaps `currentTime` its own way. **Unwinnable at the currentTime layer.** Confirmed the
existing NTSC-drift comments in the code describe a `frameCount/duration` measure that was
stubbed out — but that measure is ALSO wrong here (container dur has trailing padding, so
fc/dur=23.98 while real fps=24). Neither declared nor measured fps is right; the browser
just won't cooperate.

### Reverted (this session's unproven guesses — do NOT reintroduce)
- `_effectiveFps = fc/dur` in `MpiVideoSurface.js` + `MpiVideoControlBar.js` → back to `_fps`.
- `_wrapLatch` + boundary `_play()` in `MpiVideoControlBar.js` → removed.
- **KEPT:** `MpiTrimBar.js` `_snap` end-stick (out reaches exact duration) — sound, independent.

## The plan (see `plan.md` — full detail there)

**Hybrid, WebCodecs via mediabunny.** Native `<video>` for PLAY; `mediabunny` `CanvasSink`
draws the EXACT decoded frame on a canvas overlay when PAUSED/frame-stepping/trim-playhead.
Delete all seek-math.

### Why mediabunny (decided, don't re-litigate)
1.33M dl/wk, MPL-2.0, zero runtime deps, ~70kB gzip tree-shaken, WebCodecs-native
(Chromium/Electron native, no WASM), Remotion deprecated its own libs for it + sponsors
$1k/mo. v1.50.8 (2026-07-09).

### Verified API to build against
```js
import { Input, ALL_FORMATS, UrlSource, BlobSource, CanvasSink } from 'mediabunny';
const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
const track = await input.getPrimaryVideoTrack();
const sink  = new CanvasSink(track);           // optional { width, height }
const wrapped = await sink.getCanvas(n / fps); // -> { canvas } | null, EXACT frame
// CanvasSink manages VideoFrame.close() internally — no manual GPU cleanup.
```
Track metadata: `await track.computePacketStats()` → `.packetCount` (frames),
`.averagePacketRate` (fps); `await track.computeDuration()`.

### Caveats
- No built-in `.seek()` yet (mediabunny #303) — irrelevant for our short clips (tiny GOP,
  decode-from-keyframe near-instant).
- Our media serves via `/project-file?path=...` (same-origin). Try `UrlSource` first; if
  range requests misbehave in Electron, `fetch()` → `BlobSource`.
- If ever using raw `VideoSampleSink` instead of `CanvasSink`, MUST `frame.close()` every
  `VideoFrame` (GPU leak). Prefer `CanvasSink`.

## Next step (start here)

**Step 1 of plan:** `npm i mediabunny`, then a standalone smoke test — load
`combined_003.mp4` via `Input`+`CanvasSink`, call `getCanvas(n/fps)` for n=0..19, assert 20
DISTINCT canvases (hash them). Test file:
`C:\Users\Fabio\Documents\Cubric Vision\Projects\Boogu image edit\Media\combined_003.mp4`
(20 frames, 24fps, 320×640, has audio). Verify exact + distinct BEFORE touching the real
player. Then steps 2–6 (frame-sink service → Surface canvas overlay → ControlBar →
TrimBar → cleanup+docs).

## Key files
- `js/components/Compounds/MpiVideoSurface/MpiVideoSurface.js` — `<video>` + `frameStep` (delete seek-math)
- `js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.js` — playhead/trim/loop (delete `_handleRangeBoundary` dance)
- `js/components/Compounds/MpiTrimBar/MpiTrimBar.js` — trim handles (keep `_snap` fix)
- `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js` — `loadVideo(url, meta)` wires fps/frameCount
- `services/videoConcat.js` + `routes/videoConcat.js` — concat (already fixed)
- Component rules: `.claude/rules/components.md`; doc-drift rule → ASK before editing `.claude/rules/`.

## Resume paste-block (copy verbatim into fresh session)

```
/mpi-continue MPI-283
```
