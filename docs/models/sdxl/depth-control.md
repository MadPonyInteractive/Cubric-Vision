# SDXL family — Control (ControlNet-Union), shipped 2026-07-24, widened 2026-08-03

All 5 SDXL-family models — `sdxl-realistic`, `sdxl-nsfw`, `ill-anime-beauty`, `ill-anime`,
`pony-mix` — carry a **Control** op. Shipped as depth-only and verified in-app **and** on a
Pod; widened to four control types by MPI-365.

## SDXL is the only model with a control TYPE PICKER

The op key is `control` (MPI-365). It replaced `depth`, which had itself replaced
`poseReference` earlier in the same unreleased cycle — the two intermediate keys never
shipped, so only `poseReference` survives in `operationRegistry.js` as deprecated, for
history items written by <= 1.3.0.

SDXL declares four types where every other model declares one:

```js
controlTypes: ['depth', 'pose', 'scribble', 'canny']   // sdxl x5
controlTypes: ['depth']                                // klein, krea2 x2, chroma x2
controlTypes: ['depth', 'pose']                        // qwen-edit
```

That list is **display order**. The value injected into `Input_Control_Net` comes from
`CONTROL_TYPES` in `commandRegistry.js`, which is fixed by the authored graphs — SDXL and
Qwen independently number their switch **1 Pose · 2 Depth · 3 Scribble · 4 Canny**, so one
shared map serves both. A model listing a single type shows no picker at all.

## The MECHANISM differs from Krea2 — this is the first non-LoRA controlnet dep

| | Krea2 control | SDXL control |
|---|---|---|
| Kind | a **LoRA** (`krea2-lora-depth-control`) | a real ControlNet **weight** |
| File | — | `ControlNet-Union-ProMax-SDXL.safetensors` (`controlnet-union-sdxl`), 2.34 GB, `controlnet/` path |
| Types | depth only | depth, pose, scribble, canny — ONE checkpoint, four `SetUnionControlNetType` nodes |

This is the **first controlnet-model dep in the app** — every prior control was a LoRA.

## Control path in the master graph

```
MpiLoadImageFromPath
  -> MpiAnySwitch (select = Input_Control_Net)     picks the annotator
       any_1 AIO_Preprocessor[OpenposePreprocessor]
       any_2 AIO_Preprocessor[DepthAnythingV2Preprocessor]
       any_3 AIO_Preprocessor[ScribblePreprocessor]
       any_4 AIO_Preprocessor[CannyEdgePreprocessor]
  -> MpiAnySwitch (select = Input_Control_Net)     picks the matching union type
       any_1..4 SetUnionControlNetType[openpose | depth | hed/pidi/scribble/ted | canny/lineart/anime_lineart/mlsd]
  -> ControlNetApplyAdvanced   (strength <- MpiNormalizeValue <- Input_Control_strength)
```

**The two switches must stay index-aligned.** Nothing errors if they drift: the graph would
run an OpenPose skeleton through a `depth` union type and return a plausible, wrong image.
The `Control` note in `comfy_workflows/raw/sdxl_t2i_template.json` is the authoring record
of that order and `CONTROL_TYPES` mirrors it; `tests/op-strip-availability.test.cjs` pins
the index map.

`Input_Control_strength` is normalised **0-1 → 0-0.5 in-graph** (`MpiNormalizeValue`),
because past ~0.5 this ControlNet artefacts. The app's slider is the plain 0-1.

## The branch selector, and what MPI-365 changed underneath it

The old three-file era (`sdxl_t2i_template` + `sdxl_upscaler_template` +
`sdxl_detailer_template`, 15 runtime files) is gone. One master template now serves all five
ops through `Input_wf_type`:

    1 = t2i   2 = i2i   3 = control   4 = ---   5 = ---   6 = detail   7 = upscale

`Input_depth_reference` and `Input_Is_i2i` went with it — both were `MpiIfElse` booleans the
shared ops injected, and SDXL was the last model holding either. **Two behaviours inverted
when the branch moved, and neither raises an error:**

- **Batch is now dead on control.** The old graph switched only the CONDITIONING pipe and
  kept sampling `EmptyLatentImage`, so batch was real on depth. The master template routes
  control through `VAEEncode` (`KSampler.latent_image <- MpiAnySwitch on wf_type, any_3`),
  so `batchOps` is `['t2i']` — matching Chroma exactly, which it never used to.
- **The ratio picker is now a lie on control.** Control scales the input with
  `ImageScaleToTotalPixels` instead of reading `Input_Width`/`Input_Height`, so
  `imageSizedOps` gained it. i2i still resizes to our dimensions (`ImageResizeKJv2`) and
  keeps the picker.

## Three traps worth knowing

- **kjnodes was NOT previously an SDXL dep** despite the template already using
  `ImageResizeKJv2` before the 2026-07-24 change — a latent gap. Both `kjnodes` **and**
  `controlnet_aux` are explicit deps on all 5 models.
- **`ComfyUI-Impact-Pack` was the same gap, found 2026-08-03.** `MaskDetailerPipe` /
  `To`-`FromBasicPipe` were always needed by the detail op and were never declared. It was
  survivable while detail lived in its own file; the master template makes ComfyUI
  submit-validate every node on EVERY run, which turns a missing pack into a failure of
  plain t2i. Now declared on all 5.
- **yaml needs ZERO edits.** `routes/yamlHelper.js` derives folder keys from dep filenames
  (`controlnet/...` → `controlnet:`) and `controlnet` is already in `coreExtras`, so it is
  auto-emitted for every user and Pod (`start.sh` maps `controlnet: mpi_models/controlnet/`).
  **Dropping a new dep with a new folder type is discoverable automatically — never hand-edit
  the yaml for one.**

## Annotator weights

`comfyui_controlnet_aux` auto-downloads what each preprocessor needs on first use. Canny and
Scribble are **weightless** filters. DepthAnythingV2's weights are already pulled by Klein;
**OpenPose's body/hand/face annotators are new to the app** and land on the first pose run,
not at install time.

## Pod

The ControlNet weight is **per-model, NOT an `engineAsset`** — it downloads on demand from R2
into the volume at model-install time. Both custom nodes are already baked into the image
(Dockerfile kjnodes + controlnet_aux). **No image rebuild required.**
