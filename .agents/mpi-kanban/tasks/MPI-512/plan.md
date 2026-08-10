# MPI-512 — Remote install and Pod disk

Umbrella created by the `mpi-end-session` consolidation sweep, 2026-08-10. It exists
because six `todo` cards describe one subsystem failing in six places, and read one at a
time they look like six unrelated bugs.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. When a phase below lands, close the member it covers and say so in its card. If
you decide the members are the better unit, delete this umbrella instead — Fabio picks
which of the two the board keeps.

## Members

| Card | What it is |
|---|---|
| MPI-510 | An interrupted remote install strands its partial on the volume, then the disk gate counts it against the retry |
| MPI-509 | A remote install can silently do nothing — the engine dep filter drops every dep and still answers `success: true` |
| MPI-496 | Stage-all-on-connect stages onto the download Pod, whose disk is hard-capped |
| MPI-489 | A renderer that did not start the download never subscribes to the SSE stream |
| MPI-485 | The orphan Pod sweep reaps by NAME, so a second app instance deletes the first one's live Pod |
| MPI-403 | `engineAssets` never reach the Pod's fast disk — hot-store staging stops too early |

## Current State

Not started. Every member is independently carded with its own evidence; read those
first, this file only holds the shape.

## The thread that connects them

Three of the six (510, 509, 489) share one failure mode: **the remote install path
reports success or silence for work it did not do.** A dropped dep set answers
`success: true`, a stranded partial is invisible to the sweep that should reclaim it,
and a renderer that did not start a download hears nothing about it. The other three
(496, 485, 403) are the disk and lifecycle underneath that path.

That suggests the ordering below: make the path tell the truth first, then fix what it
is telling the truth about.

## Phase 1: Make the remote install path answerable

MPI-509 first — a route that cannot say "I dropped your deps" makes every other bug in
this list harder to see. Then MPI-489, so the renderer hears the answer.

## Phase 2: Reclaim and account for the disk

MPI-510 and MPI-403. Both are about what is actually ON the volume versus what the app
believes is there. MPI-483's live-Pod evidence (already closed) is the measurement
baseline — read its `validation.md` before re-measuring anything.

## Phase 3: Pod lifecycle safety

MPI-485 and MPI-496. MPI-485 is the dangerous one: it deletes another agent's live Pod,
and it has already happened once (memory `tool_electron_launch_run_as_node`).

## Parallel Batch

None yet. Ownership overlaps heavily — 510, 509 and 489 all reach
`routes/remoteModels.js` and the install store, and 485/496 share
`routes/remotePodLifecycle.js`, so a naive fan-out would put two workers in one file.
A batch becomes possible AFTER phase 1 splits the route from the store; derive
ownership from each member's `files.json` at that point, not from this list.

## Plan Drift

(none yet)
