# MPI-699 — checklist

Derived from `plan.md` (compact plan, 2026-09-05). One implementation step; the
sub-items are its parts, not separate steps.

## Implementation

### `MpiWindowedSampler` (sibling repo, new module)

- [ ] New node module in `c:\AI\Mpi\ComfyUi-MpiNodes` — NOT `h3.py` (MPI-591 holds a
      live write claim on it)
- [ ] Drop-in signature for `SamplerCustomAdvanced`: `noise`, `guider`, `sampler`,
      `sigmas`, `latent_image`, plus `window` and `overlap`
- [ ] Temporal window loop calling the same `guider.sample(...)` per window
- [ ] Crossfade accumulate — replicate pad, linear ramp, `out_full / weight_full`
      (port the maths from `MinimaxH3LatentUpscaler3D.forward`, do not reinvent)
- [ ] Model stays loaded across windows — no unload between iterations
- [ ] Audio latent passed through from stage 1, each window's refined audio discarded
- [ ] Degrades to a single `guider.sample(...)` when `T <= window` (no behaviour
      change for clips that already fit)
- [ ] Registered in `__init__.py` — check for an MPI-591 registration conflict first

### Terminal `MpiClearVram` (folded in, requested 2026-09-05)

- [ ] Sink variant in `vram.py`: takes the `_any` input to pin execution order,
      returns nothing, `OUTPUT_NODE = True`
- [ ] Existing pass-through node left untouched (shipped workflows reference it)
- [ ] Registered in `__init__.py`

### Ship the node (mandatory — `/mpi-nodes-sync`)

- [ ] Sibling repo procedures read from `c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\`
      and followed inline (they do NOT auto-load in a Vision session)
- [ ] `changelog.md` updated
- [ ] Committed **and pushed** — a node ships only committed -> pushed -> pinned
- [ ] Pin bumped in `dev_configs/node_lock.json`

### Wire the workflows (only after the pin lands)

- [ ] `comfy_workflows/raw/minimax_h3_r2va_template.json` — node 602 swapped
- [ ] `comfy_workflows/raw/minimax_h3_fl2va_template.json` — same
- [ ] Both compiled twins regenerated
- [ ] `ltx_video_upscale.json` considered (same shape) — wire or explicitly defer

## Verification

- [ ] 124 frames at 2K (1472x2560), turbo, on the 4060 Ti — completes, no OOM
- [ ] Bench log shows two windows, and `T=37` reached
- [ ] 🔴 **Fabio watches the crossfade region for seams** — `user-ux`, cannot be
      self-certified
- [ ] Report honestly if the `vrambuf_grow` 308 MB cast-buffer wall appears behind
      the attention wall — that failure is NOT fixed by windowing
