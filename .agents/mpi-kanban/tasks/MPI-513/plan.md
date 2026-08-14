# MPI-513 — Install state that lies to the user

Umbrella created by the `mpi-end-session` consolidation sweep, 2026-08-10. Four `todo`
cards, one shape: **what the install UI shows disagrees with what the store knows.**
(MPI-544 added by the 2026-08-14 sweep.)

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-497 | An already-present dep still fires an "installed" toast on re-verify |
| MPI-397 | The install/uninstall card move lags seconds behind the toast — it waits on a disk read |
| MPI-320 | MPI-276 write-flip: retire the legacy `_modelJobs`/`_depJobs` maps, `installStore` becomes the single writer |
| MPI-544 | Install-toast spam — a burst of completion toasts for work that is not happening. `research`, NEVER REPRODUCED |

## Current State

Not started. MPI-544 is the only one that is not a standing defect: it was seen once during
the 2026-08-11 download-Pod incident and has never reproduced, so it is carded rather than
fixed — **no evidence, no speculative patch.**

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

MPI-544 rides here for the same reason but with a weaker claim: it is the same shape as
MPI-497 (a toast announcing install work that did not happen), and its first candidate — a
MODEL-LEVEL `download:complete` re-broadcast when the install SSE reconnects and replays —
is a two-writer symptom, since the MPI-276 G9 snapshot protocol versions *deltas* and a
replayed terminal event is not a delta. **Do not go hunting it before phase 1 lands.** Two
dead ends are already ruled out and must not be re-walked: it is NOT the MPI-539 reconcile
path (the client drops `modelId: null` events, which is what that path broadcasts), and it
is not the abandon path (now terminal exactly once per model job).

If it fires again before phase 1, capture evidence BEFORE touching code: the `app.log`
download lines around the burst, and whether the SSE reconnected in that window.

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
