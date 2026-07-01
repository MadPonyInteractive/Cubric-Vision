# 01 — Environments & File Locations

The "stop re-searching" file. Every path an agent keeps re-discovering.

## Repos (local)

| Repo | Path | Role | Git |
|---|---|---|---|
| **Cubric-Vision** | `c:/AI/Mpi/Cubric-Vision` | the app. Kanban, CLAUDE.md, docs, `dev_configs/node_lock.json`. | yes (private) |
| **mpi-ci** | `c:/AI/Mpi/mpi-ci` | this repo — Pod/Builder images + install scripts + CI. | yes (private) |

mpi-ci layout (image build + install scripts only — the authoring playbook now
lives in Cubric-Vision at `docs/builder/`):
- `cubric-vision-builder/` — authoring Pod image. `Dockerfile`, `start-builder.sh`,
  `install_nodes.sh`, `install_models_<wf>.sh`, `README.md`.
- `cubric-vision-pod/` — the PRODUCT Pod image (ComfyUI + Cubric wrapper). Not for
  authoring — that's what ships in the app's remote-engine.

This folder (`docs/builder/`) is the authoring/tuning playbook + research. It pairs
with the mpi-ci image: build the image there, drive the workflow loop from here.

## Local authoring rig

- ComfyUI: `G:/ComfyUi/ComfyUI/` (note the lowercase `i` in `ComfyUi`).
  - Workflows: `G:/ComfyUi/ComfyUI/user/default/workflows/`
    (e.g. `LTX_i2v_t2v_template.json`).
- LoRAs: `C:/AI/loras/` — **LTX LoRAs nested under `C:/AI/loras/LTX2.3/`**
  (rgthree "Auto Nest Subdirectories in Menus" gives folder submenus). LoRA-name
  strings therefore carry the `LTX2.3\` prefix.
- Workflow authoring scratch: `D:/WORK/workflows/App/` — but the **canonical**
  install scripts are in `mpi-ci/cubric-vision-builder/`, NOT the `D:/WORK` copies
  (those are stale; ignore them).

## RunPod Builder Pod

- **Template:** `Cubric Vision Builder`, id **`2brluktxb4`**. Points at a
  `ghcr.io/madponyinteractive/cubric-vision-builder:vX.Y.Z-cu130` tag.
- **ComfyUI root on the Pod: `/opt/ComfyUI`** (NOT `~/ComfyUI`). Jupyter file-tree
  shows this as `/`.
- `models/` `output/` `input/` are symlinked to the active data root (`$ROOT` =
  `/workspace` if a volume is attached, else `/cubric-data`) by `start-builder.sh`
  — so `cd /opt/ComfyUI && <write to models/<type>/>` lands on the right disk
  automatically.
- Ports: **8188** ComfyUI, **8888** JupyterLab (ours — terminal + drag-drop work).
- Pod env: `$HF_TOKEN` + `$CIVITAI_TOKEN` set on the template.
- **No agent SSH.** Proxy SSH (`ssh <pod>-<id>@ssh.runpod.io`) works for the user
  interactively but refuses non-PTY automation exec. User drives the shell.

## ComfyUI Windows portable ships cu130

The ComfyUI Windows portable (`ComfyUI_windows_portable_nvidia.7z`) at v0.25.1 ships
Python 3.13.12 + torch 2.12.0+cu130 (CUDA 13.0). RunPod host fleet is HETEROGENEOUS on
drivers (535→12.2, 550→12.4, 570→12.8, 580→13.0). Decision: keep Pod images cu128 + cu124
(cu128 covers ≥570, cu124 covers ≥550). Parity surface = ComfyUI core SHA + frontend +
custom-node commits (MPI-117 lock), NOT torch/CUDA.

## Where research / decisions / docs live (single-source — point, don't copy)

| Topic | Canonical file | Repo |
|---|---|---|
| LTX-2.3 resolution tiers + timing | [research/ltx-2.3-tiers.md](research/ltx-2.3-tiers.md) | Cubric-Vision |
| LTX-2.3 integration spec + LoRA test log (§0b) | `.agents/mpi-kanban/tasks/MPI-4/research/ltx-integration-spec.md` | Cubric-Vision |
| Builder image internals + deploy + script-authoring | `cubric-vision-builder/README.md` | mpi-ci |
| Build/push either image (skill) | `.claude/commands/build-pod-image.md` | Cubric-Vision |
| Locked decisions, condensed | [research/README.md](research/README.md) | Cubric-Vision (this folder) |
