# MPI-59 Validation

## Root cause (corrected — NOT case-sensitivity)
`spawn .../resources/ffmpeg EACCES` — bundled ffmpeg lacked the exec bit →
`extractVideoThumb` threw → `thumbPath` null → `MpiHistoryList._makeCard` put the
MP4 URL into `<img src>` → broken-image icon ("missing video/image link").

## Fix (three layers, all in 0.0.9)
1. `services/ffmpegBinary.js` — runtime self-heal chmod +x at resolve (f168fa5).
2. `scripts/portable/apply-update.cjs` — `restoreLauncherBits` now restores +x on
   `resources/ffmpeg` + `resources/ffprobe` (commit 9708459).
3. `js/components/Compounds/MpiHistoryList/MpiHistoryList.js` — video items never
   fall back to the video URL in `<img src>`; src-less `<img>` shows the
   `--surface-bar` background (commit 685f0c2).

## Manual verification — PASS (Linux, 2026-06-10)
- Updated Linux 0.0.7 → 0.0.9 via `update-from-zip.sh` (in-place, no reinstall).
- New project → imported a video + an image → opened both in the history workspace.
- **Result: video thumbnail renders, no "missing link".** Confirmed by Fabio.
- Video zoom (MPI-58) also verified working in the same Linux history view.

## Dev checks
- `node --check` on all three changed files — passed.
- ESLint (warn-only) on MpiHistoryList.js — passed.
- Delta bundle byte-verified to contain all three fixes before the Linux test.
