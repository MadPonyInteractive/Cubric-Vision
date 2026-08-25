# MPI-621 Plan — Draw It In, rebuilt Klein-only

Design, evidence and both measured sizing rules live in `brief.md`. This file is the
build order and the session's running notes. **Do not re-derive the measurements.**

## Current State

**Phases 1-3 are DONE and verified; phase 4 is done as far as an agent can take it.** The graph
is rebuilt and validates, the app surface is swept, the docs are rewritten, and 5 live runs on
the local engine across 4 cases all came back structurally correct - evidence in
`validation.md`. `npm test` 729/729, `npm run test:desktop` 26/26, lint clean,
`release:check` passed.

**DoD item 6 happened, and it found a real defect.** Fabio's vintage plate came back with a
visible seam: the model RESTORES a faded photo, so the returned patch is de-faded and
re-contrasted relative to its surroundings. A bigger box did not help, and a feather cannot -
it is a whole-patch shift, not an edge artefact. Fixed by a `ColorMatch` before the stitch,
simulated offline on his own output and then verified live (top-edge step 3.60 -> -0.20).
Graph is 35 nodes now.

**CONFIRMED 2026-08-25.** He re-ran the vintage case as `flowScribObj_020` and the seam is
gone - "oh wow! It really does fix it." That was DoD item 6, and all six are now met.

**Next action: `/mpi-end-session`.** There is no build work left on this card. Handed off
rather than closed only because the session context was at ~450k.

Things a fresh session would not guess:

- **`MpiMath` already existed**, so the derived crop needed no new node and no `node_lock.json`
  pin bump. The whole "which node computes the factor" question was a non-question.
- **Seam severity tracks the PLATE'S GRADE, not the background's uniformity.** Every plate an
  agent is likely to reach for is a modern-looking render, where the model's default look
  already agrees with the photo - so the seam measures ~2/255 and reads as solved. Test a
  vintage/graded plate before believing it.
- **`safe_math` has no `max()`** - it whitelists `math.*` only, and an unknown call is caught
  and returned as **0.0 silently**, which would collapse the crop onto the box with no error.
  The floor is a nested conditional expression instead. This is the single sharpest trap in
  the change.
- **Every `MpiLoadImageFromPath` reports a preview into `/history` `outputs`.** Taking
  `imgs[0]` gets the INPUT PHOTO, so the first verification read "the flow changed nothing"
  when the flow was fine. Read node 146 by id.
- The paint layer for the sweep's plate can be REBUILT by diffing
  `Untitled/Media/paint_001.png` against `t2i_005.png` - it reproduces the brief's 51x75 bbox
  exactly. Harnesses are in this session's scratchpad (`runflow.js`, `checkflow.mjs`,
  `makelayer.mjs`, `smallscribble.mjs`).

## The decision that unblocked the build

`MpiMath` already ships in `ComfyUi-MpiNodes` (safe python expression, `a`/`b`/`c` in,
`*` out) and is present on the APP engine at the pinned commit — verified against
`127.0.0.1:48188/object_info`, not just the bench. So the per-run derived crop is three
nodes that already exist. **No sibling-repo node work, no `dev_configs/node_lock.json`
pin bump.**

```
MpiMaskSquareBbox(drawn region, padding 0) -> size S
MpiMaskSquareBbox(box mask,     padding 0) -> size B
MpiMath(a=S, b=B, "1.0 if b <= 0 else (4.267*a/b if 4.267*a/b > 1.0 else 1.0)")
                                           -> context_from_mask_extend_factor
```

`4.267 = 1024 / 240`. Crop side lands at ~4.27x the drawn bbox, so the scribble measures
~240px after the crop node's own normalise — the WIDEST crop still above the measured
~200px anchor threshold, which is what `brief.md` says to pick (tone drift is worse from a
very tight crop).

**But context is NOT the lever for the vintage-plate seam** — Fabio tried a bigger box and it
changed nothing, because the model is not missing reference, it is correcting the photo. That
one is the `ColorMatch`, not the crop. Do not conflate the two.

Read out of `inpaint_cropandstitch.py` rather than assumed:

- `context_from_mask_extend_factor` grows the **mask** bbox by the factor in every
  direction (`batched_growcontextarea_m`), then `combinecontextmask_m` unions the
  optional context mask, then `crop_magic_im` grows the region to the TARGET ASPECT and
  resizes to exactly `output_target_width x output_target_height`. With a 1024x1024
  target the crop is always square, so crop side = `f * max(box_w, box_h)`.
- Therefore node 162 must STOP feeding `optional_context_mask`. A union there would
  re-widen the crop and defeat the derivation. It is repurposed to measure the box.
- The `1.0` floor is honest, not defensive: when the user's box is already wider than the
  ideal crop, the crop IS the box and anchoring degrades. Nothing can shrink below the
  region that has to be returned. It is written as a conditional because `safe_math`
  REFUSES `max()` — see the trap in Current State.
- `comfyController._inject` skips any input that is a link, so the derived value cannot
  be clobbered by the param spray.

## Phases

### Phase 1: Rebuild the graph

Author `comfy_workflows/raw/flow_draw_it_in.json` (LiteGraph), convert to the API twin,
verify. Agents may author `raw/` directly (`docs/workflow-authoring/converters.md`); the
converters hard-refuse to write inside it.

- Delete the render phase: nodes 5, 7-16, 19-25, 27-35 (SDXL, ControlNet-Union, both AIO
  preprocessors, rembg, the flat paste) and the LanPaint half (164, 165, 167) plus both
  LoRA racks (171-182).
- Repurpose node 6 `ImageCompositeMasked` to composite the paint layer onto the PHOTO
  instead of a flat white background. That composite is what Klein sees.
- Repurpose node 4 -> `MpiMaskSquareBbox(drawn region, padding 0)`; node 162 ->
  `MpiMaskSquareBbox(box mask, padding 0)`; add the `MpiMath`; wire it into
  `InpaintCropImproved.context_from_mask_extend_factor`.
- Klein branch mirrors `klein_9b_t2i.json`'s PLAIN edit path (its nodes
  167/163/172/170/171/173/169/185): `ImageScaleToTotalPixels 1MP -> VAEEncode ->
  ReferenceLatent -> CFGGuider(cfg 1) + Flux2Scheduler(steps 4) ->
  SamplerCustomAdvanced(euler) -> VAEDecode -> InpaintStitchImproved`. No
  `SetLatentNoiseMask`, no LanPaint, and no `FluxGuidance` — in the reference graph that
  node feeds only the masked branch.
- New instruction text carrying the six properties from `brief.md`, concatenated with
  the user's own prompt (reuse the `StringConcatenate`).
- **Verify:** `node scripts/verify-workflow.mjs` on the converted graph, and every
  `Input_*` title the op injects still resolves to a node.

### Phase 2: App surface

- `flowsRegistry.js`: ONE model slot (`klein-9b`), no LoRA rack, drop the
  `Input_Control_Net` and `Input_Control_strength` fields, rewrite the paint-step hint
  (the ~96px ControlNet ink floor does NOT carry over — the crop manufactures
  resolution) and keep the box-step shadow-room copy, which the stitch measurement now
  puts a number under.
- `operationRegistry.js` + `operation_registry.json`: `flowScribObj` `1.0` -> `1.1`
  (parameters removed). Nothing in the app reads `latestVersion`; the mirror check does.
- `commandRegistry.js` and `universal_workflows.js`: comments only — `mediaInputs`, the
  `headSwap` box injector and the op key are all unchanged.
- Sweep the tests that assert the two-slot arrangement: `flow-model-choice.test.cjs`
  (incl. its NAMED control-strength exception, which this flow no longer needs),
  `inject-params-titles.test.cjs`, `flow-result-compare.test.cjs`.
- **Verify:** `npm test`, `npm run test:desktop`.

### Phase 3: Docs

Rewrite `docs/playbooks/add-flow/existing-flows/scribble-to-object.md` against the new
architecture. It is 351 lines today, over the 200-line budget and not exempt — the
rewrite deletes a whole phase, so bring it inside budget rather than flagging it again.

- **Verify:** the doc names no node the graph no longer has.

### Phase 4: Live verification

Per `brief.md` DoD item 4, judged on the BOX REGION ONLY (a wider crop hallucinating at
its margins is free):

1. the beach plate that the sweep was measured on,
2. one small/distant subject,
3. one deliberate style mismatch ("a cartoon man..." into a photoreal scene).

`/connector/generate` CANNOT run this (any op with an image slot returns
`MEDIA_UNSUPPORTED`). Run against the LOCAL engine on `127.0.0.1:48188` — `/proxy/*` is
the REMOTE forwarder. The GPU lease binds direct POSTs to `48188/prompt`.

- **Verify mode:** `user-ux` — the last call on a generated picture is Fabio's.

## Remaining Work

- **One re-run of the vintage case through the fixed graph.** That is all.

## Plan Drift

- 2026-08-25: the brief's LAST open question ("does the upscale smear survive at the tight
  end?") got answered incidentally by phase 4 rather than being left open - a 7.3x crop
  upscale stitches back cleanly on textured ground. What DOES show is Law 2 over sky/water.
  Both written into `validation.md`.

- 2026-08-25: `brief.md` names `context_from_mask_extend_factor` as "THE open
  measurement". It was closed in the previous session and the answer moved: the
  governing variable is the scribble's pixel size after normalise, not the factor. The
  factor is merely how the graph reaches it, and is now derived per run.

## Completed

- **Phase 1 - the graph.** 68 nodes -> 34. Deleted the SDXL render phase, rembg, the flat
  paste, LanPaint, `SetLatentNoiseMask` and both LoRA racks. Repurposed node 6 to composite the
  drawing onto the PHOTO, node 4 and node 162 to measure the drawn bbox and the box, and added
  `MpiMath` + the Klein 9B plain edit chain cloned from `klein_t2i_template.json`. Authored in
  `raw/`, converted against 48188, verified.
- **Phase 2 - the app surface.** One model slot (klein-9b), no LoRA rack, both ControlNet
  fields gone, hints rewritten, op `1.0 -> 1.1` in both registries, comments in
  `commandRegistry` / `universal_workflows`. Four test files swept - and two of their tests
  MOVED rather than being deleted: the per-phase LoRA rack pin and the two-candidate picker
  fixture both went to the character sheet, which is now the two-phase flow.
- **Phase 3 - the docs.** `existing-flows/scribble-to-object.md` rewritten (351 -> 200 lines).
  Also swept two docs the rebuild made factually WRONG: `blending-into-a-photo.md` (Law 1 does
  not generalise to a generating edit model; the control-strength section no longer applies
  here) and `ui/paint-gizmo.md` (it described the paint layer feeding a ControlNet hint).
- **Phase 4 - live.** 5 agent runs across 4 cases, all bit-exact outside the box, plus Fabio's
  3 runs in the app which found the vintage-plate seam. Fixed with a `ColorMatch` before the
  stitch, simulated offline then verified live. Details: `validation.md`.

## Noticed, not actioned

- **MPI-596 (Object Stamp)** is still a ready `todo` card while `brief.md` marks it
  SUPERSEDED and says the two flows may converge into one. Board question for close-out,
  not build work.
