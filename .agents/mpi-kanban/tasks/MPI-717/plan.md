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

**Phases 1 and 2 have shipped. Phase 3 (MPI-719, the cancel race) is the single next
action** — still `planned`, brief at `tasks/MPI-719/brief.md`, and untouched by either
phase. Nothing is blocked.

Phase 2 (MPI-718) landed 2026-09-10: the budget now means three failures WITHOUT progress
(`_attemptBytes` + an 8 MB `RETRY_PROGRESS_FLOOR_BYTES` reset in the `'progress'` handler),
its length unchanged at three, and the MPI-427 zero-bytes gate unmoved. Evidence:
`tasks/MPI-718/validation.md`. Two things a fresh session needs that the diff does not say:

- **The four-cut repro found two live faults in the same handlers and both are fixed here**
  — a replaced stream's late `'download'` crashed the process on MPI-716's `__response`
  read, and its late `'error'` spent a second retry for one blip. Every handler in
  `_bindEvents` now captures its own downloader (`const dh`) and returns when
  `this._downloader !== dh`. Phase 3 touches different files, but any future work in
  `_bindEvents` must keep that guard.
- **NDH absorbs a dead socket before our code sees it.** `resumeOnIncomplete` defaults to
  true with `resumeOnIncompleteMaxRetry: 5`, so a test that wants to reach our retry path
  must make the socket go QUIET, not kill it. That is what `cutQuiet` in the harness is.

The 2026-09-10 sweep carded all three members and re-checked every claim against the
working tree and the captured logs:

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

## Phase 1: Telemetry — MPI-716 — SHIPPED 2026-09-10

Three log lines, no behaviour change. Plan and thresholds: `tasks/MPI-716/plan.md`;
executed evidence: `tasks/MPI-716/validation.md`.

Landed as planned: free space at boot and at install start (one `_diskSpace` statfs
returning free AND total), a `_slowWarned` latch on NDH's per-dep `stats.speed` carrying
rate/host/peer/`cf-ray`, and an fsynced 8 MB write probe gated on that same latch. The
harness gained a throttled body rather than a second server, as this plan required.
917/917 suite, eslint clean, Phase 1 confirmed in a live isolated app boot.

**What Phase 2 inherits:** the WARN and the probe both hang off `_checkSlowStream`, and
`_rearm()` now clears `_slowSince`/`_slowWarned` beside the MPI-291 stall clock — so a
retry-budget change that alters how often `_rearm()` runs also alters how often a stream
may re-warn. `_setSlowStreamThresholdsForTests` is on the module for the harness.

**What Phase 3 inherits:** the probe's `unlink` brushes the very race MPI-719 fixes; it is
named in a comment beside that unlink. The probe is not a new cause — `cancel()` opens a
far wider window — but MPI-719's reader-side fix closes both.

Owns: `routes/downloadManager.js` (`FileDownloader._bindEvents`, `_rearm`, the install
start after the disk gate, a new probe helper), `server.js` (the boot line beside
`Server started`), `tests/download-retry.test.cjs`, `docs/download-manager.md`.

→ verify: the card's own definition of done — name the line each addition WOULD have
written into the captured logs and the question it answers.

## Phase 2: Retry budget — MPI-718 — SHIPPED 2026-09-10

The budget resets on progress since the last spent attempt; the MPI-427 zero-bytes gate is
untouched. Brief: `tasks/MPI-718/brief.md`; executed evidence: `tasks/MPI-718/validation.md`.

Landed as planned, plus the two stale-event faults the repro turned up (above). **The open
question in the brief — a hard attempt ceiling, or accept the trickle — was answered "no
ceiling", and the reason is on the card:** every reset costs 8 MB of new bytes on disk, so
a file spends at most `3 + size / 8 MB` attempts by construction, and a stream that
dribbles UNDER the floor never resets and still dies at 3/3. The floor is the ceiling.
7 test cases, 917/917 suite, eslint clean, both captured deps re-read.

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

- **2026-09-10, Phase 2.** Scope grew by two defects, both in the handlers this phase
  already owned and both surfaced by its own repro rather than by inspection: a replaced
  stream's late `'download'` crashing on MPI-716's `__response` read, and its late
  `'error'` double-spending the budget. Folding them in was the cheaper and more honest
  call — the second one IS this card's subject, and the first is an uncaught exception on
  the retry path this card exercises. The harness also needed a knob the plan did not
  anticipate (`cutQuiet`): NDH's own `resumeOnIncomplete` swallows a killed socket, so a
  cut had to become a quiet socket to reach our budget at all.
- **2026-09-10, Phase 1.** No drift in scope. Two implementation choices worth recording:
  `_freeDiskBytes` was KEPT as a thin wrapper over the new `_diskSpace` rather than
  renamed, so nothing downstream (including a comment in `tests/disk-full-message.test.cjs`,
  a file Phase 1 did not own) drifts; and the write probe targets the dep's OWN directory
  rather than the models root — same volume by construction, already writable, and it
  measures the exact path in use.
