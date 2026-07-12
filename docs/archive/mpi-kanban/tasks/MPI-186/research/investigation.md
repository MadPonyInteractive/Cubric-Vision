# MPI-186 — Investigation (2026-07-03, pre-card)

Two parallel read-only investigations run before the card was written. Findings that gate
the design. Full context: the Pod Dockerfile clones ComfyUI v0.27.0 + `pip install -r
requirements.txt` (~5GB uncompressed) as baked layers; torch trio (~6GB) is separate +
arch-bound.

## A. Dependency classification + `pip --target` viability

ComfyUI v0.27.0 `requirements.txt` = 33 packages. Excluding the torch trio (out of scope):

**Safe to relocate (arch-agnostic, `--target`-safe): ~28 packages.**
Pure-Python: comfyui-frontend-package, comfyui-workflow-templates, comfyui-embedded-docs,
einops, transformers, tqdm, requests, filelock, pydantic-settings, simpleeval, torchsde,
spandrel, alembic. CPU-arch-uniform manylinux (compiled but not torch-linked): numpy, scipy,
pillow, pyyaml, aiohttp, yarl, sentencepiece, safetensors, tokenizers, av (bundles own
ffmpeg since v8), blake3, SQLAlchemy, psutil, pydantic, kornia (+ kornia-rs). All use
`$ORIGIN`-relative RPATH → relocatable.

**RISKY — torch-linked compiled CUDA extensions (MUST live-test): 2 packages.**
- `comfy-aimdo==0.4.10` — PyTorch custom VRAM allocator plugin (`cuMemAddressReserve`...).
  `.so` hooks into torch's allocator. **Load-bearing** (MPI-156: loss = 6-min loads / OOM).
  Has a silent fallback → a broken relocation is INVISIBLE except in the boot log.
- `comfy-kitchen==0.2.16` — compiled CUDA kernels + nanobind. Has a CPU-only py3-none-any
  fallback that IS safe, but the CUDA variant links libtorch_cuda.

**`pip --target` + PYTHONPATH failure modes (confirmed, not theoretical):**
1. **torch shadow (HIGH):** requirements lists `torch` UNPINNED → `--target` pulls a fresh
   (wrong/CPU) torch into the volume dir → PYTHONPATH-first shadows the image's pinned CUDA
   torch → every GPU breaks. **FIX: exclude torch/torchvision/torchaudio from the --target
   install.**
2. **RPATH relocation (HIGH):** aimdo/kitchen `.so` may break if RPATH is install-relative,
   not `$ORIGIN`. → the Phase 0 spike.
3. **stale .dist-info on upgrade (MEDIUM):** `--target --upgrade` leaves old dist-info →
   `importlib.metadata.version()` ambiguous (transformers probes it). → on version bump,
   `rm -rf` the target dir + clean reinstall, never upgrade-in-place.
4. `.pth` files not processed under PYTHONPATH (MEDIUM) — namespace-package edge; low
   likelihood for this set.
5. console_scripts not installed (LOW) — ComfyUI uses alembic as a lib, not CLI. Non-issue.

**Bottom line:** workable-but-needs-care, NOT a trap. ~80% of the tree is reliably safe. The
two load-bearing tests before trusting it: (1) import aimdo+kitchen from PYTHONPATH-only;
(2) boot ComfyUI + confirm aimdo activates in the log + a gen has no OOM; (3) confirm torch
is still the image's CUDA build.

## B. Version-signal + volume-layout wiring

**Version signal already exists:** Dockerfile `ARG COMFYUI_REF` (CI sets it from
`dev_configs/node_lock.json` `comfyui.core.tag` = **v0.27.0**; the ARG default `v0.19.3` is
stale but always overridden) → `ENV CUBRIC_COMFYUI_REF` (line ~347) → `wrapper.py` line 70
reads it → written to `/workspace/cubric/manifest.json` as `comfyui_ref` (line 1125). A
boot-time sentinel `$VOLUME_COMFY_DIR/.installed_ref` compared to `$CUBRIC_COMFYUI_REF`
drives install-vs-skip.

**Proposed layout:** `$CUBRIC_ROOT/cubric/comfyui/` (source + main.py + sentinel),
`$CUBRIC_ROOT/cubric/comfyui_deps/` (pip --target). `CUBRIC_ROOT` = `/workspace` normally,
`/cubric-data` ephemeral. Wrapper launches via `CUBRIC_COMFY_MAIN` (wrapper.py line 178) +
inherits `PYTHONPATH` through `sys.executable` spawn (line 254) → no wrapper change needed.

**custom_nodes complication (REAL, must handle):** ComfyUI finds `custom_nodes/` relative to
`main.py`'s dir. Move main.py to the volume → the 7 baked packs in `/opt/ComfyUI/custom_nodes`
orphan **silently** (boots fine, nodes absent, fails at gen "Node not found"). FIX = declare
`/opt/ComfyUI/custom_nodes` as an absolute stanza in `extra_model_paths.yaml`. Per-model
volume nodes already load via that mechanism (unaffected).

**Boot cost:** fresh volume +3.5-5.5 min (clone ~30s + pip ~3-5 min). Warm volume ~0
(sentinel hit). Version bump = full reinstall (atomic .tmp → mv).

**Ranked failure modes:** (1) half-finished install on interrupted boot → clean `.tmp`
first, write sentinel LAST; (2) torch shadow → exclude trio; (3) baked nodes orphan →
extra_paths stanza; (4) wrapper silently falling back to baked `/opt/ComfyUI/main.py` on a
bad CUBRIC_COMFY_MAIN → fail loud; (5) ephemeral Pod re-installs every boot → guard with
`CUBRIC_EPHEMERAL=1` → keep baked; (6) git clone network failure on first boot → fall back
to baked, don't crash-loop.
