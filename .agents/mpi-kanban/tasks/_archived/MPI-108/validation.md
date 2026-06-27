# MPI-108 Validation

- 2026-06-17: User verified the fix against previously existing previews on the remote ephemeral-Pod restart path.
- Result: accepted. Stage-2 re-stages the local preview latent after a remote ComfyUI restart instead of falling back because the ephemeral Pod input dir was wiped.
- Regression posture: remote-origin preview Continue path remains unchanged by design; targeted lint passed on `comfyController.js`, `commandExecutor.js`, and `MpiGalleryBlock.js`.
