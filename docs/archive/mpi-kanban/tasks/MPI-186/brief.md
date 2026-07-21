# MPI-186 — Move ComfyUI (source + ~5GB deps) to the network volume

## Why

The product Pod image (`c:\AI\Mpi\mpi-ci\cubric-vision-pod\Dockerfile`) clones ComfyUI
into `/opt/ComfyUI` and runs `pip install -r requirements.txt` — the **~5GB uncompressed
dep tree** — as baked Docker layers. On a RunPod **network volume** that layer re-pulls on
every cold host and can never be skipped, because it is part of the image, not the volume.

Torch (~6GB) is installed separately and is **arch-bound CUDA machine code** — it must stay
baked (Design A locked: the volume stays arch-agnostic so a user can run the same volume on
a 4090 today and a 5090 tomorrow). But **~28 of ComfyUI's 33 deps are pure-Python or
CPU-arch-uniform manylinux wheels** — genuinely portable, safe to install once onto the
volume and reuse across Pod recreations.

The version signal the user described already exists: `ARG COMFYUI_REF` → `ENV
CUBRIC_COMFYUI_REF` (Dockerfile line ~347), read by `wrapper.py` (line 70) and written to
`/workspace/cubric/manifest.json` (line 1125). A boot-time sentinel compare against that
value drives install-vs-skip.

## Payoff

- Cut the baked image by **~5GB of ~11GB** (torch stays, ComfyUI deps leave).
- On a network volume, ComfyUI installs **once** (~3.5-5.5 min first boot), then every
  subsequent Pod skips it (sentinel hit = milliseconds). Re-installs ONLY on a core
  version bump — exactly the "download once" behaviour asked for.

## The load-bearing risk (why this is spike-gated)

Two deps are **torch-linked compiled CUDA extensions**, NOT pure Python:
- **`comfy-aimdo`** — the dynamic-VRAM allocator. Its loss is **load-bearing**: MPI-156
  proved that without aimdo the Pod does 6-min model loads and OOMs on LTX-2.3. It
  registers as a PyTorch allocator plugin via a `.so`.
- **`comfy-kitchen`** — ships compiled CUDA kernels + nanobind bindings.

If either `.so` uses an RPATH relative to its install location (not `$ORIGIN`), relocating
it from image site-packages to `/workspace/pylibs` **silently breaks** — and aimdo failing
falls back quietly to the exact OOM regression the project already fought. This **cannot be
assumed** — it must be proven on a live GPU Pod before any image work. Hence Phase 0.

## Scope decision (user, 2026-07-03)

**ComfyUI core + deps ONLY.** The 7 universal node packs stay baked in
`/opt/ComfyUI/custom_nodes`; declare that absolute path in `extra_model_paths.yaml` so they
still load once `main.py` moves to the volume. NOT moving nodes or prebaked weights in this
card (separate, smaller, already-solved patterns).

## Hard constraints

- **All live Pod ops (create/deploy/Stop/Terminate/shell) are USER-only.** The agent
  guides; the user runs every Pod command. No autonomous Pod create/delete (classifier
  blocks it).
- **mpi-ci is a separate repo** — edit/commit with `git -C c:/AI/Mpi/mpi-ci`. Push is
  user-authorized.
- **Never `pkill -f main.py`** on the Pod (kills Jupyter). Restart via wrapper
  `POST /wrapper/restart-comfy` or console Stop→Start.
- `start.sh` + `wrapper.py` are **R2-fetched at boot** (MPI-156) — a start.sh edit ships via
  `publish-runtime.sh stable` + Pod restart, NO image rebuild. Only the Dockerfile change
  (removing the baked ComfyUI layers) needs a rebuild.

## Full findings

`research/investigation.md` — the two parallel investigations (dep classification +
`--target` failure modes; version-signal + volume-layout wiring).
