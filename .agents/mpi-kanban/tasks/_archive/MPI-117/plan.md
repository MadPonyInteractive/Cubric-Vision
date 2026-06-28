# MPI-117 Plan — Node version-lock (local app + RunPod), RunPod branch only

Source of truth = one lock file. Both install paths read it. No version bump (that is MPI-118).

## Lock file (option A, per-node source discriminator)

`dev_configs/node_lock.json`:

```json
{
  "schema": "cubric/node-lock/v1",
  "nodeset_version": "1",
  "comfyui": { "core": "0.19.3", "frontend": "<resolved>" },
  "nodes": {
    "ComfyUI-MpiNodes": { "source": "registry", "publisher": "mad-pony-interactive", "node": "ComfyUi-MpiNodes", "version": "<TBD>" },
    "ComfyUI-VideoHelperSuite": { "source": "git-commit", "repo": "Kosinkadink/ComfyUI-VideoHelperSuite", "commit": "<sha>" },
    "ComfyUI-Impact-Pack": { "source": "git-commit", "repo": "ltdrdata/ComfyUI-Impact-Pack", "commit": "<sha>" },
    "comfyui-kjnodes": { "source": "git-commit", "repo": "kijai/ComfyUI-KJNodes", "commit": "<sha>" },
    "ComfyUI-UltimateSDUpscale": { "source": "git-commit", "repo": "ssitu/ComfyUI_UltimateSDUpscale", "commit": "<sha>" },
    "ComfyUI-Frame-Interpolation": { "source": "git-commit", "repo": "Fannovel16/ComfyUI-Frame-Interpolation", "commit": "<sha>" },
    "ComfyUI-Impact-Subpack": { "source": "git-commit", "repo": "ltdrdata/ComfyUI-Impact-Subpack", "commit": "<sha>" }
  }
}
```

`source` resolver → download URL:
- `registry` → `https://cdn.comfy.org/<publisher>/<node>/<version>/node.zip`
- `git-tag` → `https://github.com/<repo>/archive/refs/tags/<tag>.zip`
- `git-commit` → `https://github.com/<repo>/archive/<commit>.zip`

Pod consumer (git-commit) → `git clone <repo> && git checkout <commit>`; (registry) → download+unzip CDN; (git-tag) → `--branch <tag>`.

## Phases

1. **Resolve pins** (research, no code). For each of 7 packs: query `api.comfy.org/nodes/<id>/versions`; in registry → version, else GitHub HEAD SHA (current HEAD = freeze point). Resolve frontend version inside app's v0.19.3 portable. Write findings to `research/pins.md`.
2. **Lock file.** Write `dev_configs/node_lock.json` with resolved values.
3. **App consumer.** In `dependencies.js`, build the 7 node `url`s from the lock (import lock JSON + a small resolver). SHA256 stays null for changed urls (per file header rule). Add **RES4LYF** as new DEPS entry, git-commit `419de2d`, lock entry too.
4. **Pod consumer.** Dockerfile: COPY/ARG the lock, replace `--depth 1` clones with checkout-by-source. Pin `COMFYUI_REF` to v0.19.3 core commit + frontend. Reconcile node SET (Pod has no Painter — correct, it's volume-installed; confirm 7 == 7).
5. **build-pod-image command revision.** `/build-pod-image` reads core+frontend+node pins from lock, stops prompting for SHA.
6. **Verify parity** (post-rebuild, separate step / handoff). App vs Pod identical node availability.

## Hard constraints
- RunPod branch ONLY. Commit by explicit pathspec (shared tree).
- No version bump. Lock built so MPI-118 moves version by editing lock alone.
- Rebuild is a SEPARATE step after edits land.
