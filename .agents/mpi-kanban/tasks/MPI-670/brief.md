# MPI-670 — Media import cannot carry a large file

## Symptom

A 474 MiB (497,657,819 byte) 4K clip — 3840x2160 HEVC Main 10 (`yuv420p10le`),
120 fps, 91.3 s, AAC stereo, ~43.6 Mbps — dropped on the gallery produces no card
and no error. The only trace in `app.log`:

```
[WARN] [mediaUploadService] Media save failed:
```

Smaller 2K clips of 20–40 s **do** import, but take a long time to appear.

## Root cause

Every import goes through `uploadMediaFile`
(`js/services/mediaUploadService.js:34`), which base64-encodes the whole file
into a JSON body:

```js
const base64 = await _fileToBase64(file);       // FileReader.readAsDataURL
body: JSON.stringify({ filename, base64Data: base64, ... })
```

Two hard walls:

| Wall | Limit | Max file |
|---|---|---|
| V8 `MAX_STRING_LENGTH` | 536,870,888 chars | **~384 MiB** |
| `bodyParser.json({ limit: '100mb' })` (`server.js:37`) | 104,857,600 bytes | **~75 MiB** |

The 474 MiB file needs a 663,543,760-char base64 string, so the V8 wall fires
first: `readAsDataURL` cannot build it, `_fileToBase64` rejects, and **nothing
reaches the network**. Between ~75 MiB and ~384 MiB the request is built and the
server answers 413 — also silently.

Below 75 MiB it works but pays the whole base64 cost: encode to a 1.33x string,
a second copy through `JSON.stringify`, POST, decode server-side. That is the
slow 2K import.

There is no extension / codec / duration / resolution gate anywhere. `mp4` is
accepted and `video/*` passes the drop overlay. Size is the only thing wrong.

## Two secondary bugs that hid it

1. **`js/services/clientLogger.js:34`** — `warn: (category, message)`. The call
   site passes a third arg `e`, silently dropped; only `error` takes an err.
   That is the empty log line.
2. **Silent failure in the UI** — `uploadMediaFile` returns `null` on any error
   and every caller does `if (!uploaded) continue;` / `return;`
   (`MpiGalleryBlock.js:197`, `MpiPromptBox.js:541`, and 8 more). No toast, no
   card, no feedback.

## Fix — send the path, not the bytes

This is a desktop app; the file is already on disk. The repo already resolves a
dropped file to an absolute path with Electron `webUtils.getPathForFile`
(`MpiFolderDrop.js:114`, `MpiProjectDropOverlay.js:66`). Reuse it, let the
server copy the file, and the ceiling and the latency both disappear.

Rejected: multipart/streaming upload (a new dependency and a new route to move
bytes that never needed to move), and raising the `100mb` limit (does not clear
the V8 wall, and buffers ~600 MB of base64 in RAM twice).

### Changes

1. **`routes/projects.js` — `POST /project-media/:projectId/upload`**
   Accept an optional `sourcePath` as an alternative to `base64Data`. Only the
   write step changes; sequencing, sidecar, `probeVideo`,
   `writeVideoDerivatives` and `writeImageRenditions` all stay as they are.
2. **`js/services/mediaUploadService.js`**
   Resolve `webUtils.getPathForFile(file)` once — all 10 callers benefit. When
   it is present, skip `_fileToBase64` and send `{ sourcePath }`. Browser dev
   mode (no `webUtils`) keeps the base64 path unchanged.
3. **Surface the failure** — give `clientLogger.warn` the `(category, message,
   err)` signature `error` already has, and emit `ui:error` from
   `mediaUploadService` before returning `null`.

## Folded in: the sidecar recorded a portrait clip as landscape

Found while validating the above, and folded in on the user's call rather than
split off. The same clip carries a quarter-turn display matrix: coded 3840x2160,
**displays 2160x3840**. `probeVideo` read `vStream.width/height` and ignored the
matrix, so the sidecar claimed landscape.

Everything else downstream already works in display space — ffmpeg applies the
turn before any filter sees a frame, which is why the 720p proxy of this clip
comes out **406x720**, not 1280x720. The probe was the odd one out, and the
sidecar and the proxy disagreed.

Normally the renderer's own `measureVideoDimensions` wins (the route backfills
only when `w` is falsy), but that returns `{0,0}` whenever the renderer cannot
decode — exactly the HEVC Main 10 case here.

**Fix:** `services/ffprobeVideo.js` swaps `width`/`height` on a quarter turn and
exposes `rotation`. Two traps worth keeping:

- ffprobe spells rotation two ways and **they disagree in sign on the same
  file** — the real clip reports `tags.rotate: 90` and
  `side_data_list[].rotation: -90`. Both normalise to a quarter turn, so the
  swap is right either way, but never trust the sign of one alone.
- The **bundled ffprobe is 4.0.2**, far older than a system ffprobe. It does
  emit `side_data_list` under `-show_streams`, but it rejects
  `-show_entries stream_side_data=...`, so a probe written against a modern
  binary can fail on the shipped one.

`_canFastPath` in `services/videoConcat.js` compares these dimensions to decide
the `-c copy` concat path. It now sees display dims, so two clips coded alike but
rotated differently correctly fail the fast path instead of concatenating into a
broken output. No change needed there.

## Open question (separate card if it bites)

The gallery hover uses the 720p H.264 `proxyPath`, but the full viewer plays the
**original** (`MpiGalleryGrid.js:1197`). Whether Electron 41 decodes 4K HEVC
**Main 10** depends on the Windows HEVC Video Extension — unverified. If
playback is black after import works, that is its own card (fall back to the
proxy in the viewer), not part of this fix.
