# MPI-576 validation

Reported evidence (Fabio, 2026-08-18): five screenshots of `mpi-546-smoke`, status bar
`IDLE · REMOTE`, VRAM 0.0-0.2/24 GB, RAM 0.4-0.7/62 GB, 7 assets unchanged — so no install
and no generation was running while these fired:

```
engine:node-drift · FLUX.2 Klein · NVIDIA PiD Upscaler · Boogu Image Edit
MiniMax H3 · MiniMax H3 Reference · Krea 2      → all "… installed."
```

Cases to satisfy:

1. **Connect to a Pod holding N installed models** → **zero** "installed." toasts, and zero
   OS notifications when the window is unfocused. This is the headline case.
2. **Reconnect / Pod swap** → same, on every connect, not just the first (the node-drift heal
   is first-connect-latched, so confirm no OTHER completion re-opens the storm).
3. **Genuine install of a model whose deps complete a SECOND model** → the second model still
   toasts. The shared-dep cascade is a real feature; the fix must not delete it.
4. **First connect that really heals node drift** → the heal still runs and still re-clones,
   silently (MPI-230's stated intent). No `engine:node-drift installed.`, no raw job id in
   any toast or OS notification.
5. **A NEW `engine:*` job id** → silent without editing an allowlist (the point of step 3).
6. `tests/engine-assets-silent-install.test.cjs` still passes, extended to cover node-drift.
7. **Reuse full prompt on a Krea 2 card immediately after a connect** → works, no
   `Model "krea2" is not installed` (only if step 4 of the plan finds it is the same window).
8. `node --test "tests/*.test.cjs"` green.
