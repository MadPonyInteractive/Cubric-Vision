# MPI-243 — verify the 1.1.0 build (local engine, ComfyUI 0.27)

> **User tests this.** Install the shipped 1.1.0 build, launch, generate locally.
> If it fails, start an agent session **from this card** — everything needed is below.

## The finding

The engine version lives in **two files**, and they drifted:

| file | drives | moved to 0.27 in | date |
|---|---|---|---|
| `dev_configs/node_lock.json` `core.tag` | node pins + **Pod image** | `6884514b` (MPI-148) | 2026-07-03 |
| `dev_configs/system_dependencies.json` `engine.version` | **local-engine download** | `41c59093` (the 1.1.0 release commit) | 2026-07-09 |

`git merge-base --is-ancestor 6884514b 41c59093` → **true**. `node_lock` was already
`v0.27.0` when 1.1.0 was cut.

The local gate is at [`routes/engine.js:509-540`](../../../../routes/engine.js) (`/engine/version-check`):

```js
needsUpgrade: installedVersion !== null && installedVersion !== requiredVersion
// requiredVersion = COMFY_VERSION  ← read from system_dependencies.json
```

During **all** 1.1.0 testing `system_dependencies.json` said `0.26.0`, and the dev machine's
`engine/.mpi_engine_version` said `0.26.0`. Equal ⇒ no upgrade ⇒ **every local-engine test
ran on 0.26** while `node_lock` pinned 0.27-era node commits.

## What this does and does not mean

| engine | version during 1.1.0 testing | what it ships |
|---|---|---|
| **RunPod / remote** — reads `node_lock` | **0.27** | 0.27 ✅ tested on what it ships |
| **Local** — reads `system_dependencies` | **0.26** | 0.27 ⚠️ **never tested** |

**1.1.0 is the RunPod release.** Its own engine was on 0.27 throughout. The agents did not
skip the bump — they bumped the file the Pod reads (`node_lock`, MPI-148) and missed the file
the local downloader reads. This is precisely the trap recorded in memory as
`project_release_engine_version_desync`. The gap is real but **bounded**: it is the local
engine on 0.27, not "nobody ran the release".

## What to test

1. Install the shipped **1.1.0 artifact on a clean machine** (no pre-existing `engine/`).
2. Launch. Let it download ComfyUI **0.27** + the 11 universal-workflow custom nodes.
3. **Confirm all 11 nodes install without needing a Retry.** (See the race below.)
4. Generate on the **LOCAL** engine with at least one model per family: SDXL, Chroma, LTX, Wan.
5. Confirm the pinned node commits in `node_lock.json` work against core 0.27.

> **A RunPod run does NOT verify this** — see `feedback_runpod_not_local_engine_proof`.
> RunPod is the *remote* code path. This must be the local engine.
>
> If a fix is needed, check whether the **remote twin** needs it too —
> `feedback_check_both_engine_paths`.

## Incidental: a parallel-installer race (2026-07-10)

An agent launched the app on the bumped branch, which fired the 0.26→0.27 local upgrade for
the first time: ~2 GB (`ComfyUI_windows_portable_nvidia.7z` v0.27.0) + 11 node re-pins.

The parallel node installer **raced**: `python install.py` ran against
`comfyui-frame-interpolation` before its extraction finished —
`can't open file '...\comfyui-frame-interpolation\install.py': [Errno 2]`, exit code 2. The
batch aborted, leaving two nodes undownloaded:

```
/engine/deps-status → { missingDeps: ["ComfyUI-Impact-Subpack", "RES4LYF"],
                        driftedDeps: ["ComfyUI-Frame-Interpolation"] }
```

**The user pressed Retry and it recovered** (models 7/11 → 9/11, app booted clean). By then
the `comfyui-frame-interpolation` folder existed — confirming a timing race, **not** a 0.27
incompatibility.

⚠ If step 3 above needs a Retry, that race is reproducible on a clean install and deserves
its own card. `installRequirementsCommand: 'python install.py'` is declared for
`ComfyUI-Frame-Interpolation` in `dependencies.js:517`.

## Fix already in place

`41c59093` synced `system_dependencies.json` to `0.27.0`, so the drift is closed going
forward. **At every future engine bump, sync BOTH files** and grep `node_lock.core.tag`.
