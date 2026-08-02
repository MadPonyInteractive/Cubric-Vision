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

5. **POSE is a NEW operation** (Qwen first, via **ControlNet**). Does not exist in
   the app today. Planned to reach the SDXL workflows next.

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

## Traps (carried from MPI-354 — still bite)

- An op that forgets its `wf_type` fails SILENTLY. The `generate_*.py` assert and the
  `inject-params-titles` test are what make it loud.
- ComfyUI validates EVERY node at submit time even on a lazily-skipped branch. Image
  loads MUST be `MpiLoadImageFromPath` with `block_if_empty: false` — including every
  new depth/reference/mask slot — or the one-file template breaks.
- Only ONE node may carry a given `Input_*` title. `validate-injection-rules.mjs`
  catches duplicates; run it on each exported template.
