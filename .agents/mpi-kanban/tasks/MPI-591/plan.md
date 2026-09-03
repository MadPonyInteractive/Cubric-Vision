# MPI-591 — Plan: Extend Video takes MiniMax H3, and the user picks which

Written 2026-08-31 after Fabio brought in `kat3ri/ComfyUI-MiniMax-H3-Extend`. Two files feed
this plan and neither should be re-searched: `brief.md` (the H3 seam physics — every rule there
fails SILENTLY) and `research/minimax-h3-extend-nodepack.md` (the pack, and what changed).

## Current State (2026-09-01, after 4b + 4c — only Phase 5 and Phase 6 are left)

**Phases 1, 2, 3, 3b, 4, 4b and 4c are ALL CLOSED.** The graph is 40 nodes, both arms are
bench-proven, and the app side is wired and tested. The card is in `doing` / `in-progress`.

> **PHASE 5 PART 1 IS DONE (2026-09-02) — everything that needs no GPU, and it found a real bug.**
> `hiddenWhen` on a STEP field had never reached the DOM: `_buildFieldsRow` neither registered its
> nodes in `_liveFields` nor painted, and `_paintFieldConstraints` skips an unregistered id in
> silence — so the `Avoid` box stayed on the H3 arm and 4b's claim was wrong. Fixed in
> `MpiBaseFlow.js` (two lines, both mutation-killed) and pinned by
> `tests/desktop/flow-step-field-hidden.spec.js`. MPI-666 checks 3/4/5 pass in the app; 1/2 are
> unreachable while H3 is installed and are covered by `flow-licence-surface.test.cjs`. Full
> evidence in `validation.md` § Phase 5.
>
> **TWO THINGS THE NEXT SESSION MUST KNOW.** (1) **LTX 2.3 is no longer installed** —
> `G:/CubricModels/diffusion_models/` now holds both H3 DiTs and no LTX transformer, so the LTX
> arm cannot be RUN without a ~20GB download; its field behaviour is covered by stubbed tests that
> need no weights. (2) `app:isolated` with no `CUBRIC_ENGINE_ROOT` resolves `.engine-config.json`
> to the SAME engine the user's app runs, and its boot repair acted on it (a forward move to the
> `ccc25d1` pin — harmless, and Fabio restarted). The instance also holds `needsRestart: true`
> afterwards, and `routes/comfy.js:405` delegates that restart to the OWNER app — so REBUILD the
> isolated instance before dispatching anything.
>
> **PHASE 5 PART 2 RAN 2026-09-03 AND THE GATE FAILED — PHASE 5b IS NOW THE CARD.** Both real
> extends completed (turbo 213.5 s, non-turbo 543.5 s, both 1280x704 / 128 frames / 5.334 s, both
> carrying `flowModelIds` on the sidecar). No flicker, no artefacts. What failed is CONTINUITY:
> Fabio can always tell where the source ends, against an LTX extend he calls seamless. Root cause
> is in the graph, not in tuning — `#330 MpiH3References` gets **no `ref_video_*` and no
> `ref_image_*`**, so the model's entire view of the source is `#903 MiniMaxH3AddGuide` pinning ONE
> frame. The H3 arm is image-to-video off the last frame. Same cause re-sings the music: the track
> goes into the STANDALONE `ref_audio_1` ("make audio like this"), not paired to a reference video.
> Two 4b carry-forwards died with it — the "2x luma energy" INVERTED at real resolution (it was
> measuring how much the continuation moves, not flicker) and "+47%" became +154%. Full evidence,
> the LTX mechanism table and the node inventory: `validation.md` § Phase 5 part 2.

> **NEXT: PHASE 5b — give the model the previous seconds.** Decided with Fabio 2026-09-03: match
> LTX's window exactly — **last 3 s, capped, take everything when the source is shorter, invent
> nothing**. Route A (attempt first, wiring only): wire `ref_video_1` + `ref_video_audio_1` on
> `#330` off a `MpiClamp(1, 72)` / `GetImageRangeFromBatch(start -1)` tail of the CROPPED `#916`,
> with `MpiAudioRange` cutting the matching audio tail, and DROP `ref_audio_1`. Route B (escalation
> if A is too weak): `MpiH3EncodeAV`/`MpiH3DecodeAV`, which have grown real video AND audio masking
> since Phase 1 — that is LTX's actual mechanism, and we own it. `MiniMaxH3VideoExtendPatched`
> (`context_latent` + `context_frames`) is a bench ORACLE for B's shape, never a dependency.
> The prompt is part of the fix: it must describe the CONTINUATION, never re-describe the source.
> Multi-reference extends (a new character entering mid-extend via `ref_image_1..9`) are DEFERRED.

> **5b's FIRST THREE PAIRS ARE RUN (2026-09-03) AND "MORE OF THE PREVIOUS VIDEO" IS A DEAD END.**
> Four arms, one source (`cowboys/Media/ref2v_ms_004.mp4`, 5.167 s), one seed, one prompt, the
> shipped downstream on every arm — so context is the only variable. **The shipped ONE-FRAME pin
> has the tightest join of the four, by 3-4x:** control 2.02 (0.36x) / Route A at 3.00 s 2.07
> (0.37x, +64% for nothing) / the pack at 1.75 s 6.86 (1.20x) / the pack at 3.00 s 7.98 (1.39x).
> Scaling context UP made it worse in BOTH mechanisms. **Route A is dead** — and 5b's first pair,
> which said it made the seam *worse*, was RETRACTED: that window was 1.625 s, below the node's
> 2 s floor, so it was out of range, not informative. **The pack oracle was rebuilt and validated**
> — ctx21 measures 1.39x against Phase 1 arm A's recorded 1.40x, and Phase 1's finding that the
> shipped route beats the oracle (0.94x vs 1.40x) reproduces independently on a longer source.
> `context_frames` counts LATENT TOKENS (`FRAME_PER_TOKEN = (1,4,4,4,4)` indexed `k%5`): the
> author's default 2 = 0.33 s, Phase 1's 12 = 1.75 s, and 21 = exactly 3.00 s.

> **NEXT: ROUTE B, AND IT IS NOT "MORE CONTEXT" — IT IS GENERATE ACROSS THE SEAM AND BLEND.**
> At 0.36x the join is already TIGHTER than the footage's own frame-to-frame motion, so there is no
> pixel step to see; what Fabio sees is a CONTENT discontinuity. Every H3 arm — ours and the
> pack's — emits only the new frames and butt-joins in pixel space (`#904` blends **1 frame**). LTX
> masks the source into the latent, generates THROUGH the boundary, discards its regenerated copy
> of the reference and crossfades the original back over the full 3 s. So build:
> `MpiH3EncodeAV` over source+extension with the mask covering ONLY the extension →
> `MpiH3DecodeAV` compositing back through that mask with `feather` (the crossfade H3 lacks).
> Two other causes now have evidence and are cheap: the PROMPT must describe the continuation, not
> re-describe the source (proved — it stopped the camera re-invention on both arms), and SOURCE
> LENGTH dominates (on 5 s even the one-frame control continued plausibly; on 1.6 s nothing did).

> **PHASE 5c RAN (2026-09-03): ROUTE B IS DEAD, AND THE BENCH IS NOT STOCK COMFYUI.**
> Route B built and run as approved - `MpiH3EncodeAV` over source+extension, mask over the
> extension only, `MpiH3DecodeAV` compositing back. **Join 30.18 (5.56x) against the shipped
> control's 2.02 (0.36x): 15x LOOSER**, and the driver changes clothes across the seam.
> **The mechanism is not what failed.** F8 re-ran the same sample with the composite off (25 s,
> ComfyUI cached the sampler) and its decoded head IS the source - so the noise mask reached the
> sampler and the preserved region survived. The composite is not the seam either (30.38 without
> it) and neither is the VAE round trip (-0.83 luma over the head against +12 at the join).
> H3 does not take identity from unmasked latent tokens. **That makes Route B and Phase 1's
> `MpiH3MaskedPrefix` ONE mechanism, not two** - the handoff's distinction between them was a
> difference of nodes, not of what the model is asked to do. Identity in H3 travels through the
> GUIDE, which is why the one-frame pin has now beaten five context arms.
> **Correction to the handoff:** `feather` is a SPATIAL softener (`max_pool2d`+`conv2d` over H,W,
> `h3.py:986-1010`). It is a no-op on a full-frame mask and can never crossfade a temporal seam.
>
> **NEXT, AND IT NEEDS A DECISION FROM FABIO FIRST.** `MiniMaxH3AddGuide` anchors a CLIP, not just
> a frame (17k+5, `frame_idx` in pixel frames) - LTX's whole shape through the path H3 listens to.
> Three arms were built for it and all three died in the sampler, and a minimal-diff probe (the
> CONTROL with only `#902 num_frames` 1 -> 39) died identically, so it is not our graph.
> **`custom_nodes/ComfyUI-MiniMax-H3-Extend/patch.py` monkey-patches `PackedLayout.__init__` and
> `MiniMaxH3.extra_conds` at import for EVERY graph on 8188.** It allocates one frame's rows for
> any image keyframe (hence `[4860, 96]` into `[405, 96]`) and raises "only first/last keyframe
> anchors are supported". Stock `PackedLayout` called directly on CPU sizes all three lengths
> correctly. The pack has no env switch: disabling it means renaming the folder and restarting the
> bench, which also removes the Phase 5b oracle. **Fabio's call.** Full evidence and the probe
> table: `validation.md` § Phase 5c.

> **PHASE 5d (2026-09-03): THE CLIP GUIDE RUNS, AND THE SEAM METRIC WAS MEASURING THE WRONG THING.**
> Pack disabled (renamed `.disabled`, Fabio restarted the bench) and both blocked arms ran first
> time unchanged - so the layout failure and the anchor restriction were the pack's patch, proven.
> `MiniMaxH3AddGuide` now anchors the source's last **39 frames** as a clip at `frame_idx 0` with
> its matching audio, `ref_audio_1` dropped: **F10a** discards the model's re-take and joins hard
> (LTX #44/#45), **F10b** keeps it and crossfades the original back over all 39 (LTX #43).
> **THE HEADLINE IS THE METRIC.** `join / source-half mean` never measured smoothness - it measured
> STILLNESS. The control's 2.02 is a DIP (2.0 where its neighbours run 4.6-6.6 and the footage's own
> motion is 5.68): the picture nearly stops for one frame, which IS the "start frame from the last
> frame" artefact Fabio described. The target is **1.0x**, not 0. F10b's whole crossfade region
> measures mean **5.59** against pure-source **5.68**, no spike - indistinguishable from ordinary
> motion. **And identity holds** through the fade and 2.3 s past it, which no arm before this
> managed. This reframes Phase 5b's table: the control's 0.36x was never the bar.
> **NEXT: Fabio's eyes on F10b vs F10a.** The metric cannot say whether it reads as one take.
> Then, if it holds: guide length (39 -> 56 -> 73, matching LTX's 3 s cap) and the audio, which is
> untested on these arms.

> **FABIO'S GATE ON 5d: CONTINUATION PASSES, ONE DEFECT LEFT (2026-09-03).** *"Their continuation
> is really good... The sound is good, flawless."* Identity, motion and AUDIO all pass on both
> arms - the guide's own `audio` input killed the re-sung-music problem. What remains is a short
> **luma** flicker at the transition, 1-5 frames, worse on F10b. **Measured and diagnosed: chroma
> is flat (U +0.84, V -0.2); the model's RE-TAKE of the guide is up to +4.9 luma brighter than the
> original, `linear_blend` ramps that in monotonically across the overlap, then frames 119-124 swing
> 3-6 luma and drop back.** Crucially the model's CONTINUATION (frame 125 on) sits at the source's
> own level - only the re-take drifts, and the re-take is exactly what the crossfade mixes. F10a's
> version is a single -2.4 step, compounded by the source brightening 103.8 -> 105.9 through the
> overlap on its own while the continuation does not follow.
> **NEXT, cheapest first: (1) level-match the re-take to the original before blending (per-frame
> gain or mean-match over the overlap) - it attacks the measured cause directly; (2) try
> `filmic_crossfade` / `perceptual_crossfade`, both untested, `linear_blend` was chosen only
> because flow_ltx_extend.json uses it; (3) guide length 39 -> 56 -> 73.** Do NOT widen the
> crossfade - the excursion grows with overlap length.
> **BENCH STATE: `custom_nodes/ComfyUI-MiniMax-H3-Extend` is renamed `.disabled` and must stay that
> way for this work** (it patches core for every graph). Restore it only when the Phase 5b oracle
> is needed again, and restart the bench by hand - Manager has no reboot endpoint on this build.

> **STILL OPEN after 5b: Reuse Prompt coming back on H3, then Phase 6 docs.**

> **NEXT: Phase 5, and it is NO LONGER BLOCKED.** The handoff said 48188 was stale on `53c0198`;
> Fabio has restarted his app since, and the 40-node graph — `force_rate`, `EasyCache` and
> `ImageResizeKJv2` included — validates clean against it. Run the isolated app
> (`npm run app:isolated`, never `:3000`), and fold in MPI-666's five licence-surface checks
> (message `71214c6e`). **Look at a NON-TURBO extend, not only a turbo one:** its generated half
> measures ~2x turbo's frame-to-frame luma energy and a luma diff cannot tell detail from flicker.
> Then Phase 6 docs: `existing-flows/ltx-extend.md` (second candidate, the `byModel` contract, the
> Turbo toggle, and that a non-32-divisible source is delivered centre-cropped) and
> `any-of-models.md` ("a slot may pick a different GRAPH, not just different params"). The
> `hiddenWhen` model clauses are ALREADY documented in `ui/carousel-frame/fields.md`.

- **PHASE 4b — DONE.** Turbo is the user's choice, default TRUE. `#908 Input_is_Turbo` drives three
  `MpiIfElse` plus `#915`'s strength math; `hiddenWhen` gained `{ model }` / `{ modelNot }` so the
  toggle hides on LTX and the `negative` box finally hides on H3. Turbo re-earned at **69.5 s**
  against the 70 s baseline (the LoRA/SigmaShift reorder cost nothing); non-turbo runs at
  **102.3 s**, +47%, seam 0.333x against turbo's 0.327x. See § Plan Drift for the three corrections.
- **PHASE 4c — DONE.** `#916 ImageResizeKJv2` (crop, `divisible_by 32`, centre) feeds BOTH `#902`
  and `#904`; `#900/#901` deleted. A 1280x720 source now delivers **1280x704**, and the source half
  is proved to be a crop rather than a rescale at 44.3 dB vs 27.5 dB.

---

**Phases 1, 2, 3 and 3b are all closed. The graph is done; what is left is wiring, verifying and
documenting it.**

- **PHASE 1 — GATE PASSED by Fabio on arm F2.** The route is the SIMPLE one and none of the
  masked-prefix machinery is in it: stock `MiniMaxH3ReferenceToVideo` generating the new frames
  only, `MiniMaxH3AddGuide` pinning the source's last frame at generated frame 0, the source's
  audio in as `ref_audio_1`, and a PIXEL join. Flash 1.05 / 2.03 against the prefix arms' 5.37 /
  18.51, seam 0.94x against the oracle's 1.40x, audio 0.973. Thirteen arms; the history and the
  sparkle diagnosis are in the § sections below and stay there as record. `MpiH3MaskedPrefix` and
  `MpiH3EncodeAV` remain shipped in MpiNodes, documented and proven equivalent to the pack's
  encode — simply unused by this Flow. **Nothing to revert.**
- **PHASE 2 — DONE.** Both H3 nodes written, registered on a live bench, changelog + README rows
  added, pin bumped off `5e07043`.
- **PHASE 3 — DONE.** `comfy_workflows/flow_h3_extend.json` (33 nodes) + its `raw/` LiteGraph twin,
  0-difference round trip, both validators green, and a 70 s bench run: 94 frames, seam 0.65x,
  generated audio 0.989. See § PHASE 3.
- **PHASE 3b — DONE, and it cost two corrections the plan got wrong.** `force_rate` on
  `MpiLoadVideo`, `Input_Video.force_rate = 24`, `MpiSaveVideo.fps` a constant 24. Pin now
  **`f1ed110`** (archive 200). Round trip 0 differences, and a bench run on a deliberately 30 fps
  source: 94 frames at a true 24 fps, seam **0.22x**, generated audio **0.991**, and the source
  half lands within **8.3 ms (0.51%)** of its own duration where leaving `force_rate` off would
  have played it **25% slow**. Both corrections and every number are in `validation.md` § Phase 3b.

- **PHASE 4 — DONE.** The pick selects the GRAPH: `byModel` on `flowLtxExtend`,
  `getUniversalWorkflow(key, modelIds)`, `flowModelIds` through the `runCommand` whitelist, and
  the slot `['ltx-23-balanced', 'minimax-h3-ref2va']`. FIVE files, not four, and the candidate is
  **ref2va** — see § Plan Drift for both. `npm test` 853/853, `eslint js/` clean, and the new
  MPI-591 test in `flow-model-choice` was mutation-checked red twice.

**4b and 4c both LANDED 2026-09-01.** The planning block that stood here — the donor node table,
the crop-vs-rescale question, the `hiddenWhen` decision and the 48188 stale-pin warning — described
work that is now done and an engine that has since been restarted. What it decided is in § Plan
Drift; what it proved is in `validation.md` § Phases 4b + 4c.

**F3 (`ref_video_1` + its soundtrack) is built and unrun** — hold it as the answer if a longer real
source still steps at the join.

**MPI-666 is parked in `validating` waiting on this card** (message `71214c6e`). Once Phase 4
declares `minimax-h3` in `requiredModels`, its five licence-surface checks become runnable and they
belong in Phase 5's verification — tile reads LICENCE REQUIRED not GET MODELS, footer reads REVIEW
LICENCE not VERIFY LICENCE, the drawer block carries the three links, step 0 shows the attribution
inside a project, and re-opening does not re-fire the gate but does keep the attribution.

**The bench is shared and it is not free.** Same ComfyUI at `:8188` that other cards use. Wrap every
run in `gpu_lease.py run --`; it queues correctly. Check the QUEUE is empty before restarting it — a
restart kills whatever another session has in flight.

**A `RuntimeError: HostBuffer.read_file_slice failed` inside `SamplerCustomAdvanced` is an engine
hiccup, not a graph bug.** Seen once right after another session's job released the GPU; the
identical graph succeeded on retry. Retry before diagnosing.

## Phase 1 results (2026-08-31) — six arms, on the bench

Source: `mpi591_src39.mp4`, 39 frames / 1.625 s / **640x352**, cut down from `MpiVideo_00056`.
Target 73 frames (39 preserved + 34 new). Seed 591000591 on every arm. Turbo settings lifted from
the SHIPPED graph, not invented: LoRA `minimax_h3_ref2v_..._4step` at **1.0**, `MiniMaxH3SigmaShift`
12/5, `BasicScheduler` **beta / 6 steps**, `KSamplerSelect` **euler**. Weights: our
`ref2va_pruned_int8_convrot` + int8 video VAE, never the author's fp16.

| arm | what | result |
|---|---|---|
| A | the pack (`MiniMaxH3VideoExtendPatched`), context as keyframes | **seam invisible** — the oracle |
| B | masked prefix ALONE | boundary EXACT, but the tail renders **an unrelated scene** |
| C | masked prefix + a 39-frame `MiniMaxH3AddGuide` | **crash** |
| D | that guide with NO mask | **same crash** — so it is the guide, not the mask |
| **E** | **masked prefix + a single frame-0 guide** | **works — continuous, first-party, stock** |
| **F** | **stock pin-last-frame, no prefix** | **RUN 2026-09-01 — clean, and it beats the pack oracle** |
| **G** | **arm E on a STATIC shot** | **the best result on the card — seam matches the oracle** |
| H | no prefix, no guide (control) | clean, but a different scene: not a usable control |
| **I** | **frame-0 guide, prefix REMOVED** | **clean — so the PREFIX causes the sparkle** |

### The sparkle is `MpiH3MaskedPrefix`, and that is a real defect (2026-08-31)

Arm I is arm G with exactly one node removed. Same seed, same frame-0 guide, same source, same
canvas, same turbo settings. It anchors to the same scene and subject, and its tail is **clean**:

| arm | masked prefix | seam/tail | tail |
|---|---|---|---|
| G | **yes** | 1.39x | sparkle/streak particles from ~frame 50 |
| I | no | 1.17x | **no artifact** |

Fabio, 2026-08-31: he has never seen this artifact in turbo. So it is not the 6-step budget and it
is not the resolution — the two explanations the earlier "open for Fabio" note offered are both
dead. **`MpiH3MaskedPrefix` is putting it there.**

Not yet diagnosed, and NOT to be patched at the symptom. What is already known and constrains it:

- The preserved head is clean (PSNR 38.0 dB), so the damage is in the GENERATED region beside the
  boundary, not in the prefix itself.
- It grows with distance from the seam rather than sitting on it, which does not fit a simple
  boundary-blend error.
**Narrowed, same day, by two more arms:**

- **G2** — arm G re-run on a freshly restarted bench, after Fabio flagged `aimdo` VBAR
  `pin_count` warnings that never clear. **Bit-identical: `PSNR y:inf` against G.** So the engine
  state is not a factor, the warnings are noise, and G-vs-I was never confounded by the restart
  Fabio's MPI-664 job sat in the middle of. Worth keeping as a habit: when two arms straddle
  another session's job, re-run the earlier one before trusting the pair.
- **K** — the mask kept exactly as G has it, the context latent zeroed through core's own
  `LatentMultiply` (so shape, nesting and dtype are the real encode's, not a hand-built tensor).
  **Tail is clean.**

| arm | prefix content | mask | sparkle |
|---|---|---|---|
| G / G2 | real | yes | **yes** |
| K | zeros | yes | no |
| I | none | none | no |

**So the noise mask is exonerated and the written CONTENT is the cause.** That also kills the
first suspect: a noise-scale error would show up in the head, and the head decodes at 38.0 dB.

**Split again by arm L — it is the VIDEO half.** L keeps the video prefix and silences the audio
one with `AudioAdjustVolume` at -100 dB (silencing beats zeroing: the waveform keeps its exact
length, so the audio latent keeps its step count and the node's arithmetic is untouched).

| arm | video prefix | audio prefix | mask | sparkle |
|---|---|---|---|---|
| G / G2 | real | real | yes | **yes** |
| **L** | **real** | **silent** | yes | **yes** |
| K | zeroed | zeroed | yes | no |
| I | none | none | none | no |

Fabio confirmed the artifact by eye on G and its absence on I, 2026-08-31.

So the cause is **the written video latent**, and the audio half is exonerated. Note the tension
that makes this interesting: the same written latent decodes the head at 38.0 dB, so it is not
wrong — it is correct content that nonetheless poisons what is generated after it.

**Where to look next, in order.** All of this is reading, not running:

1. **The encoder's tail pad.** `MpiVideoSamplingPreview`'s changelog records that an H3 encode
   carries a 3-token pad after the real content, and that H3 packs 17 pixel frames per 5 latent
   tokens with each chunk's prefix trimmed. `MpiH3MaskedPrefix` takes `ctx_v[:, :, -steps:]` — the
   TAIL — which is exactly where a pad would sit. The head decoding at 38 dB argues against it, but
   this is the one place the node knowingly slices near a region the VAE treats specially.
2. **The packing phase across the boundary.** The context is encoded as a standalone 39-frame clip
   and then dropped into a 73-frame target's first steps. Both are on the grid, but the target's
   chunking is computed for 73 frames, not 39 — worth confirming the two agree token-for-token.
3. **What the model attends to.** The preserved tokens are re-noised at each sigma and never
   denoised. If the sparkle grows with distance from the seam (it does — it starts around frame 45,
   not at 39), that is attention drift, not a boundary error.

**Do NOT reach for a fix at the crash site.** There is no crash; there is correct-looking content
producing wrong output downstream, which is precisely the shape a symptom-patch would hide.

### DIAGNOSED 2026-08-31 — the prefix ends INSIDE a decode chunk

All three candidates above are answered. Candidates 1 and 2 are dead by reading; the cause is a
fourth thing neither of them named, and it is structural rather than a slip in our arithmetic.

**Candidate 1 — the encoder's 3-token tail pad — DEAD, two ways.** `comfy/ldm/minimax/vae.py`
`encode_temporal` (line 544) splits the clip into fixed 17-frame chunks, pads a short FINAL chunk
by repeating its last frame, emits 5 tokens per chunk, then does `z = z[:, :, :-token_drop]` with
`token_drop=3`. So the VAE removes the freeze-pad tokens itself: 39 frames -> 3 chunks -> 15 tokens
-> **12**, which is exactly the 12 latent steps the C/D crash already measured (2640/220). Nothing
padded ever reaches the node. And had a pad survived, the node would have **raised, not sparkled**:
`plan_context(15, 39)` returns `(0,0,0)` because a 15-token clip's reachable tail spans are 42 and
38, never 39. Corollary worth keeping: with 12 tokens `ctx_v[:, :, -steps:]` is the WHOLE latent —
arm G never sliced a tail at all.

**Candidate 2 — packing phase across the boundary — DEAD.** The encoder is a 3D **causal** CNN
(`CausalConv3d`, front-only temporal padding, vae.py:39-55) chunking on absolute frame 0. A
39-frame encode's tokens 0-11 are therefore identical to a 73-frame encode's: same chunk cuts
(0-16, 17-33, 34-), same causal receptive field, and the freeze pad sits after token 11's span so
causality keeps it out. The phase agrees token-for-token — which is also *why* the head is 38 dB.

**Candidate 3 — attention drift — DEAD by measurement.** It predicts the artifact grows with
distance from the seam. It does not. Measured with a temporal-impulse metric (a pixel brighter
than BOTH its temporal neighbours by 16/255 — static texture cancels exactly, which is why the
locked-off arm G was the right shot for it), each arm normalised against its OWN chunk 1:

| arm | real prefix | c1 (17-33) | **c2 (34-50)** | c3 (51-67) | c2/c1 | c3/c1 | worst frame c2/c1 |
|---|---|---|---|---|---|---|---|
| G static | yes | 617 | **1297** | 574 | **2.10x** | 0.93x | **7.08x** |
| L audio silent | yes | 617 | **1247** | 558 | **2.02x** | 0.91x | **6.22x** |
| E moving | yes | 1800 | **4241** | 1603 | **2.36x** | 0.89x | **12.68x** |
| B moving, NO GUIDE | yes | 1813 | **4683** | 1612 | **2.58x** | 0.89x | **19.02x** |
| K content zeroed | no | 101 | 105 | 55 | 1.04x | 0.54x | 0.33x |
| I no prefix | no | 211 | 207 | 119 | 0.98x | 0.57x | 0.93x |
| H no prefix, no guide | no | 7 | 11 | 15 | 1.55x | 2.03x | 1.07x |

Every arm with a real prefix doubles in chunk 2 and spikes 6-19x on its worst frame. Every arm
without one is flat. **And `c3/c1` is 0.89-0.93 for all four prefix arms — the excess is GONE by
frame 51.** Not drift; a localised defect that ends at a chunk boundary. (H's 1.55x/2.03x is on
counts of 7-15, the metric's noise floor — read nothing into it.)

**The cause: `token_drop=3` makes it impossible for a whole-clip prefix to end on a chunk
boundary.** Every valid H3 length is `17k+5` and encodes to `T = 5k+2` tokens — 39 -> 12, 56 -> 17,
73 -> 22. Always **two tokens into a five-token chunk, never on the boundary.** The VAE decodes in
5-token chunks (0-4, 5-9, 10-14, ...), so with a 12-token prefix written into a 22-token target,
decode chunk 2 (pixel frames 34-50) is built from tokens 10,11 written by `vae.encode` and tokens
12,13,14 produced by the sampler. Encoder latents and sampler latents are not the same
distribution; the ViT3D decoder mixing them inside ONE chunk is the sparkle. Chunks 0 and 1 are
purely encoder-written (hence 38 dB), chunk 3 onward is purely sampler-produced (hence back to
baseline at frame 51), and **only chunk 2 is mixed — which is exactly and only where the artifact
is.**

This also explains the two things that made the defect look paradoxical:
- **Why the pack's oracle is clean.** It regenerates the head from keyframes, so every token in
  every chunk is sampler-produced. It never mixes, so it cannot show this.
- **Why arm K is clean with the mask identical.** A zeroed token is smooth. It still mixes, but a
  flat token cannot produce a speck — so K exonerates the mask without exonerating the mixing.

**The guide is exonerated too, and that is a NEW arm-pair, not a re-reading.** E and B share a
source, a canvas and a seed and differ only by the frame-0 guide: 2.36x with it, **2.58x without
it**. The sparkle does not need the guide. (The missing static no-guide cell is not fillable from
disk — `B_masked_prefix` is 640x352, the MOVING source, not the static one. E-vs-B is the
controlled pair that answers it.)

**The fix this implies — do not write it before the confirm run.** Write a prefix that is a whole
multiple of 5 tokens. The prefix's length and the ENCODE's length stop being the same number: the
encode still has to be a valid `17k+5` clip, but only a chunk-aligned front slice of it gets
written. Video-aligned counts are 17/34/51/68 frames; audio also needs frames divisible by 3, so
the smallest that satisfies both is **51 frames = 15 tokens = 85 audio steps**, which needs a
**56-frame** encode (56 -> 4 chunks -> 20 tokens -> drop 3 -> 17, of which the first 15 are
written). That is a bigger minimum context than today's 39 and it changes the node's contract, so
it is Fabio's call, not a silent edit.

### Arm M — the confirm run. CONFIRMED, with a residual.

Run 2026-08-31, 80 s, `execution_cached: []`. Graph byte-identical to `G_static.json` apart from
the output name; the only change was inside the node, applied temporarily and **reverted before
anything was committed** (the repo is back at `53c0198`, `git status` clean, self-check green):
the written video prefix clamped DOWN to a whole 5-token chunk (12 → 10 tokens, 39 → 34 preserved
frames) and taken from the FRONT so the packing phase holds.

| arm | c1 | c2 | c3 | **c2/c1** | worst frame c2/c1 |
|---|---|---|---|---|---|
| G straddling prefix | 617 | 1297 | 574 | **2.10x** | **7.08x** |
| **M chunk-aligned prefix** | 612 | **709** | 392 | **1.16x** | **3.00x** |
| I no prefix (floor) | 211 | 207 | 119 | 0.98x | 0.93x |

**And the head still works: M is 37.81 dB over its 34 preserved frames against G's 38.13 dB over
the same 34.** The clamp did not buy a clean tail by throwing the prefix away.

So the mixing is confirmed as the dominant term — one change, and the excess falls by roughly
three quarters. **It is not the whole term.** M sits at 1.16x / 3.00x where I and K sit at ~1.0x /
~0.9x. Two readings of the residual, not yet separated:

- **Expected, and present in the oracle too.** In M the seam lands exactly on the chunk 1/2
  boundary, so chunk 2 is the first generated chunk after a real head. I and K have no real head,
  so they have no transition at all and are not a fair floor for it.
- **A second, smaller contributor.** Would need its own arm to find.

Do not report the sparkle as fixed. Report it as diagnosed, dominated by the straddle, and
substantially reduced by alignment.

### CORRECTION 2026-08-31 — the speck metric was the wrong instrument, and arm M is NOT close

**Fabio looked at G and M and reports the flashing is still there in BOTH.** He is right and the
`c2/c1` numbers above oversold it. A flash is a LUMINANCE jump over a frame or a region of one;
the speck metric counted isolated bright PIXELS. Related, not the same, and the divergence is
exactly where it mattered.

Rebuilt as a flash metric: per-frame luma mean on a 4x4 block grid, each block against the mean of
its two temporal neighbours, worst block reported. **It matches Fabio's eye where the speck metric
did not** — the arms he calls clean sit flat at ~0.4 levels, the ones he calls flashing sit 6-16.

| arm | prefix | c1 floor | **c2 (34-50)** | c3 (51-67) | worst |
|---|---|---|---|---|---|
| G straddling | yes | 0.59 | **6.46** | 1.62 | 15.6 @f41 |
| **M chunk-aligned** | yes | 1.04 | **3.73** | 1.08 | 11.5 @f49 |
| L audio silent | yes | 0.59 | **5.57** | 2.44 | 13.9 @f46 |
| E moving | yes | 0.97 | **5.78** | 3.65 | 18.5 @f40 |
| B moving, no guide | yes | 0.93 | **5.29** | 0.74 | 21.2 @f40 |
| I no prefix | no | 0.44 | **0.51** | 0.42 | 0.9 |
| H no prefix, no guide | no | 0.42 | **0.38** | 0.52 | 1.0 |

**M is still ~7x above the I/H floor.** Alignment moved it (6.46 -> 3.73) and did not clear it, and
the residual is not the harmless transition the previous entry allowed for — I and H prove a
generated chunk can sit at 0.4. So the straddle is *a* contributor, not *the* cause. Treat the
2.10x -> 1.16x speck result as an overstatement that a better instrument corrected.

Where the flashes actually sit, per frame: G at 39-42 **and** 45-50; M only at 47-50 (plus one at
34); both back to floor after 51. So even aligned, the tail END of decode chunk 2 still flashes.

### THE AUTHOR'S OWN WORKFLOW, read 2026-09-01 — it never mixes, by construction

Fabio downloaded the YouTuber's workflow (`~/Downloads/Minimaxh3-Ref2V-video_extend.json`, a
contributor to the pack). It answers the diagnosis from the other side and it reframes the card.

**1. The pack never writes an encoder latent into the latent being denoised.**
`nodes.py:_context_keyframes` takes the last `context_frames` LATENT TOKENS and emits
`{"kind": "context", "latent": ctx_video[:, :, ctx_t - n:]}` — a **keyframe**, i.e. conditioning.
`patch.py:_context_k_distance` places those tokens at **negative RoPE positions**, before the
target's origin. The denoised latent is therefore 100% sampler-produced. The encoder/sampler
mixing our arms measured is not solved there; it is **structurally impossible** there.

**2. `kind: "context"` is NOT reachable from stock.** Core knows `image`, `audio`, `video`,
`video_audio`, `text` only (`comfy/ldm/minimax/model.py:107,366`); `context` / `context_audio` are
the pack's own, implemented in its `PackedLayout.__init__` monkey-patch. Adopting the mechanism
means the pack as a dependency, or reimplementing that patch — which is exactly what
§ The decision rejected, and the rejection still stands.

**3. The pack emits ONLY the new frames and the author JOINS the two clips in pixel space.**
`length` is documented "for the continuation only (excludes context_frames)"; the graph has two
`VHS_VideoCombine` and an `AudioConcat` "after". **It never generates across the seam.**
So "does the oracle flash?" — the question from the previous entry — **is malformed.** The pack
cannot have a mixed decode chunk because it has no shared latent at all. It also means Phase 1's
1.40x "oracle bar" was measuring a **pixel-domain cut**, not a continuous extend. Ours ties that
bar while doing a strictly harder thing; that comparison needs restating, not rerunning.

**4. It is a generate-THEN-extend graph, not an extend-a-file graph.** Stage 1
`MiniMaxH3ReferenceToVideo` -> `SamplerCustomAdvanced#37` -> `latent_1`; stage 2's `context_latent`
is `GetNode(latent_1)` — **the sampler's own output**. The author never encodes a video file, so
the reference workflow never exercises our actual case (extend a clip that already exists on
disk), where an encode is unavoidable. `brief.md` already carried half this rule — "take the audio
prefix from the sampled latent not a re-encode" — and it was never applied to the video half.

**5. `context_frames` default is 2 LATENT TOKENS.** We write 12. The author's note claims "1 =
roughly 24 decoded frames", which his own code contradicts (`FRAME_PER_TOKEN` gives 1-4 pixel
frames per token) — and he knows: `_pin_last_context_frame` exists because "context_frames alone
only carrying whole latent frames (each spans 1-4 pixel frames) ... can show up as the
continuation re-playing a moment that already happened." That is `tail_span`'s trap 1,
independently rediscovered. **Do not trust the note; trust `nodes.py`.**

**6. His sampler settings differ from our shipped graph** and are model behaviour, not scene
content, so the "widget values are the author's scene" rule does not dismiss them: turbo LoRA
**0.7** (ours 1.0), `MiniMaxH3SigmaShift` 12/**3** (ours 12/5), `BasicScheduler` **simple/8**
(ours beta/6), `KSamplerSelect` **res_multistep** (ours euler), plus `PathchSageAttentionKJ`.
Worth one arm as a second-order factor, not as the explanation.

> **The unrun arm this makes the interesting one: arm F.** The plan already records it — "stock
> pin-last-frame, no prefix — built, not run (E made it unnecessary)". It is the pack's mechanism
> at stock's one-keyframe limit plus a pixel join: no written prefix, so **no mixing**, and no
> patch, no fork. It was skipped because arm E "worked" — and arm E is the arm that flashes.

**The oracle cannot be floored from disk, and this is a trap for the next session.**
`A_oracle_joined.mp4` reads 17.35 at frame 40 — but it is a CONCAT (`concat.txt`) of the source
and the pack's output, so frame 39 is a literal splice and that spike is the edit, not the pack.
`A_oracle_pack_00001_.mp4` is only the 39 new frames and contains no seam at all. **Neither file
can say whether the pack's route flashes.** Answering that needs a fresh oracle run that emits ONE
continuous clip — and it is the question that decides whether this route is viable, because if the
oracle flashes too, the artifact is H3 turbo and not our node.

### ARM F — RUN 2026-09-01. Clean, and it beats the oracle on both metrics.

80 s, `execution_cached: []`, so it really ran. The graph is 20 nodes and **every one of them is
stock core plus VHS plus our `MpiClearVram`** — no pack node, no `MpiH3MaskedPrefix`, no fork, no
monkey-patch. The dangling `MiniMaxH3EncodeAVPatched` the built graph still carried was stripped
first so the arm is provably pack-free:

```
VHS_LoadVideo → ImageFromBatch(38) ─┐
MiniMaxH3ReferenceToVideo(len 39) ──┴→ MiniMaxH3AddGuide(frame_idx 0) → SamplerCustomAdvanced
```

The source's LAST frame is pinned as the guide at the FIRST generated frame. Nothing is written
into the denoised latent, so there is no encoder/sampler mixing to have. Output is the new frames
only; `join_F.py` then joins it to the source in pixel space (dropping F's frame 0, which the pin
makes a duplicate of source frame 38) exactly the way the pack author does — 39 + 38 = 77 frames.

**FLASH metric, over each arm's generated frames only** (F has no preserved head, so the c1/c2/c3
windows do not apply; the fair controls are the arms on F's OWN canvas and scene, 640x352):

| arm | canvas | prefix | mean | max |
|---|---|---|---|---|
| **F stock pin-last** | 640x352 | **no** | **1.05** | **1.82** |
| A pack oracle, new frames only | 640x352 | n/a | 1.71 | 6.42 |
| E prefix + frame-0 guide | 640x352 | yes | 5.37 | 18.51 |
| B prefix, no guide | 640x352 | yes | 2.42 | 21.23 |
| G straddling prefix | 352x608 | yes | 4.21 | 15.61 |
| M chunk-aligned prefix | 352x608 | yes | 2.04 | 11.47 |
| I / H no prefix | 352x608 | no | 0.46 / 0.47 | 0.91 / 0.97 |

**F's worst single frame is 1.82.** Not one spike in 37 generated frames — the per-frame row runs
0.6 to 1.8 flat. The pack oracle on the same canvas peaks at 6.42. Every prefix arm peaks 11-21.

**SEAM metric on the joined clip** (`seam_metric.py`, seam frame diff / synthetic-tail mean diff):

| clip | head | SEAM | tail | seam/tail |
|---|---|---|---|---|
| **F_joined** | 3.66 | 3.56 | 3.75 | **0.95x** |
| A_oracle_joined | 3.66 | 11.61 | 8.29 | 1.40x |
| G static | 2.05 | 5.78 | 4.15 | 1.39x |
| E moving | 3.67 | 23.01 | 5.98 | 3.85x |

**0.95x means the cut frame is quieter than the tail's own frame-to-frame noise** — the seam is
inside the noise floor, which is the definition the metric was built for. F's tail is also calmer
than the oracle's (3.75 vs 8.29). Confirmed by eye on `F_seam.png` (frames 36-43: one continuous
walk, no cut) and `F_tail.png` (frames 39-74: coherent, no sparkle).

**So the entire masked-prefix route is unnecessary.** It was built to avoid a pixel join; the pixel
join measures better than it does, and better than the pack's. Everything the last two sessions
diagnosed — `token_drop=3`, the straddled decode chunk, `plan_context`'s packing-phase bug — is
real and is now moot for v1, because arm F never creates the condition.

Artifacts: `D:\WORK\Images\Outputs\mpi591\F_stock_pin_last_00001_.mp4` (new frames),
`F_joined.mp4` (77 frames, the deliverable shape), `F_seam.png`, `F_tail.png`.

**But F's AUDIO is a different soundtrack — Fabio heard it, 2026-09-01, and it is a real gap.**
Arm F left every audio reference on `MiniMaxH3ReferenceToVideo` empty, so the sampler invented a
soundtrack with nothing to match against. The video metrics could not see it; a metric was needed.

### The audio metric, and arm F2 — the fix is ONE stock link

`audio_match.py`: RMS dBFS from raw PCM (per memory, `ebur128` reads the silence floor on clips
this short — `volumedetect` or raw PCM, never a loudness filter) plus a 16-band log-spaced spectral
profile, cosine similarity against the source. It separates "same ambience, new moment" from "a
different soundtrack", and it agrees with Fabio's ear on the arms he has already judged.

**Arm F2 = arm F + `ref_audios.ref_audio_0` wired to the source clip's audio.** Nothing else
changed. The stock ref2v node carries `ref_audios` / `ref_videos` / `ref_video_audios` autogrow
inputs (`/object_info`); the API prompt key is the **dotted flat path**, `"ref_audios.ref_audio_0":
["5", 2]`, because `_expand_schema_for_dynamic` builds `expected_id = finalize_prefix(curr_prefix,
name)` and looks that key up in the prompt's live inputs (`comfy_api/latest/_io.py:1195`). Not a
nested dict. 60 s, sampler and decode ran fresh.

| clip | RMS dBFS | Δ dB | **band cos vs source** |
|---|---|---|---|
| source | -11.5 | 0.0 | 1.000 |
| **F2 (+ ref_audio)** | -11.9 | **-0.4** | **0.973** |
| A pack oracle | -11.0 | +0.5 | 0.981 |
| F (no ref_audio) | -13.2 | -1.6 | **0.801** |
| G masked prefix | -39.9 | **-28.4** | **0.427** |

**F2 sits level with the pack oracle on audio and loses nothing on video** — flash 1.05 mean /
2.03 max (F: 1.05 / 1.82), seam **0.94x** (F: 0.95x). One stock link bought the audio.

Note where the oracle's audio continuity actually comes from: `oracle_run.json` wires **no**
`ref_audio` — A's 0.981 comes from `context_latent`, which is AV-nested, so the pack's
`kind:'context_audio'` keyframes carry the source's audio. Ours is a different mechanism reaching
a comparable place: `ref_audio` matches CHARACTER (voice, ambience, level), it does not continue
the waveform. Whether that difference is audible at the join is Fabio's ear, not the metric's.

Artifacts: `F2_ref_audio_00001_.mp4`, `F2_joined.mp4`, `F2_seam.png`, `F2_tail.png`.
`F3_ref_audio.json` is built and unrun — it adds `ref_videos.ref_video_0` +
`ref_video_audios.ref_video_audio_0` (the source's frames paired with its soundtrack), a stronger
continuity signal whose `ref_video` tooltip asks for 2-15s against our 1.625s source, and whose ref
tokens ride every sampling step. Run it only if F2's audio join is not good enough by ear.

### PHASE 3 — the workflow file, DONE 2026-09-01

`comfy_workflows/flow_h3_extend.json`, 33 nodes, plus `comfy_workflows/raw/flow_h3_extend.json`.

**Every node is a clone of a real node from another `raw/*.json`** — the sampling stack off
`minimax_h3_r2va.json`, the join off `flow_ltx_extend.json`. Only `MiniMaxH3AddGuide` had no raw
donor anywhere and was synthesised from `/object_info`, which is the one case bench-editing.md
allows. Nothing was hand-written as LiteGraph.

```
MpiLoadVideo(Input_Video) ─┬→ MpiMath x2 (snap W/H down to 32) ─┐
                           ├→ GetImageRangeFromBatch(-1, 1) ────┼→ MpiH3References(Input_Refs)
                           └→ audio → ref_audio_1 ──────────────┘         ↓
MpiInt(Input_Duration) → MpiConvert → MpiH3Length → length     MiniMaxH3AddGuide(frame_idx 0)
                                                                          ↓
                              SamplerCustomAdvanced (turbo LoRA 1.0, SigmaShift 12/5, beta/6, euler)
                                                                          ↓
       ImageBatchExtendWithOverlap(overlap 1, linear_blend) ← VAEDecode / VAEDecodeAudio → AudioConcat
                                                                          ↓ MpiSaveVideo(Output_Video)
```

**Turbo single-stage, deliberately.** That is the configuration arm F2 ran and Fabio passed. The
r2va two-stage / non-turbo branch is NOT carried over — a Flow bakes one proven path, and these
sampler settings are the ones that were judged rather than a re-tune.

**No `Input_Negative` node**, and the titles test asserts its ABSENCE. H3 takes no negative
conditioning, so a node with that title would be one nothing reads; the field hides on the H3 arm
(the MPI-664 `hiddenWhen` dependency Phase 3 already recorded).

**Verification, in the order bench-editing.md sets out:**

| check | result |
|---|---|
| `verify-workflow.mjs` against **48188** (the SHIPPED engine, not the bench) | ✓ 33 nodes |
| `validate-injection-rules.mjs` | ✓ |
| raw → `workflow-to-api.mjs` → diff against the API file, input by input | **0 differences** |
| real bench run of the flow graph, `execution_cached` all loaders only | ✓ 70 s, success |
| `tests/inject-params-titles.test.cjs` (new H3 case) | ✓ 22/22 |
| `workflow-input-staging-gate` + `flow-model-choice` + `flow-required-media` + `flow-output-filename` | ✓ 29/29 |

**The bench run's own numbers** (`P3_flow_h3_extend_00001.mp4`, 94 frames = 39 source + 56 new − 1
crossfade, 640x352 derived from the clip, `Input_Duration` 2 s snapped to 56 frames by
`MpiH3Length`):

| | value | for comparison |
|---|---|---|
| seam / tail | **0.65x** | F2 0.94x, pack oracle 1.40x |
| flash, generated region | 1.23 mean / 5.05 worst | F2 1.05 / 2.03 over 38 frames, oracle 1.71 / 6.42 |
| generated audio alone, band cos vs source | **0.989** | F2 0.973, oracle 0.981 |

The worst flash sits at frame 90 — the far END of a 56-frame generation, not the seam — so it is
drift with distance from the pinned frame, and it is still below the oracle's worst. **The audio
got BETTER with a longer generation**, which is Fabio's own prediction measured.

> **fps — DECIDED by Fabio 2026-09-01, and it is the one thing Phase 3 still owes.**
> His rule: *"I honestly don't mind if the input video becomes 24 FPS. The only thing that I mind
> is if one video has a different speed than the other once they're combined. And also, mind the
> speed of execution."* So the source is CONVERTED to 24 fps and both halves are true 24 —
> relabelling is not enough, because a relabelled 30 fps source plays its motion 20% slow beside a
> generated half that does not, which is exactly the mismatch he rules out.
>
> **How, and why this way.** No node on the shipped engine resamples an image batch by frame rate:
> `VHS_SelectEveryNthImage` only decimates by an integer, and `FrameInterpolate` needs a RIFE model
> — a weight to download and a pass to run, which fails his speed rule. `MpiLoadVideo` already
> decodes through ffmpeg in one pass (`_decode_frames`, `video.py:243`), so a `force_rate` widget
> there (default 0 = source rate, the way VHS_LoadVideo spells it) makes the resample **free** —
> ffmpeg drops/duplicates during the decode that already happens, no second pass and no model.
> `frame_count`, `fps` and `duration` are then reported at the new rate, so everything downstream
> that derives off them stays correct.
>
> **The work, in order:** add `force_rate` to `MpiLoadVideo` in the SIBLING repo via
> `/mpi-nodes-sync` (commit → push → pin `dev_configs/node_lock.json`); it goes in `required` AFTER
> `block_if_empty`, so every existing `widgets_values` stays valid and every other graph keeps its
> behaviour at the default. Then in `flow_h3_extend`: `Input_Video.force_rate = 24` and
> `MpiSaveVideo.fps` becomes a constant **24** instead of `["331", 2]`. Re-run the raw round trip
> and the bench run afterwards — the graph changes, so both proofs have to be re-earned.

### A separate latent bug this surfaced — `plan_context` can break the packing phase

`out_v[:, :, :steps] = ctx_v[:, :, ctx_v.shape[2] - steps:]` writes the context's TAIL at the
target's FRONT. That only preserves the packing phase when the tail begins at a token index
divisible by 5, because `FRAME_PER_TOKEN` is positional (1,4,4,4,4). In arm G it did — `steps`
came out equal to the context's whole token count, so the offset was 0 by accident, not by design.
`plan_context` walks `steps` down freely and enforces no such constraint, so a longer source clip
can legally select a tail starting at token 2 or 7 and write it at position 0, silently shifting
every token into the wrong slot in the cycle. Not triggered by any arm run so far. Fix alongside
the alignment work: the walk must require `(total_steps - steps) % 5 == 0`.

### The static arm (G), 2026-08-31 — the gate's second half

Source `MpiVideo_00001` trimmed to 39 frames at **352x608** (portrait, same pixel budget as E's
640x352). Picked by measurement, not by eye: edge-region frame-diff, brightness-normalised, isolates
CAMERA motion from subject motion — `00001` scores **0.075** against **6.2** for the street clips and
**8.9** for E's own source. It is the only locked-off clip on disk with ≥39 frames.

**The clip must be re-encoded AT the target canvas before it reaches the graph.** `VHS_LoadVideo`
does not resize, so a 704x1216 source against a 352x608 target is a hard stop — `MpiH3MaskedPrefix`
raised exactly that, which is the guard working. Phase 1's own source was already downscaled on disk.

**Seam metric** — the seam frame's luma diff over the mean diff of the SYNTHETIC side. Raw frame
diffs are not comparable across clips (real footage is smooth, a 6-step turbo tail is not), so the
ratio is the number that carries. The pack's oracle sets the bar at 1.40x:

| clip | head | seam | tail | **seam/tail** |
|---|---|---|---|---|
| A oracle (moving) | 3.66 | 11.61 | 8.29 | **1.40x** ← the bar |
| **G ours (static)** | 2.05 | 5.78 | 4.15 | **1.40x** ← matches it |
| B mask alone (moving) | 3.68 | 12.72 | 3.97 | 3.20x |
| E ours (moving) | 3.67 | 23.01 | 5.98 | **3.85x** |

So the route is clean on a locked camera and steps on a dolly-in. That is a real limit to write
down, not a turbo artefact: a single frame-0 guide gives the model the subject and the set, and
says nothing about where the camera was going.

**A metric that did NOT work, recorded so it is not tried again:** frame-38-vs-frame-72 scene drift.
It scores arm B — the known failure that renders an unrelated scene — at 29.5 against G's 25.3. A
moving subject alone produces that much, so it cannot separate the known-good from the known-bad.

**Three findings that outlive the card:**

1. **The masked prefix is mechanically correct on stock core, and that is now measured.** E's and B's
   first 39 frames come back at **PSNR ~38 dB** against the source — VAE-round-trip level, not a
   regeneration. The boundary lands exactly where the arithmetic says. The nested AV noise mask
   reaches the sampler, `scale_latent_inpaint` returns the preserved region unscaled, and
   `process_timestep` zeroes its timestep. None of that needed a patch.
2. **A clean prefix is NOT an anchor.** Arm B is the whole lesson: perfectly preserved frames 0-38,
   and then a completely different street, wardrobe and subject from frame 39. The model will
   happily leave given tokens alone and ignore them. One single-frame guide at index 0 fixes it.
3. **`brief.md`'s trap 3 is WRONG for this route and must be corrected.** It says "guides inside the
   preserved head must be dropped — a stock first-frame guide sitting in the repeated span fights
   the prefix". It does not fight it: the frame-0 guide *inside* the preserved head is precisely
   what makes the continuation cohere. Arm B (no guide) is the failure; arm E (guide) is the fix.

**Why C and D crashed, exactly** — `comfy/ldm/minimax/model.py:654`,
`all_video_rows[~img_update] = cond_video_rows`, `shape mismatch [2640, 96] -> [220, 96]`. 2640 is
the 39-frame guide's 12 latent steps x 220 rows; 220 is ONE step. Stock reserves a single latent
step for a keyframe, which is the anchoring limit the pack's `PackedLayout` patch generalises. So
the research file's read of the patch is confirmed from the failure side — and irrelevant, because
E never needs a multi-frame guide.

**Open for Fabio:** E's new tail keeps the subject, wardrobe and street, but the camera drifts from
the source's dolly-in to a pull-back, and a light streak crosses frames 50-72. 6-step turbo at 352p
is a low bar, so this may be budget rather than mechanism — re-run at 768p / non-turbo before
reading anything into it.

**Cost note:** the first attempt ran the pack's example defaults (1504x832, 124 frames, 20 steps,
`res_multistep`) and was still going at 1000 s. Fabio's correction — small source, small canvas,
single stage, turbo on — took a full arm to **40-80 s**. Do not run this bench work any other way.

## The card is UNBLOCKED — that is the headline

`task.json` still says "cannot start until `/mpi-bump-engine` lands a core that has both".
**It already did.** `node_lock.json` pins core `v0.34.0`, and `MiniMaxH3AddGuide` (PR 15439) and
the per-stream `audio_denoise_mask` (PR 15375) are both in that tag — read off the tagged files,
not the changelog. The bench (`G:\ComfyUi`, 0.34.2) has the same. Nothing here waits on anything.

## Plan Drift

- **2026-09-01 — the H3 candidate is `minimax-h3-ref2va`, not `minimax-h3`.** The card's text
  (2026-08-20) says `requiredModels` becomes `[['ltx-23-balanced', 'minimax-h3']]`, written when v1
  was meant to be fl2va. Phase 1 ran on ref2va instead — § Disk, fl2va did not fit — and Phase 3
  BAKED it: the graph's `UNETLoader` takes `minimax_h3_ref2va_pruned_int8_convrot` and its turbo
  LoRA is lightx2v's ref2v-trained one, both supplied only by `minimax-h3-ref2va`'s dep set. The
  fl2va id would have gated the slot on a 19.53GB download the graph never loads and then failed
  `value_not_in_list` at the loader, with the picker looking correct the whole way. `licences.js`
  maps BOTH ids to the same `MINIMAX_H3` descriptor and receipts are keyed by LICENCE id, so
  MPI-666's consent checks are unaffected by which one is declared. `tests/flow-model-choice`
  now asserts every `byModel` arm's loader weights against that model's own dependencies.
- **2026-09-01 — Phase 4 is FIVE files, not four.** The table said `commandExecutor.js` passes
  `payload.generationSettings?.flowModelIds`. There is no `generationSettings` on that payload:
  `runCommand`'s argument is an explicit WHITELIST built in `generationService.js`, and a key not
  named there never reaches the executor — the exact hop `loraModelId` was lost at in MPI-504. So
  `flowModelIds` is threaded there first and the executor reads `payload.flowModelIds`.
- **2026-09-01 — the negative box stays VISIBLE on the H3 arm, as the plan's fallback allows.**
  MPI-664 shipped `hiddenWhen`, but its rule is `{ field, is }` and keys on another FIELD's value,
  not on the picked model, so it cannot express this hide. The field carries a comment naming the
  dependency and nothing else was built — never a bespoke twin.
  **SUPERSEDED by 4b (same day):** `hiddenWhen` gained `{ model }` / `{ modelNot }` and the box now
  hides. Fabio's call — a dead Turbo TOGGLE is worse than a dead text box, so with two fields
  wanting the rule it stopped being cosmetic.
- **2026-09-01 (4b) — the branch closes BEFORE the LoRA, which REORDERS the proven turbo chain.**
  The plan said "port #444 and the `MpiIfElse` nodes"; it did not say the port moves an existing
  node. `#457 MpiLoraModelClip` is a SINGLE shared node whose strength comes off `#453` (1.0 turbo /
  0.2 not), so the gate has to resolve before it — donor order `497 → 454 SigmaShift → IfElse → 457
  LoRA`, where the flow graph shipped `497 → 457 LoRA → 454 SigmaShift`. Both are patches on one
  `ModelPatcher` and the set is unchanged, but the shipped turbo arm is the arm Fabio passed, so the
  turbo bench run was re-earned as a gate rather than assumed. The alternative — a second LoRA node
  for the non-turbo arm — was rejected: it duplicates a weight load to avoid a reorder that the
  donor graph already ships.
- **2026-09-01 (4b) — `#417/#416/#414` are NOT ported, and that closes the plan's open question.**
  The plan asked "decide whether #417's pair is wanted". They are not: that `MpiIfElse` feeds
  `SplitSigmas #415` in the donor's TWO-STAGE sampler, and `flow_h3_extend` is single-stage with no
  `SplitSigmas` at all. Porting them would have added three nodes wired to nothing.
- **2026-09-01 (4c) — `#902 Last Frame` was a SECOND unsnapped consumer the plan missed.** It named
  `#904`'s `source_images` only. `#902` also read the raw loader, so the frame `MiniMaxH3AddGuide`
  pins would have been 1280x720 against a 1280x704 generated canvas. Both now read the resize node.
- **2026-09-01 (4c) — `#900/#901` are DELETED, not kept beside the resize.** `ImageResizeKJv2`
  reports the snapped size it actually produced on its own `width`/`height` outputs, so a second
  independent `floor(a/32)*32` could only ever disagree with it. `#330`'s width/height come off the
  resize node now.
- **2026-09-01 (4b/4c) — `inject-params-titles`'s FlowDef guard only knew ONE graph per flow.**
  It resolved `flow.workflow` alone, so it called the Turbo toggle a silent no-op — correct for the
  LTX arm and wrong for the flow. Widened to the `byModel` candidate set: a field is legitimate when
  it addresses a node in ANY arm, and the `hiddenWhen` model rule is what keeps it off the others.
  Its baked-default check now walks every candidate too, since bench content baked into the H3 graph
  is as shippable as content baked into LTX's. Mutation-checked: a bogus `Input_*` id still fails it.
- **2026-09-01 — 48188 IS NO LONGER STALE.** The handoff recorded it on `53c0198` and warned that
  `verify-workflow.mjs` would report the `force_rate` line. Fabio has restarted his app since:
  the 40-node graph, `force_rate`, `EasyCache` and `ImageResizeKJv2` included, validates clean
  against 48188. **Phase 5's blocker is gone.**
- **2026-09-01 — `force_rate` is `optional`, not `required`.** Phase 3's fps block said `required`,
  after `block_if_empty`, so every saved `widgets_values` stays valid. That reasoning only covers
  the LiteGraph twin. The API file is what the app dispatches, and `execution.py`'s `validate_inputs`
  rejects a *required* input missing from an API prompt outright (`required_input_missing`) — which
  would have broken the eleven shipped workflows that call `MpiLoadVideo` without it. `optional` is
  skipped when absent, and widget order is required-then-optional either way, so the widget still
  sits at index 2 and the plan's actual goal survives. The pack's own `update-node.md` step 2 says
  the same thing. Verified, not argued: all eight other MpiLoadVideo API graphs re-validate green.
- **2026-09-01 — the resample is `-vf fps=N`, not the output `-r N`.** Shipped as `-r` in `a0754b1`
  and fixed in `f1ed110`. `-r` is CFR conversion by per-frame timestamp rounding and it overshoots:
  on the 49-frame 30 fps test clip it returns 41 frames, which at 24 fps play 4.6% slow — a smaller
  version of the exact defect this input exists to remove. `fps=` returns 39 and preserves the
  duration at every rate tried (12 / 24 / 29.97 / 30 / 48, both a 24 and a 30 fps source).
- **2026-09-01 — the bench, not 48188, converted the graph, and that is bounded not assumed.** The
  standing rule is "convert against 48188". 48188 is Fabio's live app engine, still on the old pin,
  so it drops the new widget and the converter silently omits it. `engine_parity.py` compares both
  engines' widget names and order across all 30 classes in this graph and finds exactly one
  difference — `MpiLoadVideo.force_rate` — with two more classes differing only in which weights are
  on each disk, which the converter never reads. So the 8188 conversion IS the conversion 48188 will
  make once restarted.
- **2026-09-01 — the API twin is edited surgically, never regenerated.** `workflow-to-api` emits
  nodes in ascending id order and drops trailing `.0`s; the committed file came out of the Phase 3
  build script in graph order with `1.0` on the LoRA strengths. Regenerating churns 472 lines and
  discards that ordering for no gain — the round-trip proof compares node by node and never
  compared byte order.

- **2026-08-31 — Phase 1 and Phase 2 merged.** Phase 1 said "build the masked-prefix graph by
  hand". It could not be built: a live `/object_info` probe showed nothing in core or in MpiNodes
  composes a masked prefix (`MiniMaxH3VideoExtend` / `MiniMaxH3EncodeAV` are fork-only). So the
  Phase 2 node was written FIRST, in `h3.py`, which the bench sees through its symlink. Phase 2 is
  now commit → push → pin only. Fabio approved; that is also what moved the card to `doing`.
- **2026-08-31 — the mechanism changed, the plan's headline claim was wrong.** The plan said the
  masked prefix "uses no keyframes, so neither core patch applies". Half right: no patch is needed,
  but the masked prefix ALONE does not continue anything (arm B). The shipping route is masked
  prefix **plus a single frame-0 guide** (arm E). Still fully first-party and stock — the verdict
  on the pack does not change, only the graph does.
- **2026-08-31 — a first-party AV encode is now a Phase 2 item.** Both arms used the pack's
  `MiniMaxH3EncodeAVPatched` to turn the prior clip into an AV latent, deliberately, to keep the
  encode out of the comparison. A shipped graph cannot depend on the pack, and core exposes no
  join for the two halves (`VAEEncode` + `VAEEncodeAudio` give separate latents). Add
  `MpiH3EncodeAV` to `h3.py` — ~10 lines, mirroring core's own `_encode_ref_audio`.
- **2026-08-31 — the source clip must be trimmed to 17k+5 frames BEFORE it is encoded.** Found by
  the node's own self-check, not at run time: an off-grid clip shifts the VAE's packing phase so
  that NO tail of it lands on a legal context length (a 30-step latent can reach 4, 8, 12, 16, 17,
  21 ... frames and never 39 or 90). The node raises and says so. The graph needs a trim upstream.
- **2026-08-31 — every bench graph ends in `MpiClearVram`** (Fabio), wired as a passthrough between
  the decode chain and `SaveVideo` so it cannot be reordered off the end. Carry this into the
  Phase 3 shipped graph.
- **2026-08-31 — the seam has a NUMBER now, and it says the route has a limit.** "Judged by Fabio"
  is still the gate, but the seam/tail ratio (§ the static arm) makes the two arms comparable: ours
  ties the oracle at 1.40x on a locked camera and misses at 3.85x on a dolly-in. Do not read that as
  a turbo budget — it reproduces the plan's own § Phase 1 "open for Fabio" note as a mechanism. If a
  moving-camera extend has to be as clean as a static one, the fix is more camera information at the
  seam (a second guide near the boundary, or the pack's multi-frame anchor), and that is a decision
  for Fabio, not a silent change to the node.
- **2026-08-31 — `MpiH3EncodeAV` is written, committed and pushed (`952919f`), and the pin is
  deliberately still at `5e07043`.** Phase 2's gate reads "committed → pushed → pinned", and the
  middle step is done. The pin waits because the node has never been loaded by a running ComfyUI:
  the only bench was held by another session's job all session, and restarting it would have killed
  that job. Pinning first and verifying later is the false-done this card keeps catching.

## The decision: first-party masked prefix. The pack is a bench ORACLE, not a dependency.

| route | mechanism | verdict |
|---|---|---|
| **masked prefix** (`brief.md`) | encoded tail written into the target latent's prefix, protected by the nested AV noise mask | **ship this** |
| **the pack** | context keyframes → model regenerates the head → trim | bench-only |

The pack monkey-patches `comfy.ldm.minimax.model.PackedLayout.__init__` and
`comfy.model_base.MiniMaxH3.extra_conds` at import time. We pin core and bump it; a patched
internal that drifts does not raise, it renders a plausible clip that is quietly wrong. Both
patches fix **keyframe** bugs, and the masked-prefix route uses no keyframes — so neither applies
to it. ~80 lines in `ComfyUi-MpiNodes` against a 19th third-party pack that rewrites core.

The pack still earns its keep on the bench: it is the fork's real implementation, so running its
example against ours on the same clip and seed is the only cheap way to check a seam that
otherwise cannot be proven wrong by looking at it.

## Scope: v1 is prompt-only. Refs are a follow-up card.

The pack ships two example workflows and the difference is one input and one weight:

- **Text-to-Video-Extend** → `fl2va` transformer → our **`minimax-h3`** card. Prompt describes the
  new seconds. This is the LTX extend the flow already does, on the other model.
- **Ref-to-Video-Extend** → `ref2va` transformer → our **`minimax-h3-ref2va`** card, plus ref
  images that pin a subject/voice **across the seam**. A second **20.97GB** download, a second
  graph, and its own UI (image slots that only exist for one candidate).

v1 = `minimax-h3` only, so the slot reads `['ltx-23-balanced', 'minimax-h3']` and the flow's input
surface does not change at all. Ref-extend is a real feature and it gets its own card — it is
squarely the LoRA-free character-consistency bet (consistent character, no training),
which is exactly why it should not be smuggled in as a checkbox on this one.

## The one new thing: a Flow whose picked model selects a different WORKFLOW FILE

This is the part that outlives the card, and it is the same finding `task.json` already made.
`modelParams` swaps params inside ONE graph; LTX extend and H3 extend share no nodes.

Today (`js/services/commandExecutor.js:1457`):

```js
const universal = getUniversalWorkflow(payload.operation);   // op → one filename
```

and `getUniversalWorkflow` (`js/data/modelRegistry.js:405`) is `UNIVERSAL_WORKFLOWS[key]?.workflow`.

**Proposed contract — keep resolution where it already lives:**

```js
// universal_workflows.js
flowLtxExtend: {
    workflow: 'flow_ltx_extend.json',            // the recommended candidate, models[0]
    byModel: { 'minimax-h3': 'flow_h3_extend.json' },
},
```

```js
// modelRegistry.js
export function getUniversalWorkflow(key, modelIds = []) {
    const def = UNIVERSAL_WORKFLOWS[key];
    if (!def) return null;
    for (const id of modelIds) if (def.byModel?.[id]) return def.byModel[id];
    return def.workflow ?? null;
}
```

The executor passes `payload.generationSettings?.flowModelIds`, which flow payloads have carried
since MPI-620 (`flowService.js:122`) — so nothing new has to be threaded through, and every
existing caller keeps working on the one-argument form.

Rejected: putting a resolved `workflowFile` straight on the payload from `flowService`. It is
fewer lines and it opens a second route into workflow resolution that bypasses the registry — the
next flow with a two-graph slot would not know which one to copy.

`filePrefix` stays `flowExtendVideo` and the op stays `flowLtxExtend`. **Do not rename the op** —
`operationRegistry.js` + `commandRegistry.js` + the sidecars of every clip already extended read
that key, and MPI-533 (tombstone ledger) is still a `todo`.

## Phases

Each phase has one gate. Do not start the next until its gate is green.

### 1 — Bench: prove the seam (no app, no repo edits, **NO DOWNLOAD**)

On `G:\ComfyUi` (0.34.2), with **our** weights: `minimax_h3_video_vae_int8_convrot` (2.95GB),
`minimax_h3_audio_vae_fp32` (0.56GB), the H3 Qwen3-VL encoder (24.55GB) — all already on disk.

**Run this phase on `ref2va` (19.53GB, already there), NOT `fl2va`.** See § Disk: `fl2va` does not
fit and buys nothing here. The seam is a **latent-layout** property — the `17k+5` grid, the VAE's
temporal packing, the nested AV mask — and both DiTs share the VAEs, the encoder and the layout.
A seam proven on one is proven on the other. The pack's own two examples differ only in the
`UNETLoader` widget, so the oracle run swaps to `ref2va` the same way.

1. Install the pack into the bench `custom_nodes/` **only**, run its Ref-to-Video-Extend example
   (it already loads `ref2va`) on a known clip. That is the oracle take.
2. Build the masked-prefix graph by hand: `MpiH3Length` for the `17k+5` grid, encode the whole
   context run in ONE VAE call, snap the context DOWN onto the grid before slicing the tail
   (trap 1), use a context length divisible by 3 so both clocks line up — **39 / 90 / 141**
   (trap 2), take the audio prefix from the sampled latent not a re-encode, drop guides inside the
   preserved head (trap 3).
3. Same source clip, same seed, both routes. Compare the seam.

> **Gate:** a masked-prefix extend whose seam is at least as clean as the pack's, judged by Fabio.
> A seam that only *looks* fine on one clip is not a pass — run a static shot and a moving one.

Running on `ref2va` also settles, in the same session and for free, the thing the follow-up ref
card needs: does masked prefix + stock `MiniMaxH3ReferenceToVideo` work with no patch? The context
arrives as latent data rather than as a keyframe, so `extra_conds`' overwrite should never fire.
Record the answer either way.

### 2 — The node in `ComfyUi-MpiNodes`

`/mpi-nodes-sync` owns this — the sibling repo's procedures do not load in a Vision session, read
them and follow inline. ~80 lines beside the existing `MpiH3Length` / `MpiH3References` in `h3.py`:
encode tail, snap to grid, write the prefix, build the two-stream mask, drop conflicting guides.
Written from `brief.md`'s rules, **not ported** — `ethanfel/ComfyUI-MiniMaxH3-Contex-Loop` is
GPL-3.0 and MpiNodes has no `LICENSE` file (`brief.md` says so, and it still has none).

Read `MiniMaxH3EncodeAVPatched` first: encoding the prior clip to an AV latent is needed on every
route including ours, and it is the one piece of the pack with no dependency on either patch.

> **Gate:** committed → pushed → `node_lock.json` `ComfyUI-MpiNodes.commit` bumped off
> `5e07043`. A node that is not pinned did not ship.

### 3 — The workflow file

Bench graph → `comfy_workflows/raw/flow_h3_extend.json` → API export → `flow_h3_extend.json`.
`Input_*` / `Output_*` titles per `docs/workflow-authoring/`; agents never hand-edit the JSON —
this is a bench re-export. Titles must at minimum cover `Input_Video`, `Input_Positive`,
`Input_Seed`, `Input_Duration`, `Output_Video`, so the existing collected fields land unchanged.

**H3 has no negative input** (`models.js` `minimax-h3`: `negativePrompt: false` — the conditioning
comes out of a single Qwen3-VL encode). **Fabio, 2026-08-31: the negative box HIDES on the H3
arm.** So the H3 graph carries no `Input_Negative` node and the field goes behind `hiddenWhen`.
Keeping it visible would have re-created MPI-475 exactly — a stop the user typed that never
reached the model, with nothing saying so.

> **DEPENDS ON MPI-664**, which is adding `hiddenWhen` as portable frame work. Do not author a
> second one here. If Phase 4 lands first, the field stays visible with a one-line comment naming
> this dependency, and the hide is a one-line follow-up — never a bespoke twin.

> **Gate:** `tests/inject-params-titles.test.cjs` extended to pin the new file's titles, green.

### 4 — Wire the pick

Four edits, all small:

| file | edit |
|---|---|
| `js/data/modelConstants/universal_workflows.js` | `byModel` on `flowLtxExtend` |
| `js/data/modelRegistry.js` | `getUniversalWorkflow(key, modelIds)` |
| `js/services/commandExecutor.js` | pass `payload.generationSettings?.flowModelIds` |
| `js/data/flowsRegistry.js` | `requiredModels: [{ label: 'Model', models: ['ltx-23-balanced', 'minimax-h3'] }]` |

`models[0]` is the recommended candidate and the picker stars it — LTX stays first, because it is
what every existing extend ran on. No `modelParams` arm is needed: the two candidates differ by
graph, not by a loader widget inside one graph. Check `tests/flow-model-choice.test.cjs` tolerates
a slot with no `modelParams` — if it does not, that is a test change, not a `modelParams` stub.

H3's licence consent gate (MPI-451, keyed by licence id in `licences.js`) already covers this: an
H3-only user who accepted during an fl2va install gets no second dialog.

> **Gate:** `tests/flow-model-choice.test.cjs` + the inject test green, `node --check` clean.

### 5 — Verify (`docs/playbooks/add-flow/05-verify.md`)

Isolated app on its OWN port and profile (`npm run app:isolated`) — never `:3000`. Pick LTX, run:
unchanged. Pick H3, run: a real clip. Reopen the flow: the pick is session-only by design
(`setFlowModel`), so it does **not** restore — confirm that reads as intended and not as a bug.
Reuse Prompt on an H3 extend must come back on H3 (`flowModelIds` on the sidecar, MPI-620).

> **Gate:** Fabio watches one H3 extend end to end. The live-run gate is his, always.

### 6 — Docs

`docs/playbooks/add-flow/existing-flows/ltx-extend.md` gains the second candidate and the
`byModel` contract; `any-of-models.md` gains "a slot may pick a different GRAPH, not just
different params" — that is the portable half and it belongs there, not on the flow's own page.
Ask before editing `.claude/rules/`.

## Not in v1

- **Ref-to-video extend** — its own card, see § Scope.
- **`minimax-h3-ref2va` as a third candidate** — same thing.
- **The pack in `node_lock.json`** — bench-only. If Phase 1 fails and the pack becomes the route,
  pin `source: git-commit` at `d175f0a`, **not** `registry` (the registry copy is v1.0.0 from
  2026-08-11, 19 days behind `main`), and open an issue asking for a `LICENSE` file.
- **Width/height on the flow** — still MPI-520's open half, still deferred, unchanged by this card.

## Disk — the real constraint, and why Phase 1 costs nothing

Measured 2026-08-31: **`G:` is 98% full, 5.1GB free of 239GB.** `fl2va` is ~19.53GB, so it does
not fit at all — this is not a preference to weigh, it is arithmetic.

`G:\CubricModels` is **the app's shared model store**, not a bench scratch dir — the bench's
`extra_model_paths.yaml` says so in its own comment ("same models the app pulls from"). So
**deleting a weight there uninstalls it from Fabio's app.** Relevant weights:

| weight | size | status |
|---|---|---|
| `qwen3vl_32b_h3_*` encoder | 24.55GB | shared by both H3 DiTs — never a candidate |
| `minimax_h3_ref2va_pruned_int8_convrot` | 19.53GB | **present — Phase 1 runs on this** |
| `ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot` | 20.03GB | the flow's shipped path AND its A/B baseline |
| `minimax_h3_fl2va_pruned_int8_convrot` | ~19.53GB | absent |

**Do not uninstall LTX.** It is `models[0]`, it is what every existing extend ran on, it is the
control in Phase 1's comparison, and removing it costs a 20GB re-download to get back to today.

Fabio raised uninstalling LTX to make room. It is not needed: **nothing before Phase 3 wants
`fl2va`.** Prove the seam on `ref2va`, and only then spend space on a route that is known to work
rather than on spec. When `fl2va` is finally needed, the two surfaces want different things and
only one of them is tight:

- **Bench (Phase 3, authoring the graph)** — no `G:` space needed at all. The bench's
  `extra_model_paths.yaml` already maps a SECOND store, `comfyui_external` →
  `C:/AI/diffusion_models/` (101GB free on `C:`). Drop `fl2va` there; ComfyUI scans both roots and
  the node dropdown does not care which one served the file.
- **App (Phase 5, the live run)** — this one is tight. The app has ONE models root
  (`CUBRIC_MODELS_ROOT`, preserved across engine reinstalls via `getCustomRoot()`,
  `routes/engine.js:1009`), so the weight has to live under it. Either free ~15GB of unrelated
  weights on `G:`, or move the whole store — it is one path, not a per-model choice. Decide then,
  with the route already proven.

## Open — needs Fabio

Nothing. Both questions answered 2026-08-31: the negative hides on the H3 arm (§ Phase 3), and the
disk question dissolves because Phase 1 needs no download (§ Disk).
