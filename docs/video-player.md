# Video Player — frame-accurate hybrid (MPI-283)

The video viewer is a **hybrid**: the native `<video>` element plays; a
mediabunny/WebCodecs canvas overlay owns the visible pixels while
paused/stepping/scrubbing. This exists because `<video>.currentTime` is **not
frame-accurate by spec** — the browser seeks to the nearest keyframe-decodable
time, which drifts by up to a frame and renders interpolated pixels.

Components: `MpiVideoSurface` (the `<video>` + canvas), `MpiVideoControlBar`
(transport + embedded `MpiTrimBar`), `MpiTrimBar` (track + in/out handles +
playhead). Frame decode lives in `js/services/frameSink.js`.

## Why (root cause)

`<video>.currentTime = t` does not land on frame `round(t·fps)`. The media
clock is driven by the **audio PTS / container timestamps**, not a frame
counter, so a "seek to frame N" via time is approximate. Two symptoms:

- **Frame step wasn't exact** — repeated `currentTime` seeks could show the
  same frame twice or skip one.
- **Interpolated flash on scrub-back** — the native seek target renders its own
  (drifted) pixels for a beat before settling.

Fix: the canvas overlay paints the **exact** decoded frame (mediabunny
`VideoSampleSink`), and we set `video.currentTime` *after* painting (for
audio/PLAY sync, under the covering canvas). `data-frame="true"` shows the
canvas over the video; `play` hides it.

## Cross-platform guarantee (by construction)

Every sink is gated on `track.canDecode()`. False/error → `getFrameCanvas`
returns `null` → the caller keeps the native seek (with a `+0.25·fs` bias) so a
platform that can't decode is **never worse than before**. frameSink only
hand-converts I420/I420A (our libx264 output); any other pixel format → `null`
→ native fallback. Pure JS, no per-OS binary; portable build copies
`node_modules`. Media serves via `/project-file?path=` (same-origin, range 206),
so mediabunny's `UrlSource` works directly.

## The color matrix rule (critical)

WebCodecs mis-converts YUV→RGB: it mis-tags the matrix (renders SD content
vivid, as if bt709). `copyTo` / `drawImage` / `createImageBitmap` **all** give
the same mis-converted pixels — the only exact fix is a **manual I420→RGB**
conversion from raw planes (`frameSink._paintI420`).

**Matrix is chosen by height, not by the container tag** (WebCodecs
mis-reports `colorSpace.matrix` as always bt709 — do NOT trust it):

- height ≥ 720 → **BT.709**, else **BT.601**, **limited range**.

This matches the libx264 tag and Chromium's `<video>` decode. Verified
pixel-near-perfect vs `<video>` (SD residual 0.12, HD 0.59). Ground truth for
color = `<video>` / DaVinci Resolve / our ffmpeg crop-export (all agree). Cost
is per-displayed-frame only (paused/step), so clip length is irrelevant.

> The same recolor must be applied wherever a frame is **extracted** to an
> image (extend-from-last-frame). See the follow-up card.

## The frame-index coordinate law

There is exactly **one** mapping from "frame N" to an on-screen x-position, and
all three components MUST agree on it or the playhead visibly jumps.

- **Effective fps** = `frameCount / duration` when both are known (matches the
  file's true PTS spacing, e.g. 29.97 for a "30fps" NTSC clip), else the
  declared `fps`. `MpiVideoSurface._effectiveFps`, `MpiTrimBar._effFps`.
- **Position %** = `idx / (frameCount-1) · 100` — frame 0 at 0%, last frame at
  100% (last-frame normalization). Lives in **one place only**:
  `MpiTrimBar._pctOf`.
- **`MpiVideoControlBar._displayTime`** snaps a raw `currentTime` to the exact
  frame's **true** timestamp `idx / effFps` — it does **NOT** stretch to
  `idx/lastIdx·dur`. Applying the normalization there *and* in `_pctOf` shifts
  the echoed playhead one frame off the drop position (the historic "playhead
  jumps on release" bug).

`frameCount` reaches `MpiTrimBar` via `MpiVideoControlBar.setFrameCount()` →
`trim.setFrameCount()` (and on `attachSurface`). Without it, TrimBar falls back
to plain `time/duration` mapping.

Invariant that must hold: for every frame, **drop% == echo%**, and frame 0 is
reachable at 0% / last frame at 100%.

## Sub-range loop

Drive the loop boundary off native time vs the out-point directly (half-frame
lead), NOT a reverse-engineered frame index — that rounding froze sub-range
loops. Only the out-point matters during playback (time moves forward); the
play-start in-seek is handled by `_seekRangeStartIfNeeded`. Native `video.loop`
is used only for the full range; sub-ranges emulate the wrap in the frame-watch
/ `timeupdate` / `ended` handlers.

## Known non-bug

`frame0 == frame1` on Wan/LTX clips is **content**, DaVinci-confirmed: the model
pads a duplicate first frame (49 = 48+1). The workflow may drop frame 0 before
export — no player change. (This padding is also why a clip's last displayed
frame can appear one short of the scrub-bar tick until the pad is removed.)
