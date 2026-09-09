# MPI-591 — Plan: Extend Video takes MiniMax H3, and the user picks which

Written 2026-08-31 after Fabio brought in `kat3ri/ComfyUI-MiniMax-H3-Extend`. Two files feed
this plan and neither should be re-searched: `brief.md` (the H3 seam physics — every rule there
fails SILENTLY) and `research/minimax-h3-extend-nodepack.md` (the pack, and what changed).

> **STOP - THE CARD PIVOTED 2026-09-08. READ THE END OF THIS FILE FIRST**, section
> "DIRECTION CHANGE, 2026-09-08 - THE CARD PIVOTS TO FL2VA + MOTION CONTEXT". The 8-step
> gate FAILED (`validation.md` Phase 5h) and the ref2v graph described below is no longer
> the direction. Eight settled decisions are recorded there; do not re-open them.

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

> **PHASE 5e (2026-09-03): THE FLICKER IS FIXED, ON THE METRIC. Fabio's eyes are the gate.**
> Eight arms off ONE cached sample (5-10 s each, everything downstream of `#409`). **The defect was
> TWO defects:** the drifted re-take AND a one-frame flash at generated frame 39 - the model's first
> frame with nothing to copy, 106.6 against 103.5 either side - which sits OUTSIDE the crossfade and
> which no `overlap_mode` could ever have reached. **Lead 2 is dead:** `filmic_crossfade` measures
> *worse* than `linear_blend` (6.95 vs 6.68) and `perceptual_crossfade` is identical to it; both
> reshape the weighting curve, neither touches the level being weighted. **Lead 1 works and needs no
> new reference node** - `#902` already IS source frames 85..123, and `ColorMatch`/`reinhard` is
> per-frame across equal batches (`mkl` is measurably worse). **Dropping the flash frame is a trap**
> the luma metric would have rewarded: join motion goes 6.98 -> 8.75 -> 10.84 for 0/1/2 frames
> dropped, one artefact traded for a 42 ms skip. **F12k keeps it and level-matches it against its own
> successor: luma span 1.33 / worst step 1.10 (source wobble ±0.4), join motion 5.34 against the
> footage's 5.69 = 0.94x.** Six nodes on top of F10b. Full table: `validation.md` § Phase 5e.
> **NEXT: Fabio watches F12k. If it passes, port F12k into `comfy_workflows/flow_h3_extend.json` and
> its `raw/` twin** - the shipped graph still has the one-frame pin (`#902 num_frames 1`, no guide
> audio, `ref_audio_1` wired, `#904 overlap 1`). Guide length 56/73 was NOT run and is now a knob,
> not a pending fix.

> **PHASE 5f (2026-09-03): 5e's CLAIM WAS TOO STRONG, AND THE SOUND ARTEFACT IS OURS.**
> Fabio on F12k/F10b: *"Both videos still have a colour flicker, just not as much as before, and
> there is also a sound artefact. Sounds like a light switch."* Frame-MEAN luma is flat on F12k and
> the eye still sees it - a frame mean cannot see a regional or chromatic swing, so 5e killed one
> contributor, not the defect. **THE SOUND IS A 17 ms DROPOUT AND IT IS ROOT-CAUSED:** the tail's
> content lands at output sample 165888, not 165333, and 165888 = 162 x 1024, a whole number of AAC
> frames. `MpiLoadVideo._load_audio` (`video.py:156-189`) decodes the mp4's AAC to WAV and the
> decoder emits its final PADDED frame, so the loader returns a soundtrack 555 samples LONGER than
> its own picture, ending in silence. Harmless at the end of a clip; this Flow concatenates onto it.
> Eliminated by probe, not by reading: the model's raw audio (F13) has no hole, the slice (F14) is
> clean, `AudioConcat` is a plain `torch.cat`, and the source file is loud to its last sample.
> **Fixed in the Flow with an existing node** - `#950 MpiAudioRange(#906, fps #331, 0, -1)` into
> `#907 audio1`, which counts in FRAMES and so re-derives 165333 with nothing hard-coded. Verified:
> the join envelope goes `-19/-48/-56/-60/-59 dB` to `-19/-24/-27/-28/-28 dB`. **THE NODE IS STILL
> WRONG for every other caller** - that fix is `/mpi-nodes-sync` + a pin bump, and it is Fabio's
> call. **BENCH RESOLUTION IS 864x480, not 1280x704** (the source is an 864x480 H3 render), and
> Phase 5 part 2 already had a metric INVERT between bench and app resolution - re-run before
> quoting. **NEXT: F15a (fade) vs F15b (HARD JOIN, no crossfade anywhere), both with the audio fix,
> are with Fabio** - F15b exonerates or convicts the crossfade in one watch. Full evidence, the
> elimination table and the three new instruments: `validation.md` § Phase 5f.

> **FABIO ON F15 (2026-09-03): THE PICTURE CROSSFADE IS CONVICTED, AND THE AUDIO IS THE SPLICE.**
> *"On F15B, it's barely noticeable, but the audio artefact is still there."* / *"F-15A, the colour
> flicker is more apparent."* **The 39-frame crossfade CAUSES most of the flicker** - F15a (fade) is
> worse than F15b (hard join, no crossfade anywhere), where it drops to barely noticeable. The fade
> was carried over from `flow_ltx_extend.json` and is the wrong mechanism for H3; **the hard join is
> the base from here.** The level-match still earns its place (the flash frame is on the hard arm
> too), but the 39-frame blend does not. On F15b chroma at the join is FLAT (dU -0.08 vs the fading
> arm's -0.97), which retires the chroma lead; the residual is a two-frame luma decline of -2.35
> (source brightens 103.8 -> 105.5 through its last 40 frames, the continuation does not follow).
> **The audio artefact is neither the picture stitch nor the AAC hole** - it survives both arms and
> F15b has no dropout anywhere in the file. It is the SPLICE: `#907 AudioConcat` butt-joins two
> recordings at one sample with no fade. MpiNodes already knew - `MpiAudioSplice`'s tooltip reads
> *"A hard splice clicks, and a click is the one artefact an audio edit cannot hide"* - the Flow just
> never used it. **F16 fades the sound over the model's own re-take of the same moment** (#951
> MpiAudioRange + #952 MpiAudioSplice, negative `start` so no source length is hard-coded).
> DO NOT CHASE the 4.7553 s step: the SOURCE clip has it too.

> **PHASE 5g (2026-09-03): F16b PASSES CLEAN. The bench arm is settled; the PORT is what is left.**
> *"F-16A still has a little flicker, almost imperceptible, and the sound is good. F-16B is perfect,
> both sound and image, no flicker at all."* **F16a and F16b have BIT-IDENTICAL VIDEO** (md5
> `e56a0cd65c540e57bf2bd3fac81b67cf` on both) and differ only in the audio crossfade - 300 ms over a
> 12-frame pre-roll vs 800 ms over 24. So the flicker seen on F16a was **not in the pixels**: the
> audio splice was being perceived as a VISUAL event, which is why every picture instrument came back
> flat while the eye kept objecting. That also retires the residual two-frame luma decline - it is in
> both arms byte for byte and invisible once the sound is right.
> **THE WINNING CONFIG, four changes, each with its own evidence:** (1) `MiniMaxH3AddGuide` anchors
> the source's last 39 frames as a CLIP with its own audio, `ref_audio_1` dropped; (2) **hard join,
> `#904 overlap 1`, re-take discarded - NO 39-frame crossfade**; (3) `ColorMatch`/`reinhard` on the
> model's first free frame against its own successor; (4) `#950 MpiAudioRange(#906, 0, -1)` to trim
> the AAC padding plus `#951`/`#952 MpiAudioSplice` crossfading the splice over 24 frames / 800 ms.
> **GOTCHA: the bench is NOT bit-reproducible across a ComfyUI cache eviction** - F15b and F16a share
> a seed and an upstream graph and have different video md5s, because F16a re-sampled. Any A/B that
> spans an eviction compares two samples, not two stitches; check the video md5 first.
> **NEXT: PORT F16b into `comfy_workflows/flow_h3_extend.json` and its `raw/` twin.** The shipped
> graph still carries the one-frame pin (`#902 num_frames 1`, no guide audio, `ref_audio_1` wired,
> `#904 overlap 1` with no level match and no audio work). Round trip + both validators, per the
> workflow-authoring rules. Build script: scratchpad `build_F16.py` (imports `build_F15` ->
> `build_F12`); the exact node set is in `validation.md` § Phase 5f/5g.

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

> **PHASE 5g PORT DONE (2026-09-04) - AND IT IS BIT-IDENTICAL TO F16b.** F16b is in
> `comfy_workflows/flow_h3_extend.json` and its `raw/` twin, both 40 -> 52 nodes, both edited
> surgically with `pos`/`size` asserted unchanged on every survivor. The shipped file driven with
> the bench arm's own inputs produces **the same file byte for byte on picture AND sound** - video
> md5 `e56a0cd65c540e57bf2bd3fac81b67cf`, decoded-audio md5 `6d81b0b5f94366bd775d762b72a0e9da`,
> matching F16b on both. Round trip 0 differences, check 3 (`graphToPrompt` in the real frontend)
> 0 differences, both validators green, 83/83 tests.
> **ONE CHANGE BEYOND THE HANDOFF'S FOUR, AND IT WAS NOT OPTIONAL.** The guide costs 39 frames of
> the model's own output, so delivered new frames are `N - 40`. Feeding `Input_Duration` straight
> into `MpiH3Length` under-delivered every duration by 1.67 s AND **crashed at the slider's minimum**
> (1 s -> N=22, `#941 start_index 40` out of range). `#954 MpiMath "a + 40/24"` adds the frames back
> before the 17k+5 snap: 4 s now asks for N=141 - the bench arm's own length - and 1 s for 56. The
> cost is real and inherent to the clip guide: 141 sampled frames at 4 s where the one-frame pin
> sampled 90.
> **BLOCKER, AND IT IS FABIO'S CALL: `MpiAudioSplice` IS NOT AT THE PIN.** `node_lock.json` pins
> `ccc25d1`, which is `origin/main` exactly and has `MpiAudioRange` but not `MpiAudioSplice`; the
> node is in `09e75c9`, one of **nine unpushed commits** on `ComfyUi-MpiNodes` `main`. The bench runs
> the working tree, so no bench run can see this - an H3 extend in the APP dies node-not-found.
> Shipping needs a push plus a pin bump, and those nine commits carry other cards' unshipped work.
> Core is fine: the shipped engine's `MiniMaxH3AddGuide` already has `audio`/`audio_vae`/`image`.
> **48188 WAS DOWN this session**, so conversion and verification ran against 8188; re-run
> `verify-workflow.mjs` against the app engine when it is up.
> **NEXT: the pin decision, then Reuse Prompt on a finished H3 extend, then Phase 6 docs.**

> **PHASE 5h - THE 8-STEP ALIGNMENT (2026-09-04). Static proofs green; THE GATE IS UNRUN.**
> MPI-687's `c39b5008` swapped this graph onto the 8-step distill for dependency reasons and
> explicitly did NOT re-tune it, leaving an 8-step LoRA sampled the 4-step way. The arm now
> matches `minimax_h3_r2va` line for line (`arm_equivalence.py`): `MpiLoraModel` **switched**
> in/out at strength 1 instead of `MpiLoraModelClip` faded to 0.2, `beta/8` instead of
> `beta/6`, shift `12/4` turbo and `12/2` quality, `Input_Refs.clip` straight off the
> CLIPLoader. `#457` + `#915` deleted; 52 -> 53 nodes.
> **THREE PRE-EXISTING DEFECTS FIXED ON THE WAY, all on the branch being rebuilt:** the
> quality arm had NO sigma shift at all; the turbo LoRA was on the CLIP and still at 0.2 when
> turbo was off; and `#909 EasyCache` hung off the raw UNET, so quality silently skipped
> `ModelAttentionBackend`.
> **A V3 TRAP WORTH REMEMBERING:** the first run wrote `steps: 8` into
> `BasicScheduler.scheduler`, because this engine declares a COMBO as the literal string
> `"COMBO"` rather than as the list of options, and a missed COMBO shifts every LATER widget
> by one. `verify-workflow`, the injection validator and 883 tests all pass on a shifted
> widget - **only the raw round trip caught it.**
> **PIN BLOCKER CLEARED:** MpiNodes 1.2.9 (`e00086a9`) is pinned and carries `MpiAudioSplice`.
> **NEXT, AND IT IS THE ONLY THING LEFT BEFORE THIS CARD CLOSES: THE 8-STEP GATE.** No
> generation ran this session - Fabio was mid-test on the GPU and asked for it to be left
> alone - so every Phase 5d-5g number, the `e56a0cd6` md5 included, is 4-step evidence that no
> longer describes this graph. Run the shipped file with the Phase 5g inputs, measure with
> `luma.py` + `dropouts.py`, and put an 8-step extend in front of Fabio. Then Reuse Prompt and
> Phase 6 docs.
> **The two-pass sweep is MPI-688, not this card.** If extend goes there, the refine's
> reference encoder is titled `Refine_Refs` - a second `Input_Refs` is an injection violation.

> **TEXT ENCODER RE-BAKED (2026-09-05).** Fabio opened `raw/flow_h3_extend.json` in ComfyUI,
> swapped the text encoder and re-saved, which also re-laid-out the graph (the raw diff is large
> and almost all of it is `pos`). **All 53 nodes survived his export** - the F16b port, the 8-step
> arm, `#457`/`#915` still deleted - verified node by node before anything was baked. The runtime
> file was one value stale, so `tests/flow-model-choice.test.cjs` was **RED in the working tree**:
> *"the minimax-h3-ref2va arm loads qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors
> (CLIPLoader.clip_name), which no dependency of that model supplies"* - MPI-698 supersedes that
> encoder with `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` and leaves the old one referenced by
> no model. Exactly the trap MPI-687's LoRA swap hit. Re-baked `#390` to the nvfp4 encoder: round
> trip vs the converter **0 differences**, verify + injection green against 48188, `npm test`
> **902/902**, and that test is green again.
> **THE LESSON FOR THE NEXT WEIGHT CHANGE: nothing propagates it.** `sync-raw-workflows.mjs`
> converts each raw file independently and shares no weight names between graphs, so every H3
> sweep has to touch `flow_h3_extend.json` explicitly or it silently names a weight no model
> downloads. This is the second time (4-step LoRA, then the encoder). **Extend belongs in the H3
> sweep's file list from now on**, not chased afterwards.

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

---

# DIRECTION CHANGE, 2026-09-08 — THE CARD PIVOTS TO FL2VA + MOTION CONTEXT

Everything above this line describes the ref2v / one-frame-pin / pixel-join graph. That graph is
still what SHIPS, and its gate FAILED (`validation.md` § Phase 5h: **-3.51 dB** level step across
the join against the -1.12 dB of the arm Fabio passed). It is not being patched further.

## Decisions — SETTLED WITH FABIO, DO NOT RE-OPEN

**D1 — Extend moves to FL2VA conditioning, off ref2v.** Fabio's verdict on the footage: the
reference-video model tears, and the tearing translates into morphing, distortion and pixelated
output. `minimax_h3_fl2va.json` already ships AND carries its own matching distill
(`#455 minimax_h3_fl2v_turbo_8step_v1.0_768p`) — the extend flow is currently on the *ref2v*
conditioning path AND the *ref2v* distill.

**D2 — BARE BONES FIRST. NO LoRA.** Order is: prove a good extension with nothing on it, then the
turbo LoRA, then accelerators and attention, then possibly the upscale phase. Rationale is not
only diagnostic — see D5; a LoRA-free low-res chain may be the shipping shape, which would demote
the open -3.51 dB LoRA defect from blocker to a constraint on an optional path.

**D3 — The upscale phase is PARKED, and is not needed to prove extension.** Fabio: the upscale
stage exists so you can generate at low resolution and upscale, which for an *extension* means
generating below the input's resolution. Untested, and suspicious on its face. Prove the seam
first.

**D4 — TWO PATHS, ONE NODE: latent if provided, pixel encode/decode if not.** Not speculative —
this is exactly what the upstream pack does (`context_latent` wired => picture and sound both come
from it, `context_frames`/`context_audio` ignored; absent it the pixel path runs and sets
`overhang = 0.0` because decoded audio was cut at the frame, so the pixel branch is the SIMPLER
arithmetic, not a degraded one). Build the latent branch in from the start so infinite video is
not a retrofit.
  - **Extend Video** (this card) — user's imported MP4, no latent exists, pixel path. It pays no
    round-trip penalty: the source was never a latent, so there is no decode to avoid.
  - **Infinite video / future flows** — our own output, latent path, full quality per link.

**D5 — The infinite-video shape: chain entirely at LOW resolution, then upscale the finished
latent through the already-windowed refine.** Fabio's design, and it dissolves a tension recorded
wrongly earlier in this session: `context_latent` refuses a resolution change **mid-chain**, not
an upscale AFTER the chain is complete. Every link at one resolution, one resize at the end. At
low res 25 steps is cheap and needs no LoRA, and `MpiWindowedSampler` makes a 30 s - 60 s upscale
credible. Not this card, but the node must not preclude it.

**D6 — THE UPSTREAM PACK NEVER GOES NEAR THE ENGINE.** Explicit instruction from Fabio. It is an
ORACLE ON THE BENCH ONLY, same posture as `kat3ri/ComfyUI-MiniMax-H3-Extend`. Nothing from it
enters `node_lock.json`. We reimplement the arithmetic in `ComfyUi-MpiNodes/h3.py` via
`/mpi-nodes-sync`, crediting the source in the docstring.

**D7 — The H3 community licence is ASSESSED AND SORTED.** The upstream README claims it does not
cover the EU, UK, Korea or the US. Fabio has dealt with it. **Do not raise it again.**

**D8 — MPI-591 stays in `doing`.**

## The mechanism, read out of the source — DO NOT RE-DERIVE

Read from `NikoDemon80/ComfyUI-H3-Motion-Context` (919 stars, updated 2026-09-08), which is the
real upstream behind the `Motion-Director` repo Fabio linked; Motion Director is a timeline/
orchestration UI whose README names five continuity features and explains none of them. Source
copies of `nodes.py`, `README.md`, `layout_contract.py`, `tests/level_step.py`, `CHANGELOG.md` were
pulled to the session scratchpad (`mc/`) — re-fetch with `gh api` if gone.

**Why our audio fails, in their words:** *"Add Guide anchors audio starting at a frame and running
forward. To actually continue a soundtrack, the pinned window has to END at the join and reach
backwards into the sound that already played."* Our graph is `#903 MiniMaxH3AddGuide` at
`frame_idx: 0` with the source track in the STANDALONE `ref_audio_1`. They hit the identical
failure and named it: the model reads a reference as *"a separate clip that sounds like this"* — a
cover band. Cross-correlation at the join went **0.45 -> 0.95+** when they fixed it.

**Video pin.** Slice the last N latent steps out of the previous clip's video latent, one cond
block per step, offsets from `FRAME_PER_TOKEN = (1,4,4,4,4)` (same geometry Phase 5b derived here
independently — the two agree). Two hard refusals: `start = total - steps` must have
`start % 5 == 0`, and off-grid run lengths must **snap DOWN** the grid
`(124,107,90,73,56,39,22,5,1)` from the VAE's `max(1,(n-5)//17*5+2)`. Their reason for the snap is
the dangerous bit: encoding 10 frames yields the same 2 steps as encoding 5 **but covering frames
[-10..-6] instead of [-5..-1]** — the pinned run ends early and the clip continues from the wrong
instant, silently.

**Audio pin — this is the whole trick.** Stock places a keyframe's audio window STARTING at
`(5/3) * index` and running forward. To make it END at the join:

```
end_frame = span + overhang / FRAME_RESCALE        # end-align with the pinned video
end_coord = round(FRAME_RESCALE * end_frame)       # snap onto the target's own 40 Hz grid
end_frame = end_coord / FRAME_RESCALE
resolved_frame_index = end_frame - ref_audio_t / FRAME_RESCALE
```

`FRAME_RESCALE = 5/3` (24 fps picture, 40 Hz audio latents). That index is **fractional, and
negative whenever the audio window is longer than the pinned head**, which it normally is — legal
layout arithmetic, unreachable through stock Add Guide, which is why they carry
`layout_contract.py` to refuse if ComfyUI ever stops honouring it. `overhang = total_t -
(5/3)*frames` is **exactly one of {0, +1/3, -1/3}** because 5/3 x an integer lands on .0/.333/.667
and never .5, and H3 rounds the audio grid to NEAREST. Skipping the snap costs up to 1/3 step =
**8.3 ms**, cycling rather than constant — that was their "chained clips come out 8 ms late" bug.

**Settings they collapsed to constants, losing branch documented in their own source:**
`ENCODE_MODE = "video"` (one VAE call for the whole pinned run, motion lives inside the latent;
per-frame stills "left a visible seam"), `ANCHOR_MODE = "head"` (negative-time pinning "collides
with the text rows, weakens the anchors and darkens the output"), `AUDIO_MODE = "timeline"` (vs
`"ref"`, the cover band).

**It is a CONDITIONING PASS-THROUGH** — `RETURN_TYPES = ("CONDITIONING", "INT")`, wired between a
stock H3 conditioning node and the guider, MERGING pinned keyframes into whatever arrives. Their
comment: *"the pinned run decides how the clip starts, the anchor decides where it ends"*, and an
upstream `last_frame` anchor is called a legitimate companion. **That is FL2VA's exact shape** — D1
and this mechanism compose without a graph rebuild.

**Their input surface**, worth matching: `context_length` offers only `22/5/39/56` (whole numbers
of latent steps), default 22, described as "nearly seamless" against 5's "just barely fluid";
`audio_context_length` default **24 frames = 1 s**, END-aligned and INDEPENDENT of the picture
window, multiples of 3 landing on the 40 Hz grid. The INT return is `trim_frames`.

## Traps carried forward

1. **Phase 5b's "more context is worse" DOES NOT TRANSFER.** That measured the kat3ri pack's
   pixel-domain `context_frames` with no end-aligned audio. Different mechanism. It must not be
   used to veto a 22-frame pin.
2. **The pinned head comes back in the output** and must be trimmed, picture and sound together,
   before concatenating. A 56-frame pin spends 2.3 s of render on frames you throw away.
3. **H3 emits 32 kHz, not 48.** A hardcoded 48000 in any remux silently kills the tail of a long
   chain while every duration check still passes.
4. `level.py` is the level-continuity instrument; `dropouts.py` is structurally blind to it. See
   `validation.md` § Phase 5h.

## We already own every primitive — the new code is small

| what the upstream needed a node for | what Cubric Vision already ships |
|---|---|
| Save Latent / Load Latent (exists only because ComfyUI won't wire a sampler to itself) | **`MpiStageLatents`** (`save_path`/`load_path`/`is_continue`) |
| `_streams_from_latent`, to reach video and audio separately | **`LTXVSeparateAVLatent` / `LTXVConcatAVLatent`** |
| — | **`MpiWindowedSampler`** (`overlap_frames: 17`, `frame_grid: 5`) |
| — | **`MinimaxH3LatentUpscaler3D`** + `enable_temporal_chunking`, **`ManualSigmas`** |

`MpiWindowedSampler`'s `frame_grid: 5` / `overlap_frames: 17` is **the same 17m+5 grid** as the
upstream's `VIDEO_RUN_GRID` and the VAE's `(n-5)//17*5+2`. Our sampler is already on H3's latent
grid, which is what makes D5 credible rather than hopeful.

**The only genuinely new code is the keyframe arithmetic** (tail slice, end-alignment, the
fractional/negative audio index, the `%5` and grid-snap refusals). It lands in
`ComfyUi-MpiNodes/h3.py`, which today has `MpiH3Length`, `MpiH3References`, `MpiH3ImageToVideo`,
`MpiH3MaskedPrefix`, `MpiH3EncodeAV`, `MpiH3DecodeAV` and essentially no keyframe-index handling.

## THIRD SWEEP MISS — `flow_h3_extend.json` was left out AGAIN

MPI-699/704 swept `minimax_h3_r2va` and `minimax_h3_fl2va`; the extend flow was not in the file
list. Against those two it is missing: **`MpiWindowedSampler`**, `MinimaxH3LatentUpscaler3D`,
`MpiStageLatents`, `ManualSigmas`, `LTXVConcatAVLatent`/`LTXVSeparateAVLatent`, `MpiFloat`, 6x
`MpiLoraModelClip` (the style-LoRA slots), and the THIRD sigma shift (`shift_audio: 0.5`, the
refine stage). r2va's turbo arm is now **beta/10**; extend is still beta/8. This is the third
occurrence — it is a process bug, not bad luck, and the file belongs in the H3 sweep's list
permanently.

## NEXT ACTION — the bare-bones bench arm

Not started. Needs the GPU (Fabio said it is free 2026-09-08; ask anyway, the lease is not the
whole truth).

1. Base `comfy_workflows/minimax_h3_fl2va.json`, **LoRA OFF**, quality arm, no accelerators, no
   upscale, pixel path.
2. Pin the source tail: last **22** frames + **24** frames of END-ALIGNED tail audio.
3. Trim 22 off the front, concatenate, measure.
4. **Port `tests/seam_probe.py`** from the upstream scratchpad copy — it cross-correlates the new
   clip's opening against the previous ending and is the one number that separates "continued"
   from "cover band". That is the verdict metric this saga has never had. Run it alongside
   `level.py`.
5. Baseline to beat, already on the board: **-3.51 dB** level step, and whatever correlation the
   currently shipped graph scores.

**Deferred, unchanged:** multi-reference extends (a new character mid-extend via `ref_image_1..9`).
**Noted, do not build against it yet:** Dars is making every H3 generation save its latent. If that
lands, Extend gets the latent path for free on anything the app generated and the pixel path
narrows to user-imported footage only.

## PHASE 6a RESULT - the bare-bones arm PASSED (2026-09-08)

`validation.md` Phase 6a. Level step **-0.43 dB** against the -3.51 dB baseline and INSIDE the
0.55 dB noise floor; seam correlation **0.791**, verdict CONTINUATION; picture seam also better
(worst 1-frame luma step 0.49 vs 1.14-1.19). The audio failure that killed the 8-step gate does not
reproduce on this chain.

**Next, in D2's order - one variable per arm:**

1. **A2, the turbo LoRA back on** (`minimax_h3_fl2v_turbo_8step_v1.0_768p`, beta/8, euler). This is
   the untested prime suspect from Phase 5h AND the thing the upstream README independently warns
   "thickens the sound". A1 is now the control it never had.
2. **A3, accelerators** - EasyCache and the attention backend, on top of whichever of A1/A2 wins.
3. **THEN** the MpiNodes port (`ComfyUi-MpiNodes/h3.py` via `/mpi-nodes-sync`), latent branch built
   in from the start per D4/D5. A1 is the number the port has to match.
4. Only then D3's parked upscale question, and Phase 6 docs.

**The oracle is INSTALLED on the bench** at `G:\ComfyUi\ComfyUI\custom_nodes\ComfyUI-H3-Motion-Context`.
It does NOT monkey-patch - it says so at startup ("ComfyUI is not modified") and its own
`layout_contract.py` explains why the old patches went away in ComfyUI 0.34 (bench is 0.34.2).
Unlike `ComfyUI-MiniMax-H3-Extend.disabled` it is safe to leave loaded, but it still NEVER enters
`node_lock.json` (D6).

### FABIO'S VERDICT ON A1, AND THE TEST CORPUS IS WRONG

He watched it. **FLAWLESS, VIDEO AND AUDIO** - his words, and that is the gate the metrics only
ever stood in for. Phase 5h failed on his ear after the instruments said "sound clean"; this time
ear and instruments agree. **The continuation also IMPROVED on the source.** The source itself
tears and smears - it is ref2v output at low resolution, and in his words reference-to-video "has a
lot of tearing and smearing and is practically crap". That is D1 confirmed from the footage rather
than from a metric.

**But it makes the picture half of A1's verdict unrepresentative.** Nobody extends footage this
bad, so the visible improvement across the join would not show up in a real extension, where the
source is already good. The 0.49 luma step is a true measurement of a case that does not occur.

**This does NOT invalidate A1.** The audio result stands on its own - the level step and the
seam correlation are measured against the source's OWN sound, so "the source is ugly" does not
reach them, and the mechanism demonstrably phase-locks.

**The tension, and the call:** switching to a good source breaks comparability with the -3.51 dB
baseline, which was measured on `ref2v_ms_004.mp4` specifically. So:

* **A2 KEEPS this source.** Its only job is a single-variable A/B against A1 (turbo LoRA on),
  and that needs the same footage on both sides.
* **A later arm re-runs the winner on an FL2VA-GENERATED source** - good footage, the case a user
  actually hits. That arm is about whether the win holds, not about the baseline.
* Whatever ships is decided on the second corpus, not the first.

## PHASE 6b RESULT - the turbo LoRA is CONVICTED, as a bundle (2026-09-08)

`validation.md` Phase 6b. Arm A2 = A1 + the turbo bundle, one seven-line graph diff, same source
and seed. Level step **-5.97 dB** against A1's -0.43 dB: a **5.54 dB** move, ten times the 0.55 dB
noise floor. The prime suspect named in the plan and independently fingered by the upstream README
is confirmed.

**The pin is not what turbo breaks.** Seam correlation went UP (0.825 vs 0.791), same constant
-9.0 ms lag, same 0.06 ms residual. It still continues the source; it continues it 6 dB too quiet.
The defect is gain, not continuity - a separation Phase 5h could not make.

**NEXT ACTION - A2b, and it is cheap.** A2 moved three things. `shift_audio` is already cleared by
Phase 5h (0.21 dB, inside the band, and the multiply is compensated in
`comfy/ldm/minimax/model.py`), leaving the LoRA and the 8-step beta/euler arm. **A2b = A1 plus
beta/8 + euler, NO LoRA**, ~90 s on the bench. Near -0.43 convicts the LoRA; near -6 convicts the
step count. This is the arm that names the culprit, and nothing downstream should be built until it
has run - if the step count is the cause, dropping the LoRA does not fix anything.

Then, unchanged: **A3** (accelerators on the winner), the **second corpus** on FL2VA-generated
footage where shipping is actually decided, and only then the **MpiNodes port**.

## PHASE 6c RESULT - the LoRA is INNOCENT; the fast sampler ARM is guilty (2026-09-08)

`validation.md` Phase 6c. **A2b = A2 with the turbo LoRA deleted and nothing else. -6.16 dB against
A2's -5.97.** 0.19 dB apart, inside the floor, and with NO cache eviction between them (the bench
served 18 of 24 nodes from cache, including the conditioning and the motion context), so the
comparison is tighter than the 0.55 dB floor implies. Removing the LoRA changed nothing.

**This overturns Phase 5h's prime suspect and Phase 6b's headline.** The damage belongs to the
8-step `beta`/`euler` sampler arm, not to `minimax_h3_fl2v_turbo_8step`. `shift_audio` stays
cleared. What is still coupled inside the convicted group is scheduler + step count + sampler; A2b
separates that group from the LoRA, not its three members from each other.

**FABIO'S EAR vs THE SPECTRUM.** He heard the hooves go soft on A2 and called it a low-pass. The
defect is real and he localised it correctly; the mechanism is the reverse. `bands.py` (new, with a
synthetic `--self-check`) shows a BASS COLLAPSE on both 8-step arms - 0-250 Hz down 9.62 dB (A2) /
10.71 dB (A2b), 5.88 / 7.35 dB deeper than every other band - while 2-8 kHz moves with the crowd,
the centroid rises, and crest factor is flat. The hooves lost body, not top. Shipping copy must say
"the low end thins out", never "loses treble".

**PRODUCT (Fabio's call, this session): turbo becomes a USER OPTION, not a defect to eliminate.**
And the option is **8 fast steps vs 25 quality steps**, NOT "LoRA on/off": turning the LoRA off
while keeping 8 steps buys nothing on audio and costs picture, so the LoRA should stay on whenever
the fast arm is chosen. Speed bought: 580.8 s -> 240.3 s, 2.4x.

**NEXT ACTION - the arm that turns the toggle into a slider.** LoRA on, `beta`/euler, **12 or 16
steps**. If the bass comes back at half the quality arm's cost, the fast/quality binary becomes a
real ladder, and that is what the product decision rests on now. ~5 min.

Then unchanged: **A3** (accelerators on the winner), the **second corpus** on FL2VA-generated
footage where shipping is decided, and only then the **MpiNodes port**. One gap worth closing
cheaply if a spare run comes up: A1's bands were never measured (its clips died with its
scratchpad) - its bass is inferred intact from the -0.43 dB broadband step, not measured.

## PHASE 6d RESULT - the ladder: TWO defects, and 15 steps is the knee (2026-09-08)

`validation.md` Phase 6d. Turbo path walked up in steps (10/15/25, one variable each against A2's
8): level step **-5.97 -> -5.23 -> -3.91 -> -2.60 dB**, monotonic. Fabio's theory was right that
steps matter; my linear extrapolation predicting -0.5 dB at 25 was WRONG - the curve saturates
(per-step gain 0.37 -> 0.264 -> 0.131) and 25-step turbo stops at -2.60, **2.17 dB short of A1**.

**THE DEFECT WAS TWO DEFECTS.** `bands.py` across four points: the bass collapse is step
starvation and steps fix it (0-250 Hz shape -5.88 -> -1.48, centroid drift +293 -> +60 Hz, and at
25 steps the bass is no longer the worst band). What remains is a FLAT ~2.6 dB level offset that
steps do not touch and A1 does not have. The broadband `level.py` number could never separate the
two.

**NEXT ACTION - what owns the residual.** 25-step turbo vs A1 differ by four things: `beta` vs
`simple`, `euler` vs `res_multistep`, `shift_audio` 4 vs 2, LoRA present vs absent. The LoRA was
cleared **at 8 steps only** - that does not carry to 25. Cheapest decisive arm: **A1 exactly plus
the turbo LoRA**, one variable against a measured -0.43 dB.

**PRODUCT: 15 steps is the knee and the default.** 10->15 buys 1.32 dB for 98.7 s; 15->25 buys
1.31 dB for 225.7 s. Sampling is ~21.6 s/step + ~27 s fixed. Picture is identical to the quality
arm from 15 steps up (luma 0.49), confirming Fabio's prior bench finding that this distill takes
3x its nominal steps with no degradation - a fact not derivable from the repo, recorded here.

## THE CENTROID IS A SPEECH PROBLEM, AND IT IS STEP-DEPENDENT (Fabio, 2026-09-08)

**His prior bench knowledge, not derivable from this repo or any doc:** turbo LoRAs on H3 have a
tendency to **boost the spectral centroid, and that is what makes SPEECH hurt the ears.** He has
noticed it in earlier tests. Our whole corpus has **no speech in it**, so every centroid number on
this card is measured on the case that does not hurt.

**Our own ladder now gives that observation a shape.** Centroid drift across the join, turbo path:

| steps | 8 | 10 | 15 | 25 |
|---|---|---|---|---|
| centroid drift | **+293 Hz** | **+239 Hz** | +144 Hz | +60 Hz |

The boost is **step-dependent and worst where turbo is fastest.** So picking 10 steps for speed
sits near the worst end of exactly the effect that hurts vocals. That is the whole reason the
`shift_audio` sweep is worth running at 10 steps rather than anywhere else.

**Settled this session, do not re-open:** the scheduler and the sampler are NOT to be swept. Each
arm already has known-good values, the residual 2.17 dB is not worth re-litigating them for, and
Fabio called it directly. `shift_audio` is the knob to explore instead. The Phase 6c note proposing
"A1 plus the turbo LoRA" is **superseded** - that arm was about attributing the residual, and the
residual is no longer the question.

**Also settled: 15 and 25 steps are indistinguishable to his ear**, so the extra 225.7 s that 25
costs buys nothing audible. Turbo's whole point is speed. **The turbo path is 10 steps.**

### WHY THE SWEEP KEEPS THE SILENT PROMPT, and how speech gets judged

Putting a shouted line in the extension prompt would make `level.py`, `bands.py` and the centroid
**stop measuring continuity**: the extension would contain content the source never had, so a level
step and a centroid drift would be reporting "a scream was added", not "the continuation matches".
Every number on this card would become incomparable with the ladder in one move.

So the sweep runs on the SAME silent prompt, source and seed - fully comparable to the 10-step arm
already measured (-5.23 dB, +239 Hz) and to the whole ladder - and speech is judged in a SECOND
stage on the one or two candidates the instruments pick. That keeps the instruments meaningful and
costs fewer GPU minutes than sweeping with speech in every arm.

**Open question for the second stage, Fabio's call:** shout a line over the existing wagon source,
or generate a fresh CLOSE-SHOT source with a speaking character. He raised the distance problem
himself - the woman is far away, which is the hardest case to judge harshness on. A close-shot
FL2VA-generated source would also serve as the **second corpus** this plan already requires before
shipping, so it settles two things in one.

## PHASE 6e RESULT - shift_audio is a STRONG knob, and Phase 5h eliminated it wrongly (2026-09-08)

`validation.md` Phase 6e. Sweep at 10 steps, turbo on, only `#516.shift_audio` moving:

| shift | 1 | 2 | 3 | 4 (shipped) | 6 |
|---|---|---|---|---|---|
| level step | **-3.55** | -4.29 | -4.87 | -5.29 | -6.31 |
| centroid drift | **+124 Hz** | +153 | +214 | +239 | +284 |

Monotonic on every audio metric - lower is better, 2.76 dB and 160 Hz across the range. **Going
from the shipped 4 to 1 buys 1.74 dB and HALVES the centroid drift for free**, which is precisely
the speech-harshness lever Fabio asked for.

**PHASE 5h's "shift_audio is NOT the cause - do not re-test" IS OVERTURNED.** It tested a single
4 -> 5 step (0.21 dB, inside the band) on an arm whose bass collapse dominated. Under-powered, not
wrong. Its source reading still stands - the multiply IS compensated in
`comfy/ldm/minimax/model.py` - but a compensated change of variables still changes the sigma
schedule the audio latent rides. **Carry the rule: eliminating a knob on a one-unit step is not
eliminating it.**

Counter-trend, recorded not dismissed: seam correlation moves the OTHER way, 0.802 at shift 1
against 0.828 at 6. Spread 0.026, every row still CONTINUATION, and A1 passed Fabio's ear at 0.791.

**10 steps + shift 1 = -3.55 dB / +124 Hz at ~250 s**, against 25 steps + shift 4 at -2.60 dB /
+60 Hz for 567.7 s. The cheap knob recovers most of what the expensive one did.

**NEXT ACTION - two runs, then speech.** The trend is still improving at 1 and `shift_audio` goes
to 0.01 (the shipped refine stage runs 0.5), so **1 is the edge of the sweep, not a minimum**:
extend to **0.5 and 0.25** and find the floor, or find where the correlation trade turns bad. THEN
take the winner into the speech stage - Fabio's call still open there between shouting a line over
the wagon source and generating a close-shot FL2VA source that doubles as the second corpus.

## PHASE 6f RESULT - the noise floor was wrong all session (2026-09-08)

`validation.md` Phase 6f. The seed control Fabio asked for did not test the artefact (that is in the
source - Phase 6g) but answered something never asked: **identical settings, different seed = 0.86
dB apart.** Every significance call this session used the 0.55 dB CACHE-EVICTION floor, measured
from a pair that SHARED a seed. **The usable floor is at least 0.86 dB**, from one pair, so a lower
bound rather than an estimate.

**Survives:** `shift_audio` matters and lower is better (1 -> 6 spans 2.76 dB across five ordered
points); the step ladder's shape (8 -> 25 spans 3.37 dB); the LoRA exoneration (a null at 0.19 dB,
which a bigger floor only makes safer); A1 vs everything (2+ dB).

**WITHDRAWN:** the seam-correlation counter-trend from Phase 6e. Its whole span was 0.026 and the
seed pair differs by 0.026 on identical settings. Not established.

**Re-qualified:** 8 -> 10 steps (0.74 dB) is inside the floor - "10 beats 8" rests on the ladder's
shape and Fabio's own bench experience, not on that pair. 15 -> 25 (1.31 dB) is ~1.5x the floor.
shift 4 -> 1 (1.74 dB) is ~2x - quote it as "about 1-2 dB".

**The sweep has a floor at about `shift_audio` 1.** 0.25 / 0.5 / 1 land within 0.74 dB of each
other, inside seed noise; below 1 buys nothing and 0.25 is marginally worse.

**STANDING RECOMMENDATION - the turbo path is 10 steps, `shift_audio` 1, LoRA on.** ~250 s,
-3.55 dB, +124 Hz. Against today's shipped turbo that is 1-2 dB and about half the centroid drift,
for no extra time. 0.5 is equally defensible.

**RULE FOR EVERY FUTURE ARM ON THIS BENCH:** two floors exist and only one was measured. A
cache-eviction floor answers "is this reproducible"; a SEED floor answers "is this difference
real". Significance here is ~0.9 dB, and a single-pair difference below that is not a finding.

## THE SECOND CORPUS IS CHOSEN: ref2v_ms_062.mp4 (Fabio, 2026-09-08)

`C:\Users\Fabio\Documents\Cubric Vision\Projects\cowboys\Media\ref2v_ms_062.mp4` - a
CLOSE-UP with voice, which is what the speech judgement needs. Fabio raised the distance problem
himself: on `ref2v_ms_004.mp4` the woman is far away and the turbo centroid boost is hardest to
judge there.

**What carries over unchanged** (probed, not assumed): 124 frames, 24 fps, 5.167 s, 32 kHz - the
SAME temporal grid as 004. So `level.py`'s hardcoded `JOIN = 5.167`, the 22-frame picture pin, the
24-frame audio pin and the `4 + 22/24` duration arithmetic all hold with no edit. That is luck
worth checking again if a third corpus ever appears - `JOIN` is a module constant.

### WHAT DOES NOT CARRY: RESOLUTION, AND THERE IS AN UNWRITTEN INVARIANT HERE

| | 004 (first corpus) | **062 (second corpus)** |
|---|---|---|
| resolution | 864x480 | **1920x800** |
| aspect | 1.800 | **2.400** |
| pixels | 414,720 | 1,536,000 (3.7x) |

Every arm hardcodes 864x480 in `#167`/`#168` (`MpiInt`), and on 004 that HAPPENED to equal the
source's own resolution. **Neither node resizes** - checked against the live `/object_info`:
`MpiLoadVideo` has no width/height inputs at all (it *outputs* them), and
`MiniMaxH3MotionContext` VAE-encodes `context_frames` exactly as handed to it. So the bench arms
carry an invariant nobody wrote down: **`#167`/`#168` must equal the source clip's resolution**, or
the pinned latent and the generation latent disagree.

**Three ways out, in order of preference:**

1. **Pre-resize 062 once with `ffmpeg` and point `#600` at the copy.** Keeps every graph shape
   identical, so the arms stay one-variable against each other. **960x400** is the pick: exact 2.4
   aspect, 0.93x A1's pixel count, so wall clocks stay roughly comparable to the whole ladder.
2. Insert an image-resize node between `#600` and `#601`. One more node in every arm, and it
   changes the graph the MpiNodes port has to match.
3. Generate at native 1920x800. **3.7x A1's pixel count on a 16 GB 4060 Ti** - expect it to be very
   slow or to OOM, and every timing on this card becomes incomparable. Not recommended for a
   measurement arm.

**Do not skip this and let it fail at dispatch:** `validate.py` will NOT catch it. It checks
classes, wiring and weight names against `/object_info`; a latent-size disagreement is a runtime
error, so the cost of getting it wrong is a full dispatch, not a second.

### THE SECOND CORPUS IS A NEW BASELINE FAMILY, NOT A CONTINUATION

Different source, different resolution and (if speech is added) a different prompt. **Nothing
measured on it is comparable to the -0.43 / -2.60 / -3.55 dB numbers**, which are all
`ref2v_ms_004.mp4` at 864x480. Re-establish the family's own reference point first - the
recommended turbo config, 10 steps and `shift_audio` 1 - and read every later arm against that,
not against the first corpus.

**Noted while checking:** `MiniMaxH3MotionContext` exposes an optional **`context_latent`** input,
described as "the previous clip's SAMPLER OUTPUT latent". That is the D4/D5 latent path the plan
wants built into the MpiNodes port from the start, and it is already reachable on the bench today.
Not needed for the speech work; recorded so the port does not rediscover it.

## PHASE 7a - THE SPEECH STAGE RAN ON CORPUS 2, AND THE PLAN'S RESIZE WAS WRONG (2026-09-09)

`validation.md` Phase 7a. First arm on the second corpus: `arm_speech_c2_10step.json`, the
standing recommendation (10 steps, `shift_audio` 1, turbo LoRA on, seed 591000591) with the
shouted line added. 400.6 s wall, success.

### THE 960x400 RECOMMENDATION IS WRONG AND COST A DISPATCH - USE 1152x480

The section above picks 960x400 for exact 2.4 aspect at 0.93x A1's pixel count. **400 is not a
legal H3 dimension.** `MpiH3ImageToVideo` declares `step: 32` on `width` and `height`, and
`#167`/`#168` feed them from `MpiInt` **links**, which bypass the widget that would have enforced
it. 400/16 = 25, an ODD latent grid, and the DiT's 2x2 patchify needs an even one:

    #153 SamplerCustomAdvanced RuntimeError:
    shape '[1, 24, 1, 1, 12, 2, 30, 2]' is invalid for input of size 36000
    wanted 24*24*60 = 34560, got 24*25*60 = 36000

**The invariant is NOT the one this plan wrote down.** The feared failure was source-vs-graph
disagreement; the two agreed perfectly at 960x400. The real rule is that **both dimensions must be
multiples of 32** - and the source must then be resized to match, so the pin still agrees.

Exact 2.4 aspect on a 32-grid leaves only **768x320** and **1152x480**. Picked 1152x480: it keeps
corpus 1's height, and the ECU of the man's eyes needs the detail. It costs 1.33x A1's pixel count
and ran 400.6 s against the ladder's ~250 s, so **wall clocks on corpus 2 are NOT comparable to the
first corpus's** - one more reason this is a separate baseline family.

### validate.py NOW CATCHES THIS CLASS - the handoff's warning is retired

`check_int_widget_limits` walks every `MpiInt` feeding a numeric widget and enforces the declared
`min`/`max`/`step` off `/object_info`. Proved by regenerating the failing shape and watching it
refuse:

    #472 MpiH3ImageToVideo.height <- #168 MpiInt 400: NOT a multiple of step 32 (nearest 384 / 416)

So "validate.py will NOT catch that mismatch" is **no longer true for the size class**. It still
cannot check that `#167`/`#168` equal the SOURCE's resolution - that needs an ffprobe of `#600`.

### 062 IS NOT A PLAIN CLOSE-UP: IT IS A TWO-SHOT WITH A HARD CUT AT 3.200 s

Read off its own sidecar, not assumed. Shot 1 is a POV from the wagon with the man riding
alongside, revolver out; **Shot 2 is an EXTREME CLOSE-UP of his eyes**, cropped above the brows and
below the bridge of the nose, finishing the line `...or I'll shoot.` The pins land clean:

| | window | vs the cut at frame 76.8 |
|---|---|---|
| picture pin, 22 frames | frames 102-123 = 4.250-5.125 s | after |
| audio pin, 24 frames | 4.167-5.167 s | after |

Both entirely inside Shot 2, so the extension continues ONE continuous shot and no pin straddles
the cut. **A bonus for this stage:** no mouth is in frame, so the shouted line is judged on voice
alone with no lip-sync confound. **A warning for any third corpus:** a source with a cut inside its
last second would put a scene change inside the pin, and nothing in the graph would say so.

### THE RESULT: THE INSTRUMENTS SAY THE AMBIENT BED DID NOT CONTINUE

Fabio's ear is the gate and it has the clip. What the instruments say, with the caveat that the
level step is meaningless once a shout is in the prompt:

| metric | reading |
|---|---|
| level step | **+6.86 dB** - uninterpretable, it averages a shout with whatever bed is under it |
| **floor** (new) | **-7.82 dB** - the extension's quietest window is 7.8 dB below the source's quietest |
| **range** (new) | **+13.72 dB** - the extension's p90-p10 is 13.7 dB wider than the source's |
| seam corr | **0.390**, 2/35 windows above 0.6 - "does not phase-track" (A1 on corpus 1 was 0.791) |
| luma | clean - worst 1-frame step 2.20, no flash or stall at the join |

The floor and the range are the two that matter and they agree: the extension emits the shout over
near-silence rather than over the hooves/tyres/wind bed the prompt asked for. **Picture continuity
is fine; the sound bed is what broke.** Whether that is our chain or is simply what H3 does with
speech in an extension prompt cannot be told from one arm - it needs a silent-prompt arm on this
same corpus as the family's own reference point.

## PHASE 7b - THE CUT-BACK WORKS, AND THE PLAN'S RESIZE ADVICE IS WRONG TWICE (2026-09-09)

`validation.md` Phase 7b. Fabio's question: 062 leaves a wide POV shot at 3.200 s and ends on an
eyes ECU. Can the extension cut BACK to that wide shot? His reasoning for why context matters, and
it is right: the wide shot cannot be re-invented from prose - horses, the lady, the road, the
light, the time of day.

**IT WORKS.** `arm_cutback_c2_10step.json`, `context_length` 56, `length` 158 (so new footage stays
102 frames and the arm is comparable to the approved one), 730.9 s. The extension cuts to the wide
POV on the FIRST frame it is free of the pin - a single-frame hard cut, frame-to-frame diff 56.29
against a 9.48 mean (5.9x), no dissolve - and carries the scene: the draft horse in harness at
frame left, the man on the dapple grey at right, the high downward angle, the road in motion blur,
the low warm light, the forearm on the rein bottom-right. It did NOT reproduce the revolver locked
out at the lens, which the prompt asked for; it took the framing and the scene, not the pose.

**56 was enough. The 124-frame experiment is unnecessary** - the pinned window straddling 062's cut
gave the model both the scene and an example of the edit, and it took them.

### THE RESIZE ADVICE IN "THE SECOND CORPUS IS CHOSEN" IS WRONG TWICE - IGNORE IT

Phase 7a already recorded that 960x400 is off the 32-grid. The deeper error: **no resize was needed
at all.** 1920x800 is ALREADY a legal H3 size - 1920/32 = 60, 800/32 = 25. The only real motive for
downscaling was VRAM and wall clock on the 4060 Ti, and the section presents it as a correctness
requirement. It is not.

**And the shipped flow does not downscale.** `comfy_workflows/flow_h3_extend.json` `#916`:

    ImageResizeKJv2   width = ['331', 5]   height = ['331', 6]      <- MpiLoadVideo's OWN w/h
                      divisible_by = 32    keep_proportion = 'crop'

It feeds the source's own dimensions back in and only CROPS to the 32-grid, never scales. 062 passes
through untouched at 1920x800 in the real flow.

**Consequence: every picture judgement on corpus 2 this session is at a resolution users never
see.** The cut-back result stands - it cut back and carried the scene - but the degraded face is a
bench artefact of a 1152x480 the product would not have used. **Corpus 1 is unaffected**: 864x480 IS
`ref2v_ms_004.mp4`'s native size, so the whole step ladder and `shift_audio` sweep are clean. **Any
future corpus-2 arm runs at native 1920x800 with no resize step.**

### context_length: THE DEFAULT IS 0.917 s, THE 56 CAP IS A DROPDOWN, AND IT SNAPS DOWN

Read off `/object_info` and `ComfyUI-H3-Motion-Context/nodes.py`, not assumed.

    context_length: (["22", "5", "39", "56"], {default: "22"})
    n = min(int(context_length), available)
    run = next(g for g in VIDEO_RUN_GRID if g <= n)
    VIDEO_RUN_GRID = (124, 107, 90, 73, 56, 39, 22, 5, 1)

* **Default is 22 frames = 0.917 s, not 2 s.** 56 = 2.333 s is the maximum offered and Phase 7b is
  the first arm ever to use it.
* It clamps to what the clip HAS, then snaps DOWN to the grid, and warns rather than erroring. A
  1.00 s source (24 frames) asked for 56 pins **22**, not 24. A 0.50 s source (12 frames) asked for
  22 pins **5**. Short sources lose context off a cliff.
* Why snap down: an off-grid count encodes to the same number of latent steps as the lower grid
  point, but those steps then cover the FIRST frames of the input rather than the last - the pin
  would end early and the join would jump.
* **The grid continues upward at 17m+5; the node "only offers up to 56" in its dropdown.** So the
  2.333 s ceiling is a UI cap, not a model limit. Combo values ARE enforced server-side
  (`execution.py:1071`, "Value not in list"), so reaching past it needs the node's list edited -
  and `ComfyUI-H3-Motion-Context` is bench-only and never enters `node_lock.json` (D6). **The cap
  is ours to choose in the MpiNodes port.**

### A CONSTRAINT THE PORT MUST DESIGN AROUND: context_latent CANNOT SERVE AN IMPORTED VIDEO

`context_latent` is documented as skipping the decode/re-encode that costs quality at every join,
and D4/D5 wants it in the port. But it needs **the previous clip's SAMPLER OUTPUT latent**. A user
who imports a video has no such latent - you would VAE-encode its pixels, which is the same round
trip. **So the latent path only helps CHAINED extensions from our own pipeline**, and the pixel path
has to stay for imported media. Design for both, not one.

### THE BENCH AND THE SHIPPED FLOW ARE DIFFERENT ARCHITECTURES

| | transformer | context mechanism |
|---|---|---|
| bench arms (all session) | **fl2va** | `MiniMaxH3MotionContext` |
| `flow_h3_extend.json` (runtime AND raw) | **ref2va** | `MpiH3References` + `MiniMaxH3AddGuide`, last 39 frames |

**The FL2VA swap has NOT landed** - both the runtime and raw shipped flows still load
`minimax_h3_ref2va_pruned_int8_convrot`. Making it land is a transformer AND mechanism change, and
the reference path must be REMOVED rather than left unused: fl2va does not error on references, it
samples fine and silently ignores them (`docs/models/h3/ref2va.md`).

## THE CONTEXT DEFAULT IS 56, NOT 22 (Fabio, 2026-09-09)

Fabio's call: the extend should pick up **about 2 seconds** of the previous clip by default, and
fall back to whatever is there when the clip is shorter - the behaviour he remembered from LTX.

**LTX's actual rule, read off `flow_ltx_extend.json` rather than memory:**

    #23  MpiMath   floor((a-1)/8)*8+1     a = MpiLoadVideo frame_count   (the WHOLE clip)
    #24  MpiClamp  min 1, max 73

So LTX takes the entire source, snaps it to its own 8k+1 latent grid, and caps at **73 frames -
3.04 s at 24 fps**, not 2 s. It is not user-exposed. Short clip: it takes what is there.

**That is the same algorithm H3 already runs.** `MiniMaxH3MotionContext` does
`n = min(request, available)` then snaps DOWN to `VIDEO_RUN_GRID`. The take-what-you-can fallback
Fabio wants is already built in - only the DEFAULT is wrong.

**2 s is not reachable on H3's grid** (48 frames is off it). The neighbours are 39 = 1.625 s and
**56 = 2.333 s**. Pick **56**: nearer 2 s, and nearer LTX's cap in spirit. It is also the value
Phase 7b proved carries a scene across a shot change.

**A live inconsistency for the port to resolve:** the SHIPPED flow does not use that clamp at all.
`flow_h3_extend.json` `#902 GetImageRangeFromBatch start_index=-1, num_frames=39` is a hard 39
frames with **no clamp against a short source** - a clip under 39 frames has untested behaviour
there. Three different context rules exist right now:

| | rule | at 24 fps |
|---|---|---|
| LTX extend (shipped) | `min(whole clip snapped to 8k+1, 73)` | up to 3.04 s |
| H3 extend (shipped) | **fixed 39, no clamp** | 1.625 s |
| H3 bench (`MotionContext`) | `min(request, available)` snapped to the run grid, default 22 | 0.917 s, max 2.333 s |

The port should land on one rule: default 56, clamp to available, snap down.
