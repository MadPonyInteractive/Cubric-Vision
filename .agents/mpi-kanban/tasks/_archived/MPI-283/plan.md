# MPI-283 — Frame-accurate video player via mediabunny (hybrid)

## Problem (research-confirmed)

`<video>.currentTime` is not frame-accurate **by spec**:
- Chromium drives `currentTime` from the **audio clock**, not the video PTS.
- float→integer PTS conversion truncates → **~0.5% residual drift** (the exact 24-vs-23.98 mismatch behind every symptom this session).
- No framerate/frame-number API — everything was reverse-engineering a number the browser refuses to expose.

Symptoms it caused: stuck playhead, no-movement-on-step, sub-range loop freeze, out-point can't reach the true end. All unfixable at the `currentTime` layer.

## Fix: hybrid, WebCodecs via mediabunny

- **Play** → keep native `<video>` (continuous playback + audio "just works").
- **Paused / frame-step / trim playhead** → mediabunny `CanvasSink.getCanvas(t)` → exact decoded frame → draw to a canvas overlaid on the video, shown only when not playing.
- **Delete** all seek-math: `frameStep` currentTime+`0.25*fs` bias, `_effectiveFps` guessing, `_handleRangeBoundary` seek dance.

### Why mediabunny
1.33M dl/wk, MPL-2.0, zero runtime deps, tree-shakes ~70kB gzip, Remotion deprecated its own libs for it + sponsors $1k/mo. WebCodecs-native → Chromium/Electron native, no WASM.

### API (verified)
```
import { Input, ALL_FORMATS, BlobSource, UrlSource, CanvasSink } from 'mediabunny';
const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
const track = await input.getPrimaryVideoTrack();
const sink  = new CanvasSink(track, { /* optional width/height */ });
const wrapped = await sink.getCanvas(n / fps);   // -> { canvas } | null, exact frame
// CanvasSink manages VideoFrame.close() internally (no manual GPU cleanup)
```
Frame N → `getCanvas(n / fps)`. Trim in/out → exact timestamps, no snap error.

### Caveats
- mediabunny has no built-in `.seek()` yet ([#303]) — irrelevant for our clips (short, tiny GOP → decode-from-keyframe is near-instant).
- If we ever use raw `VideoSampleSink` instead of `CanvasSink`, every `VideoFrame` MUST be `.close()`d (GPU leak). `CanvasSink` avoids this.
- URL: our media is served via `/project-file?path=` — `UrlSource` on the same-origin dev/Electron URL should work; verify (may need `BlobSource` from a fetch() if range requests misbehave).

## Cross-platform guarantee (MPI-283 hard rule — Mac/Linux/Windows)

WebCodecs decode support **varies by OS/Electron build** (mediabunny's own docs). The
guarantee is NOT "h264 always decodes" — it is **"never worse than today on any OS"**,
enforced by construction:

- Every sink build is gated on **`await track.canDecode()` → boolean** (mediabunny's
  runtime capability check; accounts for the real Electron/OS build + custom decoders).
- `canDecode() === false` (or any sink error) → service returns `null` → callers keep the
  **current native-`<video>` behavior**. The hybrid is purely additive: frame-accurate
  when decodable, today's behavior when not.
- Our own output is h264 (`libx264`/`yuv420p`, software, GPU-agnostic) in BOTH
  `videoConcat.js` and MpiSaveVideo — the best-supported WebCodecs codec. Imported
  hevc/prores `.mov` is the only risky input, and those already degrade in native
  `<video>` today → the gate preserves status quo for them. **No encode-node change.**
- Electron 41 = Chromium ~140 → WebCodecs API present on all 3 OSes.

## Steps

1. **Add dep + smoke** → `npm i mediabunny`; standalone check: load combined_003 via Input+CanvasSink, assert `track.canDecode() === true`, `getCanvas(n/fps)` for n=0..19, assert 20 distinct canvases (hash) → **verify: canDecode true + distinct frames, exact.**
2. **Frame-sink service** — `js/services/frameSink.js` (or a manager): wraps Input/CanvasSink lifecycle keyed by URL; **gate on `await track.canDecode()` — return `null` when false or on any error (caller falls back to native `<video>`)**; `getFrameCanvas(url, frameIndex, fps)`; dispose on video change. → **verify: returns correct frame; returns null + native fallback when undecodable; disposes cleanly (no leak on repeated loads).**
3. **MpiVideoSurface** — add a `<canvas>` overlay sibling to `<video>`. Show canvas when paused/stepping, hide (show video) on play. Replace `frameStep` internals to call the sink + paint canvas (drop currentTime bias math). Keep `_play/_pause` on native video. → **verify: step ±1 shows adjacent distinct frames every step; frame 0→1 moves.**
4. **MpiVideoControlBar** — drive playhead readout + trim boundary from frame index (sink-backed), delete `_handleRangeBoundary` currentTime seek dance + `_effectiveFps`. Sub-range loop = play native video, wrap by seeking to in-point at out-frame (native play stays; only the *paused* frame display uses the sink). → **verify: sub-range (in≠0, out≠end) loops clean, no freeze.**
5. **MpiTrimBar** — playhead/in/out map to exact frame timestamps from the sink's fps; keep the end-stick `_snap` (already landed). → **verify: out drags to true end + returns; in/out land on exact frames.**
6. **Cleanup + docs** — remove dead seek-math; add `docs/` note (video-player subsystem) on the audio-clock/PTS-truncation root cause + the hybrid contract. Update `.claude/rules/` component maps if wiring changed (ASK per CLAUDE.md doc-drift rule). → **verify: full manual pass on combined_003 + a 48fps clip + an imported video.**

## Definition of done
- Frame-step: every step shows a distinct adjacent frame (0→1 included), 20-frame clip ends on the last real frame.
- Sub-range loop: any in/out combo loops without freezing.
- Trim out reaches + returns to true end.
- Works on generated (combined/24fps), 48fps, AND imported video.
- No `VideoFrame` GPU leak across repeated loads.
- **Cross-platform:** undecodable codec (or non-WebCodecs OS build) → clean fall back to native `<video>`, never a black canvas or crash. Verified via forced `canDecode()===false` path.

## Already landed this session (separate from this refactor)
- **Concat fps fix** (`services/videoConcat.js` `forceReencode` + `routes/videoConcat.js`): combine now re-encodes → clean CFR 24fps (was demuxer `-c copy` → 283/12≈23.58). Verified.
- **TrimBar `_snap` end-stick** (`MpiTrimBar.js`): out handle reaches exact duration. Kept.
- Reverted: the unproven `_effectiveFps=fc/dur`, `_wrapLatch`, boundary `_play()` guesses (superseded by this plan).
