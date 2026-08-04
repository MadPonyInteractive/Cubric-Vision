# MPI-438 Validation

## Diagnosis (2026-08-04) — VERIFIED LIVE

Pod `jtoo2fl2xgtt5y`, volume `9t3awufudk`, dev app, image `v0.18.0-dev`, wrapper `0.2.41`.

| check | result |
|---|---|
| Resize Video dispatch | `missing_node_type`, `class_type: VHS_LoadVideoPath`, node 9 |
| Pod `/object_info` (dev mode, raw ComfyUI on 8188, no auth) | 1822 node types, **zero `VHS_*`** |
| `POST /remote/model-present {custom_nodes, comfyui-videohelpersuite}` | `present: false` |
| **negative control** — same for `comfyui_ultimatesdupscale` (code-only, volume) | `present: true` |

The control is what makes this conclusive: code-only volume packs DO load on this Pod;
VHS specifically was never installed on this volume.

**Ruled out as cause — MPI-413.** The wrapper code MPI-413 deleted
(`_install_node_requirements`) only ran `requirements.txt` against an already-extracted
folder and never downloaded a node. `start.sh`'s boot loop likewise only iterates folders
that exist, and it was unmodified and still running on this image. Neither could remove a
working VHS.

## Blast radius — MEASURED, not assumed

Swept every `UNIVERSAL_WORKFLOWS` graph's `class_type` set against the local
`custom_nodes` sources, mapped each to its pack, kept the code-only ones, then mapped
pack to declaring models:

| pack | universal ops | models installing it |
|---|---|---|
| `ComfyUI-VideoHelperSuite` | `resizeVideo` | 2 of 18 |
| `comfyui-inpaint-cropandstitch` | `appHeadSwap` | 3 of 18 |
| `ComfyUI-MpiNodes` | all 12 | 18 of 18 (zero-model volume only) |

First pass of the sweep UNDER-reported: `custom_nodes/ComfyUI-MpiNodes` is a symlink, so
`readdirSync(..., {withFileTypes:true})` reported `isDirectory() === false` and every
`Mpi*` class was missing from the index. Re-run with `statSync` following the link.

## Implementation validation (2026-08-04)

Option A shipped: ensure on every connect.

- `routes/shared.js` — `getUniversalWorkflowDeps()` returns the universal DEP objects
  (the id list already existed).
- `routes/remoteModels.js` — `_universalVolumeNodeDeps()` (the selection, exported for the
  test) + `ensureUniversalNodesOnVolume()`: one batched `remoteModelsCheck`, install each
  missing pack via `remoteInstallDep` (wrapper stamps `.mpi_node_commit` from
  `getPinnedNodeCommit`), poll the same check to a 60s deadline, then ONE ComfyUI restart
  if anything landed. Single-flight, since `/remote/comfy/status` is polled.
- `routes/remotePodLifecycle.js` — `_ensureUniversalNodes()` fires once per podId,
  non-blocking, the first time the wrapper reports `comfy_ready`.

Selection is exactly the 7 code-only packs; 16 baked/weight deps excluded.

### Sabotage results — the test earns its place

| sabotage | caught? |
|---|---|
| drop the `_isImageResident` filter (baked packs leak into the volume install) | YES — named `comfyui_controlnet_aux` |
| drop `ComfyUI-VideoHelperSuite` from the selection | YES |
| a dep arriving without `id` | YES |
| **`getUniversalWorkflowDeps` stops stamping `id`** | **NO — and that was correct** |

The fourth was the useful one. It passed because all 112 DEPS entries already
self-identify (`dep.id === its key`, verified), so the `{ ...DEPS[id], id }` spread was
dead code carrying a comment that misstated the data. Both removed; the test's id
assertion now guards the DATA invariant `remoteInstallDep` actually depends on.

### Not claimed

Zero live remote verification — no Pod was running. `ensureUniversalNodesOnVolume` has
never executed against a wrapper. The install/poll/restart sequence is code-verified only.
Folds into MPI-413's image test: a volume with no Wan 2.2 and no Klein/Boogu must run
Resize Video AND Head Swap.

Pre-existing and untouched: `routes/remoteModels.js:695` carries an unused
`eslint-disable` directive; confirmed present on the unmodified file.
