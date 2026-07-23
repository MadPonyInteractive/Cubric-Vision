# MPI-273 Validation — DROPPED

Idea abandoned during pilot wiring (2026-07-13). MpiLogger `[MPI_PHASE]` markers
do NOT surface cleanly in the execution progress bar the way renamed nodes do.

Key finding for a future attempt: **rgthree already displays renamed nodes in
its own execution progress bar.** The real seam for semantic phase labels is
reading rgthree's node-title progress signal, NOT a logger-print marker. If this
is revisited, start there.

All code reverted:
- routes/comfy.js — phase regex removed (MPI-272 peer route preserved)
- js/services/commandExecutor.js — reverted to HEAD
- js/shell/statusBar.js — reverted to HEAD

No workflow changes shipped. N/M stage counter untouched.
