# Seam instruments for MPI-591

Bench measurement scripts, kept here because a session scratchpad does not survive a handoff and
two of these took a wrong answer to arrive at. Run them from anywhere; they only need `ffmpeg`,
`ffprobe` and numpy.

| script | what it answers | when it lies |
|---|---|---|
| `level.py` | **the verdict metric.** Per-250 ms RMS and the steady-state level step across the join, excluding the 800 ms splice window either side. | assumes the join is at 5.167 s (`JOIN`); change it for another source. |
| `luma.py` | picture flicker: ABSOLUTE per-frame luma, plus the frame-to-frame diff alongside. | — (but `flash.py`, which it replaced, scores a STALL as a win). |
| `dropouts.py` | audio holes and splice clicks, whole file, against the source. | **structurally blind to a level offset** — it scores every window against its own LOCAL median, so a continuation that is uniformly quieter reads as normal on both sides. Use `level.py` for that. |
| `seam_probe.py` | **the verdict metric.** Cross-correlates the extension's pinned head against the source tail: is it CONTINUING, or a cover band that merely sounds similar? Needs the UNTRIMMED generation. `--self-check` proves it separates the two (0.995 vs 0.087). | on strongly periodic content a lag larger than half a period reads as the nearest cycle alias, so read a small lag as reliable and a large one as "at least this much". |
| `step_at.py` | is a named sample step OURS or the SOURCE's? | — |
| `what_ran.py` | what the bench ACTUALLY executed, read back from `/history`. | — |

Two calibrations worth not re-deriving:

* **Bench noise floor on the level metric: 0.55 dB.** Measured off the F15b/F16b cache-eviction
  pair (same seed, same upstream graph, different video md5). Anything inside that band is noise.
* **Baseline to beat: -3.51 dB**, the currently shipped `flow_h3_extend.json`, against the -1.12 dB
  of the 4-step arm Fabio passed. Full table in `../../validation.md` Phase 5h.

* **First real seam number, 2026-09-08 (arm A1): corr 0.791 on the PIXEL path**, verdict
  CONTINUATION. Upstream quotes 0.45 → 0.95+ for the same fix, but on the LATENT path, which they
  document as avoiding a lossy round trip. Do not compare the two directly.

The bench-arm graphs, the dispatcher and the trim/concat/measure wrapper live one level up in
`../bench/`. `measure.py` runs `seam_probe.py` and `level.py` together from one raw generation.
