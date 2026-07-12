# MPI-126 — Wan stage-2 sigma drift fix

## Problem
Wan i2v/t2v two-stage workflows: stage-1 → stage-2 results are very inconsistent (worst on **t2v**). Stage-2 changes the result dramatically instead of just refining detail.

## Root cause (carried from LTX-2.3 / MPI-4)
Stage-2 starts denoising too HIGH → it **regenerates** rather than **refines**. Observed in the Wan t2v template:
- stage-2 `BasicScheduler`: steps 6, **denoise 1.00**
- `SplitSigmas` step 3

High denoise on stage-2 = full re-denoise = drift.

## The fix that worked on LTX (apply analogously)
LTX stage-2 was fixed by giving it a **low START sigma** so it only polishes. Final LTX ship value (human faces, 704×1280):
- **`0.65, 0.45, 0.25, 0.0`** = the "knee" — real detail, identity + audio hold.
- `0.5` too soft; `0.7+` audio/identity drift; `0.85` over-sharp/plasticky.
- Hard ceiling signal: when the OUTPUT starts changing CONTENT (not just sharpening), the start sigma is too high.

For Wan: either lower the `BasicScheduler` **denoise** below 1.0 for stage-2, or replace stage-2 with **manual sigmas** starting low. Tune per Wan's sampler/scheduler — the curve shape matters at few steps.

## Method
1. Sweep stage-2 start denoise/sigma on **HUMAN faces** (animated content hides the difference — proven on LTX with chipmunks vs humans).
2. A/B stage-1 vs stage-2: they must be CONSISTENT (refine, not regenerate).
3. Find the knee (max detail before content drift).

## References
- `docs/builder/research/audio-input.md` — full LTX sigma sweep + method + the `0.65` decision.
- Memory: `project-ltx-refaudio-not-setrefaudio` (LTX stage-2 sigma findings).

## Scope
Out of scope for the current MPI-4 LTX audio session — carded for a future session. Wan-only; does not touch LTX.
