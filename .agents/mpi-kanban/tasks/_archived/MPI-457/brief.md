# MPI-457 — Update the engine in place; give the bump a skill

Surfaced 2026-08-06 while doing the 0.29.2 → 0.30.0 bump by hand under MPI-449.

## Half 1 — the user pays for a full reinstall to get a few MB of core

`routes/engine.js` `/engine/upgrade` (line ~807) does, in order:

1. preserve the models root out of `extra_model_paths.yaml` (MPI-118)
2. `fs.remove(portableDir)` — **the entire `ComfyUI_windows_portable` tree**
3. `_runEngineDownload()` — re-fetch the ~1 GB portable 7z, re-extract, re-install
   every custom node from `node_lock.json`, re-install `python_deps.txt`

That is correct and safe, and it is enormous for the common case. Measured on this
machine 2026-08-06: the installed engine tree is ~11 GB and the actual 0.29.2 → 0.30.0
delta was **one git checkout plus three pip packages**.

### The portable is a git checkout — this is not a hack

`engine/ComfyUI_windows_portable/ComfyUI` is a real git repo:

```
remote  origin  https://github.com/Comfy-Org/ComfyUI
HEAD    32212244  ComfyUI v0.29.2      <- exactly node_lock.json comfyui.core.commit
```

It also ships its own updater — `ComfyUI_windows_portable/update/update.py`,
`update_comfyui.bat`, `update_comfyui_stable.bat`. Comfy's own updater pulls
`master`, which we must NOT do (we pin), but the mechanism is theirs and it is
supported. Our equivalent is `git fetch --tags origin && git checkout <pinned sha>`.

The full in-place sequence, as actually run on 2026-08-06:

```
git -C <engine>/ComfyUI_windows_portable/ComfyUI fetch --tags origin
git -C <engine>/ComfyUI_windows_portable/ComfyUI checkout v0.30.0
<engine>/ComfyUI_windows_portable/python_embeded/python.exe -m pip install \
    comfyui-workflow-templates==0.11.27 comfy-kitchen==0.2.26 comfy-aimdo==0.4.11
printf '0.30.0' > <engine>/.mpi_engine_version
```

Result: engine reported `0.30.0`, frontend `1.47.11`, templates `0.11.27`, and all
**167** class_types used by every shipped runtime workflow registered, 0 missing.

### When the wipe IS still right

Do not delete the wipe — route to it on a real signal:

- a custom node was **removed from `node_lock.json`** or now fails to import
- the portable itself moved python or torch (compare `python_embeded` version /
  installed torch against what the target portable ships)
- the tree fails a health check (`getPythonBin()` missing, no `comfyui_version.py`,
  a dirty/detached repo that will not check out)

Deprecation must be **detected**, not assumed: diff the installed `custom_nodes/`
set against `node_lock.json` and force the wipe only on a real removal.

### One trap the wipe already has

`fs.remove` takes out `custom_nodes/ComfyUI-MpiNodes`, which on this dev machine is
a **symlink** to `c:/AI/Mpi/ComfyUi-MpiNodes`. The reinstall replaces it with a plain
clone at the pinned commit, so live edits to the node repo stop reaching the app
silently. The in-place path never touches it (verified: the symlink survived the
0.30.0 checkout).

## Half 2 — no skill for the app-engine bump

`/mpi-bump-local-comfy` is for the standalone authoring bench at `G:/ComfyUi` only.
For the app engine, the only written guidance is `docs/versioning.md` § COMFY_VERSION:
edit `dev_configs/system_dependencies.json` **and** verify `dev_configs/node_lock.json`
`comfyui.core.tag`, grep both. Everything else was derived from scratch.

The sequence worth encoding, in order:

1. **Portable asset exists?** Upstream tags can exist with no Comfy-Org portable build.
   On 2026-08-06 `v0.30.1` and `v0.30.2` were real tags with **no release**, so
   `COMFY_VERSION` could only be `0.30.0` — `COMFY_BASE` in `platformEngine.js` builds
   the download URL from `Comfy-Org/ComfyUI/releases/download/v<ver>/…`.
   `gh api repos/Comfy-Org/ComfyUI/releases/tags/v<ver> --jq '.assets[].name'`
2. **Read the target's `requirements.txt`** and diff it against the current version's —
   that is the exact pip work, and it also gives the frontend/templates pins for
   `node_lock.json`.
3. **Empirical floor check.** Collect every `class_type` in `comfy_workflows/*.json`
   and assert all of them register in `/object_info` on an install of the target
   version. This is what replaces guessing which custom nodes need bumping. On the
   0.30.0 bump, all 14 pinned nodes passed unchanged and 11 of them were already
   proved by the bench running the same commits on 0.30.2.
4. **Bump both files** — `system_dependencies.json` `engine.version` (no `v`) and
   `node_lock.json` `comfyui.core.tag` (with `v`) + `.commit` + the frontend block.
5. `node scripts/compile-node-deps.mjs --check` then regenerate. It prints the core
   version it resolved, which is a free confirmation the pin propagated.
6. Upgrade the local engine, boot it, re-run the floor check against `48188`.

## Related

- MPI-449 — where this surfaced (H3 needed the 0.30.x floor)
- MPI-450 — 1.4 release gates; a real fresh-install upgrade belongs there
- `docs/versioning.md` § COMFY_VERSION — the two-file rule
