# MPI-84 Validation

Long toast (e.g. the missing-LoRA warning) displays its full text; toast height grows to fit; layout/stacking unaffected for short toasts.

## Outcome — ACCEPTED by user (2026-06-15)

Validated in-app by user. "We finally have a very good Toast system."

Fix shipped:
- Removed `-webkit-line-clamp: 2` clamp on `.mpi-toast__msg` (the truncation bug); message now wraps naturally (`white-space:normal; overflow-wrap:anywhere`).
- Variable-height toasts no longer overlap: replaced fixed per-index `--toast-stack-offset` positioning with a shared `.mpi-toast-stack` fixed container (flex `column-reverse` + gap). Browser handles non-overlap at any height. Removed all `--toast-stack-index` / `_reassignStackPositions()` JS layout math; MpiToast reparents its `el` into the shared container on show. Callers (StatusBar.notify + 2 others) unchanged.
- Mascot clip regression fixed: height cap + scroll moved off `.mpi-toast` (which clipped the overhanging mascot) onto `.mpi-toast__content` (`max-height:40vh; overflow-y:auto`); `.mpi-toast` keeps `overflow:visible` so the mascot pokes out the top.
- Dev gallery: 6 cycling test fixtures (varying length, different links/variants) on the Spawn Toast trigger.
