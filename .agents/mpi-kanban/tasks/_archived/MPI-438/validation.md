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

### ~~Not claimed~~ → LIVE-VERIFIED 2026-08-04

Pod `vhks7b6fl1x57h` (L4, EU-RO-1, volume `9t3awufudk` — the volume the bug was found on),
image `v0.19.0-dev-cu130`, wrapper `0.2.41`.

Before state, captured in the window where the wrapper was up but `comfy_ready` was still
false (the ensure fires on `comfy_ready`, so this is genuinely "before"):

| pack | before |
|---|---|
| `comfyui-videohelpersuite` | `present: false` ← the bug, still live |
| `comfyui-inpaint-cropandstitch` | `present: true` |
| `comfyui_ultimatesdupscale` (control) | `present: true` |

Then, unprompted, from app.log:

```
[runpod] universal nodes: installing 2 missing on volume
         (ComfyUI-PainterI2Vadvanced, ComfyUI-VideoHelperSuite)
[runpod] universal nodes: installed …; ComfyUI restart -> 200
```

`ensureUniversalNodesOnVolume` executed against a real wrapper for the first time.
`/object_info` went 1822 → **1863** node types with **40 `VHS_*`**, including
`VHS_LoadVideoPath` — the exact class that threw `missing_node_type`.

**End-to-end generation passed.** Resize Video dispatched as prompt
`81b0399f-6d48-47e4-9403-e84ff1a4fe2e`: 9 nodes, `VHS_LoadVideoPath` +
`VHS_VideoInfoSource`, `status: success`, `completed: true`, `outputs: 18:videos`.

**Two corrections to this card's own brief, both found by running it:**

1. **The blast-radius table was incomplete.** The ensure found *two* missing packs, not
   one — `ComfyUI-PainterI2Vadvanced` was absent as well and is not in the table above.
   The table was built from `UNIVERSAL_WORKFLOWS` graph `class_type` sets; whatever pulls
   PainterI2Vadvanced onto the volume was not captured by that sweep. The shipped
   selection (all 7 code-only packs) was right anyway — it is broader than the table.
2. **The stated verify condition was not met, and could not be.** It asked for a volume
   with no Wan 2.2 **and no Klein/Boogu**. `comfyui-inpaint-cropandstitch` was already
   `present: true` on this volume, so **Head Swap was not a valid test here** — it would
   have passed for the wrong reason. Not run, and not claimed. The VHS half is the half
   this volume could prove, and it did.

Pre-existing and untouched: `routes/remoteModels.js:695` carries an unused
`eslint-disable` directive; confirmed present on the unmodified file.
