# MPI-285 — Validation

## Verified (agent)
- **Arg-branch logic** — standalone node harness mirrors route branching, 6 assertions pass:
  - `video` (audio, no trim) → `-vf reverse` + `-c:a copy`, no `areverse`.
  - `audio` (no trim) → `-c:v copy` + `-af areverse`, no `-vf reverse`.
  - `audio` + trim → `-c:v libx264` (re-encode, not copy).
  - `both` (audio) → both reversed.
  - `both`/`video` no-audio → `-an`.
- **Syntax** — `node -c` clean on `routes/videoReverse.js` + `MpiGroupHistoryBlock.js`.
- **Lint** — eslint clean on both files.

## NOT yet verified (needs live app)
- Real ffmpeg run of each mode on a project video with audio → confirm output plays, correct stream reversed.
- Audio-only on a no-audio source → menu item disabled ("Source has no audio"); direct POST → 400 `source has no audio to reverse`.
- 3 menu items render with correct labels + `reverse` icon.

## How to smoke
Load a project with a video-with-audio, right-click viewer → run all three; then a no-audio clip → confirm "Reverse audio" is disabled.

## USER-VERIFIED (live, 1.2.0) — 2026-07-15
All three modes confirmed working in the running app after full restart
(routes are NOT hot-reloaded; first run tested stale server → same both-stream
output was the symptom, gone after restart).

## Commit status
- Frontend (MpiGroupHistoryBlock.js) + card: committed `cf2e487f`.
- Backend (routes/videoReverse.js): DEFERRED — co-owned with a peer session's
  uncommitted `nextSequence` refactor (projects.js/videoConcat/videoCrop).
  Committing it alone → broken HEAD (nextSequence export not yet committed).
  Peer commits it with their batch. Card stays `validating` + attention:required
  until that lands. Logic itself is user-verified.
