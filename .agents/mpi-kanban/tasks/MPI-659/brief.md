# MPI-659 - guard-gpu misses script-wrapped dispatches and non-Comfy GPU jobs

Filed from MPI-623 Phase 0, 2026-08-29. **Measured, not theorised: an entire session of
GPU work ran with no lease and the guard never fired once.**

## What happened

MPI-623's Phase 0 spike ran, on the local 4060 Ti:

- a SplatKit dataset pass (MoGe depth, an 81-frame mesh render, SphereSfM),
- three Brush trainings at 30 000 steps each, ~8 min apiece at 80-99% GPU,
- a `RenderSplat` render,
- the first stretch of a 4-rail Wan 2.1 i2v bake.

`guard-gpu` blocked none of them, and `gpu_lease.py status` reported `GPU 0 free`
throughout. Nothing collided - Fabio was not running anything - but that was luck. Fabio
caught it, not the guard.

## Why the guard did not fire

`.agents/mpi-kanban.local.md` declares:

```
gpu_command_patterns:
  - "scripts/pre_release_test\.py"
  - "scripts/smoke-workflows\.mjs(?!.*(--plan|--self-check))"
  - "127\.0\.0\.1:(8188|48188)/prompt"
  - "/connector/generate"
```

`guard-gpu.py` matches these **against the raw command string**. Two independent holes:

### 1. A script-wrapped dispatch is invisible

The graphs were queued by writing a small Python file that POSTs to
`http://127.0.0.1:8188/prompt` and running `python <scratchpad>/gate_graph.py`. The URL is
inside the file; the command line contains no URL, so the regex sees nothing and the hook
exits 0.

This is not an exotic workaround - **it is the normal way to dispatch a non-trivial
graph.** A 51-node API graph cannot be sent from a `curl` one-liner, and the repo's own
tooling (`scripts/workflow-to-api.mjs`) produces exactly the JSON such a script consumes.
Any pattern matched against a command line has this hole by construction.

`guard-gpu.py`'s own docstring predicts it:

> A lease an agent takes only when it remembers to is the file-claim failure again:
> claims sat on disk for six weeks binding nothing because claiming was prose.

A pattern that only catches the one-liner form makes the lease prose again for every other
form.

### 2. `brush_app.exe` matches nothing at all

Brush is a **wgpu** Gaussian-splat trainer - not ComfyUI, not torch, not on any port. It
held the GPU at 94% for ~8 minutes per run. Nothing in `gpu_command_patterns` mentions it,
because until MPI-623 no GPU consumer here was anything but ComfyUI.

**This is about to ship.** MPI-623's plan puts the Brush trainer in `ComfyUi-MpiNodes` as a
node, so it will run inside a ComfyUI dispatch on user machines and on RunPod pods, and any
local bench work on it is a bare `brush_app.exe` invocation exactly like Phase 0's.

## Suggested fixes

Not prescribing - the pack is Fabio's call. Options as measured:

1. **Add a `brush_app` pattern.** Trivially correct, closes hole 2, does nothing for hole 1.
2. **Match the scratchpad-script shape**, e.g. a pattern for `python .*scratchpad.*\.py`.
   Broad and noisy; would block plenty of non-GPU scratch scripts.
3. **Make the convention "any graph dispatch goes through `gpu_lease.py run`"** and enforce
   it where dispatches are actually built rather than at the shell. The honest version of
   this is that a command-line regex cannot see intent one file down, so the guard should
   perhaps bind the *interpreter* (`python`/`node` invoking anything under the session
   scratchpad) and accept false positives, since `gpu_lease.py run` is cheap when the GPU
   is free.
4. **Leave hole 1 open and document it** in `.claude/rules/` so an agent takes the lease by
   hand for script dispatches. Weakest option, and the docstring above is the argument
   against it.

Worth noting for whoever picks this up: taking the lease *after* a job has already started
works fine - `gpu_lease.py run -- python <waiter>` occupies the slot for the remainder,
which is how MPI-623's bake was covered once the gap was spotted.

## A smaller, separate bug found while fixing this

`gpu_lease.py run -- bash -c '...'` **fails on this machine**: the child `bash` resolves to
**WSL's** bash, which cannot see the Windows paths, and dies with

```
<3>WSL (15 - Relay) ERROR: CreateProcessCommon:818: execvpe(/bin/bash) failed: No such file or directory
```

The lease is taken first (`mpi-kanban: GPU 0 leased` prints), then released a moment later
when the child dies - so **a `bash -c` wrapper looks like it leased and did not hold**.
Use a `python` child, or an absolute path to Git Bash. Cheap fix in the pack: resolve the
child through `shutil.which` and fail loudly if the resolved binary is under `\\wsl`, or
just document it.

## Scope note

`.agents/mpi-kanban.local.md` is the config; `guard-gpu.py` and `gpu_lease.py` live in the
**installed plugin**, which `.claude/rules/kanban.md` says must never be edited in place - a
pack change is an issue on `MadPonyInteractive/mpi-kanban`. So this card is likely
"decide the patterns, edit the local config, and file one pack issue for the `bash -c`
resolution bug".
