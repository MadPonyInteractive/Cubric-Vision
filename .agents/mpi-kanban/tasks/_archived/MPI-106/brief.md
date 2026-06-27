# MPI-106 — Cubric Vision Builder image

## Goal
A standalone ComfyUI **workflow-authoring** Pod for RunPod, so workflows can be built
on high-end / Blackwell cards (which the user can't run locally) and then tested in the
Cubric Vision app. NOT the product image — no wrapper, no token, no volume contract.

## What shipped
- Image `ghcr.io/madponyinteractive/cubric-vision-builder:v0.1.2-cu128` (GHCR, **public**).
- Same ComfyUI commit (SHA `90eeeb2…`) + same 7 universal node packs as the product
  image (parity, so authored workflows behave identically in the app), **+ ComfyUI-Manager
  + sageattention + JupyterLab**.
- cu128 / Blackwell (torch 2.7.1+cu128). **LOCAL docker build only** (cu128 overflows the
  GitHub runner, same wall as the product cu128 image — no CI workflow).
- Ports 8188 (ComfyUI) + 8888 (Jupyter), both exposed.
- **Volume/ephemeral data root** (`start-builder.sh`): models root at `/workspace` when a
  ≥40GB volume is attached (PERSIST across Stop), else `/cubric-data` on the container disk
  (mirrors product MPI-78; avoids RunPod's 20GB default-volume trap). Symlinks
  `/opt/ComfyUI/{models,output,input}` → `$ROOT` so install scripts using relative paths work.
- Tokens via Pod env (`HF_TOKEN`, `CIVITAI_TOKEN`) — never in scripts.

## Deploy bugs found + fixed
1. **8188 403 behind RunPod proxy** — ComfyUI's host/origin CSRF middleware 403'd every
   proxy request (Origin != internal Host) while `curl 127.0.0.1:8188` returned 200. Fix =
   `--enable-cors-header` on ComfyUI launch (ComfyUI #4865). This was the hard one.
2. **`{}` template start-command override** — cleared the field so the image CMD runs.

## Live verification (RTX 5090, 2026-06-17)
- ✅ ComfyUI 8188 loads (Manager, template gallery, node graph) after the CORS fix.
- ✅ Jupyter file UI on 8888 works (drag-drop offline LoRAs). Note: it's **RunPod's own
  Jupyter** (base auto-start wins 8888) — its terminal is disabled; run scripts in the
  **RunPod Web Terminal** instead.
- ✅ Volume persistence: `/opt/ComfyUI/models -> /workspace/models` confirmed (Stop/resume safe).

## Refs
- Build context + durable doc: `mpi-ci/cubric-vision-builder/` (Dockerfile, start-builder.sh,
  README.md). mpi-ci commit `d5f2c85`.
- Memory: `project_builder_image_flow.md`.
- Follow-up: **MPI-105** (app-side NVMe disk request; RunPod defaults to slower SSD).

## Deferred (not blocking)
- cu124 Builder tag (for RTX 4090/3090 authoring) — user opted to test lower cards via the
  app instead; parked.
- Making this image's terminal-capable Jupyter win 8888 (Web Terminal covers it).
