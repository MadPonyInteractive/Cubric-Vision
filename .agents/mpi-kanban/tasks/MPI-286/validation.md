# MPI-286 — Individual project load — Validation

**Goal:** make the Landing project list *feel* faster to load (content-heavy projects with 100+ cards / 4K media stalled the panel by decoding all thumbnails at once).

## Fix
Per-thumb spinner + cap-3 concurrency reveal queue, newest-first, row open-locked until its own thumb resolves. Dropped video hover-play + `preload='metadata'`.
Files: `js/shell/projectUI.js`, `styles/shell/landing.css`.

## Verification
- **Queue logic unit test** (headless node): cap=3 held, newest-first launch order, full drain of 13, abort stops further launches, under-cap drains. PASS.
- **Live browser drive** (playwright vs :3000, real 13-project list): all 13 rows render immediately; all thumbs paint (4 img + 9 video); 0 spinners left, 0 rows stuck `--loading`; video first-frame paints via `loadeddata`. Max concurrent `/project-file` requests = 5 (video range-chunking; decode-level concurrency still 3).
- **ESLint** projectUI.js: 0 errors, 0 warnings.
- **User eyeball** (2026-07-15): confirmed projects load faster; goal achieved. (Noted the per-thumb spinner is brief because thumbs now load fast — that is the design working, not a miss.)

## Result
User-verified. Goal met (felt-faster, not actually-faster — as scoped).

## Follow-up (2026-07-16) — cold-boot server fix
Original fix only deferred **browser thumbnail decode**; server `/list-projects` still scanned every project's `.meta` sidecars **serially** (heavy projects 100–163 sidecars: `readJson`+`pathExists`+`stat` each, ~700 total, all sequential). Hot reload masked it (OS file cache warm); cold app launch = "forever" (spinner is pre-grid loader at `projectUI.js:195`, `listProjects()` pending).
Fix: parallelised both loops in `routes/projects.js` — `findRecentProjectThumbnail` sidecar reads → `Promise.all`; per-project folder scan → `Promise.all`. Behavior identical (18/18 thumbs, same sort/pick). **User-verified cold-boot much faster.**
