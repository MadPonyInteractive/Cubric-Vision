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

**6. SYNC THE LOCK INTO mpi-ci, then rebuild the Pod image — the DEV image.**

> 🛑 **BUILD THE DEV IMAGE, NEVER THE USER-FACING ONE.** A bumped engine in the released
> image breaks every user's remote Pod on their next boot, with no staging step in between.
> The split already exists (MPI-340) and `routes/remotePodLifecycle.js` resolves it:
> ```js
> const POD_IMAGE_VERSION     = 'v0.17.0';       // released users
> const POD_IMAGE_VERSION_DEV = 'v0.19.0-dev';   // dev app runs only
> const v = _devMode ? POD_IMAGE_VERSION_DEV : POD_IMAGE_VERSION;
> ```
> So: tag `v<ver>-dev-<profile>` and bump **only** `POD_IMAGE_VERSION_DEV` /
> `POD_IMAGE_VERSION_CPU_DEV`. A shipped build cannot resolve a `-dev` tag, which is what
> makes smoking a bumped engine safe. `/build-pod-image` step 1 owns this decision — do not
> re-derive it. **The smoke therefore runs against the DEV image**, and the evidence is
> evidence about that image.
>
> **The Pod has TWO dev-gated halves and you must stay on the dev side of BOTH.** The image
> (above) *and* the R2 runtime — `bootstrap.sh` reads `CUBRIC_RUNTIME_CHANNEL`, default
> `stable`; a dev app run creates Pods on `dev`, a released portable never does. So runtime
> edits go out with `./publish-runtime.sh dev`, and **never** `publish-runtime.sh stable`,
> which lands untested on released users. Knowing only one half is enough to break them.
>
> **Promotion happens at RELEASE, and it is a clean rebuild — never a rename.** Per
> [`../../runpod-remote-engine.md` § Dev image pins](../../runpod-remote-engine.md): *"Promotion
> is a clean rebuild at a real version, never a dev tag renamed into the stable pin."* That is
> why nothing in the release flow copies `POD_IMAGE_VERSION_DEV` into `POD_IMAGE_VERSION` —
> there is no const to promote. **An engine bump makes that rebuild mandatory:** ship the app
> at the new pin while the released image is still on the old one and every user gets a local
> engine and a remote Pod running different ComfyUI versions, silently. `mpi-release`'s
> "a dev-only Pod IMAGE tag needs no action" is true for ordinary image work and NOT true here.

Two steps, and the first is the one that gets skipped, because the Pod's lock is **a
different file in a different repo**: `c:\AI\Mpi\mpi-ci\cubric-vision-pod\node_lock.json`.
Bumping Vision's copy does nothing to it. The image bakes nodes from *that* file, so an
un-synced lock rebuilds the image at the OLD engine and gate 7 then refuses to smoke —
after you have paid for a build.

**Two files travel, not one — `node_lock.json` AND `python_deps.txt` (MPI-413).** The
Dockerfile `COPY`s both, a node bump moves both (the lock directly, the curated set via
`node scripts/compile-node-deps.mjs`), and shipping one without the other bakes an engine
whose nodes and Python set disagree. Syncing only the lock is how a Pod that *looks* synced
still drifts.

Measured 2026-08-07: Vision sat at `v0.30.0` while the Pod lock was still `v0.29.2`, with
`comfyui-kjnodes` and `ComfyUI-MpiNodes` both behind. The same day, a lock-only sync passed
its own drift check while `python_deps.txt` was still missing `imageio-ffmpeg` — the image
built clean and would have failed every video op at runtime (MPI-472).

**You do not have to remember this — the smoke runner checks it for you.** A step that
lives only in a playbook is a step someone forgets, so `scripts/smoke-workflows.mjs` runs
the comparison itself: it **warns on `--plan`** (which still prints the full matrix) and
**hard-fails before renting anything** on a real run, naming the exact drift and the fix:

```
  🛑 POD LOCK IS BEHIND — core v0.29.2 -> v0.30.0, ComfyUI-MpiNodes, comfyui-kjnodes, python_deps.txt
  Sync them, rebuild the DEV image, then re-run:
    cp dev_configs/node_lock.json ".../cubric-vision-pod/node_lock.json"
    cp dev_configs/python_deps.txt ".../cubric-vision-pod/python_deps.txt"
    git -C ".../cubric-vision-pod" commit --only node_lock.json python_deps.txt -m "chore(pod): sync node_lock to ComfyUI 0.30.0"
    /build-pod-image   — DEV tag v<ver>-dev-<profile>, bump ONLY POD_IMAGE_VERSION_DEV/_CPU_DEV
```

It compares `python_deps.txt` LF-normalized — this repo converts line endings, so a raw byte
compare would report drift on a clean checkout.

The lock files are structurally identical (same 14 nodes, same fields), so the sync really is
a straight copy of both. `mpi-ci` lives at `c:\AI\Mpi\mpi-ci\cubric-vision-pod` — override with
`CUBRIC_POD_REPO`; an absent path warns rather than blocks, so another machine is not stuck.
It is a separate git repo — commit there with `git -C`.

**Sync LAST, not first.** Both files are live working-tree state in Vision; a card landing
mid-bump (MPI-472 added `imageio-ffmpeg` hours after a sync on 2026-08-07) silently re-drifts
a Pod you already synced and built. Re-run `--plan` immediately before the smoke, not only
before the build.

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
| **`python_deps.txt` travels WITH the lock** — syncing only the lock bakes an engine whose nodes and Python set disagree, and it builds clean | Gate 6; MPI-413. A lock-only sync on 2026-08-07 passed its own check while `imageio-ffmpeg` was missing (MPI-472) |
| Both sync files are live working-tree state — a card landing mid-bump re-drifts a Pod already synced and built | Gate 6; re-run `--plan` right before the smoke |
| Building the **user-facing** Pod image with a bumped engine breaks every user's remote Pod on next boot | Gate 6 — build `-dev`, bump only `POD_IMAGE_VERSION_DEV` |
| **The image and the runtime are promoted separately, and only the runtime is automatic-ish** | `publish-runtime.sh promote` moves R2 bytes; the image tag is a manual `POD_IMAGE_VERSION` edit — see gate 6 note |
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
- [ ] **`node_lock.json` AND `python_deps.txt` synced into `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`** — core tag, every node commit, and the curated pip set all agree with Vision's copies (drift command in gate 6), committed there with `git -C`
- [ ] Drift re-checked immediately BEFORE the smoke, not only before the build — both files are live working-tree state and a card landing mid-bump re-drifts them
- [ ] **DEV** Pod image rebuilt at the new lock (`build-pod-image`) — `v<ver>-dev-<profile>`, only `POD_IMAGE_VERSION_DEV`/`_CPU_DEV` touched, user-facing `POD_IMAGE_VERSION` untouched
- [ ] **Pod reports the new version** — asserted before any smoke run
- [ ] Smoke matrix executed and green ([01-smoke-run.md](01-smoke-run.md)); skips named explicitly
- [ ] Evidence file written; `mpi-release` gate satisfied
- [ ] Windows-half limitation stated in the evidence — Pod-green ≠ Windows-green

An engine bump **is** an app version bump — the 2nd digit, per `/mpi-release` — unlike a
model addition, which is not versioned at all. It must also update
`dev_configs/system_dependencies.json`, the provisioning routes/docs, and the release
notes' engine section (`.claude/rules/versioning.md:15`). Run `/mpi-version-bump` after
this playbook, not instead of it.
