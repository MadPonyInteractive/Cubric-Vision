# MPI-438 Plan — remote twin for universal node deps

Compact plan. Diagnosis and blast radius are in `brief.md`; do not repeat them here.

## Current State

Diagnosed and swept, no code written. The local engine honours the
"universal deps install with the engine" contract via
`checkUniversalWorkflowDepsStatus()` + the `POST /engine/repair-deps` ladder.
The remote engine has no twin, so the 7 code-only packs reach a Pod volume only
when a model declaring them is installed there.

## Decision (user, 2026-08-04): option A — ensure on every connect

Rejected alternative: lazily, when a dispatched graph needs a missing pack. That
keeps connect free but needs a graph-to-pack map at dispatch time and still
surfaces the failure as a mid-generation stall. Option A matches what the local
engine already does at boot, which is the whole point of closing a half-wire.

## Implementation

One function plus one hook, reusing the existing remote machinery — no new
install path, no new UI.

- `routes/shared.js` — export the universal dep OBJECTS (it already computes the
  id list in `getUniversalWorkflowDepIds()` and already `_require`s the ESM dep
  registry).
- `routes/remoteModels.js` — `ensureUniversalNodesOnVolume()`:
  1. take the universal deps, keep `type: 'custom_nodes'` that are NOT
     `_isImageResident` (i.e. the code-only ones the image does not bake),
  2. one batched `remoteModelsCheck()` call to learn which are absent,
  3. `remoteInstallDep()` each missing one (the wrapper stamps
     `.mpi_node_commit` from `getPinnedNodeCommit`, same as a model install),
  4. poll the batched check until they land, then restart ComfyUI ONCE so the
     new packs register.
- `routes/remotePodLifecycle.js` — fire it once per Pod, non-blocking, at the
  point `/remote/comfy/status` first sees the wrapper report ready.

Nothing runs when the volume is already complete: one batched status call, zero
installs, zero restarts.

## Verification

**Verify mode:** auto

- `node --test "tests/*.test.cjs"` stays green.
- A unit test proves the selection: the code-only universal packs are chosen and
  the baked (`installRequirements: true`) ones are excluded.
- Live (folds into MPI-413's image test): on a Pod volume with no Wan 2.2 and no
  Klein/Boogu, Resize Video and Head Swap both succeed.
