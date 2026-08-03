# Krea2 — app injection seam

> Part of [docs/models/krea2/](README.md). The style table itself is in [style-loras.md](style-loras.md).

## Style system — SHIPPED DESIGN (read the graph, not the old proposal)

> **Superseded.** An earlier research proposal had the app inject a style *filename* into one
> `LoraLoaderModelOnly` plus a trigger string into a `PrimitiveStringMultiline`. **That is not
> what shipped.** The authored workflow is better; the notes below describe the real graph
> (`comfy_workflows/krea2_t2i_<sfw|nsfw>.json`, API format).

**The app injects exactly TWO scalars for the whole style system.** No filenames, no strings.

| app injects | key | widget | effect |
|---|---|---|---|
| `int` 0–10 | `Input_Style_Selector.selector` | `selector` | selects the style (0 = none) |
| `float` | `Input_Style_Selector.strength_model` | `strength_model` | that style's `strength_model` |

Both land on ONE node: an `MpiStyleSelector` titled `Input_Style_Selector`, which also holds
the ten trigger phrases (one per line in `triggers`). It feeds **two chained `MpiStyleLoras`
banks** (`lora_1..lora_5` each) carrying the ten hardcoded style LoRA filenames in picker
order. Style N = trigger line N = the Nth slot along the chain; `selector = 0` passes model
and clip through untouched and emits an empty prompt.

The banks' `prompt` output flows through `MpiPromptProcessor` into
`StringConcatenate.string_b`, with `Input_Positive` (`MpiText`) as `string_a`.

Since the two knobs sit on one node they are injected per-widget with the dotted
`Title.widget` key — see [../../workflow-authoring/style-rack.md](../../workflow-authoring/style-rack.md).
(MPI-359 replaced the old rack: `Input_Style` `MpiInt` + ten `MpiMath` gates +
`Input_style_lora_1..10` + an `MpiPromptList`. Those titles no longer exist in any graph.)

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
2. `targets` is irrelevant to the style rack now: both style knobs use the dotted
   `Input_Style_Selector.<widget>` key, which writes the named widget directly and skips the
   `targets` sweep entirely.

Per the Comfy node-naming law (MPI-116), every injected node must be titled `Input_*` / `Output_*`.

### The full injection surface (read live from the three API-format workflows)

**`krea2_t2i_<sfw|nsfw>.json`** — one graph serving **t2i + i2i + depth reference + edit**:

| title | class | type | notes |
|---|---|---|---|
| `Input_Positive` | `MpiText` | string | `string_a` of the concat |
| `Input_Seed` | `MpiInt` | int | |
| `Input_Width` / `Input_Height` | `MpiInt` | int | must be **÷16** — see [resolution.md](resolution.md) |
| `Input_Style_Selector.selector` | `MpiStyleSelector` | int | `0`–`10`, clamp |
| `Input_Style_Selector.strength_model` | `MpiStyleSelector` | float | default `1.0` |
| `Input_Image` | `LoadImage` | image | source for i2i **and** depth reference |
| `Input_Is_i2i` | `MpiSimpleBoolean` | boolean | `MpiIfElse`: `VAEEncode` vs `EmptyLatentImage`, **and** `Input_denoise` vs a dummy float |
| `Input_denoise` | `MpiFloat` | float | only consumed when `Input_Is_i2i` |
| `Input_depth_reference` | `MpiIfElse` | boolean | `Krea2ControlApply` vs passthrough of `Input_Lora_6` |
| `Input_Lora_1..6` | `MpiLoraModel` | object | the user LoRA rack |
| `Input_Negative` | `MpiText` | string | **quality tier only** — see the tier note below |
| `Input_Tier` | `MpiInt` | int | **1** = quality, **2** = fast. See below |
| `Output_Image` | `PreviewImage` | — | capture |

#### The tier toggle (MPI-316)

`Input_Tier` is the **runtime** speed switch, injected by the `krea2Turbo` PromptBox control
(scope `perModel` — turbo is a MODE that must hold across t2i → detail → upscale, not a per-op
setting). It replaced the old separate Turbo cards:

- **1 = quality** — 25 steps @ cfg 3.5, then the 3-step refiner. Negative prompt **works**.
- **2 = fast** — 8 steps @ cfg 1.0, then the same refiner. The `Accelerator Lora` gate
  (an `MpiMath`, `0.0 if a == 1 else 1.0`, keyed off `Input_Tier`) raises the turbo-distill
  LoRA to strength 1.0, reconstructing the old Turbo transformer from the Raw weights.

> The accelerator gate is **correct as written** — at tier 1 the strength is 0.0 and
> `MpiLoraModel.apply_lora` short-circuits without loading the file. Do **not** "fix" it to
> look like the style-LoRA gates.

The templates bake `Input_Tier: 1` as a **safe default only**; the injected value always wins.
The bake exists so a silent injection failure (a title mismatch drops the param with no error)
degrades to the quality tier rather than shipping whatever was last exported.

**Negative prompt is tier-dependent.** At tier 2 (cfg 1) classifier-free guidance is inactive —
the negative conditioning is computed, then discarded. So the PromptBox **hides the negative
toggle while turbo is ON** (the control emits `prompt:krea2-turbo`, on mount as well as on
click). The typed text is kept in memory and restored on flip back — flipping tiers must never
destroy the user's work. Before the collapse this gating was structural (a separate Turbo card
declared `negativePrompt: false`); it is now a live UI concern.

#### Per-op injection contract (t2i graph)

`Input_Is_i2i` drives **two** `MpiIfElse` nodes: the latent source (`VAEEncode` vs
`EmptyLatentImage`) and the denoise value (`Input_denoise` vs a dummy float). So
**`Input_denoise` is structurally inert unless `Input_Is_i2i` is `true`.**

| op | `Input_Is_i2i` | `Input_denoise` | `Input_depth_reference` | `Input_Image` |
|---|---|---|---|---|
| `t2i` | `false` | — | `false` | — |
| `i2i` | **`true`** | **inject** | `false` | inject |
| depth reference | `false` | — | **`true`** | inject |

**i2i and depth reference COMPOSE.** `Input_Image` fans out to two independent branches —
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

## One master template (MPI-365)

> **`krea2_detailer_*` and `krea2_upscaler_*` NO LONGER EXIST.** All six ops now run
> `krea2_t2i_<sfw|nsfw>.json`. `MaskDetailerPipe`, `UltimateSDUpscale` and
> `UpscaleModelLoader` moved into that one graph as branches 6 and 7. Delete nothing else
> looking for them — they are gone from `raw/`, from `workflow_generation/` and from
> `comfy_workflows/`.

The branch is chosen by **`Input_wf_type`** (an `MpiInt`), injected from the ModelDef's
`opInject` map — never by the op's own `injectParams`, because `commandExecutor._buildParams`
REPLACES rather than merges when a model declares `opInject`:

| `Input_wf_type` | op |
|---|---|
| 1 | `t2i` |
| 2 | `i2i` |
| 3 | `control` |
| 4 | `krea2Edit` |
| 5 | *(unused — edit takes an optional mask, so there is no separate inpaint branch)* |
| 6 | `detail` |
| 7 | `upscale` |

A missing `opInject` entry does **not** error: it runs the baked default (1 = t2i) and
returns a plausible image from the wrong operation. `generate_krea2.py::_bake_wf_type`
raises if the node is absent, `commandExecutor` warns on a gap, and
`tests/inject-params-titles.test.cjs` pins the node's presence in both runtime files.

Retired with the old shape: `Input_Is_i2i`, `Input_Is_Edit`, `Input_depth_reference`
(replaced by `wf_type`) and `Input_Tier` (now the boolean **`Input_is_Turbo`**). The test
asserts those four titles are ABSENT — a leftover would be a rival branch selector nothing
drives. Note `Input_Tier` still exists in **Qwen's** graph; it is a different control.

New injection surface on this graph: `Input_Mask` (optional — empty self-gates to a
whole-image edit), `Input_Image_2` (the depth line's subject reference),
`Input_Auto_Grid`, `Input_Upscale_Factor`, `Input_Upscale_Model`, `Input_is_Turbo`, and
`Input_depth_strength`.

`Input_depth_strength` was authored-only through the migration and became a control
afterwards: the **Depth Strength** slider (`depthStrength` in `PromptBoxControls.js`,
`scope: 'perOp'`, on the `control` op only, as `controlStrength` → `Input_Control_strength`). The slider value IS the
`Krea2ControlLoRALoader` `strength` — no mapping, no scaling.

Range **0–1.00, step 0.05, default 1.00** (the graph's own bake). It is a LOOSENING knob and
that is why it was added: at 1.00 the depth map is too strict — it pins the composition so
hard the prompt cannot move anything. **0.6–0.8 is the working band**, where the pose still
reads but the model may reinterpret the framing. At 0 the loader early-returns the unpatched
model and the op stops being a control op. **1.00 is the deliberate ceiling** — the node
accepts ±100, but a 1.5 test returned the subject's clothing dissolved into ribbons, so
overdrive is capped out rather than offered. Krea2-only, gated on `capabilities.depthStrength`, because Klein and Qwen
condition on the depth image directly and have no equivalent strength.

> The style rack's LoRA banks are never injected — only the two dotted
> `Input_Style_Selector` widgets are; do not add the banks to any injection map. The rack
> now reaches **every** op including `detail` and `upscale` (`styleOps` in the ModelDef),
> which the old rack-less detailer/upscaler files could not offer.

## Local install layout (`G:\CubricModels`)

```
loras/krea-2/style/krea2_*.safetensors      (9 files)
loras/krea-2/control/depth-control-lora.safetensors
diffusion_models/krea2_raw_int8_convrot.safetensors        (SFW; NSFW = lustify-v10-krea-raw-int8_convrot)
loras/krea-2/extra/krea2_turbo_distill_r128.safetensors     (accelerator = the fast tier)
text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors
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

## Prompt enhancement — LIVE, and the system prompt MUST be a real chat turn

The graph runs an LLM prompt-expander (`TextGenerate` on the `qwen3vl_4b` encoder), gated by
`Input_enhance_prompt` (bakes FALSE — the app toggle drives it). An earlier note here said it
was cut on 2026-07-09; that was reverted and the enhancer is load-bearing. It is the app's
only enhancer.

**The trap (2026-07-19).** `TextGenerate` wraps its whole `prompt` string in ONE
`<|im_start|>user` block. Concatenating a system prompt in front of the user's text therefore
delivers the rules as *user-turn text with no authority* — the 4B abliterated encoder treats
them as subject matter, not constraints, and narrates its way through them into
`Output_prompt` ("Wait, I need to re-read… Rule 1: … Rule 2: …"). That text is the prompt, so
it reaches the sampler and gets RENDERED INTO THE IMAGE. It quotes banned words while breaking
them; no amount of rule rewording fixes it (adding rules makes it worse — a longer checklist
to narrate).

**The fix — hand-built chat scaffold.** `Qwen3VLTokenizer.tokenize_with_weights`
(`comfy/text_encoders/qwen3vl.py`) sets `skip_template = text.startswith('<|im_start|>')`, so a
prompt that already carries turn markers is passed through verbatim. Assemble exactly:

```
<|im_start|>system\n{RULES}<|im_end|>\n<|im_start|>user\n{USER}<|im_end|>\n<|im_start|>assistant\n
```

Newline after each `<|im_start|>role`; NO newline before `<|im_end|>`. Built from node 420
(system + trailing `<|im_start|>user`), the user prompt, and a closer node — joined by
`StringConcatenate` (plain `delimiter.join`, empty delimiter; ComfyUI widgets trim trailing
newlines, so a bare `"\n"` concat node supplies the missing one). A `StringReplace` strips the
leading newline the assistant turn returns — expected, not a bug.

Caveats: `skip_template` also bypasses the `<think>\n\n</think>` suppressor that the default
path appends when `thinking:false` — the system turn carries compliance instead; do not
hand-add the block (whitespace-sensitive, and it broke generation when malformed).
`use_default_template` is then inert (auto-detect wins). Rule text: derived from Krea's
official `docs/expansion.txt`, which *sanctions* a deliberation step — deleting that step while
keeping rules that require deliberation is what created the leak, as did a word-count FLOOR
fighting the "already detailed → polish" rule. Keep the floor a ceiling.

Style-LoRA tension is real (expander wants long prompts, style LoRAs want short) — rule 1
("never repeat a choice the user already made") is what holds it in check.

## Edit op — WHOLE-IMAGE identity-edit (MPI-282, de-masked in `b3f9a018`)

Edit shares the t2i graph. The app injects `Input_Is_Edit: true` (commandRegistry `edit`
op `injectParams`, baked FALSE — same contract as `Input_Is_i2i`) to route the identity-edit
LoRA path. **The edit is whole-image, at our provided dimensions. There is no mask.**

> ⚠ **This section used to describe an `Input_Mask` → `InpaintCropImproved` → sample →
> `InpaintStitchImproved` path. That was REMOVED on 2026-07-16 by `b3f9a018` ("masked edits
> gave inconsistent results") and the doc did not follow. Verified 2026-07-25: no krea2 graph
> contains `InpaintCropImproved`, and `Input_Mask` now exists only in the DETAILER workflows.**

### Why the masked crop failed — read before re-adding one

The removed config was already feathered (`mask_blend_pixels: 32`,
`context_from_mask_extend_factor: 1.2`, crop resized to 1024²), so blending was **not** the
missing piece. The symptom was a visible mask-shaped tone patch, which feathering cannot fix
because the offset is region-wide, not boundary-local. Three causes, in likely order:

1. **Context starvation** — a 1.2× margin means the model white-balances to the crop, not to
   the scene.
2. **Double lanczos resample** — crop → 1024² → back.
3. **VAE round-trip on the pasted region only** — the surrounding pixels never went through
   the VAE.

`ImageCompositeMasked` (what `remove_background.json` node `9` uses, and what the v1.2
community workflows use for localized edits) removes 1 and 2 outright — the model generates
the full frame at native resolution and you keep only the masked part. Cause 3 survives but
becomes uniform instead of patch-shaped; if a tone patch still shows, round-trip the
DESTINATION through `VAEEncode` → `VAEDecode` so both sides carry identical VAE error.
Crop-and-stitch still wins for 4K/8K sources with a small edit region — sampling the full
frame there is not affordable. See MPI-347.

### Deps + controls

- **Dep:** `comfyui-krea2edit` on BOTH cards (the shared graph references `Krea2Edit*`
  classes, and ComfyUI validates every node class before `MpiIfElse` picks a branch — Turbo
  cards were missing it).
- **`comfyui-inpaint-cropandstitch` is no longer a Krea2 dep** (removed 2026-07-25). No krea2
  graph has referenced those classes since `b3f9a018`. The listing had outlived its path and
  was silently the only reason the pack installed for the Head Swap app, whose own declaration
  was missing; the app now declares it on its `requiredDeps` and is the sole consumer. Do not
  re-add it here unless a Krea2 graph actually calls `InpaintCrop*`/`InpaintStitch*`.
- **Edit op has NO user controls** (`components: []`). The style-LoRA rack was tried and
  reverted: style LoRAs and the identity-edit LoRA don't compose (edit degrades). A
  `Force_1024` crop toggle (`Input_HiRes_Mode`) was also tried and dropped (didn't help
  enough).
