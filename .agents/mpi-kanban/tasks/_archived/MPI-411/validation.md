# MPI-411 Validation

## LIVE-VERIFIED on Linux — 2026-07-31, controlled before/after

Not a single observation. The **same box, same clone, same command** was run twice
with only `routes/engine.js` differing between the runs.

### Run 1 — unfixed `engine.js` (build 30589473208, what the box shipped with)

```
[02:54:42] [engine] uv-venv: uv venv --clear --seed --python 3.12 …/engine/comfy-venv
[02:54:48] [uv-venv] Creating virtual environment with seed packages at: comfy-venv
[02:54:51] [install-comfy-cli] Installed 48 packages in 1.35s
[02:55:02] [comfy-install] ComfyUI is already installed at the specified path:
[02:55:02] [comfy-install] …/engine/ComfyUI_linux
[02:55:02] [comfy-install] If you want to restore dependencies, add the '--restore' option.
[02:55:02] [ERROR] [engine] comfy-install failed (exit 1):
             …/comfy --skip-prompt --workspace …/engine/ComfyUI_linux install --cpu
```

Steps 1 and 2 sail through — MPI-408's `--clear` doing its job — and step 3 dies,
exactly as the brief describes.

### Run 2 — fixed `engine.js`, nothing else changed

```
[02:57:06] [WARN] [engine] ComfyUI workspace already cloned — installing with --restore: …/engine/ComfyUI_linux
[02:57:07] [engine] comfy-install: …/comfy --skip-prompt --workspace …/engine/ComfyUI_linux install --cpu --restore
[02:57:12] [comfy-install] Installing for CPU
[02:57:33] [comfy-install] Installing collected packages: torchaudio, mpmath, sympy, setuptools, pillow, numpy, networkx, fsspec, filelock, torch, torchvision
[02:58:44] [comfy-install] Successfully installed … torch-2.13.0+cpu torchaudio-2.11.0+cpu torchvision-0.28.0+cpu
```

Both the `--restore` warn line and the flag on the actual command line, then the
install continuing into dependencies instead of `exit 1`. That is precisely the
brief's Verify section.

### Method note — how this was run without a UI click

The fix is in `routes/engine.js`, which is **server** code, so `POST
/engine/download` exercises it directly and the UI's Retry routing (MPI-414) is not
in the path. The whole test ran over `ssh linuxbox`.

`routes/engine.js` was taken from the **official** `CubricVision-linux-x64-v1.3.0.tar.gz`
(CI run 30593339513, `app/routes/engine.js`) — real built bytes, not hand-edited.
A full re-extract was rejected because it would orphan the 8 GB engine already on
the box and cost hours to rebuild for a three-line change.

**`diff` between the box's file and the new one is EXACTLY the MPI-411 fix and
nothing else** — the `workspaceIsClone` const, the warn line, and
`installArgs.push('--restore')`. That is what makes the single-file swap a clean
isolation rather than a shortcut: no other behaviour could have moved.

Run 2's starting state was also the genuine article — run 1 had just failed, so the
workspace was a real post-failure clone, not a synthesised one.

### Machine

ThinkPad X121e, Ubuntu 22.04, i3-2367M, no NVIDIA driver → `--cpu` resolved.
Extract `/home/mad-pony/Downloads/CubricVision-linux-x64-v1.3.0`.

### Not run

The install was stopped after `comfy install` completed, before the custom-node
requirements stage. That stage is MPI-413's several-GB CUDA re-download, already
proven, and this box thermally shuts down under sustained load. Nothing about
MPI-411's claim needs it.
