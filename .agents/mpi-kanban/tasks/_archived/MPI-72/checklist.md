# MPI-72 — OS notifications (not-focused gate + download-complete)

## Code — DONE
- [x] `main.js` — notification gate `isMinimized()` → `!isFocused()`. Factored `showOsNotification(payload, kind)`. Added `notify-download-complete` IPC handler. (`main.js:696`)
- [x] `js/shell/notificationService.js` — added `download:complete` listener → sends `notify-download-complete` with `"<modelName> installed."`; skips UW installs (`__universal_workflow__`). `_unsub` → `_unsubs[]` for two listeners; teardown drains array.
- [x] ESLint clean on edited files.

## Verification — DONE (status: accepted)
- [x] Run `npm run test:desktop` (8/8 pass; confirms no regression — focus gate itself is Electron-only and eyeballed manually).
- [x] Manual: generation finishes while app unfocused-but-visible (behind another window) → OS notification fires.
- [x] Manual: model download finishes while app unfocused → `"<model> installed."` OS notification fires. (User-verified 2026-06-15.)
- [x] Confirm no notification when app IS focused (in-app toast only).

## BEFORE CLOSING THIS CARD — REQUIRED
- [x] **Add this change to `docs/releases/UNRELEASED.md`** (the unreleased changelog). Entry: OS notifications now fire when the app is unfocused (not only minimized); new OS notification when a model finishes downloading while the app is unfocused.

## Files touched
- `main.js`
- `js/shell/notificationService.js`
