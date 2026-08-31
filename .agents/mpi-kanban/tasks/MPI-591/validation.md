# MPI-591 Validation

Phase 1 verified on the bench 2026-08-31. Phases 2-6 not started.

## Verified

- **Engine capability, read off the LIVE bench** (`brief.md` first-check #2, not the changelog):
  `GET :8188/object_info` on core 0.34.2 returns `MiniMaxH3AddGuide`,
  `MiniMaxH3ReferenceToVideo`, `EmptyMiniMaxH3LatentAV`, `MiniMaxH3SigmaShift`.
  `MiniMaxH3VideoExtend` / `MiniMaxH3EncodeAV` are ABSENT — fork-only, as researched.
- **`h3.py` self-check green** — `python h3.py` passes, including the new masked-prefix
  arithmetic: the 39/90/141/192 context family, snap-DOWN, the period-5 `tail_span`, and the
  off-grid case that legitimately yields nothing.
- **`MpiH3MaskedPrefix` registers** — `GET :8188/object_info/MpiH3MaskedPrefix` after a bench
  restart returns the node with its three inputs and four outputs.
- **The prefix is genuinely preserved, measured not eyeballed** — the first 39 frames of both
  arm B and arm E come back at **PSNR ~38 dB** (37.94 / 37.96) against the source clip. That is
  VAE-round-trip + h264 level; a regenerated head would be nowhere near it.
- **Arm E renders a continuous extend** — `mpi591/E_prefix_plus_frame0_00001_.mp4`, 73 frames,
  subject / wardrobe / street all continuous across the seam at frame 39.
- **Every run actually executed** — `/history` `status.messages` checked for `execution_cached` on
  each; the sampler and decode nodes were never cache-served.
- **The C/D crash is stock's single-step keyframe limit, not our node** — identical failure with
  and without the mask, at `comfy/ldm/minimax/model.py:654`
  (`shape mismatch [2640, 96] -> [220, 96]`, i.e. 12 latent steps offered where 1 is reserved).

## NOT yet verified — the gate is Fabio's

- The plan's Phase 1 gate is **Fabio judging the seam**, on a static shot AND a moving one. Only
  the moving shot has been run, and only at 640x352 / 6-step turbo. Not a pass until he looks.
- Arm E's tail drifts the camera and carries a light streak across frames 50-72. Unknown whether
  that is the mechanism or the turbo/resolution budget. Re-run at 768p before judging.
- Nothing in the Cubric-Vision repo has been touched, so nothing there needs verifying yet.

## Artifacts

`D:\WORK\Images\Outputs\mpi591\` — `A_oracle_pack` / `A_oracle_joined` (the pack's take),
`B_masked_prefix` (mask alone, the instructive failure), `E_prefix_plus_frame0` (the winner),
plus `A_seam.png` / `B_seam.png` / `E_seam.png` / `E_tail.png`.
Graphs and scripts: session scratchpad `h3/`.
