# MPI-54 Validation

Date: 2026-06-09. Validated by: user ("This is verified.").

## What was built

- Marker-based model download safety: managed downloads create `<file>.cubricdl`, and installed checks require the target file to exist without that marker.
- Cross-restart model resume: sidecar-marked partial files resume with manual `resumeFromFile()` on a fresh downloader instance without enabling NDH `resumeIfFileExists`.
- Pause/cancel hardening: pause preserves visible byte progress; cancel uses NDH `stop()` so the request does not keep downloading in the background.
- Electron close handling: active-download warning distinguishes resumable model downloads from engine downloads that restart; Cancel keeps the app window open.
- Partial-progress reporting: model checks include sidecar partial bytes so cold-start "partially installed" UI reflects the large model file bytes already present.

## Tests run

1. `node tests\download-completion.test.cjs` - PASS.
2. `node --check` on touched backend/frontend files - PASS.
3. Server smoke for `/comfy/downloads/active` - PASS.
4. `npm run test:desktop` - PASS, 8/8.
5. Real user validation: pause/resume/close/cancel behavior verified after follow-up fixes.
