# MPI-60 Validation

## Implementation Ready For Validation

2026-06-10: Code work is complete and ready for user validation on the next version bump.

Expected validation:
- On Apple Silicon, the status-bar memory monitor hides the VRAM row and leaves the RAM row visible.
- During generation on macOS, the status-bar progress bar advances once real Comfy work-node progress arrives.
- When generation finishes, the success toast includes elapsed time, e.g. `Generation finished in 59s`.

If validation fails, open a new session to address the platform-specific follow-up.
