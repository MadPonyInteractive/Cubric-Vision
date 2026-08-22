# Checklist - MPI-367

Content pass over the per-op help TEXT. The mechanism, the dialog and the `?`
affordance shipped in MPI-360 and are out of scope here.

Reconstructed from `events.jsonl` on 2026-08-04 by mpi-project-refresh: the card
has linked this file since it was created, but it was never written.

## Op copy, rewritten from the user's own practice

- [x] **Detail** - localised img2img; the model sees under the mask and denoise,
      not the prompt, decides how far it strays. ~0.30 refines, >0.50 replaces.
- [x] **Upscale** - i2i with a bigger canvas, so both brakes are taught:
      <=0.20 keeps the picture, >0.30 real changes, >0.50 a new image, and
      under 0.10 use the plain upscaler instead.
- [x] **Inpaint** - rewritten 2026-08-22 after MPI-598 put the op on LanPaint. The
      model now SEES under the mask, an empty prompt is a no-op, and removal is an
      instruction that names its target. Swept Detail in the same pass (its "unlike
      Inpaint" line went false). Open graph question recorded in the events log and
      in docs/models/klein/9b.md: is_remove still gates the NSFW LoRA on a trigger
      that can no longer fire.
- [ ] **Remaining ops** - not started. The events log does not record which of
      the other entries the user has found wrong, so this needs a pass with them.

## Then

- [ ] Per-model overrides layered on top of the corrected op copy
- [ ] `assets/help/` imagery
