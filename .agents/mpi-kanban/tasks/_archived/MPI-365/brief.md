# MPI-365 — Migrate all models to the one-master-template shape

## VERIFIED against the exported graphs (2026-08-02)

Exports landed in `comfy_workflows/raw/` (klein / krea2_t2i / qwen_edit). Converted to
API with `workflow-to-api.mjs` against the live bench and run through
`validate-injection-rules.mjs`:

| template | nodes | injection surface | validator |
|---|---|---|---|
| klein_t2i | 316 → 337 | **IDENTICAL** — 23 titles, 0 added, 0 removed | ✅ clean |
| krea2_t2i | 114 → 218 | +8 / −4 | ❌ 1 violation |
| qwen_edit | 74 → 130 | +5 / −0 | ❌ 3 violations |

**Klein needs NO app-side change.** Its `Input_*` set is byte-identical to the shipped
one; the +21 nodes are internal rewiring (2-ref depth line, mask on edit) behind titles
that already existed. Existing `opInject` already matches the graph's note
(`1 t2i · 2 i2i · 3 depth · 4 edit · 5 inpaint · 6 detail · 7 upscale`).

**Krea2 delta.** Added `Input_wf_type`, `Input_Mask`, `Input_Image_3`,
`Input_Upscale_Factor`, `Input_Upscale_Model`, `Input_Auto_Grid`, `Input_is_Turbo`,
`Input_depth_strength`. Removed `Input_Is_Edit`, `Input_Is_i2i`,
`Input_depth_reference`, `Input_Tier`. Node-type delta confirms the absorption:
`MaskDetailerPipe`, `UltimateSDUpscale`, `UpscaleModelLoader` are now IN the master
template → `krea2_detailer_template.json` + `krea2_upscaler_template.json` and their
6 runtime `_sfw`/`_nsfw` outputs are deprecated. `ImageResizeKJv2` → 
`ImageScaleToTotalPixels` is the crop-independence change.

**Qwen delta.** Added `Input_wf_type`, `Input_Mask`, `Input_Width`, `Input_Height`,
`Input_denoise`. Removed nothing — **`Input_Tier` STAYS** (note: `1 High · 2 Balanced ·
3 Low`), so Qwen keeps its 3-tier runtime radio; only Krea2's tier became a boolean.

**The turbo title is `Input_is_Turbo`, not `Input_turbo`.** Klein already carried it
before this export.

**Qwen POSE = `OpenposePreprocessor` + `AIO_Preprocessor`, NOT ControlNet.** There is no
`ControlNet*` node in any of the three graphs — the pose map feeds Qwen's native image
conditioning. So no ControlNet checkpoint to host; the new dependency is the
`comfyui_controlnet_aux` NODE (already a Klein dep, must be added to Qwen's
`dependencies`) plus its auto-downloaded annotator weights (OpenPose body/hand/face —
new to the app; DepthAnythingV2's are already pulled by Klein).

**Correction to this card's original trap text:** it says image loads must be
`block_if_empty: false`. The real contract is narrower — the PRIMARY `Input_Image` is
`true` in all three, and the three OPTIONAL loads (`img2`, `img3`, `mask`) are `false`.
Klein has shipped that shape since MPI-354.

**Qwen has no prompt enhancer, before or after.** No `Input_enhance_prompt` node and no
`TextGenerate`; `models.js` documents `promptEnhance` staying default-false for it.
Klein and Krea2 both carry `Input_enhance_prompt`. So "styles + enhance on every op"
holds for Klein/Krea2 only — open question whether Qwen was meant to gain it.
(Also checked and cleared: Qwen never had an `Output_prompt` node, so nothing regressed
there — its old `PreviewAny` was untitled.)

### ~~BLOCKER — 4 dangling injection nodes~~ — RESOLVED BY DESIGN, re-verified 2026-08-02

**Do not go hunting this. There is no live bug.** The section below was true when
written; every one of the four was then settled by a deliberate decision during the
migration itself, and the graphs shipped correct. Kept, struck through, because a
reader who finds the raw templates still holding dangling `Set_*` nodes will otherwise
re-open it — there are **nine** of them now, not four.

The original four, and what each turned out to be:

- **krea2** `Input_Image_3` (#555) → `Set_img3` (#547) — *intentional*. Krea2's depth
  branch became a LINE (image 1 = depth map, image 2 = subject), so it stops at TWO
  images and declares `depthSubject` **without** `depthSubject3`. The app never offers
  a third slot. `models.js` says so at the `capabilities` block.
- **qwen** `Input_Width` (#204) → `Set_W`, `Input_Height` (#205) → `Set_H` — *intentional*.
  All three Qwen ops are in `imageSizedOps`, so output shape comes from the source image
  and the ratio picker is hidden; the pair was bypassed out of the graph on purpose.
- **qwen** `Input_denoise` (#237) → `Set_denoise` — *intentional*. `denoise` belongs to
  the `i2i` op and reaches the sampler only through the `Input_Is_i2i` gate. Qwen has no
  `i2i`, and `qwenEdit`'s `components` list does not include it, so nothing injects it.

**The check that settles it, and the one to re-run if this is ever doubted:** scan each
RUNTIME graph for an `Input_*` titled node consumed by nothing. The answer is **zero**
in both `krea2_t2i_nsfw.json` and `qwen_edit.json`. Those nodes are not orphaned in the
shipped graphs — they are *absent*, pruned by `_prune_to_captures` as unreachable, and
the leftover `Set_*` nodes exist only in the raw authoring templates (`Set_0 Get_0` in
both runtime files, because Set/Get are virtual and resolve away at conversion).

What is genuinely left is **cosmetic GC of nine dead nodes in the raw templates**, which
costs a ComfyUI re-export to remove things that already never ship. Low value; do it
next time those templates are open for another reason.

## Status (rewritten 2026-08-02 — the lines above it had gone stale)

**Migrated and shipped:** Klein, Krea2, Qwen and Chroma. Their raw templates landed,
converted and baked; the "pending export" note that used to sit here was overtaken.

**Chroma is fully closed out** — one template per tier, depth via a HuggingFace-linked
FLUX ControlNet, a four-LoRA style rack whose licences are verified
(`docs/models/chroma/licences.md`), weights on R2, and `docs/models/chroma/` written.
Three defects found in the live app on 2026-08-02 and fixed the same day:

- `depth` was missing from `imageSizedOps`, which put a lying ratio picker on the op
  AND padded its gallery card (one cause, three symptoms).
- The batch control was dead on every op sampling a VAE-encoded latent. Fixed with a
  new per-op `ModelDef.batchOps`, swept across Chroma **and** the SDXL family.
- Style strength now starts at 0.6 via a new `ModelDef.controlDefaults`; the
  checkpoints are distilled enough that 0.8/1.0 artefact instead of styling.

**NOT migrated, and this is what blocks the card:** the SDXL family (5 models, still
`t2i_*` + `upscaler_*` + `detailer_*` each) and the video models (wan-22, ltx-23 ×2,
wan22-5b, 2 files each). Until those land, the whole GC half of the acceptance list is
unreachable — the per-op `injectParams` on shared ops (`Input_Is_i2i`,
`Input_depth_reference`), the REPLACE-not-merge branch in `commandExecutor._buildParams`,
and `DEFAULT_STYLE_OPS` all still have live consumers. Verified present 2026-08-02.

**Deferred by user decision, not forgotten:** a per-model + per-op `progressStages`
table. Chroma emits 1 bar on t2i/i2i/depth but varies with the mask count on detail and
the tile grid on upscale, so the per-FILE table cannot state a total — Chroma therefore
carries a comment in `progressStages.js` rather than an entry (an empty object would be
identical to no entry).

Backup of the pre-migration five: git, clean at `4e5c7aa1` (2026-07-28) —
`klein_t2i_template.json`, `krea2_t2i_template.json`, `krea2_detailer_template.json`,
`krea2_upscaler_template.json`, `qwen_edit_template.json`. Restore any one with
`git show 4e5c7aa1:comfy_workflows/raw/<file>`.

## The wf_type maps (read off the authored graphs, 2026-08-02)

Every model's ops are branches of ONE graph selected by an injected `Input_wf_type`
int. The numbering is PRIVATE to each model — no shared op may own it.

**Klein** (`klein_t2i_template`) — unchanged from MPI-354:

    1 = t2i    2 = i2i    3 = depth    4 = edit    5 = inpaint    6 = detail    7 = upscale

**Krea2** (`krea2_t2i_template`) — mirrors Klein's numbering, slot 5 deliberately dead:

    1 = t2i    2 = i2i    3 = depth    4 = edit    5 = ---    6 = detail    7 = upscale

`5` is empty because **edit now accepts a mask**, so there is no separate inpaint
branch. Krea2 collapses from three raw files (t2i + detailer + upscaler) to one.

**Qwen-Image-Edit** (`qwen_edit_template`) — its own numbering, three ops:

    1 = edit    2 = depth    3 = pose

## What changed in the authored graphs

1. **Krea2 tier → turbo boolean.** The in-workflow `Input_Tier` int (Krea2's
   quality/turbo sampler-chain selector, driven by the `krea2Turbo` control —
   `models.js` ~L263) is replaced by **`Input_turbo`, a boolean**. This is the
   *workflow* tier, NOT the model card's sfw/nsfw split and NOT Qwen's
   `capabilities.tierSelect` radio — those are untouched. The balanced/high tier
   chains inside the Krea2 graph are gone.

2. **Mask on edit, all three models.** Klein, Krea2 and Qwen edit ops now take
   `input_mask`. For Krea2 this is what folds inpaint into edit (wf_type 5 freed).

3. **Ops are crop-independent (Krea2, and the pattern for the others).** Every op
   EXCEPT t2i and i2i derives its output dimensions from the **input image**, not
   from the crop / resolution control. The crop-driven resolution injection must
   stop reaching those branches.

4. **Depth is a LINE of images, not a boolean.** First image = the depth map;
   subsequent images = references.
   - Klein: depth + up to 2 references.
   - Qwen: depth + up to 2 references (Qwen supports the extra slot).
   - Krea2: depth + reference.
   This replaces the `Input_depth_reference` MpiIfElse gate
   (`commandRegistry.js:282`) — one of the shared-op `injectParams` this card
   already wants deleted.

5. **POSE is a NEW operation** (Qwen first). Does not exist in the app today.
   Planned to reach the SDXL workflows next. **NOT via ControlNet** — this line
   said "via ControlNet" until 2026-08-02; the VERIFIED section at the top of this
   file is right and this was stale. Qwen pose is `OpenposePreprocessor` +
   `AIO_Preprocessor` feeding Qwen's own image conditioning, so it costs the
   `comfyui_controlnet_aux` NODE and its annotator weights but NO hosted ControlNet
   checkpoint. (Chroma's DEPTH does use a real ControlNet checkpoint — different
   model, different mechanism, don't conflate them.)

6. **Styles + prompt enhancement on EVERY op** (all three models). The capability
   flags are already right — Krea2 ships `styleLoras: true, promptEnhance: true`
   (`models.js` ~L288) — so what widens is the **op-level reach**, not the model
   flags: `styleOps` must list every entry in `supportedOps` (detail and upscale
   included), and the enhance toggle's op gate must open the same way. Klein already
   declares the full-reach `styleOps` (MPI-354) — copy that shape to krea2 + qwen.
   Once all three are full-reach, `DEFAULT_STYLE_OPS` (`commandRegistry.js:902`)
   loses its last purpose and joins the GC list.

## Pending — Krea2 Chroma-dataset style LoRA (user testing 2026-08-02)

A new Krea2 style LoRA trained on the **Chroma** dataset, making Krea2 able to
produce Chroma-like output. User is testing **three candidate LoRAs** to see which
lands, if any. NOT carded and NOT wired until one is chosen.

When it lands: append to `styleLoraLabels` AND `styleLoraImages` (index-aligned, all
four Krea2 variants share the rack), add a display `.webp` in
`comfy_workflows/display/`, and add the weight to `loraDeps.js`. If it wins outright
it may also make the shipped Chroma model cards redundant — raise that separately,
do not fold it into this card.

## Naming collision — resolve BEFORE wiring pose

The existing op id **`poseReference` is the DEPTH op**, not pose:
`commandRegistry.js:235` gates it with `injectParams: { Input_depth_reference: true }`,
and Klein maps `poseReference → Input_wf_type: 3`, which the authored graph labels
`3 = depth`. `poseReference` appears in 7 models' `supportedOps` and in
`DEFAULT_STYLE_OPS` (`commandRegistry.js:902`).

Wiring a real `pose` op alongside a `poseReference` that means depth is a silent
foot-gun. Rename `poseReference → depth` in the same pass, then add `pose` clean.

## Repo-side work this implies (on top of the card's original GC list)

- `models.js`: `opInject` maps for krea2 + qwen (mandatory — a missing entry runs the
  default branch and returns a plausible WRONG image); `styleOps` widened to
  detail/upscale for both, since one-template models carry the rack everywhere.
- `krea2Turbo` control: int → boolean, retarget `Input_Tier` → `Input_turbo`.
- New `pose` op in `commandRegistry.js` + rename `poseReference` → `depth` across all
  consumers.
- Mask slot on `krea2Edit` / `qwenEdit` / `kleinEdit`; retire the Krea2 `inpaint` path.
- Crop/resolution injection: skip the non-t2i/i2i branches.
- Depth image LINE: replace `Input_depth_reference` with the ordered multi-image slot.
- `generate_krea2.py` / `generate_qwen.py`: collapse variant maps to the master
  template, mirror `generate_klein.py`'s prune + `wf_type`/UNET/rack asserts.
- Delete `krea2_detailer_template.json` + `krea2_upscaler_template.json` and their
  6 runtime `_sfw`/`_nsfw` outputs; collapse `progressStages` to one key per model.

## CHROMA — MIGRATED 2026-08-02 (commits 2325ae42 / 9385120f / d33e762e)

Six runtime files → two. The user authored the master graph; the repo side is wired,
tested (310/310) and committed. Chroma was NOT in this card's original scope — it was
added because the same one-template shape applies.

    1 = t2i   2 = i2i   3 = depth   4 = ---   5 = ---   6 = detail   7 = upscale

**Tier is a FILE axis here, not a runtime one.** Flash and Hyper are two SEPARATE
checkpoints (17GB bf16 / 9.2GB int8), not weight + accelerator LoRA like Krea2. So
`generate_chroma.py` bakes `ClownModelLoader.model_name` + `Input_Tier` per output —
tier 2 → `chroma_t2i.json`, tier 3 → `chroma_hyper_t2i.json` — the Boogu pattern. Two
loaders in ONE graph would force BOTH downloads: ComfyUI validates every combo widget at
submit time even on a lazily-skipped branch. Tier 1 (High) is a reserved slot, never
shipped — MPI-217 tested the full weight and rejected it.

The loader is RES4LYF's **`ClownModelLoader`** (model + CLIP in one node), NOT a
`UNETLoader`, and it is UNTITLED — the generator looks it up by `class_type` and asserts
exactly one.

**Depth ships via a FLUX ControlNet.** Chroma is pruned FLUX.1-schnell: its forward pass
applies control residuals exactly as FLUX does (`comfy/ldm/chroma/model.py:221-226`,
`:257-262`), `latent_format` is Flux, and Union Pro 2.0's `x_embedder` is `[3072, 64]` —
Chroma's hardcoded `in_channels` (`model_detection.py:294`). There is **no Chroma-native
ControlNet or depth LoRA**; Klein's refcontrol LoRA and Krea2's control-LoRA are both
model-specific and neither ports (Krea2's expands `img_in`, so it is dimension-locked).
Union Pro 2.0 **dropped the mode embedding**, so `SetUnionControlNetType` is a silent
no-op — do not add it. Measured ceiling: strength past ~0.5 artefacts; the graph
normalises the 0–1 slider to 0–0.5 and runs `end_percent` 0.570.

**LICENCE — the ControlNet is the app's first non-permissive weight** (flux-1-dev
non-commercial). It is linked from **HuggingFace and must NEVER be mirrored to R2**: BFL's
*paid* commercial terms still forbid "distributing … to third parties via any means", so
no price unblocks rehosting. Linking the origin is the ComfyUI/Invoke/Fooocus position.
Consequences: no mirror fallback (`_mirrorUrlsFor` preserves pathname; HF has no R2 twin)
and the sha256 is the only guard against an upstream re-upload. No ControlNet exists for
the Apache-2.0 FLUX.1-schnell, so there is no permissive alternative.

`imageSizedOps` is **detail + upscale only** — Chroma's depth still reads
`Input_Width`/`Input_Height` through `MpiCrop` and generates at our dimensions, unlike
Klein's image-derived depth.

### Two gates before Chroma can ship

1. **R2 upload of the style LoRAs** — DONE 2026-08-02, four weights, ~962 MiB. The URLs
   404'd until then, which is what made Chroma un-installable.
2. **CivitAI SHA256 licence check** — DONE 2026-08-02. Table, method and reasoning now in
   `docs/models/chroma/licences.md`.

**The licence check changed the product, so read that file before touching the rack.**
Two findings:

- **The documented method was incomplete.** `docs/models/klein/licences.md` read only the
  permission flags off the v1 API, and that payload has **no licence field at all** — the
  `License: Apache 2.0` badge lives in the server-rendered model page. Two weights that
  read as `RentCivit`-only by flags are Apache-2.0 in fact, and Apache-2.0 outranks a
  hosting-site checkbox. Klein's doc gained the trap; re-verifying its own table (and
  deciding what authorises our R2 mirror for badge-less weights) is **MPI-430**.
- **The rack is FOUR styles, not five.** `chroma-style-cinema` (Absolute CINEMA) was
  dropped: no badge, and its creator withheld `Image`, so a user could not sell what they
  generated with it. Removed from the deps, both ModelDefs, the display cards **and the
  master template** — the graph was re-exported from ComfyUI and re-synced so `lora_3` is
  Brushwork, `lora_4` Anime, `lora_5` `None`. A dead slot would have been worse than
  useless: ComfyUI validates every combo widget at submit time, so a `lora_N` naming a
  file nobody downloads fails EVERY Chroma prompt. Three creators require attribution and
  carry `credit` blocks; `chroma-style-anime` waived it and its absence is deliberate.

Also missing (pre-existing, not regressions): Chroma has no `progressStages` entries
(bar counts never measured). `docs/models/chroma/` now exists — README + licences.

## Traps (carried from MPI-354 — still bite)

- An op that forgets its `wf_type` fails SILENTLY. The `generate_*.py` assert and the
  `inject-params-titles` test are what make it loud.
- ComfyUI validates EVERY node at submit time even on a lazily-skipped branch. Image
  loads MUST be `MpiLoadImageFromPath` with `block_if_empty: false` — including every
  new depth/reference/mask slot — or the one-file template breaks.
- Only ONE node may carry a given `Input_*` title. `validate-injection-rules.mjs`
  catches duplicates; run it on each exported template.

## SDXL MIGRATED + the control-type merge — 2026-08-03

The user re-exported five raw templates in one pass (klein, krea2, chroma, qwen, sdxl) and
this session wired the repo side. **SDXL was the last un-migrated image family**, so the
whole GC half of the acceptance list is now reachable and done.

### The product change: `depth` + `pose` collapse into ONE `control` op

The user's call, from the exports: instead of a separate op per control kind, ONE op with a
**Control Type** picker whose entries come from the model. SDXL's master graph carries four
types off one ControlNet-Union checkpoint; Qwen carries two; everything else carries one and
shows no picker.

    controlTypes: ['depth','pose','scribble','canny']   sdxl x5
    controlTypes: ['depth','pose']                      qwen-edit
    controlTypes: ['depth']                             klein, krea2 x2, chroma x2

`CONTROL_TYPES` (`commandRegistry.js`) maps id → the `Input_Control_Net` switch index. The
index is **fixed by the authored graphs** — SDXL and Qwen independently number their switch
`1 Pose · 2 Depth · 3 Scribble · 4 Canny`, so ONE shared map serves both and `controlTypes`
is free to be display-ordered (both list depth first; the graphs still start at pose).

`pose` was deleted before it ever shipped, and `depth` with it — both were 1.4.0-only keys,
so no history migration. `poseReference` remains the only deprecated entry.

### The two SDXL behaviours that INVERTED, silently

Traced in the baked graph, not assumed — both are the lie-classes this card already fixed
once for Chroma, and neither raises an error:

- **batch died on control.** The old graph gated depth with `Input_depth_reference` and kept
  sampling `EmptyLatentImage`. The master template routes control through `VAEEncode`
  (`KSampler.latent_image <- MpiAnySwitch on wf_type, any_3`). `batchOps: ['t2i','depth']`
  → `['t2i']`. SDXL and Chroma now agree, which the old test comment said would mean one of
  them was wrong — that comment was rewritten, not worked around.
- **the ratio picker became a lie on control.** Control scales the input with
  `ImageScaleToTotalPixels`; only i2i still resizes to `Input_Width`/`Input_Height`
  (`ImageResizeKJv2`). `imageSizedOps: ['control','detail','upscale']` added.

### One strength title for every model

The user renamed `Input_depth_strength` → **`Input_Control_strength`** across all five
templates, so the control carries ONE `nodeTitle` instead of a per-model map. The control is
`controlStrength` (was `depthStrength`), gated on `capabilities.controlStrength` — every
model but Qwen, which conditions on the control IMAGE and has nothing to patch.

### GC actually done

- `injectParams` is now EMPTY across the whole registry: `control` lost
  `Input_depth_reference` and `i2i` lost `Input_Is_i2i` (SDXL was the last holder of both).
- `DEFAULT_STYLE_OPS` **deleted** — all six style models declare `styleOps`. The fallback is
  now `[]` on purpose: a future style model that forgets the field shows no rack at all
  rather than inheriting a wrong reach. A new test pins that every shipped style model
  declares it.
- **14 files deleted:** `upscaler_*` + `detailer_*` x5 runtime, `sdxl_upscaler_template` +
  `sdxl_detailer_template` in both `raw/` and `scripts/workflow_generation/`.
- `generate_sdxl.py` collapsed to the one master template and gained Klein-style asserts —
  `Input_wf_type` and `Input_Control_Net` must exist as plain widgets, then bake to 1 (t2i)
  and 2 (depth). The `Input_Control_Net` assert fired on the first run: the export was baked
  to 1 (pose).

### NOT done — the one deliberate hold

`commandExecutor._buildParams` keeps its REPLACE-not-merge branch. With zero `injectParams`
left it is unreachable, and the card's acceptance line says to delete it with them — but
`injectParams` is still a documented, supported op-level field, and removing the branch
while keeping the field would make a future declaration merge instead of replace. **User's
call**; flagged rather than silently skipped.

### Latent bug found on the way

**`ComfyUI-Impact-Pack` was never in any SDXL model's `dependencies`**, though `detail` has
always needed `MaskDetailerPipe`. Survivable while detail lived in its own file; the master
template makes ComfyUI submit-validate every node on EVERY run, so the gap would have failed
plain t2i on a fresh install. Added to all five.

### State

Full suite **338/338 green** (2 new tests), `release-health-check` passed,
`validate-injection-rules` clean on all five API templates,
`operation_registry.json` re-synced. **Not yet run in the app** — every claim above is from
the graphs, the registries and the suite, not from a live generation.

## CLOSED 2026-08-03 — and why the video models did NOT block it

The last status note said this card could not close until the video models migrated.
That was wrong, and the correction is worth keeping because the same reasoning will come
up for any future "migrate everything" card.

**LTX is ALREADY a one-master-template model.** `ltx_i2v_t2v_template.json` serves both
t2v and i2v from one graph, selected by `Input_Text_to_video` — a boolean, not an
`Input_wf_type` int, because two ops do not need an int. It arrived at the shape before
this card existed.

**The video file count is not an op split.** Three axes, none of which one graph can
absorb:

- **`_stage2` is a SECOND ComfyUI SUBMISSION**, not a branch. `commandExecutor` resolves
  it by filename swap (`payload.isStage2`, ~L1357) and dispatches it as its own job.
  Lazy evaluation prunes *within* one submission; it cannot span two. So a multi-stage
  model can never collapse its stages into one file, no matter how the ops are wired.
- **`_fp8` / `_mxfp8` are quantisation variants** chosen per GPU via `variantTokens`.
  Same constraint that keeps Chroma's Flash and Hyper in separate files: ComfyUI
  validates every combo widget at submit, so two loaders in one graph force BOTH weight
  downloads.
- **`t2v` / `i2v`** is the only real op axis, and LTX already collapsed it.

**No video model uses anything on the GC list** — no `injectParams`, no `styleOps`, none
of the shared-op booleans. That is why every GC acceptance item unblocked and shipped
without a single video file being touched.

### Left undone on purpose, NOT carded

`wan-22` and `wan22-5b` still keep separate `t2v` / `i2v` templates where LTX proved one
file works. Merging them saves two files and changes no behaviour — not worth a card.
`ltx_i2v_t2v_template.json` is the worked example if it is ever wanted. Raise it as a
by-the-way if those templates are open for another reason.
