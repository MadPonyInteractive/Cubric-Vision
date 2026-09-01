# MPI-670 checklist

- [x] `routes/projects.js` `/project-media/:projectId/upload` accepts `sourcePath` as an
      alternative to `base64Data` (absolute + `pathExists` validated, 400 otherwise);
      write step becomes `fs.copy` when it is present.
- [x] `js/services/mediaUploadService.js` resolves the file's disk path via
      `webUtils.getPathForFile` and sends `sourcePath`, skipping `_fileToBase64`
      entirely. A File with no disk path (canvas snapshot, recorded take) and browser
      dev mode both fall back to base64.
- [x] `js/services/clientLogger.js` — `warn` takes `(category, message, err)` like `error`.
- [x] `mediaUploadService` emits `ui:danger` on failure so a refused import is visible.
      Toast, not `ui:error`'s blocking dialog — a batch drop must not open N modals.
- [x] The 474 MiB 4K/120 HEVC clip imports through the route in 26.7 s. Evidence:
      validation.md.
- [x] Sidecar asserts: `pixelDimensions {w:3840,h:2160}`, `fps:120`, `duration:91.282`,
      `frameCount:2738`, `hasAudio:true`, non-null `thumbPath` + `proxyPath`.
- [x] Copied file byte-identical to the source (sha256 + size both match).
- [x] Regression: a small PNG still imports through the `base64Data` path.
- [x] Both 400 guards fire with their own message (missing file, neither field).
- [x] `services/ffprobeVideo.js` reports DISPLAY dimensions — swaps `width`/`height`
      on a quarter turn and exposes `rotation`, reading both spellings ffprobe uses.
      (Folded in on the user's call after it surfaced during validation.)
- [x] `tests/video-rotation-dimensions.test.cjs` covers 90/270 swapped, 0 and 180 left
      alone, against real generated fixtures. 3/3 pass.
- [x] The real clip now probes `2160x3840, rotation:270` instead of `3840x2160`.
- [x] Full suite green after the probe change: `npm test` → 830 pass, 0 fail. Covers
      `videoConcat`'s `_canFastPath`, which compares these dimensions.
- [ ] **Human check** — one real drag-drop of the clip onto the gallery in the user's
      own app. Electron drag-drop with an OS file path cannot be driven from outside
      the app, so no agent can close this one.
