# MPI-699 Validation

**Verify mode:** user-ux — a completed render does not close this card on its own.

## Machine-checkable

- [x] A windowed 2K-class render completes without OOM on the RTX 4060 Ti 16GB.
      Fabio ran 243 frames through 3 windows on 2026-09-06 and watched it to
      completion (10.4 -> 11.1 GB dedicated across windows 2 and 3).
- [x] The windowed path is taken, and the `info` output reports the plan it took.
      Verified executing in ComfyUI 2026-09-05; the printed line matched the
      planner exactly.
- [x] A clip that already fits produces the single-pass path and is unchanged.
      Confirmed 2026-09-06: `window_frames` forced to 100000 at 1344x768 / 243
      frames took `_sample_once` and completed — `MpiVideo_00122.mp4`, 1344x768,
      243 frames, 24 fps, 10.125 s, aac stereo, 12 min, peak 14,945 / 16,380 MiB.
- [x] Both runtimes carry the node and are internally consistent.
      `minimax_h3_r2va.json` 712 and `minimax_h3_fl2va.json` 532, `overlap_frames`
      17, `frame_grid` 5, `window_frames` linked to the `Window Frames` MpiMath.
      `validate-injection-rules.mjs` green, `verify-workflow.mjs` green.
- [x] Post-pin-bump sweep (MPI-498 class) clean against the pinned `287edb8`:
      the engine's live `INPUT_TYPES`, executed not parsed, over every `Mpi*` node
      in every runtime graph — 1350 instances, 56 classes, 54 graphs, zero missing
      required inputs.
- [x] Full suite green: **902/902** (`npm test`), including
      `tests/h3-two-pass-dimensions.test.cjs`.

## Needs Fabio's eyes

- [x] **No visible seam at the crossfade region.** Fabio, 2026-09-06, on the
      3-window run: "no seams visible". Note the run was almost certainly
      2688x1536 rather than 1K — the graph it used had the stage-1 halving
      bypassed — so the node cleared this at a HARDER size than the ticket asked
      for, at the NARROW 22-frame shared band.

## Still open — does NOT block this card

- The **2K portrait seam** from 2026-09-05 was never attributed to the node
  versus the generation. The evidence now leans hard toward the generation:
  that seam had a 56-frame fade, and the seam-free 2026-09-06 run had 22. The
  cheap closer is still the seam's frame number against the span the `info`
  output prints — no render needed.
- The `243` row's margin is not measured under VRAM pressure (91% peak on an
  idle card). Deliberate, recorded in
  [docs/models/h3/windowing.md](../../../../docs/models/h3/windowing.md).

## Honest-reporting gate

- [x] No `vrambuf_grow: 308503552` second ceiling appeared. What DID appear is a
      different second ceiling and it is reported rather than tuned around: stage 2
      has **two distinct walls**, attention (`prequantize_int8_attention`) and the
      MLP (`int8_linear`), and which one a run hits depends on the shape rather
      than the token count. Both are documented with their measurements.
- No window number was tuned downward until something passed. The `124` tier was
  raised to `243` because a forced single pass at 1K **succeeded**, not because a
  smaller window was made to work.

## Evidence

| what | where |
|---|---|
| Node | `ComfyUi-MpiNodes` v1.2.11, `287edb8`, pushed and pinned (MPI-703, `ace2161e`) |
| Wiring + bake | `f91438ca`, `550ea499`, `83763218` |
| Encoder correction | `f91438ca` — fl2va's re-exported CLIPLoader was still on the reverted nvfp4 build |
| Bypass correction | `550ea499` — `MpiMath` 620/621 exported at `mode: 4`, which pruned the stage-1 halving out of the runtime |
| Docs | `docs/models/h3/windowing.md` (new), `docs/models/h3/README.md`, `docs/workflow-authoring/bench-editing.md`, `docs/models/README.md` |
| Corrections to a sibling card | `.agents/mpi-kanban/tasks/MPI-477/brief.md` |
| CI | `550ea499` success on master |

## Why this is `validating` and not `done`

Everything above is verified, but nothing has run through **the app** — every
measurement here came from the bench or from a runtime graph read off disk. The
remaining check is one Vision generation per H3 op confirming the app drives the
windowed sampler end to end.
