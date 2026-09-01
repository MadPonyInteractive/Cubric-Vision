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
- **Fabio looked at G and M, 2026-08-31: the flashing is STILL THERE in both.** The speck metric
  oversold arm M; a flash metric (regional luma jump) matches his eye and puts M at 3.73 against
  the I/H clean floor of ~0.4 — about 7x, not "nearly clean". The straddle is a contributor, not
  the cause. **The defect is open and the route is not proven.**
- **The pack oracle has NOT been floored for flashes and cannot be from disk** —
  `A_oracle_joined.mp4` is a concat with a literal splice at frame 39, `A_oracle_pack` is the new
  frames only with no seam. Whether the pack's route flashes is unanswered, and it is the question
  that decides whether the masked-prefix route is viable at all.
- **Nothing is fixed yet.** The alignment change was an experiment and was reverted;
  `ComfyUi-MpiNodes` is at `53c0198` with a clean `git status`. The node still ships the
  straddling write.
- **The 39 -> 51 minimum-context contract change is Fabio's call and has not been made.**

## Verified 2026-08-31 — the sparkle diagnosed

- **Candidates 1 and 2 are dead by reading `comfy/ldm/minimax/vae.py`.** `encode_temporal` (l.544)
  chunks into fixed 17-frame clips, freeze-pads a short final clip, and then drops the last
  `token_drop=3` tokens itself — so 39 frames encode to **12** tokens, matching the 12 latent steps
  the C/D crash independently measured. No pad reaches the node, and a 15-token latent would have
  made `plan_context` RAISE (reachable tail spans 42 and 38, never 39) rather than sparkle. The
  encoder is a 3D **causal** CNN chunking on absolute frame 0, so the context's tokens 0-11 are
  identical to a 73-frame encode's — the packing phase agrees token-for-token.
- **Candidate 3 (attention drift) is dead by measurement.** A temporal-impulse metric (pixel
  brighter than BOTH temporal neighbours by 16/255; static texture cancels, which is what makes the
  locked-off arm G the right shot) run over all seven arms, each normalised to its own chunk 1:
  every real-prefix arm (G 2.10x, L 2.02x, E 2.36x, B 2.58x) doubles in decode chunk 2 and spikes
  6-19x on its worst frame; every arm without one is flat (K 1.04x, I 0.98x). **`c3/c1` is
  0.89-0.93 for all four prefix arms** — the excess ends at frame 51. Drift would grow.
- **The cause: a whole-clip prefix can never end on a decode-chunk boundary.** Every valid `17k+5`
  length encodes to `5k+2` tokens, so a 12-token prefix in a 22-token target leaves decode chunk 2
  (frames 34-50) built from tokens 10,11 written by `vae.encode` plus tokens 12,13,14 from the
  sampler. Chunks 0-1 are pure encoder (the 38 dB head), chunk 3+ pure sampler (baseline at 51),
  and only chunk 2 mixes — which is exactly where the artifact is.
- **The guide is exonerated by a controlled pair, not by re-reading.** E and B share source, canvas
  and seed and differ only by the frame-0 guide: 2.36x with, **2.58x without**.
- **The missing static no-guide cell is NOT fillable from disk** — `B_masked_prefix` is 640x352,
  the moving source. Probed, not assumed; a first pass at the metric that hardcoded 352x608
  reshaped B's bytes as the wrong canvas and produced nonsense.
- **Arm M confirms the mechanism on the bench.** 80 s, `execution_cached: []`, graph byte-identical
  to `G_static.json` but for the output name; the only change was the node clamping its written
  video prefix to a whole 5-token chunk (12 -> 10 tokens) taken from the front. **c2/c1 fell 2.10x
  -> 1.16x and the worst frame 7.08x -> 3.00x**, while the preserved head held at **37.81 dB** over
  its 34 frames against G's 38.13 dB over the same 34 — so the tail did not get clean by losing the
  prefix. The experiment edit was reverted; `git status` on `ComfyUi-MpiNodes` is clean at
  `53c0198` and `python h3.py` passes. The bench was restarted afterwards so its loaded modules
  match disk again.
- **A separate latent bug found while building arm M, not triggered by any arm yet.** The node
  writes the context's TAIL at the target's FRONT, which only preserves the positional
  `FRAME_PER_TOKEN` phase when the tail starts on a token index divisible by 5. Arm G satisfied
  that by accident (`steps` equalled the whole token count, offset 0). `plan_context` enforces no
  such constraint, so a longer source can legally pick a tail starting at token 2 or 7 and shift
  every token into the wrong slot. Fix with the alignment work: require
  `(total_steps - steps) % 5 == 0`.
- **A first sparkle metric was built and DISCARDED.** Spatial isolated-speck counting scored arm
  G's own preserved head (real, known-clean footage) *above* its generated tail — it was measuring
  scene sharpness, not sparkle, and it ranked arms by how crisp their scene was. Recorded so it is
  not tried again. Scripts: session scratchpad `sparkle.py` (dead), `sparkle2.py`, `chunks2.py`.
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

## Phase 1 — GATE PASSED 2026-09-01 (arm F2)

**Fabio's verdict on `F2_joined.mp4`:** *"the soundtrack carried on. That was a bit of a jump, but
I think that's just because the model didn't have enough reference to go about, as it's a short
video... these would work really well in longer references."* Phase 1's gate is "judged by Fabio";
this is the pass, with the residual attributed to a 1.625 s reference rather than the mechanism.

**The route that passed is ARM F2, and it uses none of the masked-prefix machinery.** Stock
`MiniMaxH3ReferenceToVideo` generating the NEW frames only, `MiniMaxH3AddGuide` pinning the
source's last frame at generated frame 0, the source's audio wired to `ref_audio`, and the two
clips joined in PIXEL space — which is what the shipped `flow_ltx_extend.json` already does at its
nodes 43/44/45 (`ImageBatchExtendWithOverlap` / `TrimAudioDuration` / `AudioConcat`).

Measured on the FLASH metric (regional luma — the instrument that matches Fabio's eye; the speck
metric above is discarded) and the seam metric, against the pack oracle on the SAME canvas:

| arm | flash mean | flash worst | seam/tail | audio band cos |
|---|---|---|---|---|
| **F2** | **1.05** | **2.03** | **0.94x** | **0.973** |
| F (no ref_audio) | 1.05 | 1.82 | 0.95x | 0.801 |
| A pack oracle | 1.71 | 6.42 | 1.40x | 0.981 |
| E masked prefix | 5.37 | 18.51 | 3.85x | — |
| G masked prefix (static) | 4.21 | 15.61 | 1.39x | 0.427 |

`seam/tail 0.94x` means the cut frame moves LESS than the tail's own frame-to-frame noise.

**The audio metric is new and it caught what the video metrics could not.** `audio_match.py`: RMS
dBFS from raw PCM plus a 16-band log-spaced spectral profile, cosine against the source. Arm F
scored 1.05/1.82 on video and was still wrong, because nothing measured sound. Per
`~/.claude/memory` `tool_measure_generated_audio`, level comes from raw PCM or `volumedetect` —
`ebur128` reads the silence floor on clips this short.

**API note that cost a lookup:** stock ref2v's `ref_audios` / `ref_videos` / `ref_video_audios` are
`COMFY_AUTOGROW_V3`, and in an API prompt their keys are the **dotted flat path**
(`"ref_audios.ref_audio_0"`), not a nested dict — `_expand_schema_for_dynamic` builds
`expected_id = finalize_prefix(curr_prefix, name)` and looks that up in live inputs
(`comfy_api/latest/_io.py:1195`). The shipped graph does not need this: our own `MpiH3References`
already exposes `ref_image_1..9` / `ref_video_1..3` + `ref_video_audio_1..3` / `ref_audio_1..3` as
flat named slots and drops the empty ones.

Artifacts: `F_stock_pin_last_00001_` / `F_joined` / `F_seam.png` / `F_tail.png`,
`F2_ref_audio_00001_` / `F2_joined` / `F2_seam.png` / `F2_tail.png`. Scripts in this session's
scratchpad: `flash_F.py`, `audio_match.py`, `join_F.py`, `build_F2.py`, `h3/F2_ref_audio.json`,
and `h3/F3_ref_audio.json` — built, UNRUN, the stronger arm (source frames + soundtrack as a
reference video pair) held in reserve if a longer real source still steps at the join.
