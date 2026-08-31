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

## Client half — NOT verified by an agent

`_sourcePathFor` is a 3-line reuse of the `window.require('electron').webUtils
.getPathForFile` accessor that `MpiFolderDrop.js:114` and
`MpiProjectDropOverlay.js:66` already ship and rely on, so the mechanism is
proven in this renderer. What is **not** verified is a real OS drag-drop of this
file onto the gallery — Electron drag-drop with a real file path cannot be
driven from outside the app, and playwright-cli is a different client with no
`window.require`. That check is one drag-and-drop by the user.

## Found while verifying — NOT fixed here (MPI-671)

The clip carries `rotation: -90`: coded 3840x2160, **displays** 2160x3840
(portrait). `probeVideo` reports the coded dimensions, so a sidecar written from
the server probe alone claims landscape. In the real drop path the client's
`measureVideoDimensions` returns the rotated display dims and wins (the route
only backfills when `w` is falsy) — but only if the renderer can decode the
file, and this one is HEVC Main 10. Separate card.
