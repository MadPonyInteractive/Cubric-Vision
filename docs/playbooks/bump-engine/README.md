# Bump the ComfyUI Engine — End-to-End Playbook

> The single procedure for moving the engine users run. **Read this file first, then
> [02-local-upgrade.md](02-local-upgrade.md) at the local gate and
> [01-smoke-run.md](01-smoke-run.md) at the smoke gate.**
>
> **This is NOT `/mpi-bump-local-comfy`.** That skill bumps the standalone authoring bench
> at `G:\ComfyUi` and syncs its `extra_model_paths.yaml`. It never touches
> `dev_configs/node_lock.json` and nothing it does reaches a user. This playbook is the
> bump that ships.
>
> Cross-reference: [../../versioning.md § COMFY_VERSION](../../versioning.md) (the two
> version files), [../../../.claude/rules/comfy_engine.md](../../../.claude/rules/comfy_engine.md)
> (engine architecture), [../../runpod-remote-engine.md](../../runpod-remote-engine.md) (the Pod half).

## Why this playbook exists

MPI-465 shipped a **completely dead LTX** to every user on 1.3.0 and 1.3.1 for six days.
A ComfyUI bump (`v0.28.0 → v0.29.2`) changed a return type that a custom node called, and
the graph threw at sampling start. Nothing caught it because **nothing in this repo ever
executed a workflow**. It was found by accident, when the user went back to LTX for
unrelated authoring work.

Two lessons are baked into the order below and are not negotiable:

1. **Validation is not enough.** MPI-465 threw *after* the loaders ran, inside a KJNodes
   `OUTER_SAMPLE` wrapper. ComfyUI's own graph validation passed it. Any check that POSTs a
   graph and reads `node_errors` would have reported green.
2. **A skipped model must never read as a pass.** Silent truncation is how a green run lies.

## There are TWO engines and one pin

`dev_configs/node_lock.json` `comfyui.core.tag` is the single pin, but it feeds two very
different runtimes, and **a bump is not done until both are proven**:

| | What users get | Proven by |
|---|---|---|
| **Local** | `ComfyUI_windows_portable`, provisioned by `_runEngineDownload` (`routes/engine.js`) | Install at the new pin, then assert **every `class_type` used by `comfy_workflows/*.json` registers** ([02](02-local-upgrade.md)) |
| **Remote** | The RunPod Pod image, which bakes nodes from the same lock | Rebuild the image, assert the version, then the **executing smoke matrix** ([01](01-smoke-run.md)) |

**Pod-green is not Windows-green.** The Pod is Linux off a baked image with its own
python/torch/CUDA. A Windows-only break — a wheel that will not build, a MAX_PATH wall, a
torch floor — passes the smoke and still ships broken. Say so in the evidence; do not let a
green matrix stand in for the local half.

**The version lives in TWO files and they have desynced in production.** On the 1.1.0
promote, `system_dependencies.json` said `0.26.0` while `node_lock.json` said `v0.27.0` —
the local engine would have pulled 0.26 while every node targeted 0.27. Grep both at every
bump; never trust one file alone.

## The order — gates in sequence, do not reorder

**0. Research the breaking surfaces FIRST.** Read the upstream changelog and diff between
the current and target tags for API changes, not just features. Fix in one coherent pass;
never patch one symptom at a time. (`feedback_research_first_on_version_breaks`.)

**1. Confirm the target is reachable.** An upstream tag can exist with **no Comfy-Org
portable build** — `v0.30.1` and `v0.30.2` were real tags with no release asset, which made
`0.30.0` the ceiling on 2026-08-06. Check before picking a target:

```bash
gh api repos/Comfy-Org/ComfyUI/releases/tags/v<ver>
```

**2. Date any suspected break against `node_lock.json`'s OWN history — not `git tag --contains`.**
That is exactly what misled the first MPI-465 diagnosis. What matters is when *we* moved the
pin, not when upstream landed the commit:

```bash
git log -p --follow -- dev_configs/node_lock.json | grep -n "core\|tag"
```

**3. Bump the pin in BOTH files.** `node_lock.json` `comfyui.core.tag` + `commit`, and
`system_dependencies.json`. Grep both afterwards and confirm they agree.

**4. Re-check every pinned custom node against the new core.** MPI-465's failure mode was a
node calling a core API that changed — the node's own pin was innocent. Walk `nodes` in
`node_lock.json` and check each repo's compatibility with the target tag.

**5. LOCAL gate — empirical `class_type` floor.** Install the engine at the new pin and
assert that every `class_type` appearing in `comfy_workflows/*.json` registers in
`/object_info`. This is an **empirical** check against a live engine, never a reading of
release notes. Full sequence + how the engine moves in place → **[02-local-upgrade.md](02-local-upgrade.md)**:

```bash
node scripts/engine-floor-check.mjs
```

**6. SYNC THE LOCK INTO mpi-ci, then rebuild the Pod image.** Two steps, and the first is
the one that gets skipped, because the Pod's lock is **a different file in a different
repo**: `c:\AI\Mpi\mpi-ci\cubric-vision-pod\node_lock.json`. Bumping Vision's copy does
nothing to it. The image bakes nodes from *that* file, so an un-synced lock rebuilds the
image at the OLD engine and gate 7 then refuses to smoke — after you have paid for a build.

Measured 2026-08-07: Vision sat at `v0.30.0` while the Pod lock was still `v0.29.2`, with
`comfyui-kjnodes` and `ComfyUI-MpiNodes` both behind. Check before building:

```bash
node -e "const a=require('./dev_configs/node_lock.json'),
  b=require('c:/AI/Mpi/mpi-ci/cubric-vision-pod/node_lock.json');
  const d=Object.keys(a.nodes).filter(n=>a.nodes[n].commit && b.nodes[n]?.commit!==a.nodes[n].commit);
  console.log('core:', a.comfyui.core.tag, 'vs pod', b.comfyui.core.tag);
  console.log('drifted nodes:', d.join(', ')||'none')"
```

Both lines must agree before `build-pod-image` runs. Remember `mpi-ci` is a separate git
repo — commit there with `git -C`.

**7. ASSERT the Pod reports the new version — before smoking anything.**
This gate is the difference between a real check and theatre: smoke an unrebuilt image and
you validate the **old** engine, then stamp the bump safe. `dev_mode` exposes raw ComfyUI on
`8188`; `/object_info` is what actually registered.

**8. Run the smoke matrix.** [01-smoke-run.md](01-smoke-run.md). It executes a minimal
generation for every op, on a Pod, off a volume that owns every weight.

**9. Record the evidence.** The runner writes it; `mpi-release` refuses a bumped engine
without it.

## Traps

| trap | detail |
|---|---|
| Validation-only checks report green on the exact bug this playbook exists to catch | MPI-465 threw after the loaders, inside a node wrapper |
| The version lives in **two** files that have desynced in production | [../../versioning.md § COMFY_VERSION](../../versioning.md) |
| An upstream tag can have **no portable release asset** | `v0.30.1`, `v0.30.2` — check with `gh api` first |
| `git tag --contains` dates the UPSTREAM commit, not our adoption | Date against `node_lock.json` history |
| Smoking before the Pod image rebuild validates the **old** engine | Gate 7 exists for this |
| **The Pod's `node_lock.json` is a DIFFERENT FILE IN A DIFFERENT REPO** — bumping Vision's copy leaves the image on the old engine | Gate 6; measured drift `v0.30.0` vs `v0.29.2` on 2026-08-07 |
| Pod-green says nothing about the Windows portable | Gate 5 is the local half; both are required |
| A skipped model reading as a pass | [01](01-smoke-run.md) § What green prints |
| The full wipe destroys a **symlinked** custom node | The dev machine symlinks `custom_nodes/ComfyUI-MpiNodes` to the node source repo — [02](02-local-upgrade.md) § Traps |
| An upgrade that restamps a version the tree did not move to conceals itself forever | MPI-419; [02](02-local-upgrade.md) § Traps |

## Checklist (copy per bump)

- [ ] Research the breaking surfaces between current and target tags — API changes, not features
- [ ] Target tag has a Comfy-Org **portable release asset** (`gh api .../releases/tags/v<ver>`)
- [ ] Any suspected break dated against `node_lock.json` history, NOT `git tag --contains`
- [ ] Pin bumped in **both** `node_lock.json` (`tag` + `commit`) and `system_dependencies.json`; both grepped and agreeing
- [ ] Every pinned custom node re-checked against the new core
- [ ] **LOCAL gate:** engine upgraded to the new pin and booted; `node scripts/engine-floor-check.mjs` exits 0 ([02](02-local-upgrade.md))
- [ ] **`node_lock.json` synced into `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`** — core tag AND every node commit agree with Vision's copy (drift command in gate 6), committed there with `git -C`
- [ ] Pod image rebuilt at the new lock (`build-pod-image`)
- [ ] **Pod reports the new version** — asserted before any smoke run
- [ ] Smoke matrix executed and green ([01-smoke-run.md](01-smoke-run.md)); skips named explicitly
- [ ] Evidence file written; `mpi-release` gate satisfied
- [ ] Windows-half limitation stated in the evidence — Pod-green ≠ Windows-green

An engine bump **is** an app version bump — the 2nd digit, per `/mpi-release` — unlike a
model addition, which is not versioned at all. It must also update
`dev_configs/system_dependencies.json`, the provisioning routes/docs, and the release
notes' engine section (`.claude/rules/versioning.md:15`). Run `/mpi-version-bump` after
this playbook, not instead of it.
