# MPI-413 Validation — the stated root cause is DISPROVEN

Investigated 2026-07-31 on the Linux box. **This card's diagnosis was wrong.** It
is kept as the record of why, because the wrong version was persuasive.

## What the card claimed

That `pip install -r <node reqs> --upgrade` re-resolved an **already-correct**
`torch 2.13.0+cpu` into the CUDA build, dragging in ~14 `nvidia-*` wheels.

## Why that cannot be what happened

Measured directly, with a correct `torch 2.13.0+cpu` in the venv and the real
`ComfyUI-LTXVideo/requirements.txt`:

```
A) pip install --dry-run -r requirements.txt --upgrade
B) pip install --dry-run -r requirements.txt
→ byte-identical output. NEITHER installs torch, torchvision, or any nvidia-*.
```

`diffusers` / `transformers[timm]` / `kornia` are satisfied by the torch already
present, so nothing re-resolves it.

Two further facts close it off:

- **PEP 440 makes it impossible.** PyPI's torch is the bare `2.13.0`; a version
  carrying a local segment (`2.13.0+cpu`) **outranks** the same version without
  one. `--upgrade` could never have replaced `+cpu` with PyPI's build.
- **There is no CUDA index in play.** No `pip.conf`, no `PIP_*` env, no
  `--index-url`/`--extra-index-url` directive in any node's `requirements.txt`.

## What actually happened

The CUDA stack was installed because **torch was absent**, not because a good one
was replaced:

1. `comfy install` failed with `exit 1` — **MPI-411**, the existing-clone bug.
2. So the `[comfy-install]` stage never installed torch at all.
3. Retry then routed to deps-only (**MPI-414**), which ran the node requirements.
4. `diffusers`/`transformers[timm]` pull bare `torch`, which resolved from PyPI —
   and PyPI's linux torch **is** the CUDA build, declaring the `nvidia-*` wheels.

The stage tags that made this look like an independent bug were real — the CUDA
install genuinely happened at `[system] [pip]` — but only because the
`[comfy-install]` stage before it had died.

**So MPI-413 is a downstream symptom of MPI-411, which is now fixed and
live-verified.** Confirmed the same night: with `--restore` working, `comfy install`
laid down `torch-2.13.0+cpu / torchvision-0.28.0+cpu / torchaudio-2.11.0+cpu` off
the PyTorch CPU index, and the node stage then has nothing left to resolve.

## The code change made under this card — kept, re-attributed

`--upgrade` was removed from `routes/downloadManager.js:2181` and the comment at
`:2033` (which asserted `--upgrade` was the idempotent one — exactly backwards)
corrected. **This does not fix the CUDA problem**, because that was never the cause.

It is kept on its own merits, which are real and **not** CPU-specific:

```
einops pinned to 0.8.0, then the same real requirements file:
  with --upgrade → would install einops-0.8.2      (drift)
  without        → "already satisfied (0.8.0)"     (no drift)
```

That is the **MPI-217** class — the mechanism that once took `opencv 4.13 → 5.0`
major and bumped numpy on an ordinary install. The repo had already hand-patched
this hazard twice per-node (`pipPins`, and `comfyui_controlnet_aux`'s
`installRequirementsCommand`, whose comment carried the same empirical dry-run
proof). Removing the flag fixes the class instead of the instances.

Consumer sweep: `runPipCommand` has exactly **two** callers, both in
`downloadManager.js`; the other (`pipPins`, `:2198`) already omitted `--upgrade`.
The **remote twin** (`cubric-vision-pod/wrapper/wrapper.py`
`_install_node_requirements`) has always omitted it and has run that way in
production, so this **converges** the engines rather than splitting them.

Self-heal is preserved: `pip install -r` still installs *missing* packages.
`--upgrade` only ever added the drift.

## Residual risk — NOT closed by this change (raised by the user 2026-07-31)

Removing `--upgrade` kills **gratuitous** drift: installing plugin B no longer moves
a shared library that plugin A already depends on and is working against. Two
narrower cases survive, named here so nobody reads this as airtight.

**1. Fresh installs still resolve "newest at the time."** A node listing an
unconstrained `kornia` gets whatever is newest on install day, so two users
installing a month apart can end up with different shared libraries. This is live,
not theoretical — tonight's dry-run showed a fresh install resolving
`kornia-0.8.3`, the exact version documented at `nodesDeps.js` as removing `pad`
and breaking ComfyUI-LTXVideo's import.

Already defended by `pipPins`, which forces known-good versions AFTER requirements
run. **The gap is that `pipPins` is a per-node, hand-maintained allowlist** — a
shared package nobody thought to pin can still land at an untested version, and it
surfaces only when something breaks.

**2. A node that explicitly constrains a shared library** (`numpy>=X`) still gets
the upgrade even without `--upgrade`, and can still break a sibling node. Rarer,
and arguably correct — it is a stated requirement rather than drift.

### Why this is not urgent

- The **remote twin has never had `--upgrade`** and has run that way in production
  across the whole MPI-385 Pod sweep without drift problems. This change makes the
  local engine match a configuration already proven at scale.
- Custom nodes are **pinned to specific commits** (`writeNodeCommitMarker` /
  node_lock), so their requirements files do not shift between releases.

### The proper fix, when someone picks it up

A single **constraints file** covering the shared set (torch family, numpy, opencv,
kornia) applied to *every* node requirements install, so pip is structurally unable
to move them regardless of what any node asks. That closes case 1 at the class
level instead of per-node whack-a-mole, and would let `pipPins` shrink to genuine
per-node needs. Contained work, but it needs testing against all 15 universal nodes
on a real install — deliberately NOT started the night before a release.

## Disposition

Root cause disproven → the CUDA-on-CPU symptom is owned by MPI-411 (fixed). The
surviving code change belongs to the MPI-217 drift class. CPU-specific concerns
dropped per the user's 2026-07-31 call that CPU inference is a fallback nobody uses.
