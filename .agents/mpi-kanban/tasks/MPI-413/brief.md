# MPI-413 — custom-node requirements reinstall the CUDA torch stack over the CPU one

Found live on Linux 2026-07-30 while verifying MPI-406. **This is the second and
larger half of MPI-406** — MPI-406 fixed the `comfy install` stage, this is the
custom-node stage, and until both are closed a `--cpu` engine still downloads
several GB of CUDA wheels.

## Evidence

```
[2026-07-31T00:04:57.395Z] [INFO] [system] Running: python -m pip install -r
  .../custom_nodes/ComfyUI-LTXVideo/requirements.txt --upgrade --no-warn-script-location
...
[2026-07-31T00:08:27.366Z] [INFO] [system] [pip] Downloading torchvision-0.28.0-…whl (7.7 MB)
[2026-07-31T00:11:20.830Z] [INFO] [system] [pip] Installing collected packages:
  nvidia-cusparselt-cu13, mpmath, cuda-toolkit, zipp, triton, tqdm, sympy, setuptools,
  safetensors, regex, Pillow, nvidia-nvtx, nvidia-nvshmem-cu13, nvidia-nvjitlink,
  nvidia-nccl-cu13, nvidia-curand, nvidia-cufile, nvidia-cuda-runtime, nvidia-cuda-nvrtc,
  nvidia-cuda-cupti, numpy, ninja, networkx, kornia-rs, hf-xet, fsspec, filelock, einops,
  cuda-pathfinder, nvidia-cusparse, nvidia-cufft, nvidia-cublas, importlib_metadata,
  cuda-bindings, nvidia-cusolver, nvidia-cudnn-cu13, huggingface_hub, tokenizers,
  diffusers, transformers, torch, torchvision, kornia, timm
```

Note the stage tag: `[system] [pip]`, not `[comfy-install]`. MPI-406's original
evidence was `[comfy-install] Downloading triton` — a different stage. That is
why removing `--fast-deps` did not change the outcome.

Machine had no NVIDIA driver; the engine correctly resolved `--cpu`
(`gpu-detect: Resolved config: uv-bootstrap (vendor none, CUDA unknown)`).

## Root cause

`routes/downloadManager.js:2181`:

```js
await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
```

`runPipCommand` (`routes/shared.js:284`) is a bare `python -m pip` — **no index
constraint**, so torch resolves from default PyPI, which is the CUDA build.

`--upgrade` is what makes it fire even on a correct engine. The comment at
`downloadManager.js:2033` states the opposite belief:

> `pip with --upgrade is idempotent (a no-op when already satisfied)`

That is wrong, and it is why this stayed invisible: `--upgrade` pulls the newest
available for every listed package **and its dependencies**, so an
already-correct CPU torch is replaced by the newest CUDA torch.

The repo already learned this once — `nodesDeps.js:178` (MPI-217): *"Those are
UNPINNED — with --upgrade, install pulls newest across the WHOLE engine … opencv
4.13→5.0 major + numpy 2.5.0→2.5.1"*. Same mechanism, torch instead of opencv.

## Why dropping the torch lines is NOT sufficient

`requirementsDrop` already exists (`nodesDeps.js:88`, MPI-387 dropped a `git+`
sam2 line on all three platforms), so it is the obvious reach. It does not solve
this: `timm` and `diffusers` **depend** on torch/torchvision, so `--upgrade`
bumps them transitively whether or not the requirements file names them. Any fix
has to constrain resolution, not edit the file.

## Candidate fixes — pick with measurement, this is a SHARED primitive

`runPipCommand` has many callers across both engine twins; sweep them before
changing it.

1. **Constraints file (probably best).** `pip install -r req --upgrade
   --constraint <file>` pinning the torch family to whatever `comfy install`
   put there. Keeps `--upgrade`'s self-heal intent while freezing the packages
   that must not drift. Surgical, no vendor branching.
2. **Drop `--upgrade`.** One word, and it makes the behaviour match the comment
   that already claims it. Risk: a node needing a newer unpinned shared package
   silently keeps the old one — though `pipPins` exists as the corrective path
   for exactly that, and runs after requirements.
3. **Vendor-aware index.** `--index-url https://download.pytorch.org/whl/cpu
   --extra-index-url https://pypi.org/simple` when the resolved vendor is CPU.
   Correct for CPU boxes but branches the pip path by vendor, and does nothing
   about the general MPI-217 drift class.

1 and 2 also fix the broader drift problem; 3 only fixes torch.

## Severity

Wasteful, not broken — a CUDA torch runs on CPU. Cost is several GB of download,
disk and decompression on the machines least able to afford it. On the box that
found this, wheel decompression contributed to a thermal shutdown.

## Why 1.3.0 shipped without it

The changelog entry claiming *"no longer downloads gigabytes of NVIDIA-only
components … It now installs the processor-only build"* was **removed from
1.3.0** rather than shipped as a false claim. Verifying a fix here costs a full
engine install on a machine that takes hours per attempt and shuts down under
load, so it was not worth holding the release. The `--fast-deps` fix (MPI-406)
stays in — it is correct on its own merits, just not sufficient alone.

## Verify

On a CPU-only Linux/macOS box: full engine install, then

```sh
grep -icE "downloading (triton|nvidia)" user-data/logs/app.log     # expect 0
engine/comfy-venv/bin/python3 -c "import torch; print(torch.__version__)"  # expect a +cpu tag
```
