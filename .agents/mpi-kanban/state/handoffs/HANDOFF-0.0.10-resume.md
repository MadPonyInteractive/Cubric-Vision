# Resume handoff — 0.0.10 patched build ready for Mac + Linux validation

**Generated:** 2026-06-10, end of session (before Fabio's nap). No wakeups scheduled.

## Where we are

The **patched 0.0.10** build is built, byte-verified, and staged. Both update
bundles carry all fixes. master is clean + pushed (**HEAD `0484449`**).

### Staged bundles — `D:/CubricStudio/Vision/Builds/v0.0.10/`
- `CubricVision-macos-arm64-update-v0.0.10.zip` (29 MB) ← the one you need for Mac
- `CubricVision-linux-x64-update-v0.0.10.zip`  (590 KB) ← the one you need for Linux
- full builds for both also there (not needed; you update in place)

Verified inside BOTH update bundles: APP_VERSION 0.0.10, the CSS
`.mpi-mem-monitor__item[hidden]` VRAM-hide fix, gpu-detect cache log REMOVED,
MPI-62 applier `bundleIsDir` dir-accept. fp32-vae flag gone (comment only).

## Boxes are currently on

- **Mac (rented M4):** updated to **0.0.10** (the FIRST 0.0.10, pre-patch). Confirmed
  working there: progress bar (`GENERATING · 50% · 0:17`), single gen no artifact,
  video zoom. STILL BROKEN on that pre-patch build: VRAM gauge showed `0/0`
  (CSS bug) + gpu-detect log spam. Both fixed in the PATCHED bundle staged above.
- **Linux:** on **0.0.9** (not yet updated to 0.0.10 at all).

## What changed since the boxes last updated (the patched 0.0.10)

commit `0484449` — MPI-60 follow-up:
1. **VRAM row now actually hides on Apple Silicon.** Root cause was CSS: the JS set
   `vramRow.hidden = true` correctly, but `.mpi-mem-monitor__item { display:flex }`
   overrode the UA `[hidden]{display:none}`. Added `.mpi-mem-monitor__item[hidden]
   { display:none }`. Backend was already perfect — `/system/stats` returns
   `gpu.vendor:"apple"`, `vram.memoryModel:"unified"`, `available:false`.
2. **gpu-detect log spam removed.** `/system/stats` calls `resolveDownloadConfig()`
   every poll; the cached-hit path logged "Using cached GPU detection result" each
   time. Dropped that log (initial uncached detection still logs once).

## NEXT STEPS when you're back

### Mac — apply patched 0.0.10
The Mac is on the pre-patch 0.0.10, so this is a 0.0.10 → 0.0.10 (patched) update.
Get `CubricVision-macos-arm64-update-v0.0.10.zip` (the NEW staged one) to the Mac.
Safari will auto-extract → truncated folder again. The INSTALLED applier is now
0.0.10's (has MPI-62 dir-accept!), so you can **test MPI-62 directly** — pass the
extracted FOLDER, no re-zip:
```sh
./update-from-zip.command ~/Downloads/<extracted-update-folder>
```
If that applies cleanly from a folder → **MPI-62 VALIDATED** (the whole point).
If it complains, fall back to the re-zip:
`ditto -c -k --keepParent <folder> /tmp/u.zip && ./update-from-zip.command /tmp/u.zip`

Then relaunch + confirm:
- **VRAM gauge GONE** — only RAM shows in the bottom memory monitor (MPI-60 CSS fix).
- **No gpu-detect spam** — tail the Terminal; "Using cached GPU detection result"
  should NOT repeat.
- **Generation duration** — run a gen; success toast should say "...in Xs" and the
  card should show seconds (statusBar wall-clock fix; shipped since first 0.0.10).
- Progress bar + zoom still good (regression).

### Linux — apply patched 0.0.10 (from 0.0.9)
Get `CubricVision-linux-x64-update-v0.0.10.zip` to the box. Quit app. From install
root: `./update-from-zip.sh <path-to-update.zip>`. Relaunch, confirm 0.0.10 +
no gpu-detect spam + zoom regression OK. (Linux is CPU-only, skip generation.)

## After both boxes pass → close the cards
- **MPI-60** (doing/validating) → done, once VRAM hide + progress + duration + no
  spam all confirmed on Mac.
- **MPI-62** (doing/validating) → done, once the folder-direct update applies on Mac.
- **MPI-61** (doing/validating) → done; it was the fp32-vae revert (decision made),
  no further hardware test needed — can close on review.
- Record results in `.agents/mpi-kanban/tasks/MPI-49/validation.md` (mac section
  already started) + flip memory `project_macos_build_fixes`.

## Still OPEN / deferred (NOT blockers)
- **Online update on Mac** (`update.command`) — never tested on Mac. Needs repo
  PUBLIC + 0.0.10 as non-prerelease 'latest'. Plan was "do it in a 0.0.10-era
  window." Optional before 1.0.0.
- **No-terminal mac launch** (`.app` wrapper) — deferred; `.command` always opens
  Terminal.
- **Stale darwin baseline (0.0.3)** — the 0.0.10 mac delta is a 1419-file superset
  (applies fine, just big). Refresh darwin baseline to a 0.0.10-full manifest
  before 1.0.0 for minimal deltas. linux/win baselines are 0.0.6.
- **MPI-61 per-workflow VAE banding** — if a specific workflow's fp16 VAE bands on
  MPS, fix THAT workflow's VAE node, not a global flag (Fabio: no global flag, no
  tiling). Future work.

## 1.0.0 — STILL HARD-GATED on Fabio's explicit go. Do NOT bump without it.

When green-lit: run mpi-version-bump (NOT `-f version` alone), refresh the darwin
baseline first, build all three via mpi-ci.

## Throwaway tags to delete eventually
v0.0.7 (handoff carryover) + any v0.0.8/v0.0.9 test tags if created:
`gh release delete <tag> --repo MadPonyInteractive/Cubric-Vision --yes; git push origin :refs/tags/<tag>`
(No GitHub releases were created this session — builds went straight to mpi-ci
artifacts + Drive. Nothing to delete unless a release was cut.)
