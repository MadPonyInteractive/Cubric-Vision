# MPI-699 Validation

**Verify mode:** user-ux — a completed render does not close this card on its own.

## Machine-checkable

- [ ] 124-frame 2K render (1472x2560, turbo, H3 ref2va) completes without OOM on
      the RTX 4060 Ti 16GB
- [ ] Bench log shows the windowed path taken (two windows at `window=27`) and
      `T=37` reached
- [ ] A clip that already fits (`T <= window`) produces the single-pass path and is
      unchanged versus the current node

## Needs Fabio's eyes

- [ ] **No visible seam at the crossfade region.** The planner returns
      `spans=[(0, 27), (10, 37)]` for T=37, so the shared band is latent frames
      **10-27**, not the narrow one first estimated. Converting back through
      `frames = (17T - 9)/5` at 24 fps, that is roughly **1.3s to 3.8s** of a 5.17s
      clip. The ramps sit at each end of that band, so the two places a seam would
      show first are around **1.9s** and **3.2s**. Watch motion continuity and any
      brightness or detail step there.

## Honest-reporting gate

- [ ] If `vrambuf_grow: 308503552 bytes` (the aimdo weight-cast buffer) appears once
      the attention wall is cleared, report it as an unfixed second ceiling. It is a
      fixed per-step cost and windowing cannot help it. Do not tune `window` downward
      until something passes and call that a result.

## Evidence

_(nothing yet)_
