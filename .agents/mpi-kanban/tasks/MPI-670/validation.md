# MPI-670 validation

Run against an isolated instance (`npm run app:isolated`, port 52190, agent
profile) into a throwaway project `MPI-670 import probe`, since deleted. The
user's app on :3000 was not touched.

## The file that could not be imported

`PXL_20260829_232809577.mp4` — 497,657,819 bytes (474 MiB), 3840x2160 HEVC
Main 10 (`yuv420p10le`), 120 fps, 91.28 s, AAC stereo, ~43.6 Mbps,
`rotation: -90`.

## Server half — PASSED

`POST /project-media/<id>/upload` with `sourcePath` instead of `base64Data`:

```
{"success":true, "filename":"imported_001.mp4",
 "fps":120, "duration":91.282, "frameCount":2738, "hasAudio":true,
 "thumbPath":".../<id>.thumb.jpg", "proxyPath":".../<id>.proxy.mp4"}
real 0m26.733s
```

- **Copy is byte-identical.** `sha256` of source and of
  `Media/imported_001.mp4` both `832803b095f31cdb6b96337b6893b52ca1a944175f031e89693fd9311dd7e08a`,
  both 497,657,819 bytes.
- **Sidecar is complete.** `pixelDimensions {w:3840,h:2160}` (backfilled by
  `probeVideo` — the request sent `width:0,height:0`), `fps:120`,
  `duration:91.282`, `frameCount:2738`, `hasAudio:true`.
- **Derivatives real.** `thumb.jpg` 8,635 B; `proxy.mp4` 7,673,004 B, probed
  `h264, 406x720, yuv420p` — 720p H.264, portrait because ffmpeg applies the
  -90 rotation.
- 26.7 s end to end, nearly all of it the proxy transcode of a 91 s 4K120 clip.

Guards and regression, all as expected:

| Request | Result |
|---|---|
| `sourcePath` that does not exist | `400 sourcePath is not an existing absolute path: C:/does/not/exist.mp4` |
| neither `base64Data` nor `sourcePath` | `400 filename and base64Data or sourcePath required` |
| small PNG via `base64Data` (dev-mode path) | `200 success` — unchanged |

Board validator: `validate_board.py .` reports one violation, and it is not this
card — a legacy-schema file claim under `state/` owned by another session's
MPI-591 work (`state/` is gitignored, so it never commits).

## Human check — PASSED (2026-09-01)

The user dragged the clip onto the gallery in their own app. It imported and the
card reads **`imported_016` · 2160 x 3840 · 91S** — portrait, correct duration.
Both halves of this card are confirmed in the real app: the file crosses the
import path at 474 MiB, and it lands the right way up.

`Media/imported_016.mp4` in the Grantiz project is the successful import.

**One thing the drag-drop exposed that this card does not fix:** the import took
long enough (474 MiB copy, then a 91 s 4K120 HEVC 10-bit source transcoded to a
720p proxy, on a box with ComfyUI loaded) that the first attempt was killed
mid-flight, because nothing in the UI says an import is running. That attempt
left `Media/imported_015.mp4` (the full 497,657,819-byte copy), a complete
`.meta/1adc25d2-….thumb.jpg` and a `.meta/1adc25d2-….proxy.mp4` truncated at 41%
(3,145,776 of 7,673,004 bytes) — and **no sidecar**, because the route writes it
last, after the derivatives. No card, and `/backfill-media-derivatives` iterates
sidecars so it can never find the orphan either. Feedback during an import is
its own card.

## Client half — verified by the human check above, not by an agent

`_sourcePathFor` is a 3-line reuse of the `window.require('electron').webUtils
.getPathForFile` accessor that `MpiFolderDrop.js:114` and
`MpiProjectDropOverlay.js:66` already ship and rely on, so the mechanism is
proven in this renderer. What is **not** verified is a real OS drag-drop of this
file onto the gallery — Electron drag-drop with a real file path cannot be
driven from outside the app, and playwright-cli is a different client with no
`window.require`. That check is one drag-and-drop by the user.

## Rotation — folded in on the user's call, PASSED

Found while verifying the above; the user chose to fold it into this card rather
than split it off.

`probeVideo` now reports display dimensions. The real clip:

```
{ "width": 2160, "height": 3840, "rotation": 270,
  "fps": 120, "duration": 91.282, "frameCount": 2738, "hasAudio": true }
```

was `3840x2160` before — the coded pair, which disagreed with the 406x720 proxy
ffmpeg had already written from the same file.

- `tests/video-rotation-dimensions.test.cjs` — 3/3 pass. 90 and 270 swap, 0 and
  180 do not. Fixtures are generated with `-display_rotation`, since
  `-metadata:s:v rotate=` is silently dropped by current ffmpeg and would have
  produced an unrotated fixture that passed for the wrong reason.
- `npm test` → **830 pass, 0 fail**. This matters beyond the new test:
  `_canFastPath` in `services/videoConcat.js` compares these dimensions to pick
  the `-c copy` concat path, and it now compares display dims.

Two things measured here that a doc would otherwise get wrong:

- **The two rotation spellings disagree in sign on the same file.** The clip
  reports `tags.rotate: 90` *and* `side_data_list[].rotation: -90`. Both are
  quarter turns so the swap is right either way — but never read the sign off
  one alone.
- **The bundled ffprobe is 4.0.2**, much older than a system ffprobe. It does
  emit `side_data_list` under `-show_streams` (which is what `probeVideo` uses),
  but it rejects `-show_entries stream_side_data=...` outright — so a probe
  developed against a modern binary can fail on the one that ships.
