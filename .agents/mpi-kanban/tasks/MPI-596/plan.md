# Object Stamp — place a specific object from one photo into another

Design settled in [brief.md](brief.md); the two baked prompts and the rules they obey are in
[prompts.md](prompts.md). **Run `/mpi-add-flow`** — it enforces `docs/playbooks/add-flow/`, and
this plan does not restate it. Graphics are a separate `/mpi-flow-graphics` pass.

> **READ FIRST, in this order:** `brief.md` (the seven measured laws — every one of them cost real
> runs), `prompts.md`, then `docs/playbooks/add-flow/existing-flows/scribble-to-object.md`. This
> flow is Draw It In's architecture with the scribble replaced by an object, so that file is the
> closest worked example and most of its traps apply unchanged.

## Current State

Project mode: `scalable-foundation`. Card is in `doing`, and **everything is shipped** —
flow (`c7bfb93c`), art (`4938ce07`), FlowDef fields (`22486914`). Next action: close the card.

**The graphics, 2026-08-28.** Tile `flow-object-stamp.webp` (896×1120, 45 KB, crop
`{700,160,480,600}`) and hero `flow-object-stamp.mp4` (1280×800, 5.5 s, 151 KB, crop
`{600,200,680,425}` at 1.88×, `xfade wiperight` 2.5 s from offset 1, 5 px `0xFF7EB6` seam).
Both cut from `t2i_003` → `flowObjectStamp_003`. Verified 761/761 unit, 37/37 desktop, lint
clean, and both assets serve **200 with byte counts matching disk exactly** off a standalone
`server.js` on a spare port. Two traps added to `06-preview-image.md`: sizing a punch-in from
the diff bbox (it includes the cast shadow — 301 px bbox vs a 53 px object body), and why a
frozen-wipe tile cannot work on an ADD-an-object flow (the "before" side is empty, so the seam
is decoration).

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

**BOTH step kinds are BUILT, SPLIT and probed** (2026-08-27). `MpiStepCutout/` is the `cutout`
kind (stage 2, on `image2`: Remove Background + Erase/Restore + `UndoStack`, skippable) and
`MpiStepPlace/` is the `place` kind (stage 3, on `image1`: the gizmo + Auto/Manual). Both are
registered in `stepKinds.js`; `sourceRole` and `sourceValue` both land in `_buildStepSlide`, and
`_deriveRunMedia` now resolves `sourceRole` too. Every claim in `validation.md` was measured live.

**NEXT: the FLOW GRAPHICS, and then close the card.** The flow is WIRED, bench-proven and
USER-VERIFIED: Fabio ran both routes in the app, plus remove-background / erase / restore /
undo on stage 2, and confirmed the UX fixes on screen. Two rounds of his screenshots then
fixed the guidance copy and a real scroll bug. Everything except the art is done.

The ONLY remaining build work is `/mpi-flow-graphics` - the 4/5 tile still and the wide hero
clip - after which `preview` / `video` get added to the FlowDef and the card can close. The
~25 runs already in the **Stamp Flow Tests** project are the plate material, so nothing needs
re-generating. `preview` / `video` stay ABSENT until the files exist: a declared name with no
file 404s and `tests/desktop/flows-tab-ring.spec.js` asserts a clean console.

**Two wiring facts the split decided, and the flow must honour them:**

1. **Step ORDER is the contract.** `_deriveRunMedia` walks `flow.steps` in declaration order, and
   `place` stamps whatever sits in `sourceRole` at that moment. Declare `cutout` (on `image2`)
   BEFORE `place` (on `image1`) or stage 3 stamps the UNCUT object.
2. **`place` declares `mediaRole: 'image2'`.** In Auto it derives the stamped composite, which is
   slot 2; slot 1 stays the clean scene. In Manual it derives NOTHING — the clean object is
   already `image2`, put there by `cutout` — and contributes only the region rect through
   `STEP_PARAMS`. That is the shape brief.md § Auto / § Manual describes, with no third file.

The bench stays stopped — restart it (`G:/ComfyUi/run_nvidia_gpu.bat`, port 8188) only if more
graph work comes up.

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
- [x] **Build the stage-2 step kind** (`MpiStepPlace` or similar): `ShapeManager` in `'place'`
      mode + the Remove Background branch + an add/subtract alpha brush + `UndoStack`. Mount the
      History engines whole, exactly as `MpiStepPaint` mounts `PaintManager` rather than growing
      a second brush. Keep **`bgMask` and `userMask` as two layers**, composited only at
      dispatch — flatten them and toggling Remove Background destroys the user's erasures. The
      brush must work with the toggle OFF (for sources BiRefNet whiffs entirely).
      Returns ONE composited RGBA through the existing `STEP_MEDIA` adapter.
      **Verify:** toggle off→on preserves erasures; Ctrl+Z covers every mask mutation.
      **DONE 2026-08-27**, probed live in an isolated app instance — erase 1600px, toggle
      off→on, second stroke → 3192px with the first intact; one Undo → back to exactly 1600
      (per-gesture), a second → 0 and the button disables. `composeObjectAlpha` returns the
      ORIGINAL RGB at every surviving pixel, so Restore reveals real pixels; with the toggle
      OFF the base alpha is the whole rectangle, so the brush still cuts.
- [x] **Add `sourceRole`** to the step contract (above). **Verify:** a step on `image1` receives
      `image2`; existing flows unaffected.
      **DONE 2026-08-27 — and it is ONE `find`, not two.** `_deriveRunMedia` needed no change:
      `place` carries the object's url in its own reported value, so the derivation rebuilds the
      picture from the snapshot alone and never looks the second role up. That is also what makes
      Reuse exact months later. Only `_buildStepSlide` resolves `sourceRole`, into `props.source`.
- [x] **Split the built kind in two** per § Plan Drift 2026-08-27: a `cutout` kind on `image2`
      (large canvas, Remove Background, Erase/Restore, `UndoStack` — no gizmo, so no `move` tool)
      and `place` on `image1` keeping the gizmo and Auto/Manual. Add `sourceValue` beside the
      `sourceRole` prop so stage 3 can show what stage 2 produced.
      **Verify:** re-run the two probes in `validation.md` against the split pair — they are
      written against `composeObjectAlpha` and the reported value, both of which survive; plus
      skipping stage 2 must leave `image2` untouched at the run.
      **DONE 2026-08-27**, probed live. Every measurement from the pre-split build reproduced
      unchanged (composite law pixel-exact; toggle off→on preserves erasures at 2074px; undo is
      per-gesture, 4148 → 2074 → 0). New this pass: an untouched mounted `cutout` derives NULL
      and reports NOTHING on mount, so `image2` reaches the run as supplied, and Reset returns it
      to that state; `place` in Manual derives null; and the `sourceValue` seam was measured
      end-to-end — erasing one quadrant in stage 2 leaves stage 3's canvas with **ratio 0.750**
      of its object pixels. Full table in `validation.md`.
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

**None.** The graphics shipped 2026-08-28 (`4938ce07` art, `22486914` wiring), which was the
last open unit. The card is ready to close.

> The earlier note here said the ~25 runs in **Stamp Flow Tests** were the plate material and
> nothing needed re-generating. That was wrong on inspection, and it is the one thing worth
> carrying forward: **21 of those 25 stamp a handgun and the other 4 stamp a Google-logo mug**,
> so neither was shippable as the face of a consumer app. Worse, the mug runs ate a 560² crop
> and returned 1024², so the whole frame resamples — measured whole-frame diff bbox, 9–18%
> changed — and they fail the "plates from ONE run" rule outright. Fabio ran a fresh one
> (a candlestick into a dining room) and it is the cleanest pair in the corpus at **1.09%
> changed, mean abs diff 0.88**. Counting runs is not surveying them.

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

### 2026-08-27 — THE CLEANUP BECOMES ITS OWN STAGE, so the built kind SPLITS IN TWO

Fabio, on reading the Auto-only-brush question back: the brush and Remove Background belong to a
**stage of their own**, before the placement. `brief.md` § The shape now carries the three-stage
table. This supersedes drift note 2 below — that question is answered by the split, not by a flag.

**This is a SPLIT of working code, not a rewrite.** Everything built on 2026-08-27 is proven and
keeps its behaviour; it moves house. Do NOT re-derive any of it.

| Goes to the NEW stage-2 kind (`cutout`, on `image2`) | Stays in `place` (stage 3, on `image1`) |
|---|---|
| `MaskManager` + `UndoStack` + `drawBrushRing`, the whole brush half | `ShapeManager` armed `'place'`, the gizmo half |
| the Remove Background toggle + `_cutOut()` dispatch | `CompositeManager.drawPlaced` / `rasterisePlace` |
| `composeObjectAlpha()` — unchanged, it is already the shared law | Auto/Manual, `_setAspect`, the square-Manual lock |
| the stage/`ViewManager`/Space-pan plumbing (both need a copy; it is ~60 lines and the two stages fit different pictures) | ditto |

Three things fall out, and they are the whole design of the split:

1. **The tool radio loses `move`.** Stage 2 has no gizmo, so the pointer is always the brush and
   Erase/Restore is a plain pair — the same shape `MpiStepPaint` has. That deletes the
   three-tool router and the `aria-disabled` dance with it.
2. **Stage 2 is skippable by construction**, no flag needed: with no cut and no stroke, its
   `STEP_MEDIA` adapter returns null and the frame treats that as "this kind changed nothing",
   so `image2` reaches the run exactly as the user supplied it.
3. **Stage 3 must SEE what stage 2 did**, and `sourceRole` alone does not give it that —
   `_buildStepSlide` resolves media from `_mediaGroups` (the user's inputs), while stage 2's
   result is derived at Run. The seam is one more line beside the `source` prop already added:
   hand the step `sourceValue: _stepValues[step.sourceRole]`. `MpiStepPlace` then composes the
   object from `bgUrl` + `userMask` exactly as `composePlacedObject` already does — the function
   takes that shape today, so no new mechanism is invented. Do this rather than persisting a
   derived file, which would re-cut an already-cut picture on every Reuse.

`composePlacedObject` keeps its current job (rebuild from the value alone) — it just reads the
masks out of the `cutout` step's value rather than its own.

> **EXECUTED 2026-08-27, with ONE deliberate departure from the paragraph above — approved by
> Fabio before the work started.** Point 3 is right about the CANVAS and was built exactly as
> written: `place` composes its preview from `sourceValue` through `composeObjectAlpha`, the
> cutout stage's own function, so the two canvases cannot disagree.
>
> At DISPATCH it is not. "Rebuild from the value alone" would mean copying both base64 mask
> layers into `place`'s value as well — two copies in every persisted run, and two copies that can
> disagree. Instead `_deriveRunMedia` now resolves `sourceRole` (the one thread the earlier drift
> note deliberately left out) and hands `place` the object AS THE RUN WILL SEE IT, which is the
> `cutout` step's derived file whenever that step did anything. One copy of the masks, in the step
> that owns them; Reuse stays exact because `cutout` re-derives from its own snapshot.
>
> Two things fall out, both verified: `place` in **Manual derives nothing at all** (the clean
> object is already `image2`), and **step order becomes load-bearing** — see § Current State.

### 2026-08-27 — three things the step kind decided that the plan did not

**1. The brush needed a THIRD tool, because the gizmo body and the brush both want a drag.**
The plan said "an add/subtract alpha brush" and left the pointer conflict unnamed. Resolved the
way `MpiCanvas` already resolves it — one tool owns the pointer: `move` drags the gizmo,
`erase`/`restore` paint. Default `move`, and the pair carries the same B/E hotkey ids
`MpiMaskStrip` binds.

**2. The brush is armed in AUTO ONLY, and this is the one call worth Fabio's eyes.** Manual
draws no object on the canvas — deliberately, that is brief law 2 — so there is nothing to brush
there, and the Erase/Restore buttons are `aria-disabled` with a note saying to switch to Auto.
The two mask layers survive the mode switch, so cleaning a cut is: flip to Auto, brush, flip
back. The alternative (ghosting the object inside Manual's box) was rejected as the same lie the
rotation handle would be. **If Fabio wants the brush in Manual, the fix is a surface for the
object, not a flag.**

**3. Manual's box is squared MECHANICALLY, not by asking.** Switching to Manual re-derives the
gizmo to 1:1 about its own centre, zeroes the rotation, and passes `shiftHeld` permanently to
`ShapeManager.drag` — which locks whatever ratio the shape HAS, and Manual's is 1:1. Auto goes
back to the object's own aspect on the way out, because `drawPlaced` stretches into the rect and
a square box would squash a wide object. Both preserve area and centre, so the switch is
reversible.

Also settled: **`ShapeManager` gained one public method**, `toLocal()`, a pure alias of the
existing `_toLocal`. The mask is sized to the OBJECT, not the scene — an erasure has to travel
with the placement when it moves — so a pointer has to cross into the shape's own frame, and a
second copy of the rotation maths is a copy that can disagree with the handles. No behaviour
change, no consumer sweep needed.

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

### 2026-08-27 — the two bench graphs are NOT one graph, and the wiring is blocked on that

`## Current State` above says "Both modes are the SAME graph — only what lands in the two
reference slots differs, plus which prompt is baked." **That is wrong, and it blocks the
FlowDef.** Diffed `graph-bench-auto.json` against `graph-bench-manual.json` this session: the
two files differ in WIRING, not just in widget values.

| | Auto | Manual |
|---|---|---|
| `108.latent` (ref 1) | `212` — clean scene, cropped to the region | `107` — the crop of node 6 |
| `203.latent` (ref 2) | `107` — the composite, cropped | `202` — the clean object, full frame |
| `Input_Paint` (node 2) | the stamp layer | `empty.png`, a transparent plate |
| `Input_Image_2` (node 200) | `scene.png`, fed only to satisfy `block_if_empty` — its `201→202` arm is DEAD in Auto | `object.png`, the real input |

Reference ORDER is semantic, not incidental — both baked prompts say "image two into the scene
of image one" — and in both files ref 1 is the scene and ref 2 is whatever carries the object.
So the modes agree on meaning and disagree on topology.

**Why the app cannot express this as it stands.** The op maps ONE role to ONE `Input_*` title.
The graph has THREE image inputs and the app has two roles, and `image2` would have to reach a
DIFFERENT node per mode (`Input_Paint` in Auto, `Input_Image_2` in Manual). No static
`mediaInputs` map does that.

**The unification that does work** — equivalent to both proven files by inspection, NOT yet run:

- `image1` -> `Input_Image` (node 1), the scene, both modes.
- `image2` -> BOTH `Input_Paint` and `Input_Image_2`; the arm the mode does not use is dead and
  never executes, which is the `MpiAnySwitch` lazy-evaluation behaviour MPI-607 proved on
  2026-08-27 ("a straight read runs with an empty perf-clip loader and `block_if_empty` armed").
- ref 1 (`108.latent`) = `212` ALWAYS. In Manual `212` is the same picture `107` was, because
  `210` crops node 1 with the same box mask `161`. This is what removes one of the two switches.
- **Switch A** on `163.image`: `any_1 = 6` (Auto, the composite), `any_2 = 1` (Manual, the raw
  scene). Without it, Manual's `Input_Paint` object gets pasted at 0,0 by node 6 and lands in
  the crop.
- **Switch B** on `203.latent`: `any_1 = 107` (Auto), `any_2 = 202` (Manual).
- Node 200's `201→202` arm now reads `Input_Image_2`; delete nothing.

**Three shipped-graph changes bench never ran, on top of the above:** restore `MpiClearVram`
(node 170) between 169 and 146 (`146.images` currently reads `169` direct); unpin the seed; and
replace `163.mask_expand_pixels: 83` with an `MpiMath` off `MpiMaskSquareBbox.size` (law 8's
30%, and 83 == 0.30 * 276 confirms the constant came from that box). `183` staying `"1.0"` is
CORRECT and is not a bench deviation — it is law 8's `context_from_mask_extend_factor`.

**A contract change the switches need.** `STEP_PARAMS.place` emits the rect only; `value.mode`
(`'auto'|'manual'`) is reported by the step but never leaves it. Both switches need it as an
injection param, so `stepKinds.js` gains a mode key — that file sits in claim `90b577a5`
(MPI-596's own, `needs_verification`), so re-claim before editing.

**Status: BLOCKED on a decision, not on effort.** The unified graph is reasoned-equivalent to
two files that ran, but it has not been executed, and `raw/` must be LiteGraph while both
artifacts are API JSON — the converters only go raw -> API. Proving it needs the bench back up
(`G:/ComfyUi/run_nvidia_gpu.bat`, port 8188), which is Fabio's call. Writing the FlowDef and the
op against a guessed injection surface would be a false done, so the wiring step stops here.

### 2026-08-27 (later) — the unified raw graph is AUTHORED and its equivalence is PROVEN offline

`comfy_workflows/raw/flow_object_stamp.json` exists — 54 nodes, 74 links, LiteGraph, built
from `raw/flow_draw_it_in.json` plus the patch. Authoring a `raw/` file directly is sanctioned
(`docs/workflow-authoring/converters.md`, Fabio 2026-08-22); what stays forbidden is editing a
converted API twin, and none was written.

**No API twin yet, deliberately.** `48188` (the app engine) is DOWN and `converters.md` is
explicit that conversion must run against it, not the bench — the bench runs ahead of what
ships, and converting LTX against it once shipped a wrong widget value. The conversion done
this session ran against 8188 as a VERIFICATION only, into the scratchpad, never into
`comfy_workflows/`.

**What was built, beyond the seven patch nodes:**

| node | what | why |
|---|---|---|
| `220` `MpiInt` `Input_Mode` | 1 = Auto, 2 = Manual | drives all three switches; the `MpiInt` -> `MpiAnySwitch.select` pattern is Head Swap's (node 95) and Character Sheet's (671/770) |
| `221` `Crop_Source_Select` | `163.image`: `6` (Auto) / `1` (Manual) | in Manual `Input_Paint` carries the clean object, and node 6 would paste it at 0,0 into the crop |
| `222` `Ref2_Select` | `203.latent`: `107` (Auto) / `202` (Manual) | the reference that carries the object |
| `223` `Prompt_Select` | `18.string_a`: `103` (Auto) / `224` (Manual) | one baked instruction per mode; bench hand-edited ONE node between runs |
| `224` `MpiText` | the Manual instruction, 44 words | `prompts.md` |
| `225` `MpiMath` `floor(0.3 * a + 0.5)` off `162[3]` | law 8's write-back growth, on BOTH crops | `mask_expand_pixels` is an INT and `safe_math` exposes only `math.*`, so `floor(x+0.5)` rounds AND returns an int — `round()` is a builtin and would raise. At the bench's box side 276 it returns **83**, the exact constant the bench ran |

**Equivalence, measured rather than argued** (scripted resolve-the-switches diff against both
bench files, 7 probes per mode):

- **Auto: 6 of 7 probes byte-identical to `graph-bench-auto.json`.** The 7th is `146.images`,
  which now reads `170` — `MpiClearVram` restored, one of the two bench deviations.
- **Manual: 3 probes differ, each with a reason.** `18.string_a` -> node `224` (the prompt TEXT
  matches the bench string exactly). `146.images` -> `170`, same restoration. `163.image` -> `1`
  instead of `6`, which is the REQUIRED fix, not a regression.
- **`108.latent` -> `212` in Manual where the bench used `107`, and that equivalence is now
  PROVEN, not assumed.** With `163.image` resolving to node 1 in Manual, nodes `163` and `210`
  were compared input by input: **identical on all 26**, same mask (`161`), same context factor
  (`183`), same expand source (`225`) — and their scale chains (`106`, `211`) carry identical
  widgets. So `210[1]` and `163[1]` are the same computation and `212 == 107`.

**Still unproven and still needing the GPU:** that the three switches behave at RUN time as the
lazy-evaluation reading predicts — the unused arm never executing, so an empty `Input_Image_2`
in Auto (and an unused `Input_Paint` in Manual) cannot trip `block_if_empty`. MPI-607 measured
exactly that behaviour on 2026-08-27 for Flow B, which is why it is the expected outcome rather
than a guess, but it has not been executed for THIS graph. No generation was run this session:
the bench was found already up and may belong to a peer, and the GPU lease was not taken.

**The FlowDef is now unblocked** — the injection surface is settled and stable:
`Input_Image`, `Input_Paint`, `Input_Image_2`, `Input_Mode`, `Input_Box`, `Input_Positive`,
`Input_Seed`, `Input_Edit_Model`, `Input_Edit_Clip`, `Input_Lora_Phase1_1..6`, `Output_Image`.
Mapping: `image1` -> `Input_Image`; `image2` -> BOTH `Input_Paint` and `Input_Image_2`.
`STEP_PARAMS.place` must gain the mode (`value.mode` is reported but never leaves the step) as
`Input_Mode`, 1/2 — that is `stepKinds.js`, inside claim `90b577a5`, so re-claim before editing.

### 2026-08-27 (later still) — WIRED, and the graph ran green on the bench

Fabio's call: stop polishing the explanation, run it and wire it. Both done.

**The graph RAN, twice, both modes** (bench 8188, GPU lease taken, 4060 Ti):

| | Auto | Manual |
|---|---|---|
| result | `success` | `success` |
| time | 26.1s | 26.1s |
| output | grounded object, contact shadow matching the window light | re-rendered object, flatter integration |

Outputs are distinct from each other and from the source scene. So the three switches
honour their selector at run time, and the lazy-evaluation reading held — nothing tripped
`block_if_empty` on the arm its mode does not use.

**The graph got SIMPLER while being wired, and the simplification is proven free.** The first
build fanned `image2` out to a third image input (`Input_Image_2`). That cannot work:
`commandExecutor._buildParams` keys its `assigned` Map by `slot.key`, so a SECOND slot
declared with the same key hits `assigned.has(slot.key)` and is skipped — one role can never
fill two titles, and the MPI-292 dedup enforces the same from the other side. Fixed by
deleting node 200 and feeding the manual reference arm from `Input_Paint` (node 2) instead:
53 nodes, two image titles. Re-ran both modes and pixel-compared against the 54-node
outputs — **0 differing subpixels of 3,145,728 in BOTH modes**. The byte hashes differ only
because ComfyUI embeds the graph in the PNG.

**The API twin was safe to convert here, contrary to the earlier note.** `converters.md`
says convert against 48188 because the bench runs ahead of what ships — but the bench is on
`0.31.0` and `dev_configs/node_lock.json` pins `v0.31.0`. Same schema, so the hazard did not
apply. `comfy_workflows/flow_object_stamp.json` is byte-identical to the conversion that was
verified and then executed.

**A contract change landed, and it is general rather than a special case.** `place` needs to
feed TWO nodes (the region AND the mode) and a step could declare only one `param`. So
`step.param` now accepts **either** a string (unchanged, every existing flow) **or** a map of
the kind's named outputs to param names. `STEP_PARAMS.place` returns `{ region, mode }` and
Object Stamp declares `param: { region: 'box1', mode: 'Input_Mode' }`. Nulls are still
omitted in both forms, which is what preserves a baked default.

`mode` is emitted even when the gizmo has no shape yet — it decides which arm of the graph
runs regardless. 1 = Auto, 2 = Manual, the 1-based `MpiAnySwitch` convention Head Swap and
Character Sheet already use.

**Shipped in this pass:**

- `comfy_workflows/raw/flow_object_stamp.json` + its API twin (53 nodes)
- the op in its 4 files (`commandRegistry`, `operationRegistry`, `universal_workflows`,
  `operation_registry.json`), `appVersionIntroduced: '1.5.0'`
- the `FlowDef` — `cutout` (image2) declared BEFORE `place` (image1), `place` on
  `mediaRole: 'image2'`, `result: { compare: 'image1' }`, NO `preview`/`video`
- `step.param` map form (`MpiBaseFlow.js`) + `STEP_PARAMS.place` (`stepKinds.js`) + the
  `types.js` typedef that documented the old single-value shape
- 3 new test cases: the inject-title case (asserts `input_mode`, that it drives all THREE
  switches, that both crops share one mask and factor, and that `mask_expand_pixels` is
  DERIVED not constant), the `place` adapter case, and a guard that no `place` step uses the
  string `param` form
- `docs/playbooks/add-flow/existing-flows/object-stamp.md`
- `docs/releases/UNRELEASED.md` — roster nine -> ten AND its own entry

**Verified:** 750/750 unit tests (was 747), lint clean, `node --check` on every edited JS
file, and both bench runs above.

**Left open, deliberately:** the flow has never been driven THROUGH THE APP — no live run,
no reuse round trip, and `npm run test:desktop` was still running when this was written. The
card's verify mode is `user-ux` and that gate is Fabio's. Graphics are a separate pass
(`/mpi-flow-graphics`); `preview`/`video` stay ABSENT until the files exist.

### 2026-08-27 (final) — the UX pass, and two bugs found by looking at the screen

Fabio drove the flow in the app and sent two rounds of screenshots. Everything he flagged was
real, and two of the four were bugs rather than copy:

1. **ALT-rotate was undiscoverable** — nothing named the gesture. Now in the Auto hint.
2. **The prompt field renders in Auto** where `prompts.md` said Manual-only. Kept, because it
   is LIVE there (node 18 concatenates `Input_Positive` onto whichever instruction the switch
   picked) and scene lighting is useful in both modes. Hiding it in Auto is still open and is
   NOT free — the mode radio lives inside `MpiStepPlace`, so mode-conditional field visibility
   needs a gizmo→frame seam that does not exist.
3. **`MpiInput` did not escape its markup** (shared primitive). A quote in a placeholder closed
   the attribute and truncated the rest — the Object Stamp placeholder rendered as `e.g.` and
   nothing else. `value` had the same hole, so any user typing a quote broke their own field.
   Fixed in the primitive, not by removing the quotes from the copy.
4. **A step slide could not be scrolled to its top.** `align-items: center` + `overflow-y: auto`
   puts the overflow above the scroll origin. Measured at a 420px stage: content 788px,
   maxScroll 406, top edge at −406px. Fixed with `align-items: safe center`, regression spec at
   `tests/desktop/flow-slide-scroll-reaches-top.spec.js`.

**The copy was WRONG, not just long** — Manual said "drag the object where it should sit" when
Manual has no object, and Auto told the user to leave shadow room when Auto's box IS the object
(the graph adds ~30% itself, node 225). Two short lines per mode now, no shared `base`.

**A mutation test caught two false greens** and is the lesson worth keeping: the scroll spec
passed with the fix removed, because the first attempt shipped TWO fixes (`safe center` plus
`margin: auto`) and each independently defeats the trap, so each MASKED the other. An auto
margin overrides `align-items` and resolves to 0 under overflow. `margin: auto` was deleted so
the single remaining fix is load-bearing.

**Contract change shipped this session:** `step.param` accepts a MAP of a kind's named outputs
to param names (`place` returns `{ region, mode }`), and `step.hint` accepts a string, an array,
or `{ base, <variant> }` keyed by the gizmo's reported mode.
