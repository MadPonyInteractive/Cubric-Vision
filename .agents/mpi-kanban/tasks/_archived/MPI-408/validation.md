# MPI-408 Validation

**LIVE-VERIFIED on Linux 2026-07-30**, ThinkPad X121e / Ubuntu 22.04, portable
build from mpi-ci run 30589473208 (SHA `addc03a2`).

## Repro

Deliberate, because a fresh extract has no venv and a clean install proves
nothing:

1. Press Install.
2. Ctrl+C once `[comfy-install]` lines start — stand-in for the thermal shutdown
   that originally found this.
3. Relaunch, press Install again.

Pre-fix, step 3 produced `uv-venv failed (exit 2)` instantly and Retry was dead
forever.

## Result — verbatim

```
[2026-07-30T23:53:48.747Z] [WARN] [engine] [uv-venv] Using CPython 3.12.13
[2026-07-30T23:53:48.747Z] [WARN] [engine] [uv-venv] Creating virtual environment with seed packages at: comfy-venv
[2026-07-30T23:53:49.107Z] [WARN] [engine] [uv-venv] + pip==26.2
[2026-07-30T23:53:49.107Z] [WARN] [engine] [uv-venv] Activate with: source comfy-venv/bin/activate
[2026-07-30T23:53:49.211Z] [WARN] [engine] [install-comfy-cli] Resolved 48 packages in 39ms
[2026-07-30T23:53:49.335Z] [WARN] [engine] [install-comfy-cli] 48 packages in 107ms
```

`uv venv --clear` replaced the existing venv silently and step 2 installed
comfy-cli on top of it. No `A virtual environment already exists`, no exit 2.
**This card's root cause is closed.**

## The same retry then failed at step 3 — different cause, does NOT reopen this

```
[comfy-install] ComfyUI is already installed at the specified path:
[comfy-install] /home/mad-pony/…/engine/ComfyUI_linux
[comfy-install] If you want to restore dependencies, add the '--restore' option.
[ERROR] [engine] comfy-install failed (exit 1)
```

`comfy install` refuses an existing **valid** clone, which step 0b deliberately
keeps. Filed and fixed as **MPI-411**.

The lesson this pair leaves behind: **each step of `_provisionUvEngine` carries
its own idempotency and they are not interchangeable** — 0b deletes, step 1
clears, step 3 restores. MPI-408 shipped with the changelog claiming "Retry now
works", and it did not. Verifying a fix for one step says nothing about the
next; walk the whole sequence.
