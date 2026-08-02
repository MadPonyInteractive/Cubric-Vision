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

### BLOCKER — 4 dangling injection nodes, fix in the graph editor and re-export

Each of these feeds a `SetNode`, but the matching `GetNode` does not exist anywhere in
the graph, so the app injects a value into a named channel nothing reads — silent wrong
output, not an error. `Input_Image_2` traverses the identical Set/Get shape and passes,
which is what proves the validator is following virtual links correctly.

- **krea2** `Input_Image_3` (#555) → `Set_img3` (#547); no `Get_img3` exists.
- **qwen** `Input_Width` (#204) → `Set_W` (#197); no `Get_W`.
- **qwen** `Input_Height` (#205) → `Set_H` (#198); no `Get_H`.
- **qwen** `Input_denoise` (#237) → `Set_denoise` (#236); no `Get_denoise`.

## Status

Klein / Krea2 / Qwen master templates were **authored in the node graph by the user
(2026-08-02)** and are pending export into `comfy_workflows/raw/`. The repo-side
migration (this card) starts once those three raw files land.

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
