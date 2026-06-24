# 02 — Image: what's baked, what's runtime, when to rebuild

## What's in the Builder image (THIN-BASE, cu130)

The image bakes ONLY the stable base. Everything version-volatile installs at Pod
runtime via scripts — so a node bump does NOT need a rebuild.

- ComfyUI core pinned to a **SHA** (matches app + local rig). Only **ComfyUI-Manager**
  baked — **zero other custom nodes, zero model weights.**
- sageattention (source-built) + triton + JupyterLab baked.
- torch **2.12.0+cu130**, base `runpod/pytorch:…-cu1300-…-ubuntu2404` (py 3.12).
  Deploy on **≥580-driver** hosts.

Full detail: parent [`../README.md`](../README.md) §"What's in it".

## Runtime-installed (NOT baked) — the scripts

| Script | Installs |
|---|---|
| `install_nodes.sh` | app's 7 packs + RES4LYF (SHA-pinned) + LTXVideo + BFS + rgthree (authoring-only). Pins `kornia==0.8.2`. Ollama excluded. **SKIPS dirs that already exist** — so a node already cloned won't update; `git pull` it by hand. |
| `install_models_<wf>.sh` | one per workflow. `install_models_ltx23.sh` = the LTX-2.3 ~68GB set. |

## When does a REBUILD actually need to happen?

Most changes DON'T need one. Decide:

| Change | Rebuild? |
|---|---|
| New/different custom-node version | **No** — edit `install_nodes.sh`, re-run on the Pod. |
| New workflow's model weights | **No** — write a new `install_models_<wf>.sh`, run it. |
| Try a different LoRA / weight | **No** — aria2c it on the Pod, or drag-drop. |
| ComfyUI **core** SHA moves (app bumped it) | **Yes** — bump `COMFYUI_REF`. |
| torch / CUDA / base-image change | **Yes** (slow path). |
| Bake a script change as the new default | Optional — only re-bakes the COPY layers (fast). |

## How to rebuild (when you do need to)

Don't hand-run docker here — use the skill:
**`Cubric-Vision/.claude/commands/build-pod-image.md` → Flow B (Builder)**. It's
local-only (no CI — the image overflows the GitHub runner disk), drives the version
decision, the GHCR push, the public-visibility gate, and `wsl --shutdown`.

After a rebuild: bump the **Cubric Vision Builder** template (id `2brluktxb4`) image
tag in the RunPod console (USER does this), and update "Current shipped tag" in the
parent README.
