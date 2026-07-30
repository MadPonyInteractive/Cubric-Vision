# MPI-406 — `--cpu` engine installs pull the whole CUDA stack

Found 2026-07-30 on the Linux desktop (ThinkPad X121e, Ubuntu 22.04, no NVIDIA
driver) during MPI-391 section D.

## Symptom

A `--cpu` engine provision downloads the CUDA 13 wheel stack. Seen live in
`app.log`:

```
[comfy-install] Downloading triton (188.6MiB)
[comfy-install] Downloading nvidia-nvjitlink (38.9MiB)
```

## Evidence — the engine's own resolver output

`<engine>/requirements.compiled`, written by comfy-cli's DependencyCompiler:

```
torch==2.13.0            <- bare version, NO +cpu tag
triton==3.7.1
nvidia-cublas==13.1.1.3
nvidia-cuda-cupti==13.0.85
nvidia-cuda-nvrtc==13.0.88
nvidia-cuda-runtime==13.0.96
nvidia-cudnn-cu13==9.20.0.48
nvidia-cufft==12.0.0.61
nvidia-cufile==1.15.1.6
nvidia-curand==10.4.0.35
nvidia-cusolver==12.0.4.66
nvidia-cusparse==12.6.3.3
nvidia-cusparselt-cu13==0.8.1
nvidia-nccl-cu13==2.29.7
nvidia-nvjitlink==13.3.33
nvidia-nvshmem-cu13==3.4.5
nvidia-nvtx==13.0.85
```

A CPU-only resolve would tag torch `+cpu` and pull none of the `nvidia-*` set.

## Root cause

`routes/engine.js` `_provisionUvEngine` builds the install args:

```js
const installArgs = gpuFlag === '--m-series'
    ? ['--skip-prompt', '--workspace', workspace, 'install', gpuFlag]
    : ['--skip-prompt', '--workspace', workspace, 'install', gpuFlag, '--fast-deps'];
```

`--fast-deps` routes the resolve through comfy-cli's DependencyCompiler, which
**ignores the vendor flag**. The file already says so, one branch up
(`engine.js:370-372`):

> `--fast-deps` (comfy-cli DependencyCompiler) has no Apple-Silicon branch and
> falls through to generic PyPI torch, skipping the MPS nightly wheel the
> standard `--m-series` path installs. Omit it on mac so torch is MPS-capable.

macOS was exempted. `--cpu` was not, and falls through identically — on Linux,
generic PyPI torch pins the CUDA stack.

## Severity

Wasteful, not broken. CUDA-built torch runs on CPU when no driver is present, so
the install still works. The cost is several GB of download, disk and
decompression on the machines least able to afford it — on the box that found
this, the wheel decompression contributed to a thermal shutdown mid-install.

## Fix

Extend the `--m-series` exemption so `--fast-deps` is used only when the vendor
is `nvidia`, letting comfy-cli's standard vendor-aware install select the CPU
wheel index.

## Sweep before closing

- **`--amd` keeps `--fast-deps` too** and is suspect for the same reason. Does
  DependencyCompiler resolve ROCm torch, or fall through to PyPI CUDA? Verify —
  do not assume.
- **Windows is unaffected** — it takes the prebuilt-archive path and never
  reaches `_provisionUvEngine`.
- Confirm the non-`--fast-deps` CPU install genuinely resolves `+cpu` torch
  before declaring the fix good. The whole point is that the flag, not the code
  around it, controls the index.

## Not a 1.3.0 regression

This predates the release. It was never caught because Linux had not been
validated on real hardware before 2026-07-30.
