# MPI-717 — One slow install, three defects on the local download path

Umbrella created 2026-09-10 from one beta report: installs crawling at 20-40 KB/s on a fiber
line, diagnosed from two `app.log` captures and nothing else. The investigation found that
the log could not describe the problem (MPI-716) and, on the way, two things the download
path does wrong that the same captures prove (MPI-718, MPI-719).

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

Evidence for all three, kept OUTSIDE every git root (third-party username and folder
layout): `C:/AI/Mpi/_private/cubric-download-telemetry/`. Every member's acceptance test
re-reads those two files.

## Members

| Card | What it is |
|---|---|
| MPI-716 | A slow install is undiagnosable from `app.log` — add free space, a latched slow-stream WARN (rate/host/IP/POP), a timed write probe |
| MPI-718 | The same-url retry budget never resets — MPI-460's three attempts are spent once per FILE, whatever lands between blips |
| MPI-719 | `cancel()` races every concurrent disk scan — two-step delete under unguarded `fs.stat` readers, a 500 on `/comfy/models/check` |

## Current State

Not started, all three `planned`. MPI-716 was carded first (2026-09-10 19:25) with the
other two recorded in its `brief.md` as "confirmed in code, not carded"; this sweep carded
them and re-checked every claim against the working tree and the captured logs:

- `FileDownloader._attempts` is set to 0 in the constructor and incremented in the `'error'`
  handler; nothing else touches it. The log shows `qwen3-8b-clip` resuming from 2.56 GB
  after retry 1 and 3.42 GB after retry 2, six minutes apart. MPI-718 holds.
- Two `[comfy] models/check failed` ENOENT errors 102 ms after a cancel, one stat on a
  weight and one on a `.cubricdl` marker — so the walker hit both the file and the marker
  `cancel()` had just removed. MPI-719 holds, and both readers are implicated.

**All three briefs are code traces, not executed.** Repro is step one on each.

## Why one card and not three

- **One file, two members.** MPI-716 instruments the `FileDownloader` `'progress'` and
  `'download'` handlers; MPI-718 rewrites the `'error'` handler's budget and reads progress
  in the same `'progress'` handler. Two passes over one class is two diffs over the same
  region for no gain, and they cannot fan out.
- **One harness.** `tests/download-retry.test.cjs` drives the REAL `FileDownloader`
  against a local server that cuts a body mid-flight. MPI-716 extends it with a throttled
  body; MPI-718 needs "cut N times with real progress between cuts" — the same server, one
  more knob. Build it once.
- **A hard ordering.** Telemetry lands BEFORE any behaviour change, so the next report of
  this shape is readable from the log alone, and so MPI-718's effect (a large dep that
  keeps going instead of failing at 3/3) is visible in the lines MPI-716 adds rather than
  inferred from their absence.
- **Same evidence, same acceptance.** Each member's definition of done is "re-read the two
  captured logs and show the line this would have written". A cold agent picking up any
  one of them needs the pointer to that folder, which only this plan and MPI-716's brief
  carry.

MPI-719 is the loosest fit: different files, a filesystem race rather than a transport
fault. It is here because the same two logs are its only evidence and because it is
small — a standalone card would spend more time being read than the fix takes. It is
NOT a member of MPI-513 (install state that lies to the user): same symptom family, but
MPI-513's root is two writers for one install and its plan is "single writer first, then
re-test" — a single writer does not close a readdir-then-stat window.

## Phase 1: Telemetry — MPI-716

Three log lines, no behaviour change. Plan and thresholds: `tasks/MPI-716/plan.md`.

Owns: `routes/downloadManager.js` (`FileDownloader._bindEvents`, `_rearm`, the install
start after the disk gate, a new probe helper), `server.js` (the boot line beside
`Server started`), `tests/download-retry.test.cjs`, `docs/download-manager.md`.

→ verify: the card's own definition of done — name the line each addition WOULD have
written into the captured logs and the question it answers.

## Phase 2: Retry budget — MPI-718

After Phase 1 lands. The budget resets on progress since the last spent attempt; the
MPI-427 zero-bytes gate is untouched. Brief: `tasks/MPI-718/brief.md`.

Owns: `routes/downloadManager.js` (`FileDownloader` constructor, `'error'` and
`'progress'` handlers), `tests/download-retry.test.cjs`, `docs/download-manager.md`.

→ verify: the extended harness — four cuts with progress between them completes with a
matching SHA; three zero-byte cuts still go terminal.

## Phase 3: Cancel race — MPI-719

Independent of Phases 1-2 in code, sequenced after them only because all three write
`docs/download-manager.md`. Reader-side fix in the two shared primitives, every call
site in one pass; `cancel()` itself is not touched. Brief: `tasks/MPI-719/brief.md`.

Owns: `routes/shared.js` (`findFileRecursive`), `routes/downloadCompletion.js`
(`getPartialDownloadState`), a new `tests/download-scan-race.test.cjs`,
`docs/download-manager.md`.

→ verify: the deterministic race test — an entry that vanishes between `readdir` and
`stat` is skipped, a marker whose file vanishes reads as not resumable, and any error
other than ENOENT still throws.

## Parallel Batch

None. Phases 1 and 2 share two files and one handler. Phase 3 is disjoint in code but
shares `docs/download-manager.md` with both, and it is small enough that a fan-out saves
nothing. Run them in order; a single session can carry all three.

## Plan Drift

(none yet)
