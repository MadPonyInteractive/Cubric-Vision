# MPI-557 Plan - Phase 0: answer the questions, return a GO/NO-GO

**Scope: research only. This plan builds nothing.** Its deliverable is a verdict
section written into [brief.md](brief.md) - GO or NO-GO, the winning sampler and
its settings. The build plan gets written afterwards, against those answers.

Fabio, 2026-08-13: *"It might be a good idea to first answer all the questions
and do the plan for the action of actually creating the workflow and all that,
after the questions are answered. Otherwise we'll be building something that
might not even work awesome at the end."*

## Current State

**Session 4, 2026-08-14. SCOPE IS SETTLED: the product target is SOFT faces
(Fabio, "A"). The restoration branch ships; identity work leaves this card.**

**B10 is downgraded to INCONCLUSIVE** (Fabio, same day): its face reached the
sampler with **199 px vs B1's 266 px** - 25% fewer, despite a *larger* source
face, because a 30% pad on a 2.57x window spent the budget on background. So B10
does not isolate wrongness, and its "768 loses to 512" answer was scored after
downscaling 768 -> 512, which structurally cannot detect a resolution win. Full
correction in [brief.md](brief.md) § CORRECTION - B10 was under-resolved.

**B3 is ANSWERED.** Fabio's verdict (relayed via message `4f94885d` from the
MPI-536 session, which he pasted into by mistake): *"the bottom right one is the
best one"* = the `144/512` tile. His eye picked face-pixels-per-second, confirming
the pad lever. That tile also **clips the face in 24 of 72 frames** (the travel
envelope is 160 px tall; a 144 window cannot hold it at any centre), so the shipped
shape is **`176 @ 640`** - 393 face px, 68.6 s, no cut.

**And the 'wavy shadows' he flagged in every tile are fixed by one argument.**
Diagnosed in the relayed message as MPI-506 § 2e DEFECT 3 and confirmed here by
measurement: every B3 run used `color_correction_method: "none"`, the app ships
`lab`. Low-frequency luma drift, temporal sd **1.19 (none) -> 0.10 (lab)** - a 12x
cut, `wavelet` marginally better at 0.09, `adain` poor at 0.86. Free to apply
(post-process, 4.1 s with the sampler cached).

**The shimmer is ROOT-CAUSED and it is not ours.** Fabio pushed on why the
best-regarded open-source video upscaler would produce wavy faces at all. It
does not. Three probes, in order: temporal VAE tiling ruled out (64 vs 128 →
byte-identical); a frozen-input run (73 lossless-identical frames) shows the
model's own instability is real but **sub-visible** - Fabio's own eye: *"her face
doesn't have anything moving, the grey stuff has stuff moving"*, i.e. only in the
x16 drift map; and finally a per-band detail-gain vs churn-gain ratio on the real
clip: **churn rises in proportion to sharpening in every band** (fine: detail
x1.45, churn x1.58). **SeedVR2 is faithfully restoring shimmer the LTX source
already had.** Also settled: the node offers exactly four correction methods and
both cards swept all four, and MPI-506 explicitly *settled* (~45% cut), never
solved. Full evidence in [brief.md](brief.md) § The wavy shimmer, ROOT-CAUSED.

**This changes B6's question.** Frequency separation grafts the restored HIGH
frequencies - the band carrying the amplified shimmer. B6 must now answer *how
much* of the finest band to graft and whether it needs temporal smoothing, not
merely whether the maths works. And shimmer must be judged on real degraded
footage, never on an LTX generation.

**Default shape falling out of B3:**
> window = union of the face box across the shot + ~10% margin; sample resolution
> = whatever lands the face at ~380-400 px; `color_correction_method: lab`.

Awaiting only: does `176 @ 640` + `lab` still look like his pick. Earlier findings:

- **Pad is a resolution tax, and cutting it is free money.** A 176 window at 512
  delivers **315 face px in 36.3 s** vs the 208 window's **266 px in 47.8 s** -
  more face, less time. 18% more face at 768 for the same cost.
- **The window must cover face TRAVEL, not face size.** Median face 108 px but the
  travel union is 115x160, so a 144 window (1.33x the median face) clips the chin.
  That is `MpiFaceWindow`'s output spec.
- **And no metric can rank sample resolutions** - downscale-to-common erases the
  benefit, native-scale penalises it. Settled; eye only. Detail in
  [brief.md](brief.md) § B3 re-run.

Next action: **B6 paste-back** once Fabio returns the B3 verdict. B6 is still the
gating risk - with the sampler settled it is the only remaining question that can
sink the card, because a GO on the restored crop does not survive a visible graft.
`ImageBlur` is present on the bench, so it can be hand-wired. B5 no-seam stands
(a delta probe, not a resolution comparison); B8 is partially answered - VRAM does
not climb with sample res (14.92/15.57/14.09 GiB at 512/768/1024), so the open
half is 120 frames.

Parked, NOT rejected, and out of scope for MPI-557: section 4 Level 2, the
character sheet `t2i_022.png`, the LTX2.3 head_swap LoRAs, and
`comfy_workflows/raw/flow_head_swap.json` (which is **Qwen-Image-Edit 2511**, not
LTX - corrected this session; it is a still-image reference-conditioned swap, so
it carries identity but flickers per-frame). If wrongness ever becomes a target it
is a **separate card** starting from those three leads. Detail in
[brief.md](brief.md) § SCOPE DECISION.

**The finding that produced the decision, kept because it constrains the build:**

**Restoration fixes SOFT, not WRONG.** Source sharpness measured across all three
clips explains every result this card has: B1's source lapvar 1.7 -> 10.9x
restored, B1-stress 1.8 -> 61x, **B10 13.5 -> 3.8x**. B10's source is ~8x sharper
than B1's, so there was no deficit for a restoration prior to fill and all it
could do was denoise - which is exactly what Fabio saw. SeedVR2 has no identity
source and cannot move geometry, by construction (section 4 Level 1).

That splits the opening complaint - *"small faces lose identity and sometimes look
distorted"* - into two defects, and the branch only answers one:

- **soft + face intact** -> B1, GO. **This is the product case.**
- **soft + face never recorded** -> B1-stress, impossible for any restoration model
- **sharp + face wrong** -> B10, denoise only. **Out of scope, parked.**

B10 and B1-stress are closed as out-of-scope probes, not as failures. Do not
re-run them; their value was producing the law above.

**Settled B-questions:** B1 GO (soft faces), B2 SeedVR2 wins, B4 void, B7 answered,
B1-stress failed, B10 weak-with-a-measured-reason. B3 has one data point (768 lost
to 512 on a 288 px window), B5 has one (no seam at 2 x 41, overlap 2). B6
paste-back is still fully untouched, and B8 is unmeasured.

**Corrected by Fabio:** `MpiFaceWindow` does **not** need shot detection - the
user trims to the face shot before handing the clip over. Tracking and multi-face
association are still required; those happen within one shot.

**The bench is UP on 8188** (~40 GB resident, plus the 20 GB LTX transformer from
B2 still on the card). **Kill it unless the next session starts with bench work.**

Project mode: scalable-foundation.

Design, pipeline, rejected options and phase list live in [brief.md](brief.md).
This plan expands **Phase 0 only**.

Preconditions verified 2026-08-13 (no installs needed to start):

- **SeedVR2 nodes are `comfy-core`**, not a custom pack. `raw/seedvr2_video.json`
  reports `cnr_id: comfy-core` on all five (`SeedVR2Preprocess`,
  `Conditioning`, `TemporalChunk`, `TemporalMerge`, `PostProcessing`). Nothing
  to install - but the bench's core version is a gate, so probe first.
- **Weights already on disk** in `G:\CubricModels\diffusion_models\`:
  `seedvr2_3b_int8_convrot`, `seedvr2_7b_int8_convrot`,
  `seedvr2_7b_sharp_int8_convrot`, plus `vae\seedvr2_ema_vae_fp16`.
- **SeedVR2 is entirely unwired in the app** - absent from
  `js/data/modelConstants/*.js` and `dev_configs/node_lock.json`. The weights
  were fetched outside the dep system. So this bench work has **no app-side
  dependency and touches no shipped file**.
- Bench `custom_nodes` has `ComfyUI-LTXVideo`, `comfyui-impact-pack` +
  `ComfyUI-Impact-Subpack`, `comfyui-kjnodes`, `comfyui-inpaint-cropandstitch`,
  `ComfyUi-MpiNodes` (symlink), and `G:\CubricModels\ultralytics\` exists.
- Bench was **not running** on 8188 at plan time.

Bench facts that produce wrong answers if ignored:

- Bench is `G:\ComfyUi` on **8188**; the app engine is **48188**, a different
  install running *behind* the bench (0.30.2 vs 0.30.0). **Never convert a
  workflow against the bench.** Nothing here converts anything, but the bench
  being ahead is exactly why a core-node probe is step 1.
- The bench eats ~40GB resident and 7x-slows any local run. Shut it down
  between sessions.
- **Same seed + same graph = `execution_cached`.** A "faster" second run may be
  a cache hit, and a model-side widget change costs a ~19s re-patch. n=1 is not
  a measurement. See memory `tool_benchmark_comfy_graph_changes`.
- Editing a live bench workflow: close the user's tab first, re-fetch and assert
  before writing, read back from the bench. Memory
  `tool_author_and_verify_a_comfy_workflow_offline`.
- **No ffmpeg on PATH here.** Any frame extraction goes through a node or
  Python, not a shell one-liner.

### Decisions front-loaded (scalable-foundation)

Two calls that must not be made *after* seeing output, or the verdict is
post-hoc rationalisation:

1. **Judging is by eye, not by metric.** Laplacian variance detects a
   within-clip *collapse* but **cannot rank two healthy runs** - it has already
   scored grain as detail and picked the loser (memory
   `tool_measure_generative_upscale_quality`). So: Fabio's eye decides B1 and
   B2, A/B at 200% against the source. Metrics are used only as a
   collapse-detector, normalised against a **fixed lanczos baseline**, never
   per-run frame 1.
2. **The source clip is fixed before the first run** and reused for every
   question, so B2/B3/B4 stay comparable. Selection criteria: face bbox under
   ~15% of frame height, 3s+, visible head motion and at least one turn, from an
   existing Vision generation.

## Implementation

- [x] **Desk pass (D1-D3) - no GPU.** D1: does `MpiBoxCrop` accept a multi-frame
      IMAGE batch, and is `UltralyticsDetectorProvider` per-image only? Read the
      node source in `ComfyUi-MpiNodes` and Impact-Subpack. D2: does an LTX
      identity LoRA exist upstream, and where (this gates whether Phase 3 exists
      at all - `loraDeps.js` has `merged`/`transition`/`talkvid`, no identity).
      D3: `SeedVR2TemporalChunk` - arbitrary batch or fixed chunk, read its
      core-node signature. **Verify:** three answers written into brief.md
      § Phase 0 findings, each citing the file or URL it came from.
- [ ] **Boot the bench and gate on the schema.** Start `G:\ComfyUi` on 8188,
      `GET /object_info`, assert all five `SeedVR2*` nodes plus `MpiBox`,
      `MpiBoxCrop`, `ImageResizeKJv2`, `ImageBatchExtendWithOverlap` are
      present. A *running* ComfyUI keeps the old module, so a missing node means
      restart-then-recheck before concluding anything. Pick and record the
      source clip against the criteria above. **Verify:** probe output pasted
      into brief.md, clip path recorded.
- [x] **B1 - THE GATE.** GO, stated by Fabio 2026-08-14. Verdict + the degraded-footage caveat in brief.md. Hardcoded box in `MpiBox` (numbers read off a frame by
      eye), crop the sequence, upscale to 512, SeedVR2 restore, **stop there**.
      No detection, no paste-back, no detail transfer. Judge the restored crop
      alone: sharp, or waxy/plastic? **Verify:** Fabio views the crop A/B
      against source at 200% and states GO or NO-GO in brief.md. **On NO-GO,
      stop - move MPI-557 to `done`/`rejected` with the reasoning, and skip
      every item below.**
- [x] **B2 - sampler bake-off.** WINNER: SeedVR2, stated by Fabio 2026-08-14. Same clip, same graph, one box swapped:
      SeedVR2 vs LTX v2v + `ltx23-lora-merged` (detailer already baked in).
      Judge sharpness, identity stability across the clip, plastic-ness, speed,
      VRAM. Vary the seed between repeats or the second run is a cache hit.
      **Verify:** winner named in brief.md with the four judgements, not just a
      preference.
- [x] **B1-stress - degraded footage.** FAILED 2026-08-14, confirmed by Fabio.
      The re-run the B1 GO was conditioned on. 8x on a ~29 px face returns sharp
      mush; 4x and 7B-sharp controls fail identically, so the source carries no
      identity to restore. Findings in brief.md.
- [x] **B10 - the real degraded case.** WEAK 2026-08-14, then **downgraded to
      INCONCLUSIVE** the same day: the face reached the sampler with 199 px vs
      B1's 266 px, so "starved of pixels" and "structurally wrong" both fit and
      the run separates neither. Run on Fabio's `ref2v_ms_062.mp4`. Its B5
      no-seam data stands; **its B3 answer does not.** Keeps the silent
      conditioning-wiring bug. brief.md § CORRECTION.
- [ ] **B3/B5/B8 - settings sweep on the winner.** (**B4 is void** - it was the
      LTX-only denoise sweep and that branch lost B2.) B3 crop res 512 vs 768 vs
      1024, where returns die relative to cost - **re-run: B10's answer was
      scored after downscaling to a common 512, which cannot detect a resolution
      win. Judge at NATIVE resolution, by eye.** Same run tests the knob the B10
      correction exposed: size the resize off the **face height** rather than the
      window, so the 30% pad stops taxing face pixels (B1 got 266 face px, B10
      only 199). B5 do chunk seams show, at what chunk size and overlap - the
      no-seam result stands, it was a delta probe. B8 VRAM ceiling and max chunk
      at 120 frames x 512². **Verify:** a settings table in brief.md with a
      recommended default per row, plus a stated rule for choosing sample
      resolution from face height.
- [ ] **B6/B7 - paste-back and window.** B6: does frequency separation hold up -
      `out = source_crop + (restored - blur(restored, r))` - what blur radius,
      does it ghost. Hand-wire from `ImageBlur` + arithmetic; ugly is fine, this
      only proves the maths. **Colour-match nodes are BANNED on this card** and
      are not a fallback if B6 disappoints - a failure here is a finding.
      B7: run the union-window rule against 3-4 real clips and count how often
      subject motion makes one clip-wide box useless. **Verify:** B6 verdict
      plus a chosen radius; B7 a fraction (e.g. "2 of 4 clips") in brief.md.
- [ ] **Write the verdict and shut the bench down.** Consolidate every answer
      into a `## Phase 0 verdict` section in brief.md: GO/NO-GO, winning
      sampler, settings table, what surprised us, and which of the three planned
      custom nodes the findings changed the spec of. Stop the bench process
      (it holds ~40GB). **Verify:** brief.md carries the verdict section and
      every B-question has an answer or an explicit "not reached, because X".

## Completed

- [x] **Desk pass D1-D3** (2026-08-14). All three answered and written into
      [brief.md](brief.md) section `Phase 0 findings`, each citing its source file.
      Headline: `MpiFaceWindow` is confirmed needed, Phase 3's premise is void,
      and core already ships two of the pieces the brief planned to build.

## Remaining Work

- Phase 0 from the bench gate onward (boot + schema probe, then B1). The desk
  pass is done; **B1 is the next step and needs the GPU and Fabio's eye.**
- Out of scope by design: the three custom nodes, the Flow, the identity LoRA.
  Those get a second plan written against this one's verdict.

## Plan Drift

Four changes, all from the desk pass. Detail and citations in
[brief.md](brief.md) section `Phase 0 findings`.

1. **Phase 3 is re-scoped, not void.** There are multiple LTX ID LoRAs. The one
   we ship (`ltx23-lora-talkvid`) is `LTXVReferenceAudio` **speaker** identity -
   the wrong sense. The face one is `Alissonerdx/LTX-Best-Face-ID`, built for the
   LTX-2.3 22B checkpoint we already run, needing a BFSNodes update and a weight
   fetch. Phase 3 becomes "does its reference conditioning survive a denoise~0.3
   v2v init" - a bench test, not a wiring task.
2. **Brief step 6 (crossfade) is free on the SeedVR2 branch.** `SeedVR2TemporalMerge`
   already Hann-crossfades every overlap. It is a wire, not work. Only the LTX v2v
   branch still needs its own.
3. **B6 becomes an A/B, not a build.** `SeedVR2PostProcessing`'s `wavelet` option
   is `content_high_freq + style_low_freq` at 5 levels - the section 3 detail
   transfer, already in core, multi-scale, no radius to pick. `MpiDetailTransfer`
   may be redundant. Flagged for Fabio at B6, not decided here: it sits under a
   menu labelled "color correction", and section 3 bans colour matching.
4. **B5 (do seams show) is conditional, not fixed.** SeedVR2 `auto` chunking
   reserves a flat 8.5 GiB, over half this 16 GB card. A 120-frame 512 crop is one
   chunk on a clean card and roughly four on a loaded one, so B5 must be judged
   with the bench's own `SeedVR2TemporalChunk auto:` log line recorded alongside
   the verdict.

5. **B2's answer did not need a settings sweep to be safe.** The plan asked for
   denoise ~0.3; 0.50 and 0.70 were run too, so the LTX result cannot be blamed
   on one badly chosen sigma schedule. More denoise moved drift, not detail.
   Also: `SamplerCustomAdvanced` has no `denoise` widget - denoise IS the first
   value in `ManualSigmas`.

6. **B4 is void, not deferred.** It was the LTX-branch denoise sweep. B2 ran
   0.30 / 0.50 / 0.70 and closed the branch, so there is nothing to sweep. Brief
   step 6 (crossfade) is likewise fully gone now that only the SeedVR2 branch
   survives - `SeedVR2TemporalMerge` already does it.

7. **The B1 GO is now a SCOPED go, and the stress clip was mis-selected.**
   The 864x480 clip tested the wrong thing - a face with no recoverable pixels
   rather than a wrong-but-present one. Fabio is supplying a replacement.
   Original note follows:
 B1-stress shows the restoration branch
   cannot rescue a face the generator already destroyed - not at 8x, not at 4x,
   not with the 7B model. Phase 1 must not spec `MpiFaceWindow` against "any
   shitty face video"; it holds for small-but-intact faces only. Which case the
   product targets is now a question for Fabio, and it decides whether Phase 3
   is optional.

8. **`MpiFaceWindow` needs tracking and multi-face association - NOT shot
   detection.** B10's clip carries a hard cut, but Fabio corrected the inference:
   the user trims to the face shot before handing the clip over, so cuts are not
   the node's problem. What IS the node's problem is within-shot: largest-face-
   per-frame alternates between subjects (6 of 77 frames carry two faces) and
   produced a 1055 px union from a 112 px face.
9. **B3 and B5 have partial answers already** from B10, ahead of their own runs -
   768 lost to 512, and the first genuinely chunked run showed no seam. Neither
   is a rule yet; both need a second data point.

10. **The card's premise needs re-scoping before Phase 1.** Phase 0 set out to
    ask "does a small face come back sharp or waxy" and answered it (sharp). The
    measurement that closed B10 shows that was the easier half: restoration
    addresses SOFTNESS, and "distorted" faces are a structural problem it cannot
    touch. Phase 1 must not begin until Fabio says which defect the product
    targets - the answer changes whether Phase 3 is optional or central.

Also: bench core is 0.31.0, not the 0.30.2 recorded at plan time, and the bench
path is `G:\ComfyUi\ComfyUI\` (nested).

## Verification

**Verify mode:** user-ux

The gate is inherently a human visual judgement - "does this face look waxy" has
no automated answer, and the one metric available has already been measured
picking the wrong winner. B1 and B2 do not close without Fabio looking at the
output. Do not self-certify a GO.

Plan is complete when brief.md carries a `## Phase 0 verdict` section with a
GO or NO-GO that Fabio stated, and either a settings table (GO) or the reasoning
for `rejected` (NO-GO).

## Preservation Notes

- Every answer lands in [brief.md](brief.md), not in this plan file - the build
  plan gets written from the brief.
- If the bench work produces a durable ComfyUI/bench trap, it belongs in
  `~/.claude/memory/` (a tool file), not in a repo doc - it is bench knowledge,
  not app knowledge.
- If Phase 0 GOes, `docs/` gets nothing yet. The subsystem doc arrives with the
  Flow in Phase 2, routed via `docs/README.md`.
- No shipped file is touched by this plan. Nothing to commit beyond the card
  workspace, so no pathspec risk on the shared tree.
- On NO-GO: close as `rejected`, keep the brief. The rejected-options section
  (colour match, H3 ref2va) is the durable value even if the card dies.
