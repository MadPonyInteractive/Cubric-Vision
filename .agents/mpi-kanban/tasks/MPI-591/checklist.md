# MPI-591 Checklist

Derived from `plan.md` phases 2026-08-31. Each phase has one gate in the plan;
do not tick an item until its gate is green.

- [x] 1 — Bench: seam proven on `ref2va`. **GATE PASSED by Fabio 2026-09-01 on arm
      F2** — and the route is NOT the E/G masked prefix this line used to name. F2 is
      stock `MiniMaxH3ReferenceToVideo` generating the new frames only, the source's
      last frame pinned with `MiniMaxH3AddGuide`, the source's audio in as
      `ref_audio_1`, and a PIXEL join. Nothing is written into the denoised latent, so
      the sparkle cannot occur: flash 1.05 mean / 2.03 worst against E/G's 5.37/18.51,
      seam 0.94x against the oracle's 1.40x, audio 0.973 band cosine. Thirteen arms in
      total. The masked-prefix route is dead for v1 (its nodes stay in MpiNodes,
      shipped and unused by this Flow), and with it the sparkle defect leaves this
      card's path.
- [x] 2 — The nodes in `ComfyUi-MpiNodes` (`h3.py`, sibling repo at
      `c:\AI\Mpi\ComfyUi-MpiNodes`, NOT covered by this card's `files.json`).
      `MpiH3MaskedPrefix` `f6d2484`, `MpiH3EncodeAV` `952919f`, changelog + README
      `53c0198`. Both verified REGISTERED on a live restarted bench, and the encode
      proven **bit-identical** to the pack's (`PSNR y:inf`). **Pin bumped off
      `5e07043` to `53c0198`**, archive URL 200. Gate green.
      Carried forward: `MpiH3MaskedPrefix` has an OPEN sparkle defect (see plan) —
      it does not block the pin, because no shipped graph calls it until Phase 3.
- [x] 3 — The workflow file `comfy_workflows/raw/flow_h3_extend.json` + API export,
      33 nodes, arm F2's graph. No `Input_Negative` node — the new test asserts its
      ABSENCE, not just the presence of the rest. Gate green:
      `tests/inject-params-titles.test.cjs` 22/22, `verify-workflow.mjs` and
      `validate-injection-rules.mjs` both ✓ against **48188** (the shipped engine),
      raw → API round trip **0 differences**, and the graph RAN on the bench in 70 s
      (94 frames, seam 0.65x, generated audio 0.989 vs source).
- [x] 3b — fps. Done 2026-09-01. `force_rate` on `MpiLoadVideo` (`f1ed110`, pushed,
      pin bumped off `53c0198`, archive 200), `Input_Video.force_rate = 24` and
      `MpiSaveVideo.fps` a constant 24. **Two corrections to what the plan specified:**
      the widget is `optional`, not `required` — a required input missing from an API
      prompt is a hard `required_input_missing` and eleven shipped graphs call this node
      without it (all eight other API graphs re-verified green); and the resample is
      `-vf fps=N`, not the output `-r N`, which overshoots by 4.6% on a 30 fps source.
      Gate green: raw round trip **0 differences** against the engine that has the node
      (48188 reports the one stale-pin `force_rate` line and nothing else), and a bench
      run on a deliberately 30 fps source — 94 frames at a true 24 fps, seam 0.22x,
      generated audio 0.991, source half within 8.3 ms (0.51%) of its own duration
      against 25% slow without it. Full evidence in `validation.md` § Phase 3b.
      **Carried forward: 48188 is still on the old pin.** It is the live app's engine, so
      this session did not restart it — Phase 5 needs Fabio to restart the app first.
- [x] 4 — Wire the pick. Done 2026-09-01. `byModel` on `flowLtxExtend`
      (`universal_workflows.js`), `getUniversalWorkflow(key, modelIds)`
      (`modelRegistry.js`), `flowModelIds` threaded through the `runCommand` payload
      (`generationService.js` — a FIFTH file the plan's table missed; that payload is a
      whitelist, the exact hop MPI-504's `loraModelId` was lost at), the executor
      resolving with it (`commandExecutor.js`), and the slot
      `[{ label: 'Model', models: ['ltx-23-balanced', 'minimax-h3-ref2va'] }]`.
      **The candidate is `minimax-h3-ref2va`, NOT `minimax-h3`** — the card's original
      text predates Phase 1's pivot to ref2va, and the shipped graph bakes the ref2va
      transformer and its ref2v turbo LoRA. Gate green: `flow-model-choice` 23/23 with a
      new MPI-591 test, `npm test` **853/853**, `eslint js/` clean, `node --check` clean
      on all five. The new test was mutation-checked twice — it goes red when the executor
      drops the ids, and red on the fl2va id with the exact
      `no dependency of that model supplies` message.
      **Carried forward:** the `negative` box still SHOWS on the H3 arm and does nothing
      there. MPI-664 shipped `hiddenWhen`, but its rule keys on another FIELD's value, not
      on the picked model — extending it is the one-line follow-up the plan names.
- [x] 4b — TURBO OR NOT. Done 2026-09-01. `#908 Input_is_Turbo` drives THREE `MpiIfElse`
      (#910 SigmaShift vs #909 EasyCache, #912 beta/6 vs #911 simple/25, #914 euler vs
      #913 res_multistep) plus #915 `MpiMath '1.0 if a else 0.2'` on the shared LoRA's
      strengths. **Three corrections to what this line said:** it is THREE `MpiIfElse`,
      not four — the donor's #417/#416/#414 feed a `SplitSigmas` this single-stage graph
      does not have; the port REORDERS the proven turbo chain, because #457 is one shared
      LoRA node so the gate must close before it (`497 → 454 → IfElse → 457`, where the
      graph shipped `497 → 457 → 454`); and `hiddenWhen` DID get its model rule rather
      than shipping a dead control — `{ model }` / `{ modelNot }` in `declaredFields.js`,
      which also takes the `negative` box off the H3 arm at last. Default stays **Turbo**.
      Gate green: raw round trip **0 differences**, both validators ✓ against 8188 AND
      48188, `npm test` **872/872**, three mutants killed on real assertions, and one
      bench run per arm — turbo **69.5 s** (vs the 70 s baseline, so the reorder cost
      nothing) seam 0.327x, non-turbo **102.3 s** (+47%) seam 0.333x. Full numbers in
      `validation.md` § Phases 4b + 4c.
      **Carried forward:** the non-turbo arm's generated half carries ~2x the
      frame-to-frame luma energy of turbo's. A luma diff cannot separate more DETAIL from
      more FLICKER — Phase 5 must look at a non-turbo extend, not only a turbo one. Also
      `PromptBoxControls.h3Turbo` defaults turbo OFF on the H3 MODEL surface for a
      documented quality reason; the two surfaces now disagree on purpose.
- [x] 4c — THE STITCH REFUSED ANY SOURCE THAT WAS NOT 32-DIVISIBLE. Fixed 2026-09-01. Found
      2026-09-01 from Fabio's question "the video does keep the same resolution as the
      input video, right?", and REPRODUCED on the bench with no model in 10 s:
      `ValueError: Source and new images must have the same shape: torch.Size([720,
      1280]) vs torch.Size([704, 1280])`. The generated canvas is snapped by `MpiMath`
      #900/#901 (`floor(a/32)*32`) but #904's `source_images` comes STRAIGHT from the
      loader, unsnapped — so 1280x720, 1920x1080 and 1080x1920 all raise, and only a
      source that is 32-divisible on BOTH axes survives. Every arm ran on 640x352, which
      is why nothing caught it. **The fix is already shipped in the sibling flow**:
      `flow_ltx_extend.json` #28 is an `ImageResizeKJv2` (`keep_proportion: 'crop'`,
      `divisible_by: 32`, `crop_position: 'center'`) and its stitch reads `source_images`
      from THAT, not from the loader — a donor clone, not new design. **Fabio picked CROP**
      (2026-09-01), so the LTX node was cloned as `#916` with `keep_proportion: 'crop'`,
      `divisible_by: 32`, `crop_position: 'center'`. **The plan named ONE unsnapped
      consumer and there were TWO** — `#902 Last Frame` also read the raw loader, so the
      frame `MiniMaxH3AddGuide` pins would have been 1280x720 against a 1280x704 canvas.
      Both now read `#916`. `#900/#901` are DELETED rather than kept: the resize node
      reports the snapped size it actually produced, so a second independent `floor()`
      could only disagree. Gate green: a real bench run on `mpi591_src720p.mp4` returns
      **1280x704, 94 frames, 24 fps** with no `ValueError`, seam 0.104x — and the source
      half is proved to be a CROP, not a rescale, at **PSNR 44.3 dB** against ffmpeg's own
      centre crop versus **27.5 dB** against a lanczos rescale.
- [ ] 5 — Verify in an isolated app. Gate: Fabio watches one H3 extend end to end.
      **Part 1 done 2026-09-02 (everything that needs no GPU), and it FOUND A REAL BUG.**
      `hiddenWhen` on a STEP field had never worked: `_buildFieldsRow` neither registered
      its nodes in `_liveFields` nor called `_paintFieldConstraints`, and the painter
      skips an unregistered id in silence — so the `Avoid` box stood on the H3 arm exactly
      as before 4b, while `Input_is_Turbo` worked only because it is declared flow-level.
      Two lines in `MpiBaseFlow.js`; **both halves mutation-killed** by the new
      `tests/desktop/flow-step-field-hidden.spec.js`, and a third mutant survived first
      and corrected the fixture (`kind: 'fields'` routes to the OTHER builder). Verified
      on real pixels: `Avoid` `hidden:true, offsetHeight:0`, Turbo still h=34.
      `npm test` 878/878, `flow-*.spec.js` 13/13, `eslint js/` clean.
      MPI-666: checks 3, 4, 5 PASS in the app; 1 and 2 are unreachable here because H3 is
      installed, so the flow is available and the licence chip branch never runs — covered
      by `flow-licence-surface.test.cjs` 6/6 instead. Pick is session-only: confirmed held
      across a reopen, gone across a reload, reads as intended.
      **BLOCKER FOUND: LTX 2.3 is no longer on disk** (`G:/CubricModels/diffusion_models/`
      has both H3 DiTs and no LTX transformer), so "pick LTX and run: unchanged" cannot be
      run without a ~20GB re-download. Everything else about the LTX arm is stubbed-model
      tested and needs no weights.
      **Left: the two real extends (turbo + non-turbo) and Reuse Prompt — Fabio's gate.**
- [ ] 6 — Docs: `existing-flows/ltx-extend.md` + `any-of-models.md`.

## Phase 1/2 ordering — decided 2026-08-31

The plan's Phase 1 says "build the masked-prefix graph by hand". It cannot be
built from existing nodes: a live `/object_info` probe on the bench (core 0.34.2)
shows no node composing a masked prefix — core has `MiniMaxH3AddGuide`,
`MiniMaxH3ReferenceToVideo`, `EmptyMiniMaxH3LatentAV`, `MiniMaxH3SigmaShift`, and
ours are only `MpiH3Length` / `MpiH3References`. `MiniMaxH3VideoExtend` and
`MiniMaxH3EncodeAV` are fork-only.

So the Phase 2 node is written FIRST, directly in `ComfyUi-MpiNodes/h3.py`, which
is symlinked into the bench `custom_nodes/` and therefore live on restart. Phase 2
then reduces to commit → push → pin. Fabio approved 2026-08-31; that approval is
also what moved this card into `doing` at Phase 1 rather than Phase 2.

## Phase 1 running notes

Bench = `G:\ComfyUi\ComfyUI` on `:8188` (PID confirmed by CommandLine, not by
port alone). Bench writes to `D:\WORK\Images\Outputs`, never `<ComfyUI>\output`.
