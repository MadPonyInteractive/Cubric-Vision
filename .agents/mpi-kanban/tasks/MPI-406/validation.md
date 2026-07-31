# MPI-406 Validation — PARTIAL, card stays open

**Tested live on Linux 2026-07-30. The fix works for the stage it targets, and
the card's headline symptom is UNCHANGED.** Do not close this on the `--fast-deps`
commit.

## What the fix did achieve

`requirements.compiled` is **absent** from the engine root after a full install:

```sh
$ ls engine/requirements.compiled
No such file or directory
```

That file is comfy-cli's DependencyCompiler output. Its absence proves
`--fast-deps` is genuinely off the `--cpu` branch, which was the diagnosis in
this card's brief. That half is correct and shipped.

## What it did NOT achieve

The CUDA stack still installs:

```
[2026-07-31T00:11:20.830Z] [INFO] [system] [pip] Installing collected packages:
  nvidia-cusparselt-cu13, …, triton, …, nvidia-cudnn-cu13, …, torch, torchvision, kornia, timm
```

`grep -icE "downloading (triton|nvidia)" user-data/logs/app.log` → **4**.

## Why — a second source this card never swept to

Stage tags settle it. This card's original evidence was
`[comfy-install] Downloading triton (188.6MiB)`. The new lines are
`[system] [pip]` — `runPipCommand`, a completely different stage: the
custom-node requirements install, `ComfyUI-LTXVideo/requirements.txt` run with
`--upgrade`. Tracked as **MPI-413**.

So a `--cpu` engine has TWO paths to the CUDA stack. This card fixed one.

## Process note

This card was written, fixed and changelogged from a single stage's evidence
without checking whether any other stage installs torch. The 1.3.0 changelog
entry claiming *"It now installs the processor-only build"* was therefore false
and had to be **removed before publishing** (it was caught before release, not
after). The root-cause rule's "sweep the blast radius" step applies to *stages of
the same install*, not only to call sites of a shared function.

## Also settled by the same run

Only one venv exists — `engine/comfy-venv/pyvenv.cfg`, nothing under
`ComfyUI_linux`. comfy-cli honours `VIRTUAL_ENV` as `_provisionUvEngine` assumes,
which independently confirms the assumption MPI-411's `--restore` fix rests on.

## To close this card

Both stages must be clean on a CPU-only box:

```sh
grep -icE "downloading (triton|nvidia)" user-data/logs/app.log     # expect 0
engine/comfy-venv/bin/python3 -c "import torch; print(torch.__version__)"  # expect a +cpu tag
```

That needs MPI-413 fixed first.
