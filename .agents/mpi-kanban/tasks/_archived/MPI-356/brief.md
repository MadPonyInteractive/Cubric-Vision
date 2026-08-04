# MPI-356 Brief

Brainstormed 2026-07-26. Full design lives in plan.md.

Root problem: radial computes item angles from the FILTERED item count, so switching
model rotates every item and blind hold-Tab gesture is impossible. Ops also gated only
on (model x media counts) - workspace capability missing, so mask ops render permanently
dimmed in the Gallery.

Decision: delete the requirement rather than engineer around it. Strip owns ops, overlay
owns model, radial keeps only static lists (Models today, + Apps later).
