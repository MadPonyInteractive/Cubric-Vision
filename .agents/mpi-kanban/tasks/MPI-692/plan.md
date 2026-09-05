# MPI-692 Plan — surface the app's `[download]` warnings in the smoke runner

## Goal

`scripts/smoke-workflows.mjs` prints a dot per poll during the install phase and
never reads `app.log`. On 2026-09-04 the app diagnosed a dead download Pod at
22:07:45 and the run kept dotting until 22:43 — 36 minutes of a paid Pod with
the answer already written down. Surface those lines inline. Nothing more.

Explicitly rejected, do not revive without reading `brief.md`: a rolling MB/s
throughput floor. It is too low to catch degradation and false-alarms during
aria2 finalization + sha256 verify, when bytes legitimately stop landing.

## Approach

No new detection. The app owns the thresholds and the vocabulary — MPI-691 made
a genuine stall terminal after 3 rounds. The runner just stops hiding it.

1. `downloadWarnings(logText, seen)` — pure. Pulls `[WARN]`/`[ERROR]` lines in
   the `[download]` category out of a log string, dedupes against a `Set` of
   already-emitted whole lines, returns the messages.
   Dedupe by line, not by byte offset: `routes/logger.js` rotates `app.log` at
   `MAX_LOG_BYTES = 256 * 1024`, so an offset would silently reset mid-install.
2. `drainDownloadWarnings()` — fetches `GET /logs/read` (`routes/system.js:279`)
   and `log()`s each new message as `\n  ⚠ [download] <msg>`. The leading newline
   closes the running row of dots. `log()` not `console.log`, so the warnings
   land in `dev_configs/smoke-run.txt` beside the transcript they explain.
   A failed fetch is swallowed — the log must never fail a paid run.
   The 256 KB rotation ceiling is what makes a whole-file read per poll cheap
   enough to need no range/offset protocol.
3. Wire into `waitReady()` behind `{ watchLog: true }`, passed at the two
   install call sites only. The generation-matrix waits do not pay an HTTP
   round trip per poll for a phase this card is not about.

## Verification

**Verify mode:** auto

`node scripts/smoke-workflows.mjs --self-check` — the file's own assert suite
(pure, no app, no Pod, no network; exempt from `guard-gpu`'s regex). New asserts
drive a synthetic fixture log through `downloadWarnings()`:

- two `[download]` WARN/ERROR lines are returned, in file order
- an `[INFO] [download]` line and a `[WARN] [engine]` line are ignored
- a second call over the same text returns nothing (dedupe)
- a rotated log (fresh text, same `seen`) still returns only its unseen lines

## Constraints honoured

- A peer session is executing this file right now (`pid 17864`, the 1.4.5
  release smoke matrix). Node read it at import, so a disk edit cannot affect
  that run — but the file is claimed in `files.json` at `todo -> doing`.
- Not verified live: the runner is GPU-lease gated and a live run rents a CPU
  Pod and pulls ~290 GB. Fixture only, as the brief directs.
- `dev_configs/` untouched — no `node_lock.json`, no `smoke-evidence.json`
  (claimed by MPI-687), no regenerated `smoke-run.txt`.

## Current State

Implemented and self-check verified. See `validation.md`.

## Remaining Work

None. Live behaviour is unproven by design — the next real smoke run is the
first time the new lines can print.

## Completed

- `downloadWarnings()` + `drainDownloadWarnings()` + `waitReady({ watchLog })`
- four `--self-check` asserts over a synthetic fixture log

## Plan Drift

- 2026-09-05: no plan existed when the card was picked up; this file was written
  from `brief.md` at `todo -> doing`.
