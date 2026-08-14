# MPI-558 — The smoke-gate runner: a Pod-side twin and a stale GPU order

Umbrella created by the consolidation sweep, 2026-08-14. Two `todo` cards, one file:
**`scripts/smoke-workflows.mjs`.** Both cards already name the other as SIBLING and both say
the same thing — do them in one pass rather than touching the runner twice.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-502 | Gate 9 needs a Pod-side twin — read `/object_info` from the wrapper to cover third-party and programmatic-`INPUT_TYPES` nodes |
| MPI-524 | `GPU_ORDER`'s "cheapest-first" comment is stale — our own `MIN_RAM_GB = 48` excludes the two cheap cards |

Both surfaced out of MPI-467 (the 1.4 smoke umbrella, now closed) and its live Pod
sessions on 2026-08-09 / 2026-08-10.

## Current State

Not started, both `planned`. Gate 9 itself SHIPPED under MPI-467: `checkRequiredInputs`
sweeps every graph in `comfy_workflows/`, diffs every `Mpi*` node against the required inputs a live
engine reports, and refuses to answer unless the local `ComfyUi-MpiNodes` checkout sits
exactly at the `node_lock` pin. Verified by replaying pre-fix graphs out of git — it flags
exactly MPI-498's six nodes and zero against the working tree.

Neither member is a defect in that gate. MPI-502 is its two structural blind spots;
MPI-524 is a comment that no longer describes the code under it.

## Why one card and not two

One file, one runner, and the two changes sit close enough that two passes means two
diffs over the same region for no gain. Beyond that they share a failure mode: **the
runner asserting something it did not really establish.** Gate 9 can be skipped entirely
when no local engine answers, and covers only `Mpi*` classes, so a hole in a KJNodes or
Impact node is invisible — while `GPU_ORDER` claims a cheapest-first ordering that our own
RAM floor has already invalidated. Same lesson as MPI-498: a gate that quietly reports
nothing is worse than one that refuses out loud.

## Phase 1: The stale order (MPI-524)

Cheapest to land, no live infrastructure, no dependency on phase 2. Across THREE
consecutive runs on 2026-08-10 the L4 refused, the RTX 3090 refused, and only the 4090
took it — every time. That is `MIN_RAM_GB = 48` excluding those host classes in EU-RO-1
(the volume pins the datacenter), not availability noise. Every run pays two pointless
refusal round-trips to rediscover it.

**Do NOT lower the floor blind.** 48 GB exists because weights spill to system RAM on a
24 GB card. Either re-measure the order under the real floor, or drop the floor only after
confirming `footprint.js` no longer needs it. And `ramFloorMissed: true` is NOT evidence
the floor caused a refusal — `routes/remotePodLifecycle.js:859` sets that flag on ANY
failure of the RAM-floor GraphQL create path. RunPod's own message is the signal.

## Phase 2: The Pod-side twin (MPI-502)

Read `/object_info` from the wrapper. That is authoritative for the exact commit installed,
covers every class including the ~120 `Mpi*` nodes that build `INPUT_TYPES`
PROGRAMMATICALLY (`MpiAnySwitch`, `MpiAnySwitch10`, `MpiPacker`, `MpiClearVram`,
`MpiSimpleBoolean`, `MpiBoolean` — which is exactly why MPI-498 insisted the gate must
never parse source), and costs one HTTP call on a Pod already rented.

**REUSE, DO NOT REWRITE:** `requiredInputHoles(graph, objectInfo)` is already exported from
`scripts/smoke-workflows.mjs` and is source-agnostic — it takes any `/object_info` map. The
Pod variant is a second SOURCE for the same pure function, not a second gate.

Why this was not done inside MPI-467: the wrapper has no `/wrapper/object_info` route (it
only fetches `/object_info` internally, `wrapper.py:555`). Adding one means editing the
wrapper in `mpi-ci/cubric-vision-pod` plus a `/proxy/object_info` passthrough in
`routes/remoteProxyForward.js` (mirror `/proxy/queue` at line 138), then
`./publish-runtime.sh dev` → restart the Pod → test → promote. **That is a live runtime op
on shipped infrastructure — get the user's go before the promote.** Never
`publish-runtime.sh stable` for this.

## Verification

Phase 1: run `node scripts/smoke-workflows.mjs --plan` (spends nothing) and confirm the
comment matches the constant; a real run should stop paying refusal round-trips for cards
the floor already excludes. Phase 2: the wrapper answers `/object_info` through the app
route, and `requiredInputHoles` fed from it reproduces gate 9's known-good result — flags
MPI-498's six replayed nodes, zero against the working tree.

## Parallel Batch

**None — and that is the point.** Both members own `scripts/smoke-workflows.mjs`. Phase 2
additionally owns `routes/remoteProxyForward.js` and the sibling
`c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper\wrapper.py`. Run the phases in order in one
session. Derive ownership from each member's `files.json` at dispatch time, not from this
list.

One standing trap for whoever picks this up: the runner is import-safe now
(`INVOKED_DIRECTLY` guard), but importing it used to run a LIVE matrix and rented an L4 by
accident on 2026-08-09. Do not remove that guard.

## Plan Drift

(none yet)
