# 02 — The local half: move the engine, then prove the floor

> Gate 5 of [README.md](README.md), and the sequence the repo-side bump runs on itself.
> The Pod half ([01](01-smoke-run.md)) says nothing about the Windows portable — **this is
> the gate that does.**

```bash
node scripts/engine-floor-check.mjs                        # against the app engine (48188)
node scripts/engine-floor-check.mjs --url http://127.0.0.1:8188   # against the bench
```

## Bumping the pin — the sequence, in order

Proved by hand on `0.29.2 → 0.30.0`, 2026-08-06 (MPI-449/457).

1. **Does the target have a portable release asset?** An upstream tag can exist with no
   Comfy-Org build — `v0.30.1` and `v0.30.2` were both real tags with none, which capped
   the target at `0.30.0`. `platformEngine.js` builds the download URL from
   `Comfy-Org/ComfyUI/releases/download/v<ver>/…`, so a tag with no asset is not a
   reachable target however healthy it looks upstream.

   ```bash
   gh api repos/Comfy-Org/ComfyUI/releases/tags/v<ver> --jq '.assets[].name'
   ```

2. **Diff the target's `requirements.txt` against the current one.** That diff *is* the pip
   work, and it also hands you the `comfyui-frontend-package` /
   `comfyui-workflow-templates` pins that `node_lock.json`'s `frontend` block needs. On
   `0.29.2 → 0.30.0` it was three lines.

3. **Bump both files.** `dev_configs/system_dependencies.json` `engine.version` (no `v`)
   and `dev_configs/node_lock.json` `comfyui.core.tag` (with `v`) + `.commit` + the
   `frontend` block. Grep both afterwards — [they have desynced in
   production](../../versioning.md).

4. **`node scripts/compile-node-deps.mjs --check`, then regenerate.** It prints the core
   version it resolved, which is a free confirmation the pin propagated.

5. **Upgrade the local engine, boot it, and run the floor check.** § below.

## The floor check is EMPIRICAL — that is the whole point

`scripts/engine-floor-check.mjs` collects every `class_type` in `comfy_workflows/*.json`
and asserts each one registers in the live engine's `/object_info`. On the `0.30.0` bump
that cleared **all 14 pinned custom nodes in one shot** — 167 class_types, 0 missing —
after the release notes said nothing useful either way. Eleven of the fourteen were already
proved by the bench running the same commits on 0.30.2; the check confirmed it rather than
assuming it.

It replaces reading release notes and guessing which node broke. Run it against the engine
you actually just installed:

- **48188** — the app's engine. This is the one users get.
- **8188** — the standalone authoring bench (`/mpi-bump-local-comfy`). Useful as an early
  signal, **not** a substitute: the bench is a different install at a different pin.

Exit 0 = every class_type registers. Exit 1 = at least one does not, and it names them with
the workflows that use them. Feed a missing one to `node scripts/resolve-comfy-node.mjs
<class_type>` to find which node pack ships it.

**Registering is not running.** MPI-465 threw at sampling start with every class_type
registered. Passing this gate earns you the right to run [01](01-smoke-run.md); it does not
replace it.

## How the user's engine actually moves (MPI-457)

`POST /engine/upgrade` (`routes/engine.js`) takes the **in-place** path by default:

```
git fetch --tags origin
git checkout --force <node_lock comfyui.core.commit>
python -m pip install <only the requirement lines that MOVED>
printf '<version>' > <engine>/.mpi_engine_version
<repair any custom node the same lock change drifted>
```

The Windows portable ships ComfyUI as a real git checkout (`remote origin
Comfy-Org/ComfyUI`, HEAD at exactly the pinned sha) and bundles its own
`update/update.py`; the Linux/macOS engine is a comfy-cli clone. So this is upstream's own
mechanism — with one deliberate difference: **Comfy's updater pulls `master`, ours checks
out the PINNED sha.** Never change that.

Measured cost on `0.29.2 → 0.30.0`: one checkout and three pip packages, against an ~11 GB
wipe and a ~1 GB re-download plus every node and pip dep.

### Nobody calls that POST — the app fires it at boot, unattended

Easy to read the endpoint above as the thing *you* invoke to move the engine. You do not, and
neither does the user. The boot gate in `js/shell.js` does it for both of you:

```
GET /engine/version-check  →  needsUpgrade  →  _engineInstall.el.show('upgrading')
                                              → the component POSTs /engine/upgrade itself
```

Three consequences, and the middle one is the whole reason this is written down:

- **`needsInstall` and `needsUpgrade` are not symmetric.** The install modal waits for the
  user to click Install. The **upgrade modal starts the moment it is shown** — no button, no
  confirmation. So an engine bump reaches users as a *blocking, unattended* upgrade on first
  launch after the update: the app is gated behind `engine:ready` until it finishes.
- **Testing a bump needs no POST at all.** Bump the pins, start an app, and it upgrades itself.
  Measured on `v0.31.0 → v0.34.0` (MPI-649): the isolated instance logged
  `Upgrading engine in place to 0.34.0` about a second after the server came up, and was
  stamped 25 seconds later. Driving `POST /engine/upgrade` by hand is for forcing a `mode`
  (`full` / `in-place`), not for triggering the ordinary path.
- **The gate is skippable, and skipping it skips the drift repair.** `skipLocalEngine`
  (MPI-390) and `CUBRIC_E2E` (MPI-446) both bypass the whole block, so an engine under those
  flags stays on the old pin — with stale custom nodes — and nothing says so.

That is also why "restart the app" is a real step in this playbook and not a superstition: the
gate runs at boot and only at boot.

### The wipe still exists, and is reached by a DETECTED signal

Never by default, never by a guess. `_fullReinstallReason()` routes to the full
reinstall when:

| signal | why in-place cannot do it |
|---|---|
| engine python missing, no `comfyui_version.py`, or `ComfyUI` is not a git checkout | nothing to check out |
| a custom-node folder carrying our `.mpi_node_commit` marker is no longer in the registry | a checkout leaves the dead node importing forever |
| a **moved** requirement line names an engine-owned package (`torch`, `torchvision`, `torchaudio`, `triton`, `nvidia-*`, `cuda-*`) | the portable owns those; pip-installing them is the stomp `--no-deps` exists to prevent |
| the in-place path throws for any other reason | the wipe is the backstop, and it is automatic |

The marker is what makes the deprecation signal safe: a node folder the **user** dropped in
by hand has no marker, so their own work never triggers an engine wipe.

`POST /engine/upgrade {"mode":"full"}` forces the wipe; `{"mode":"in-place"}` disables the
fallback so a failure is reported instead of silently costing 11 GB. `auto` is the default
and the only mode the UI sends.

### Traps

| trap | detail |
|---|---|
| **The wipe destroys a symlinked custom node.** The dev machine symlinks `custom_nodes/ComfyUI-MpiNodes` to the node source repo; the reinstall replaces it with a plain clone at the pinned commit, so live edits stop reaching the app **silently**. | The in-place path never touches it — verified across the 0.30.0 checkout |
| **pip cannot overwrite a binary the running engine has loaded.** Windows: `WinError 5` on `cv2.pyd`. | The in-place path calls `stopComfyUI()` before git or pip |
| **Restamping a version the tree did not move to is self-concealing.** That was MPI-419: the stamp read healthy forever while a pinned node had stopped importing. | The in-place path re-reads `comfyui_version.py` and refuses to stamp unless it matches the pin |
| A requirement line that **disappears** is not pip work | Uninstalling a package a custom node still imports turns a core bump into a node crash |
| **`node_lock.json` keys are not the folder names on disk**, and the difference is not only case. `ComfyUI-UltimateSDUpscale` installs as `custom_nodes/comfyui_ultimatesdupscale` — hyphens become underscores. A hand-rolled sweep matching lock key to folder name, even case-insensitively, reports a perfectly healthy pack as **MISSING**. Measured on the `v0.34.0` bump (MPI-649): 1 of 17 packs false-negative that way. | **Do not hand-roll it — the mapping is declared and the check already exists.** `nodesDeps.js` carries `filename` (folder) beside `id` (lock key), and `checkUniversalWorkflowDepsStatus()` in `routes/shared.js` already walks every universal dep, resolves the folder through `resolveComfyPath`, and diffs `.mpi_node_commit` against the pin — returning `{ needsDepsInstall, missingDeps, driftedDeps }`. Ad hoc, read `<folder>/.mpi_node_commit`: `writeNodeCommitMarker()` stamps the installed sha there, so it answers "is this pack at its pin" with no name matching at all |

Unit-tested in `tests/engine-in-place-upgrade.test.cjs` (the changed-line set, the
engine-owned routing, the near-misses).
