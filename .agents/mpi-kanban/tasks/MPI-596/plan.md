# Object Stamp — place a specific object from one photo into another

Design settled in [brief.md](brief.md); the two baked prompts and the rules they obey are in
[prompts.md](prompts.md). **Run `/mpi-add-flow`** — it enforces `docs/playbooks/add-flow/`, and
this plan does not restate it. Graphics are a separate `/mpi-flow-graphics` pass.

> **READ FIRST, in this order:** `brief.md` (the seven measured laws — every one of them cost real
> runs), `prompts.md`, then `docs/playbooks/add-flow/existing-flows/scribble-to-object.md`. This
> flow is Draw It In's architecture with the scribble replaced by an object, so that file is the
> closest worked example and most of its traps apply unchanged.

## Current State

Project mode: `scalable-foundation`. Card is in `doing`.

**The graph is authored and proven on the bench** (2026-08-26, 18 runs on 8188). It is
`flow_draw_it_in.json` **patched**, not rebuilt — crop/stitch, the six `Input_Lora_Phase1_*`
slots, the 9B checkpoint and `qwen_3_8b_int8_convrot` all carry over untouched. The one
structural change is a second `ReferenceLatent` (node 203) chained after 108, plus a second
`InpaintCropImproved` (node 210) that crops the **clean scene to the same region** — that
second crop is law 7 and is what stops the doll's-house failure. Proven API graphs are saved
here as `graph-bench-auto.json` / `graph-bench-manual.json`; both were run end to end.

**Canonical crop config (law 8):** `context_from_mask_extend_factor` = **1.0**, write-back grown
with `mask_expand_pixels` at **~30% of the box side**. Canvas == region written back, so an object
larger than the box cannot be sliced and its shadow has room. App-side that 30% comes off
`MpiMaskSquareBbox.size` through an `MpiMath` (it is an INT input).

Next action: build the stage-2 step kind. Nothing app-side has been written yet. The bench was
stopped at the end of the session - restart it (`G:/ComfyUi/run_nvidia_gpu.bat`, port 8188) only
if more graph work is needed; the stage-2 step does not need it.

**Two bench-only deviations must NOT reach the shipped graph:** `MpiClearVram` (node 170) was
dropped to keep the checkpoint resident, and the seed is pinned. Both are in the saved graphs.

### What the live session already settled (so it is NOT open work)

| Question | Answer | Evidence |
|---|---|---|
| Architecture | Klein 9B edit, Draw It In's topology | ~25 runs, `events.jsonl` 2–12 |
| Model | **9B only, 4B tested and failed** | Fabio, 2026-08-26 |
| Reference count | **Two, never three** | 3 refs drew two guns |
| Auto config | slot 1 clean scene, slot 2 stamped composite | passes mug + logo + cup |
| Manual config | slot 1 cropped scene, slot 2 clean object | the run that fixed the gun |
| Baked prompts | both written, in the 40–120 word band | `prompts.md` |
| Aspect-fit fork | **dead** — nothing is pasted, so nothing needs fitting | brief.md § dropped designs |
| Perspective/warp gizmo | **dead** — the stamp is a hint, not a paste | brief.md law 2 |

### The one contract change

A step gets exactly **one** media today — `out.find(m => m?.role === step.role)`, in both
`_buildStepSlide` and `_deriveRunMedia` (`MpiBaseFlow.js` ~1329 and ~2265). A step bound to
`image1` therefore cannot see `image2`, which this flow needs.

Add **`sourceRole`** to the step declaration, mirroring the existing `mediaRole` that already
routes a kind's *output* to another role. Symmetric, two `find`s and a prop. Do NOT reach for a
bespoke component instead — MPI-572 deleted that surface and a third-party Flow can never ship
one.

## Implementation

- [x] **Author and prove the graph on the bench FIRST** (port 8188; the app engine is 48188).
      Draw It In's topology with the scribble swapped for the object:
      `composite → InpaintCropImproved (mask = the placed bbox) → Klein 9B edit → ColorMatch →
      InpaintStitchImproved`. Both modes are the SAME graph — only what lands in the two
      reference slots differs, plus which prompt is baked.
      **Verify:** a real bench run per mode; a vintage plate to confirm `ColorMatch` is earning
      its place. Mind that Klein's edit pass CHANGES DIMENSIONS (snaps to ÷32, axes scale
      unequally), so any composite-back must resize to the base.
- [x] **Settle crop sizing on the bench.** Answered, and not as expected: with both references
      cropped to the same region, crop size is a quality dial, not a guard — 155px through full
      frame all produced correct placements. The shipped config is **factor 1.0 + a write-back
      grown ~30%** (law 8), NOT Draw It In's `4.267` — that constant sizes the crop, which is now
      pinned. The real requirements are law 7 (matched framing) and law 8 (canvas == write-back);
      see `brief.md` and `events.jsonl` findings 13–19.
- [ ] **Build the stage-2 step kind** (`MpiStepPlace` or similar): `ShapeManager` in `'place'`
      mode + the Remove Background branch + an add/subtract alpha brush + `UndoStack`. Mount the
      History engines whole, exactly as `MpiStepPaint` mounts `PaintManager` rather than growing
      a second brush. Keep **`bgMask` and `userMask` as two layers**, composited only at
      dispatch — flatten them and toggling Remove Background destroys the user's erasures. The
      brush must work with the toggle OFF (for sources BiRefNet whiffs entirely).
      Returns ONE composited RGBA through the existing `STEP_MEDIA` adapter.
      **Verify:** toggle off→on preserves erasures; Ctrl+Z covers every mask mutation.
- [ ] **Add `sourceRole`** to the step contract (above). **Verify:** a step on `image1` receives
      `image2`; existing flows unaffected.
- [ ] **Wire the flow.** `FlowDef` in `flowsRegistry.js` + the op in its 4 files per
      `01-descriptor-and-ops.md`. Copy Draw It In's `requiredModels` **slot** shape
      (`{ label: 'Edit model', models: ['klein-9b'], loras: true }`) and its `modelParams` —
      **the CLIP arm moves with the checkpoint** (9B needs `qwen_3_8b_int8_convrot`; 4B's
      encoder dies with a shape error that reads as a sampler bug, MPI-600), and
      `Input_Edit_Clip.clip_name` needs the **dotted** form while `Input_Edit_Model` stays plain.
      Declare `result: { compare: 'image1' }`. Declare the Manual prompt **on the step and
      nowhere else** — restating it in flow `fields` silently drops edits from the second run on.
      **Verify:** `tests/inject-params-titles.test.cjs` case + `node --check`.
- [ ] **Live-run both modes in the app**, including reuse across restart.
      **Verify:** `05-verify.md`'s Definition of Done. `npm test` **and** `npm run test:desktop`
      — green unit tests are not the CI gate.
- [ ] **Announce it** in `docs/releases/UNRELEASED.md`: the roster list **and** its own entry.
      Closing agent's debt, not the next session's.

## Remaining Work

All of the above. Graphics are a separate pass — and the ~25 runs already in the
**Stamp Flow Tests** project are the plate material, so nothing needs re-generating for the
tile or hero (`06-preview-image.md` § Plates).

## Verification

**Verify mode:** user-ux. The mechanical half self-verifies (inject test, `node --check`, a run
completing), but whether the object still reads as *the user's object* is Fabio's call — that is
the flow's whole claim.

## Preservation Notes

- Add `docs/playbooks/add-flow/existing-flows/object-stamp.md` — one file per flow is the
  convention, and it is where the six laws, the crop sizing and the Auto/Manual split belong.
  Promote the generalisable half (identity-vs-viewpoint, the three-reference limit, the
  full-frame-reference rule) into `blending-into-a-photo.md`, which already names this card.
- **NEVER write `preview`/`video` into the FlowDef before the files exist** — a declared name
  with no file 404s and `tests/desktop/flows-tab-ring.spec.js` asserts a clean console. It held
  master red for a day and eight pushes. ABSENT is the correct state while art is missing.
- **Commit the art before anyone runs `scripts/sync-raw-workflows.mjs`** — its guard refuses on
  any dirty path under `comfy_workflows/` outside `raw/`, and blocks a peer's sync with a
  message naming neither your file nor art.
- No app version bump for the Flow; a NEW op sets `appVersionIntroduced` in both op registries.

## Plan Drift

### 2026-08-26 (bench) — the cut-off object, spotted by Fabio in the bench outputs

A Manual run came back with the gun sliced clean through the grip. Cause: the stitch writes back
only the **box** while the model paints the whole **crop** (law 8). Fabio proposed fixing it in
the prompt; tested as one clause on measured evidence, and **rejected** — it changed 2.2% of
pixels and the cut stayed, because the model is already keeping the object whole inside its own
frame. The fix is geometric (factor 1.0 + a grown write-back), and it **supersedes the previous
entry's advice to ship `4.267` as the default** — that constant sizes the crop, which is now
pinned.

### 2026-08-26 (bench) — the crop question was the wrong question

The plan expected crop sizing to be the hard part and predicted a context factor derivation that
"does not transfer". Both halves were wrong. Draw It In's `4.267` transfers fine, and crop size
barely matters once the *framing* is right. What actually breaks the flow is passing any
reference at a framing the output does not have — Auto's full-frame clean scene against a
cropped output frame returns a miniature room inside the table. That is now law 7 in
`brief.md`, and it cost four failed runs that all read as "the crop is too tight".

Also settled here: `ColorMatch` is inert on a modern plate (mean delta 0.032/255) — keep it for
the vintage case, but do not credit it. Still wandering: object colour fidelity across crop
sizes; recorded, not blocking.

### 2026-08-26 — the aspect-fit fork closed, then became irrelevant

The original plan's one fork was aspect-preserving fit into the box, expected to need a new
`MpiFitInBox` node plus a `node_lock` pin. It needed neither: `ImageResizeKJv2`
(`comfyui-kjnodes`, already pinned) runs `ratio = min(width/W, height/H)` verbatim, carries a
mask through the same scale, and returns the fitted size as INTs — confirmed in the **shipped**
engine via `/object_info` on 48188, not just the bench.

Then the redesign made it moot: **nothing is pasted, so nothing needs fitting.** Recorded only
so the fork is not re-opened. Two traps kept in case the node is ever wanted: `divisible_by`
defaults to **2** (set 1), and `keep_proportion: "pad"` fills the padded mask with **ones**, so
the pad region would composite as object.

### 2026-08-26 — the card was superseded, and the whole design was rebuilt live

MPI-621 had marked MPI-596 superseded and left "may not need to be a separate flow at all" as a
board question for close-out that nobody answered — so the card sat in `todo` describing a route
its own repo had measured as worse. Resolved this session: it stays a separate flow, on Draw It
In's architecture, with an Auto/Manual split that has no equivalent in the sibling.

Design 1 and design 2 and why each died are in `brief.md`; the twelve findings, including two
predictions of mine that were measured wrong, are in `events.jsonl`.
