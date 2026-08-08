# MPI-480 - a transient wrapper 404 must be a toast, not a GitHub report

## What happened

During the MPI-467 smoke fill (2026-08-08) the runner created a cold `__cpu__` download
Pod and began installing. The Pod answered `/health` green BEFORE `/wrapper/models/install`
was routable, so all 12 `ltx-23-balanced` deps threw `wrapper install 404` inside the same
0.2 seconds. The user saw a **Download Failed** modal with a **REPORT ON GITHUB** button -
for a boot race that self-heals. It did: re-POSTing the same model installed all 12 deps.

## Why this is a defect, not a judgement call

The contract is already written down, in `routes/remoteModels.js:82-90`:

> A genuinely-down wrapper still fails after the budget, surfaced to the user as a TOAST
> (never an error+GitHub dialog - it's transient).

`wrapperFetch` spends ~30s (15 x 2s) on transient statuses before throwing. What it throws
reaches `routes/downloadManager.js:2355-2362`, which logs `remote install trigger failed
for <dep>` and broadcasts `download:failed`. Downstream of that broadcast the renderer picks
the report-dialog path instead of the toast path. That classifier is the bug.

## Do not fix it by widening the retry budget

A bigger budget hides this instance and leaves the classification wrong. The budget is also
arguably correct as-is - a cold `-cpu` Pod is the slow case, and MPI-467 now absorbs it at
the caller with one retry round (`scripts/smoke-workflows.mjs`). What is wrong is that a
transient, self-healing condition asks the user to file a GitHub issue.

## Where to look

- `routes/remoteModels.js:82-136` - `wrapperFetch`, its transient-status list and budget
- `routes/downloadManager.js:2355-2362` - the catch that logs and broadcasts `download:failed`
- the renderer listener for `download:failed` - it decides toast vs error dialog

## How to reproduce

POST an install at a `__cpu__` Pod inside its first seconds, while `/health` is green and
`/wrapper/models/install` still 404s. Do not settle for a synthetic throw: the point is how
a REAL transient is classified, and a hand-thrown error can take a different path.
