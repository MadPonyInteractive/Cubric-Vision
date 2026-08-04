# MPI-438 — Universal ops break on a Pod volume

Found live 2026-08-04 while testing MPI-413's Pod convergence. Split out of that card
because it is a different system: universal-workflow dependency resolution, not the pip set.

## The contract, and where it stops being true

`js/data/modelConstants/universal_workflows.js:5-7` states it plainly:

> Dependencies for universal workflows are the universal DEPS set (dependencies.js):
> every `type:'custom_nodes'` node + every `engineAsset:true` weight (MPI-222). They are
> installed automatically with the engine and are never tracked per-workflow.

`routes/shared.js` `getUniversalWorkflowDepIds()` agrees — *"all nodes are universal (MPI-222)"*.

That contract is enforced for the **local engine only**. `checkUniversalWorkflowDepsStatus()`
resolves through `resolveComfyPath` / `getCustomRoot` (local disk) and feeds the boot-repair
ladder. **There is no remote twin.**

On a Pod the "engine" is image + volume:

- `installRequirements: true` packs are **baked into the image** (`remoteModels._isImageResident`).
- the 7 **code-only** packs reach the network volume *only* when a MODEL declaring them is
  installed there.

So a universal op whose graph uses a code-only pack fails on any volume that never happened to
install one of the specific models carrying it.

## The live failure

Pod `jtoo2fl2xgtt5y`, volume `9t3awufudk`, dev app, image `v0.18.0-dev`:

```
Resize Video -> ComfyUI rejected prompt - missing_node_type
  "Node 'Video' not found. The custom node may not be installed."
  class_type: VHS_LoadVideoPath, node_id 9
```

Evidence gathered, with a negative control:

| probe | result |
|---|---|
| Pod `/object_info` (dev mode exposes raw ComfyUI on 8188, no auth) | 1822 node types, **zero `VHS_*`** |
| `POST /remote/model-present {custom_nodes, comfyui-videohelpersuite}` | **`present: false`** |
| control: same for `comfyui_ultimatesdupscale` (also code-only, also volume) | `present: true` |

**Not an MPI-413 regression.** The wrapper code MPI-413 deleted only ran `requirements.txt`
for an already-extracted folder and never downloaded a node; `start.sh`'s boot loop likewise
only touches folders that exist. Neither could make a working VHS disappear.

## Measured blast radius

Swept every `UNIVERSAL_WORKFLOWS` graph's `class_type` set against the local `custom_nodes`
sources, then mapped pack to declaring models:

| code-only pack | universal ops needing it | models that install it |
|---|---|---|
| `ComfyUI-VideoHelperSuite` | `resizeVideo` | **2 of 18** — wan-22, wan22-5b |
| `comfyui-inpaint-cropandstitch` | `appHeadSwap` | **3 of 18** — klein-4b, boogu-edit-high, boogu-edit-balanced |
| `ComfyUI-MpiNodes` | all 12 | all 18 — only broken on a volume with zero models |

`appHeadSwap` is a **second live-broken op nobody had reported**, and MPI-332 keeps Head Swap
while ripping the other three test apps — so it does not go away on its own.

**Sweep trap for whoever redoes this:** the local `custom_nodes/ComfyUI-MpiNodes` is a
**symlink**, so `fs.readdirSync(..., {withFileTypes:true})` reports `isDirectory() === false`
and every `Mpi*` class silently vanishes from the index. The first pass under-reported for
exactly this reason. `stat` and follow the link.

## Fix direction (not yet decided)

Give the remote engine the twin of `checkUniversalWorkflowDepsStatus`: on connect / engine
setup, ensure the code-only universal node set exists on the volume and install what is
missing at its `node_lock` commit, reusing the wrapper's existing volume-install path
(`_run_node_install`).

Open decisions:

- every connect, or lazily when a graph needs it?
- how it reports progress (the install UI is model-keyed today)
- interaction with MPI-403 (engineAssets never reach the Pod's fast disk) — related area,
  different mechanism; do not merge.

## Verify

On a Pod volume with **no** Wan 2.2 and **no** Klein/Boogu installed, both Resize Video and
Head Swap succeed.
