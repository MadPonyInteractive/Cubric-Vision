# MPI-230 Validation

**Verify mode:** user-ux
**Status:** LIVE-VERIFIED on a real Pod (2026-07-09).

## Design change from the card
Card proposed a confirm-gated dialog. Dropped it — the LOCAL engine auto-heals node
drift silently (boot-repair modal), and node re-clones are KB-scale (the "multi-GB"
fear applies to weights, which don't drift). So the shipped behavior is **silent
auto-heal on genuine first connect = local parity**: no dialog, no toast, no manual
Install click. (User-confirmed this is the intended behavior.)

## Implementation
- `js/data/modelRegistry.js` — `syncModelInstalled` collects models owning a drifted
  volume node (per-dep `drifted:true` from remoteModelsCheck) into `_driftedModelIds`;
  exposed via `getDriftedModelIds()` + added to the `models:checked` emit.
- `js/shell.js` — `_healRemoteNodeDrift()` fires once on the genuine first remote
  connect (latched by `_didFirstConnectDriftCheck`); reuses the manual install path
  (`downloadService.start` → server re-checks drift per dep → force re-clone of the
  drifted node; complete weights dedupe out).
- `tests/node-drift.test.cjs` — 3 surface tests (drift→owning-model, none→empty, dedup).

## Bug found + fixed during live test
`dlg.el.on is not a function` (shell.js) — `.on` is on the mounted instance (`dlg.on`),
not `dlg.el`. Moot now (dialog removed), but was the reason the first live attempt did
nothing.

## Live proof (Painter node, Wan 2.2 Smooth, EU-RO-1 Pod)
1. Installed Wan 2.2 Smooth → Painter cloned to volume at `a044ac7b…` + marker.
2. Bumped node_lock Painter → `f87bf8d6…` (drift), reconnected.
3. First connect → remote check tagged Painter `drifted:true` → `getDriftedModelIds()`
   = [wan-22] → `_healRemoteNodeDrift` auto-fired SILENTLY.
4. Painter force re-cloned at `f87bf8d6…` → ComfyUI restarted to load the node →
   queued gen waited for verify then ran. Post-heal: Painter `installed:true`, no drift.
5. Zero clicks, no dialog, no toast — local parity confirmed.

## Automated
- `node --test tests/node-drift.test.cjs` → 23/23 (3 new).
- ESLint + `node --check` clean on both edited files.

## Cleanup
- node_lock restored to canonical (Painter `a044ac7b…`, VHS `4ee72c0…`). git diff on
  node_lock is empty.
