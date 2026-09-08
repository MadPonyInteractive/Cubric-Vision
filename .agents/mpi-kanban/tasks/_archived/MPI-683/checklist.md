# MPI-683 checklist

- [x] Sweep every `MpiOkCancel` caller for a `text` body that relies on the current collapsing.
- [x] `white-space: pre-line` on `.mpi-ok-cancel__text`.
- [x] Drop the now-redundant per-dialog `pre-line` workaround in `MpiRunpodSettings` (create-volume).
- [x] Correct the stale comment in `MpiFlowLibrary` that documents the bug as unfixed.
- [x] Rendered check: 3 line boxes with the fix, 2 without; the bullet starts its own line (validation.md).
