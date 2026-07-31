# MPI-413 — Install the dependency set WE chose, not whatever pip resolves

**Umbrella card. Absorbs MPI-406 (closed) and the original MPI-413 diagnosis.**
Scope agreed with the user 2026-07-31, post-1.3.0. Nothing here is pre-release work.

The framing that matters: this is **the same defect MPI-419 just fixed, one layer
down**. MPI-419 was "we install an unpinned ComfyUI and hope". This is "we let each
custom node's requirements resolve freely on the user's machine and hope". Both ship a
dependency set nobody chose and nobody tested.

## The mechanism (root cause — unchanged, still accurate)

`routes/downloadManager.js:2181`:

```js
await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
```

`runPipCommand` (`routes/shared.js:284`) is a bare `python -m pip` — **no index
constraint and no constraint file**, so torch resolves from default PyPI, which is the
CUDA build. `--upgrade` is what makes it fire even on an already-correct engine. The
comment at `downloadManager.js:2033` asserts the opposite belief:

> `pip with --upgrade is idempotent (a no-op when already satisfied)`

That is wrong, and it is why this stayed invisible: `--upgrade` pulls the newest
available for every listed package **and its dependencies**, so an already-correct CPU
torch is replaced by the newest CUDA torch.

The repo learned this once already — `nodesDeps.js:178` (MPI-217): *"Those are UNPINNED
— with --upgrade, install pulls newest across the WHOLE engine … opencv 4.13→5.0 major
+ numpy 2.5.0→2.5.1"*. Same mechanism, opencv instead of torch.

## Evidence A — the catastrophic case (Linux, CPU-only, 2026-07-30)

```
Running: python -m pip install -r .../custom_nodes/ComfyUI-LTXVideo/requirements.txt --upgrade
...
Installing collected packages: nvidia-cusparselt-cu13, cuda-toolkit, triton,
  nvidia-nvtx, nvidia-nvshmem-cu13, nvidia-nvjitlink, nvidia-nccl-cu13, nvidia-curand,
  nvidia-cufile, nvidia-cuda-runtime, nvidia-cuda-nvrtc, nvidia-cuda-cupti,
  nvidia-cusparse, nvidia-cufft, nvidia-cublas, nvidia-cusolver, nvidia-cudnn-cu13,
  torch, torchvision, kornia, timm, diffusers, transformers
```

Several GB of CUDA wheels on a box with no NVIDIA driver, **replacing** the `+cpu` torch
`comfy install` had just placed correctly. Wheel decompression contributed to a thermal
shutdown on that machine. Stage tag is `[system] [pip]`, NOT `[comfy-install]` — which
is precisely why MPI-406's `--fast-deps` fix did not change the symptom.

## Evidence B — the everyday case (macOS M4, fresh install, 2026-07-31)

Measured from `app.log.1` of a clean engine install, warm pip cache:

| measure | count |
|---|---|
| pip invocations across the node phase | **13** |
| `Requirement already satisfied` lines | **400** |
| `numpy` re-resolved | **18 times** |
| `torch` re-resolved | **10 times** |
| `packaging` / `typing-extensions` / `networkx` | 14 / 13 / 13 times |
| packages installed then **uninstalled and replaced** | 4 — `kornia 0.8.3`, `transformers 5.14.1`, `matplotlib 3.11.1`, `ultralytics 8.4.113` |

Even with every wheel cached, 13 separate resolves re-derive the same shared graph.
Four packages were installed and then thrown away for a different version. On a cold
user machine each of those 400 checks is an index round-trip and each replacement is a
second download.

Note the warm-cache honesty: that phase still only took ~30s here
(`Engine ready, finishing custom node installation` 11:09:07 → `Engine provisioning
complete` 11:09:37). **Do not sell this card on wall-clock alone** — the defensible
claims are correctness, reproducibility, and cold-install cost.

## Why `requirementsDrop` is not the answer

`requirementsDrop` already exists (`nodesDeps.js:88`) and is the obvious reach. It
cannot solve this: `timm` and `diffusers` **depend on** torch/torchvision, so `--upgrade`
bumps them transitively whether or not the requirements file names them. Any real fix
constrains resolution; it does not edit the input files.

## The design (agreed with the user 2026-07-31)

### Phase 1 — constrain every node pip. Small, high value, mostly independent.

Apply a constraint file to every node pip call and drop `--upgrade`. The Pod image
**already does exactly this** — it writes `/opt/constraints.txt` with the torch family
pinned and sets `ENV PIP_CONSTRAINT`. The local engine has no equivalent. That asymmetry
IS this bug. This alone kills the torch stomp and the MPI-217 drift class, and makes
most `pipPins` entries redundant — they are currently a *repair* for damage Phase 1
would prevent.

`runPipCommand` is a SHARED primitive with callers across both engine twins — sweep
every call site in one pass (root-cause rule).

### Phase 2 — one curated dependency file, node requirements ignored entirely.

Stop asking the nodes. Maintain **our own aggregated, tested pip file**, versioned
alongside `dev_configs/node_lock.json`, and install it in a single pass with each node's
own requirements step disabled.

**Generate it, then curate it:** run `uv pip compile` over the nodes' declared
requirements plus our constraints in CI, review the diff, commit the result. Maintenance
then works exactly like a node bump — re-run, review, commit — instead of relying on
someone remembering. Same philosophy as `node_lock.json`, applied to Python deps.

**The safety net already exists.** The Pod image build boots ComfyUI and greps the log
for `IMPORT FAILED` (MPI-341). If the aggregate under-specifies what a node needs, that
build goes red **in CI, not on a user's machine**. That gate is what makes a
hand-curated set safe to adopt.

## Open questions — settle these before writing code

1. **The `install.py` nodes.** Only 4 of 7 `installRequirements` nodes use a plain
   `requirements.txt`; 3 run custom commands. `ComfyUI-Frame-Interpolation` ships **no
   `requirements.txt` at all** — its deps exist only inside `install.py`'s logic, so no
   scanner can see them. Measured on macOS 2026-07-31, its `install.py` installed
   exactly ONE new package (`opencv-contrib-python 5.0.0.93`, redundant with the
   `opencv-python` + `opencv-python-headless` already present) and failed to build
   `cupy`. Read what Impact-Pack's and controlnet_aux's commands do beyond pip before
   disabling any of them wholesale.
2. **Platform variance.** Use PEP 508 markers in the one file
   (`onnxruntime-gpu; platform_system != "Darwin"`) rather than per-platform files, or
   the darwin drops (`sam2`, `onnxruntime-gpu`) regress.
3. **Constrain against ComfyUI core's own pins** so the aggregate is strictly additive
   and can never move torch. Also decide what `repair-deps` means once installs are not
   per-node — repair one node, or reinstall the whole set?

A merged resolve can **hard fail** where sequential silently "succeeds" by
last-writer-wins. That is a real conflict surfacing, but it turns a soft-broken engine
into a failed install — decide the fallback deliberately.

## Absorbed from MPI-406 (closed 2026-07-31)

MPI-406 owned the **`comfy install` stage**: `--fast-deps` ignores the vendor flag, so
comfy-cli's DependencyCompiler resolved generic PyPI torch on `--cpu`. That fix shipped
and is positively proven on Linux — the PyTorch CPU index is consulted, `+cpu` wheels
resolve, and no `nvidia-*`/`triton`/`cuda-*` appears in that stage at all. Its card was
retitled to that scope and closed. **The residual symptom it was named after — a
`--cpu` box still ending up with the CUDA stack — is owned by this card**, because the
custom-node stage undoes it.

## Severity

Wasteful, not broken: a CUDA torch runs on CPU. The cost is several GB of download,
disk and decompression on exactly the machines least able to afford it, plus an engine
whose installed package set nobody chose and no CI ever tested.

## Verify

On a CPU-only Linux/macOS box, full engine install, then:

```sh
grep -icE "downloading (triton|nvidia)" user-data/logs/app.log      # expect 0
engine/comfy-venv/bin/python3 -c "import torch; print(torch.__version__)"   # expect +cpu
grep -c "Requirement already satisfied" user-data/logs/app.log      # expect « 400
```

Plus: ComfyUI boots with zero `IMPORT FAILED`, and the Pod image build stays green.

## Evidence C — Windows, and the cupy root cause (2026-07-31, live 1.3.0 artifact)

The Frame-Interpolation note above records that its `install.py` "failed to build
`cupy`" on macOS. Windows does the same on a real 1.3.0 portable install (RTX 4060 Ti,
ComfyUI 0.29.2, clean extract), and its log carries the reason the macOS run did not:

```
Collecting cupy-wheel
  Using cached cupy-wheel-12.3.0.tar.gz (2.9 kB)
  Getting requirements to build wheel: finished with status 'error'
      File "<string>", line 2, in <module>
  ModuleNotFoundError: No module named 'pkg_resources'
ERROR: Failed to build 'cupy-wheel' when getting requirements to build wheel
```

`cupy-wheel` is a 2.9 kB source-only shim whose `setup.py` imports `pkg_resources`,
which modern setuptools no longer installs. So this is **not** platform-specific, not
GPU-specific and not transient: it fails on every fresh install, on every platform,
until the curated set decides the question.

What that pins down for the one curated file:

1. **cupy becomes an explicit decision, not a leftover.** Either drop it — Frame-
   Interpolation falls back to torch — or pin a real `cupy-cuda12x`/`cupy-cuda13x`
   wheel behind a PEP 508 marker. Do not carry `cupy-wheel` itself: its entire job is
   runtime CUDA detection, which is exactly what the curated file replaces.
2. **Constrain `setuptools`, or ban source builds outright** (`--only-binary=:all:`
   with a documented allowlist). Any remaining sdist carrying a legacy `setup.py`
   breaks the same way as setuptools keeps shedding `pkg_resources`.
3. It is another instance of this card's core claim — **the failure reported itself as
   success.** `Custom install command succeeded for ComfyUI-Frame-Interpolation` is
   logged 400 ms after `ERROR: Failed to build 'cupy-wheel'`, and the engine went on to
   stamp 0.29.2 and report a healthy install.

Severity is unchanged (wasteful, not broken — the node still works). But "wasteful" now
demonstrably includes a dependency that can **never** install, silently, on every
machine, forever.
