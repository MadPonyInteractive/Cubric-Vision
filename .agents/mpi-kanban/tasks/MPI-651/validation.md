# MPI-651 — validation

## The hole MPI-637 left

`tests/windows-hide-spawn.test.cjs` finds a call site by CALLEE NAME:
`/\b(spawnSync|spawn|execFileSync|execFile|execSync)\s*\(/`. Six files bind the
function to an alias first — `const execFileP = promisify(execFile)` — so nine
real spawns were never scanned and never got the flag, with the test green:

    routes/videoCrop.js:129   routes/videoGif.js:114
    routes/videoReverse.js:120  routes/videoTrimInput.js:94
    services/ffmpegThumb.js:48,100,156   services/ffprobeVideo.js:36,93

`POST /backfill-media-derivatives` (`routes/projects.js:1572`) runs on project
open and calls into those services once per missing thumb / large rendition /
video proxy — which is the burst Fabio saw: ~20 terminals right after boot on
2026-08-29, all after MPI-637 was closed.

## What changed

1. `windowsHide: true` on all nine call sites (+ a note at each file's alias).
2. The scanner now resolves `promisify(exec|execFile|spawn)` aliases per file and
   scans them too; plain `exec(` joined the base list (the `.exec(` guard already
   excludes regex literals).

## Evidence

- `node --test tests/windows-hide-spawn.test.cjs` → 4/4 pass.
- **Mutation check** (the only thing that proves the scanner sees the aliases):
  strip `windowsHide` from `services/ffprobeVideo.js`, re-run → exit 1 with
  `services\ffprobeVideo.js:40 execFileP(ffprobePath, …)` and `:97` listed as
  offenders. File restored, verified restored.
- The alias case is now a permanent assertion inside the scanner's own self-test.
- Live run: `probeVideo('comfy_workflows/display/flow-drama-box.mp4')` returns
  `{"fps":30,"duration":6.4,...,"width":1280,"height":800,...}` — the added
  option does not disturb the call.

## Open

Window-count on a real user boot is Fabio's — the burst only fires on a project
whose renditions are missing, and his live `:3000` session must not be driven.
Card stays in `doing` until he relaunches and reports.
