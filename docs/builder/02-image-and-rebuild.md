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

---

## Node version-lock — `dev_configs/node_lock.json`

`dev_configs/node_lock.json` is the SINGLE source of truth for ComfyUI core + frontend +
custom-node versions. Shape: `comfyui:{core:{tag,commit},frontend:{...}}` + `nodes:{<id>:{source,...}}`.
Two consumers: (1) App — `js/data/modelConstants/dependencies.js` imports the lock +
`lockUrl(id)` resolver; (2) Pod image — Dockerfile COPYs it and a python loop clones each
pack. To bump: edit `node_lock.json` ONLY, then rebuild both images. Do NOT hand-edit
Dockerfile or `dependencies.js` urls. A `node_lock.json` edit = bump AND rebuild BOTH
images (Pod copies it, Builder `COMFYUI_REF` must match).

## Bump/rebuild trigger table

Canonical trigger inventory: `.agents/mpi-kanban/tasks/MPI-119/research/trigger-table.md`.
Maps `trigger path/pattern → bump? → rebuild? → which version field/image`. Non-obvious
rows: `dev_configs/node_lock.json` = bump AND rebuild BOTH images (easiest rebuild to
forget because it looks like a config edit). `comfy_workflows/*.json` = rebuild ONLY if a
NEW custom node is introduced (param edits = patch bump, no rebuild). `models.js` /
`universal_workflows.js` often need NO rebuild — on-demand auto-upload covers most model
adds. Advisory: `.claude/hooks/bump-rebuild-reminder.py` (Stop event) path-watches this
table's triggers and warns once at session end.

## Product Pod build procedure (mpi-ci) — SINGLE cu130 image (MPI-189)

Pod image lives in `c:\AI\Mpi\mpi-ci`. As of MPI-189 there is ONE GPU image (`-cu130`)
plus the slim `-cpu` image — the old cu124/cu128 two-profile split is GONE (torch
2.10+cu130 carries Ada sm_89 + Blackwell sm_120 in one wheel). Base =
`nvidia/cuda:13.0.3-runtime-ubuntu24.04`. **Two registries:** the `-cu130` GPU image pushes
to **Docker Hub** (`docker.io/madponyinteractive/cubric-vision-pod`, MPI-186 cold-start
test); the `-cpu` image stays on **GHCR**.

Steps: (1) edit `mpi-ci/cubric-vision-pod/` files; (2) COMMIT + PUSH mpi-ci main FIRST
(workflow builds from pushed ref, not local tree — #1 gotcha); (3) trigger: `gh workflow
run cubric-vision-pod-image.yml --ref main -f manifest_version=X -f wrapper_version=Y ...`;
(4) the cu130 torch stack is large — WATCH for the CI-runner disk overflow (`No space left
on device`) the old cu128 build hit; if it overflows, build LOCALLY (see "Build cu130
locally" in `cubric-vision-pod/README.md`); (5) after build, make the **Docker Hub repo
public** (cu130) and the **GHCR package public** (cpu) — RunPod requires public pull;
(6) anon-pull-verify both tags before telling user to connect. `wsl --shutdown` after a
local Docker build. NEVER pass `only_profile=cpu` in dispatch — it SKIPS the cu130 leg
while still reporting success (`IMAGE_NOT_FOUND` on RunPod). Always dispatch with
`only_profile` BLANK.

Docker Hub creds are repo secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (a free public
repo; set once). The first cu130 Pod deploy is the real cold-start pull measurement
(GHCR-vs-Docker-Hub) MPI-186 folded into this rebuild.

## start.sh + wrapper.py are R2-fetched at boot — no rebuild for shell/wrapper edits (MPI-156)

`bootstrap.sh` is the image `CMD`. At boot it curls `start.sh` + `wrapper.py` (+ `manifest.json`)
from public R2 at `https://pod.cubric.studio/vision/<channel>/` (default channel `stable`),
validates them, and falls back to the baked copies on ANY failure. To ship a start.sh/wrapper.py
edit WITHOUT a rebuild: commit → `bash publish-runtime.sh dev` (rclone push + verify) →
on a running Pod `POST /wrapper/restart-comfy` (or recreate) → prove it →
`bash publish-runtime.sh promote` (copies the tested dev objects to `stable/`, refusing on
working-tree drift). MPI-340: a dev app run boots the `dev` channel, released builds only ever
boot `stable`; `publish-runtime.sh stable` publishes the working tree straight to released
users and is a warned hotfix path only. Rebuild needed ONLY for torch/sage/node/base changes.
rclone remote `cubric-r2:`, token in `~/.secrets/rclone-r2.conf`. Keep published `stable/` in
sync with committed files.

## v0.26 + aimdo requires torch ≥ 2.8 — else 6-min model loads (MPI-156)

ComfyUI v0.26 ships `comfy-aimdo` (v0.4.10), dynamic-VRAM allocator, SILENT DEFAULT on
nvidia + not-WSL + **torch ≥ 2.8**. The Pod Dockerfile previously pinned torch 2.6/2.7.1
(can't reach 2.8) → aimdo's `< 2.8` gate tripped → legacy ModelPatcher + `--lowvram` →
~6-min cold loads every model switch. Confirm from boot log: `DynamicVRAM support requires
Pytorch version 2.8 or later. Falling back to legacy ModelPatcher` = OFF; `aimdo inited
for GPU` = ON. Fix: torch 2.8 stable + cu128 base, then DROP `--lowvram`. Re-check
kornia 0.8.2 + baked nodes still import after the torch bump.

## `--normalvram` removed in v0.26 + torch 2.8 — drop vram flags or crash-loop (MPI-156)

Once torch ≥ 2.8 enables aimdo, `--normalvram` was removed from `cli_args.py`. Passing it
= `main.py: error: unrecognized arguments: --normalvram` → ComfyUI exits code 2 → wrapper
supervisor tears down → Pod boot-loops (confirmed live). Surviving flags: `--gpu-only /
--highvram / --lowvram / --novram / --cpu` + new `--reserve-vram / --disable-dynamic-vram /
--enable-dynamic-vram / --fast-disk`. `--lowvram` still PARSES but is a documented NO-OP
under aimdo. Pass NO vram flag; let aimdo manage (`start.sh VRAM_MODE=""`). NEVER
reintroduce `--normalvram` on a torch ≥ 2.8 image.

## Two-profile split COLLAPSED to one cu130 image (MPI-189, supersedes MPI-156/MPI-70)

The old cu124/cu128 split (and the "cu124-is-really-cu126" label trick, and the
cu126-r550-driver-floor carve-out) are GONE. MPI-187 live-proved the `+cu130` CUDA-13 torch
build is the ~10x LTX fault-in fix (108-127s → ~11s), and torch 2.10+cu130 carries BOTH
Ada sm_89 (4090) and Blackwell sm_120 (5090/PRO 6000/B200) in one wheel — so ONE image
serves every card. Driver floor is now uniform r580, enforced app-side by
`allowedCudaVersions:["13.0"]` (MPI-188). `podImageForCard` returns a single `-cu130` tag
(no per-card suffix → the enum-desync/wrong-profile bug class of MPI-135/MPI-70 is gone).
aimdo 0.4.10 is unchanged (the proven Pod ran the same aimdo; its gate is torch ≥ 2.8, no
cuda check → 2.10 passes). The vram-flag rules above (drop `--normalvram`, let aimdo manage)
still apply.

## SageAttention DEFERRED on cu130 — SDPA fallback, revisit later (MPI-189)

The product Pod ships **NO sageattention** on cu130. ComfyUI uses PyTorch SDPA (built-in,
graceful — no flag, no error). This is a deliberate defer, not a failure:

- **The cu130 win does not need sage.** MPI-187 hit the ~11s fault-in with NO sage — the
  perf story is the cu130 CUDA-13 build, not the attention backend. Sage is only a ~2-3x
  *sampler* speedup ON TOP, independent of the fault-in fix.
- **The sage source build is unreliable on cu130 in GPU-less Docker.** SageAttention issue
  **#157** makes `setup.py` ignore `TORCH_CUDA_ARCH_LIST` and silently ship a Triton-only
  package (i.e. you *think* you baked multi-arch kernels but you didn't). Issues #219/#291/
  #330 are open cu130/Blackwell build bugs. Chasing a clean `8.6;8.9;12.0` source build
  would stall the cu130 ship for a bonus we don't currently need.
- **The decision: MOVE ON.** Ship the proven cu130 win now; the goal was to speed things up,
  and sage is not on that critical path. We revisit sage LATER, once a known-good cu130
  build is proven on a live Pod — a pinned prebuilt Linux cu130 wheel already exists
  (`snw35/sageattention-wheel`, `2.2.0+cu13-cp312`, torch 2.10, SHA-pinnable) as the likely
  re-entry point; a source build would first need issue #157 solved (arch-list honored in a
  GPU-less build) + a build-time arch assertion. Until then: **do NOT re-add a sage build to
  the product Dockerfile.** (The *Builder* image still source-builds sage — that's a
  cooperative, GPU-adjacent build, a different context from the product image's CI path.)

## Git-Bash curl on Windows — looped `curl -o` flakes (schannel)

Verifying public R2 URLs with `curl -o file -w '%{http_code}'` in a tight loop on this box
returns false `HTTP 000` + writes no file (schannel TLS-renegotiation choke), while a SINGLE
verbose `curl -sv URL` returns the real `200`. Verify public R2 with a single verbose curl,
or with rclone's S3 API (`rclone cat` / `lsf` — bypasses schannel entirely). Don't trust a
looped `curl -o` 000 as an outage.

## Pod v0.4.1 — weight prebake (MPI-81)

Image v0.4.1 / wrapper 0.2.4: Dockerfile pre-bakes 5 lazy weights via `aria2c` + `sha256sum -c`
at build time (rife47.pth, 4x_NMKD-Siax_200k.pth, 4x-AnimeSharp.pth, face_yolov8n.pt,
sam_vit_b_01ec64.pth) to kill 503s; `--cache-lru 2` in `start.sh` to evict stale models on
type-switch to prevent OOM. Audit rule: only bake weights that an actual workflow JSON names.

## Pod v0.4.3 — stats + taesd prebake (MPI-98)

Wrapper 0.2.6: (1) `GET /wrapper/stats` — truthful RAM (cgroup v2 working-set) + VRAM
(nvidia-smi); NOT `free -h` (reports host); token-gated; v0.4.4/0.2.7 added cgroup v1 RAM
fallback. (2) taesd preview prebake — 8 decoder/encoder pairs copied from local engine (not
downloaded); `.gitattributes` pins `*.safetensors binary`.

## Builder image — thin base, zero baked nodes

Redesigned 2026-06-19 (v0.1.3-cu130): thin base bakes ONLY ComfyUI core (pinned SHA eca4757 /
tag v0.25.1) + torch + sage + Manager + JupyterLab. ZERO custom nodes, ZERO weights baked.
Rebuild needed ONLY when ComfyUI core or torch changes. Base =
`runpod/pytorch:1.0.7-cu1300-torch291-ubuntu2404` (Ubuntu 24.04, Python 3.12 — NOT 3.13
like local rig). torch 2.12.0+cu130; valid torchaudio trio: `torch==2.12.0 /
torchvision==0.27.0 / torchaudio==2.11.0` (torchaudio 2.12 does NOT exist for cu130 —
first build hit this). Sage = SOURCE BUILD with `TORCH_CUDA_ARCH_LIST="8.6;8.9;12.0"` (no
GPU at Docker build → must set arch list or sage silently falls back to SDPA). NEVER
`pkill -f main.py` on the Pod — low PID, kills Jupyter terminals.

## Builder install scripts — canonical location

CANONICAL: `c:\AI\Mpi\mpi-ci\cubric-vision-builder\`. Other copies (`D:\WORK\...`) are
stale. Two kinds: (1) `install_nodes.sh` — all custom nodes, one shared script; (2)
`install_models_<workflow>.sh` — model weights, one per workflow. Tokens from Pod ENV
`$HF_TOKEN` / `$CIVITAI_TOKEN`, NEVER hardcoded. `cupy-cuda13x` (prebuilt, NOT auto-build).
After installing NODES do a REAL ComfyUI restart (Restart Pod, not Manager button).
To update for a new workflow: add `install_models_<name>.sh`, add new nodes to
`install_nodes.sh`. Rebuild to re-COPY changed scripts — OR drag-drop onto live Pod via
Jupyter and run (no rebuild for script edits).

## sage attention Windows JIT tax

On Windows embedded Python 3.13, `--use-sage-attention` makes gens ~2× SLOWER. SageAttention
→ Triton JIT-compiles per attention call → fails because embedded python ships NO
`Include/Python.h` and NO `libs/python313.lib`. Fallback to pytorch attention anyway, with
pure overhead. Fix: remove `--use-sage-attention` from the launcher. Pod/Linux unaffected.

## kornia==0.8.2 pin (ComfyUI-LTXVideo)

`ComfyUI-LTXVideo IMPORT FAILED: cannot import name 'pad' from 'kornia.geometry.transform.pyramid'`
→ fix is `pip install kornia==0.8.2`. kornia 0.8.3 removed that re-export; LTXVideo's
`requirements.txt` leaves kornia unpinned. `pip install -U kornia` makes it WORSE.
`install_nodes.sh` pins `kornia==0.8.2` after the per-node reqs loop.
