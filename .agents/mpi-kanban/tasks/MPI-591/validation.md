# MPI-591 Validation

Phase 1 verified on the bench 2026-08-31, static arm included. Phase 2's node is written,
pushed and NOT yet pinned. Phases 3-6 not started.

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

## Verified 2026-08-31 — the static arm, and what it caught

- **Arm G, a genuinely static source, chosen by measurement.** Edge-region frame-diff normalised
  for brightness isolates camera motion from subject motion: `MpiVideo_00001` scores **0.075**
  against 6.2 for the street clips and 8.9 for arm E's own source.
- **On a static shot our seam MATCHES the pack oracle: 1.40x vs 1.40x** (seam frame's luma diff
  over the synthetic side's mean). Head preserved at **PSNR 38.0 dB**, scene continuous across
  the boundary — confirmed by eye on frames 39/50/61/72.
- **On a moving shot ours is 3.85x against the oracle's 1.40x.** The camera drift is measurable,
  and it is a mechanism: a single frame-0 guide carries no camera velocity.
- **The sparkle artifact is `MpiH3MaskedPrefix`'s.** Arm I = arm G minus that one node, same seed
  and guide: clean tail, 1.17x. Not turbo, not resolution — Fabio has never seen it in turbo.
  **This is an open defect in the node, undiagnosed, deliberately not patched.**
- **`MpiH3EncodeAV` written, `python h3.py` self-check green, pushed (`952919f`).**
- **Both H3 nodes REGISTERED on a live restarted bench** — `GET /object_info/MpiH3EncodeAV`
  returns its four required inputs, `/object_info/MpiH3MaskedPrefix` its three.
- **`MpiH3EncodeAV` is bit-identical to the pack's `MiniMaxH3EncodeAVPatched`** — arm J vs arm G2,
  same seed and clip, `PSNR y:inf` over the whole 73 frames; head 38.035 dB either way. The
  shipped graph no longer needs the fork.
- **The bench restart changed nothing** — arm G2 is `PSNR y:inf` against arm G. So the `aimdo`
  VBAR `pin_count` warnings Fabio flagged are noise, and the earlier G-vs-I comparison was not
  confounded by the other session's job sitting between them.
- **The sparkle is the prefix CONTENT, not the mask** — arm K keeps the mask identical and zeroes
  the context latent through core's `LatentMultiply`; clean tail. A noise-scale error is also
  ruled out: it would show in the head, and the head is 38.0 dB.
- **And it is the VIDEO half of that content** — arm L keeps the video prefix and silences the
  audio one (`AudioAdjustVolume` at -100 dB, which preserves the waveform's length so the audio
  latent keeps its step count): sparkle stays, head still 38.03 dB. Audio exonerated.
- **Fabio confirmed both by eye, 2026-08-31**: G has the flashes, I does not. He also noted I
  diverges from the source — correct and expected, since I preserves no head at all; it is a
  control, never a candidate route.
- **`node_lock.json` pin bumped `5e07043` -> `53c0198`**, and the GitHub archive for that sha
  returns 200 (an unpushed sha would 404 for every user).
- **The node's canvas guard fires correctly** — a 704x1216 context against a 352x608 target was
  refused with the right message. `VHS_LoadVideo` does not resize; the source must be re-encoded
  at the target canvas first.

## NOT yet verified — the gate is Fabio's

- The plan's Phase 1 gate is **Fabio judging the seam**, on a static shot AND a moving one. Both
  are now run (E moving, G static) and neither has been looked at by him. Not a pass until he does.
- **The sparkle defect is narrowed to the written VIDEO latent, and not diagnosed.** Four arms
  bracket it (G/L/K/I) and the next steps are reading, not running — see the plan's ordered list:
  the encoder's 3-token tail pad, the packing phase across the boundary, then attention drift.
- **The pin was bumped with that defect open**, deliberately: no shipped workflow calls either H3
  node until Phase 3, so the pin ships the code without exposing the bug to a user. If Phase 3
  lands before the defect closes, that stops being true.
- The only Cubric-Vision file touched is `dev_configs/node_lock.json`. It is a version-bump
  trigger — `/mpi-version-bump` at release time, not per node change.

## Artifacts

`D:\WORK\Images\Outputs\mpi591\` — `A_oracle_pack` / `A_oracle_joined` (the pack's take),
`B_masked_prefix` (mask alone, the instructive failure), `E_prefix_plus_frame0` (the moving arm),
`G_static_prefix_plus_frame0` (**the static arm — the one to judge**),
`G2_static_clean_bench` (G re-run after the restart, bit-identical),
`J_our_encode` (the same, on our `MpiH3EncodeAV` — bit-identical to G2),
`I_guide_only_no_prefix` (the same shot with the prefix removed: the sparkle's control),
`K_zero_prefix` (mask kept, content zeroed — the arm that exonerates the mask),
`L_silent_audio_prefix` (video prefix kept, audio silenced — the arm that exonerates audio),
`H_control_no_prefix_no_guide` (unanchored, kept only as the reason it is not a usable control),
plus `A_seam.png` / `B_seam.png` / `E_seam.png` / `E_tail.png` / `G_seam.png` / `G_tail.png` /
`H_tail.png` / `I_tail.png`.
Static source: `G:\ComfyUi\ComfyUI\input\mpi591_static39.mp4`, cut from `MpiVideo_00001`.
Graphs and scripts: session scratchpad `h3/` — `build_static.py`, `build_control.py`,
`build_isolate.py`, `seam_metric.py`, plus `submit.py` carried over.
