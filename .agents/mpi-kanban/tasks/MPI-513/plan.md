# MPI-513 — Install state that lies to the user

Umbrella created by the `mpi-end-session` consolidation sweep, 2026-08-10. Three `todo`
cards, one shape: **what the install UI shows disagrees with what the store knows.**

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-497 | An already-present dep still fires an "installed" toast on re-verify |
| MPI-397 | The install/uninstall card move lags seconds behind the toast — it waits on a disk read |
| MPI-320 | MPI-276 write-flip: retire the legacy `_modelJobs`/`_depJobs` maps, `installStore` becomes the single writer |

## Current State

Not started.

## Why one card and not three

MPI-320 is the root and the other two are its symptoms. While two structures describe
one install — the legacy `_modelJobs`/`_depJobs` maps and `installStore` — the UI can
read one while the truth lives in the other. That is exactly a toast for an install that
did not happen (MPI-497) and a card that moves seconds after the toast that announced it
(MPI-397). Fixing either symptom on its own means teaching a consumer to distrust its
own source, which is the patch this repo's root-cause rule forbids.

So: MPI-320 first, then confirm 497 and 397 against the single writer rather than fixing
them separately. Both may simply stop.

## Phase 1: Single writer

MPI-320. `installStore` becomes the only writer; the legacy maps go. Sweep every
consumer in one pass — the map reads are spread across the install UI and the queue
panel, and a one-consumer fix on a shared primitive is a false done.

## Phase 2: Re-test the symptoms, do not pre-fix them

Re-run MPI-497 and MPI-397 against phase 1. Close whichever the write-flip already
fixed, and re-card only what genuinely survives, with the new evidence.

Verification for both is user-visible timing, so it needs the app, not a unit test:
`/comfy/downloads/status` plus `/active` split "the client thinks" from "the server
knows" (memory `tool_read_download_state_without_console`).

## Parallel Batch

None. Phase 2 depends on phase 1 by construction — the whole argument for this umbrella
is that the symptoms cannot be judged until the single writer lands. Within phase 1 the
consumers are one file each but they share `installStore`, so a fan-out would contend
on it.

## Plan Drift

(none yet)
