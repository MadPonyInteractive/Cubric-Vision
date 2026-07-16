# Krea2 — app injection seam

> Part of [docs/models/krea2/](README.md). The style table itself is in [style-loras.md](style-loras.md).

## Style system — SHIPPED DESIGN (read the graph, not the old proposal)

> **Superseded.** An earlier research proposal had the app inject a style *filename* into one
> `LoraLoaderModelOnly` plus a trigger string into a `PrimitiveStringMultiline`. **That is not
> what shipped.** The authored workflow is better; the notes below describe the real graph
> (`comfy_workflows/krea2_turbo_t2i.json`, API format).

**The app injects exactly TWO scalars for the whole style system.** No filenames, no strings.

| app injects | node `_meta.title` | class | effect |
|---|---|---|---|
| `int` 0–9 | `Input_Style` | `MpiInt` | selects the style (0 = none) |
| `float` | `Input_Stylization` | `MpiFloat` | that style's `strength_model` |

The graph carries **9 hardcoded `MpiLoraModel` nodes**, `Input_style_lora_1` … `_9`, each with
its `lora_name` baked in. Their `strength_model` is *linked*, not a widget — each is fed by an
`MpiMath` node evaluating:

```
b if a == N else 0.0      # a = Input_Style, b = Input_Stylization, N = this slot's index
```

So selecting style 5 drives slot 5 to the slider value and **zeroes the other eight**.
`Input_Style = 0` zeroes all nine.

**The same int also picks the trigger phrase.** `MpiPromptList` (title `styles`) holds the nine
phrases newline-joined in `options`, with `specific_item ← Input_Style` (1-indexed, `0` = none),
`prefix: ", "`, `suffix: "."`. Its output flows through `MpiPromptProcessor` into
`StringConcatenate.string_b`, with `Input_Positive` (`MpiText`) as `string_a`.

⇒ **One knob, both effects.** The two-list drift problem the old proposal worried about cannot
occur: the LoRA choice and the trigger phrase are driven by the same integer. Nothing to keep
in sync.

⇒ **`StringConcatenate` never needs to be injectable.** It is fed entirely from within the
graph. (Its `string_a`/`string_b` are still not in `targets` — see consequence 2 below — but
that no longer matters here.)

### Scaling to other models (LTX is next)

The style table lives **in the workflow**, not app-side. The app needs only the ordered label
list to build the dropdown and the `0 = none` convention. Keep the app's per-model style
metadata to `{ index, label }`; the filename and trigger phrase stay in the graph where they
cannot drift from each other.

### The rest of the injection surface

`comfyController.js` (`_inject`, ~L1113) — `targets` is:

```js
['value','text','int','float','boolean','string',
 'ckpt_name','model_name','unet_name','image','mask','picks',
 'lora_name','strength_model','strength_clip',
 'denoise','seed','noise_seed','video','audio','latent','select']
```

Two consequences that still bind:

1. `_inject` writes **every** matching input on the node, not the first. A `MpiLoraModel` has
   both `lora_name` and `strength_model`, so a bare-string injection would set the strength to
   the filename. Use the **object form** (`{lora_name, strength_model, strength_clip}`)
   special-cased at `comfyController.js:1141` — the path MPI-219 already built. This applies to
   the six **user** LoRA slots (`Input_Lora_1..6`), not the style rack.
2. `int` and `float` are both targets, so `Input_Style` / `Input_Stylization` inject as plain
   scalars. Nothing new is needed in `targets`.

Per the Comfy node-naming law (MPI-116), every injected node must be titled `Input_*` / `Output_*`.

### The full injection surface (read live from the three API-format workflows)

**`krea2_turbo_t2i.json`** — one graph serving **t2i + i2i + pose reference**:

| title | class | type | notes |
|---|---|---|---|
| `Input_Positive` | `MpiText` | string | `string_a` of the concat |
| `Input_Seed` | `MpiInt` | int | |
| `Input_Width` / `Input_Height` | `MpiInt` | int | must be **÷16** — see [resolution.md](resolution.md) |
| `Input_Style` | `MpiInt` | int | `0`–`9`, clamp |
| `Input_Stylization` | `MpiFloat` | float | default `1.0` |
| `Input_Image` | `LoadImage` | image | source for i2i **and** pose reference |
| `Input_Is_i2i` | `MpiSimpleBoolean` | boolean | `MpiIfElse`: `VAEEncode` vs `EmptyLatentImage`, **and** `Input_denoise` vs a dummy float |
| `Input_denoise` | `MpiFloat` | float | only consumed when `Input_Is_i2i` |
| `Input_pose_reference` | `MpiIfElse` | boolean | `Krea2ControlApply` vs passthrough of `Input_Lora_6` |
| `Input_Lora_1..6` | `MpiLoraModel` | object | the user LoRA rack |
| `Output_Image` | `PreviewImage` | — | capture |

**No negative-prompt node exists** — `ConditioningZeroOut` supplies the uncond. This is the
graph-level confirmation of `capabilities.negativePrompt: false`; a retained negative string has
nowhere to land.

#### Per-op injection contract (t2i graph)

`Input_Is_i2i` drives **two** `MpiIfElse` nodes: the latent source (`VAEEncode` vs
`EmptyLatentImage`) and the denoise value (`Input_denoise` vs a dummy float). So
**`Input_denoise` is structurally inert unless `Input_Is_i2i` is `true`.**

| op | `Input_Is_i2i` | `Input_denoise` | `Input_pose_reference` | `Input_Image` |
|---|---|---|---|---|
| `t2i` | `false` | — | `false` | — |
| `i2i` | **`true`** | **inject** | `false` | inject |
| pose reference | `false` | — | **`true`** | inject |

**i2i and pose reference COMPOSE.** `Input_Image` fans out to two independent branches —
`AIO_Preprocessor` (→ depth → `Krea2ControlImageEncode`) and `ImageResizeKJv2` (→ `VAEEncode`).
Neither is gated on the other, so both booleans may be `true` at once with one source image.

Two graph facts worth knowing:

- `ImageResizeKJv2` sets `divisible_by: 16` — the ÷16 rule is enforced in-graph on the i2i path.
- `Krea2ControlImageEncode.latent ← EmptyLatentImage` (**not** the `MpiIfElse` output). That is
  the `resize: match_latent_size` trap wired correctly, but it means the control image is sized
  to the *empty* latent even during i2i. Unverified whether that matters when both are on.

> ⚠ **The shipped graph uses `channel_mode: rgb`, `normalize: none`** on
> `Krea2ControlImageEncode` — [conditioning-and-control.md](conditioning-and-control.md) says
> depth wants `grayscale` + `per_image_minmax`. The graph is **live-proven**; that doc line came
> from research and is probably wrong for `DepthAnythingV2Preprocessor` (which emits RGB).
> Do not "fix" the graph to match the doc without a live A/B.

> ⚠ **`MpiPromptList.options` carries only EIGHT trigger phrases, but there are NINE style
> LoRAs.** `vintage tarot style` (index 9, `krea2_vintagetarot`) is missing. Selecting style 9
> loads the LoRA but appends no trigger — a silent half-application. Fix in the workflow, not
> app-side.

**`krea2_turbo_detailer.json`** (op `detail`): `Input_Image`, `Input_Mask` (`LoadImageMask`),
`Input_Positive`, `Input_Seed`, `Input_Denoise`, `Input_Lora_1..6`, `Output_image`.

**`krea2_turbo_upscaler.json`** (op `upscale`): `Input_Image`, `Input_Positive`, `Input_Seed`,
`Input_Denoise`, `Input_Auto_Grid` (`MpiSimpleBoolean`), `Input_Upscale_Model`
(`UpscaleModelLoader`), `Input_Lora_1..6`, `Output_image`.

> `Output_image` (lowercase `i`) in the detailer + upscaler is **correct**, not a typo. Capture
> titles are matched case-insensitively (`commandExecutor.js:7`), and `Chroma_detailer.json` /
> `Chroma_upscaler.json` use the same lowercase form. Only `*_t2i.json` uses `Output_Image`.
> Neither the style rack nor `Input_style_lora_N` is ever injected — do not add them to any
> injection map.

## Local install layout (`G:\CubricModels`)

```
loras/krea-2/style/krea2_*.safetensors      (9 files)
loras/krea-2/control/depth-control-lora.safetensors
diffusion_models/krea2_turbo_fp8_scaled.safetensors
text_encoders/qwen3vl_4b_fp8_scaled.safetensors
vae/qwen_image_vae.safetensors
```

**ComfyUI lists a LoRA by its path relative to the loras root, recursively.** So the loader
dropdown shows `krea-2\style\krea2_darkbrush.safetensors` — subfoldered, **backslash**
separated — not the bare filename. This is playbook §3's three-way-match rule: the loader
field, the dep `filename`, and the on-disk path must all agree. Subfoldering matches existing
convention (`loras/ltx-2.3/`, `loras/wan-2.2-5b/`), so keep it.

Two live consequences:

- The backslash form is what the app must inject. MPI-229 added a symmetric path heal
  (win-local `/`→`\`, remote basename-rewrite) in `comfyController.js`. Windows-local is now
  **proven** for Krea2's subfoldered LoRAs.
- **MPI-198 is still open**: that heal was extended to the LOCAL engine on Linux/macOS but is
  **coded, not live-verified**. A subfoldered LoRA on a non-Windows local engine is exactly
  the untested path. Expect to be the first to hit it. (RunPod does **not** test it — RunPod is
  the *remote* path.)

If ComfyUI shows an empty/stale LoRA list after adding files, its model list is cached —
refresh the browser / reload the workflow. Not a YAML bug. (`extra_model_paths.yaml` already
maps `cubric_models.loras: loras/` under `base_path: G:/CubricModels`.)

> `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` (9.38 GB) may also be on disk — it is
> Qwen2.5-VL-7B (hidden 3584), downloaded for a separate experiment. It is **NOT a Krea2 dep**;
> Krea2's encoder is `qwen3vl_4b` (Qwen3-VL-4B, hidden 2560). Do not put the 7B in
> `dependencies.js`.

## Prompt enhancement — cut it

The official template embeds an LLM prompt-expander (`TextGenerate` + system prompt +
switches). **Removed for Cubric Vision** (user decision, 2026-07-09): it over-expands and
drifts from the user's intent; a simple prompt tracked the idea better. Cubric Prompt is the
app's answer to enhancement.

Bonus: this dissolves the enhancer-vs-style-LoRA tension (expander wants long prompts, style
LoRAs want short ones).

## Edit op — masked identity-edit (MPI-282)

Edit shares the t2i graph. The app injects `Input_Is_Edit: true` (commandRegistry `edit`
op `injectParams`, baked FALSE — same contract as `Input_Is_i2i`) to route the identity-edit
LoRA path. An **optional** `Input_Mask` (MpiString path node, painted in the History workspace
only) drives a masked crop via `InpaintCropImproved` → sample → `InpaintStitchImproved`; empty
mask → whole-image edit (the `MpiAnyChecker` on `Input_Mask` gates it). The mask flows through
the standard MPI-272 path→string pipe (data-URL staged, path injected) — no edit-specific code.

- **Dep:** `comfyui-inpaint-cropandstitch` (`lquesada/ComfyUI-Inpaint-CropAndStitch`,
  `installRequirements:false`, rides the volume) on ALL 4 cards. `comfyui-krea2edit` too
  (Turbo cards were missing it — the shared graph references `Krea2Edit*` classes, and ComfyUI
  validates every node class before `MpiIfElse` picks a branch).
- **Edit op has NO user controls** (`components: []`). The style-LoRA rack was tried and
  reverted: style LoRAs and the identity-edit LoRA don't compose (edit degrades). A
  `Force_1024` crop toggle (`Input_HiRes_Mode`) was also tried and dropped (didn't help
  enough). Both nodes stay in the graph, baked/scrubbed to safe defaults, just not exposed.
