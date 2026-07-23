# MPI-242 — the three shipped workflows (read from the API JSON, 2026-07-10)

> Authored by the user, uploaded to `comfy_workflows/`. **Already API format.**
> Everything below is read from the files, not from earlier research. Where the older
> research disagrees, **the graph wins**.

| file | ops served |
|---|---|
| `krea2_turbo_t2i.json` (62 nodes) | `t2i` + `i2i` + **pose reference** (depth ControlNet) |
| `krea2_turbo_detailer.json` (19) | `detail` |
| `krea2_turbo_upscaler.json` (27) | `upscale` |

## Node packs

**NEW (must add to `dependencies.js` + `node_lock.json`):**

| pack | classes used | note |
|---|---|---|
| `facok/comfyui-krea2-controlnet` | `Krea2ControlLoRALoader`, `Krea2ControlImageEncode`, `Krea2ControlApply` | pin `@79ebfd3`; **no `requirements.txt`** ⇒ `installRequirements: false` |
| `comfyui_controlnet_aux` | `AIO_Preprocessor` (`DepthAnythingV2Preprocessor`, res 512) | |

**Already deps:** `RES4LYF` (`ClownsharKSampler_Beta` ×2), `KJNodes` (`ImageResizeKJv2`,
`ResizeImageMaskNode`), `Impact-Pack` (`MaskDetailerPipe`, `ToBasicPipe`, `FromBasicPipe`),
`ComfyUI_UltimateSDUpscale`, `ComfyUI-MpiNodes`.

## Weights — 10 LoRAs + 3 models (user-confirmed; all present on `G:/CubricModels`)

| what | n | bytes each | status |
|---|---|---|---|
| style LoRAs `krea-2\style\krea2_*.safetensors` | 9 | `469,291,992` (all identical) | **NEW upload** |
| depth control `krea-2\control\depth-control-lora.safetensors` | 1 | `861,995,928` | **NEW upload** |
| transformer `krea2_turbo_fp8_scaled.safetensors` (`UNETLoader`) | 1 | `13,141,730,784` | **NEW upload** |
| text encoder `qwen3vl_4b_fp8_scaled.safetensors` (`CLIPLoader`) | 1 | `5,242,467,968` | **NEW upload** |
| VAE `qwen_image_vae.safetensors` (`VAELoader`) | 1 | — | **only weight already on R2** → reuse dep `vae-qwen-image` |
| upscaler `4x_NMKD-Siax_200k.pth` | 1 | — | already a shared dep |

⇒ **12 new uploads, 21.86 GiB total.** Verified present on `G:/CubricModels` (0 missing).
LoRA paths are subfoldered + **backslash** (rides the MPI-229 heal).

**Baked LoRAs as deps is a PROVEN pattern, not a first.** LTX-2.3 already ships three
(`ltx23-lora-merged`, `-transition`, `-talkvid`) and Wan-5B one. Declare Krea2's ten the same
way: `filename: 'loras/krea-2/...'`, a `size` string, and **no `type` field** (only
`custom_nodes` / `json` carry `type`).

⚠ `isWeightDep()` counts every LoRA dep toward `totalWeightsGb()`. For LTX that is right (all
three load every run). For Krea2 it **over-counts by 3.50 GB**, since the 9 style LoRAs are
mutually exclusive — `MpiLoraModel.apply_lora` returns early at `strength_model == 0`
(`loras.py:100`) and `MpiMath` zeroes eight of nine. **Measured impact: none.** 22.10 / 18.60 /
17.36 GB all yield the same table. Do **not** special-case `footprint.js`.

✅ **No ≥20 GB file.** Largest is the 13.14 GiB transformer, under the playbook §4 hot-store
gate (`docs/add-model-playbook.md:203`). No user ping, no hot-store staging needed.

Upload with `--s3-no-check-bucket` + `--bwlimit 3M` (playbook). Then `/mpic-compute-dep-hashes`.

## The style system — TWO injected scalars, nothing else

9 `MpiLoraModel` nodes titled `Input_style_lora_1..9` with **hardcoded `lora_name`** and a
**linked** `strength_model`. Each strength comes from an `MpiMath`:

```
b if a == N else 0.0     # a = Input_Style (MpiInt), b = Input_Stylization (MpiFloat)
```

Selecting style N drives slot N to the slider value and **zeroes the other eight**.
`Input_Style = 0` zeroes all nine.

The **same int** feeds `MpiPromptList.specific_item` (title `styles`, `prefix: ", "`,
`suffix: "."`), whose output goes through `MpiPromptProcessor` → `StringConcatenate.string_b`,
with `Input_Positive` as `string_a`. **One knob, both effects — no two-list drift.**

⇒ The app injects **`Input_Style` (int 0–9)** and **`Input_Stylization` (float, default 1.0)**.
Never a filename, never a trigger string. `StringConcatenate` never needs to be injectable.

### UI labels (stem after `krea2_`, title-cased)

| 0 | No Style | 4 | Neon Drip | 7 | Soft Water Color |
|---|---|---|---|---|---|
| 1 | Dark Brush | 5 | Rainy Window | 8 | Sunset Blur |
| 2 | Dot Matrix | 6 | Retro Anime | 9 | Vintage Tarot |
| 3 | Kids Drawing | | | | |

At index `0` the Stylization slider must be **disabled**.

### ✅ trigger list — FIXED 2026-07-10

`MpiPromptList.options` briefly had only 8 lines for 9 LoRAs (`vintage tarot style` missing).
The user re-authored + re-uploaded. **Verified: 9 triggers, 9 LoRAs, index-aligned.**

## Per-op injection contract (t2i graph)

`Input_Is_i2i` (`MpiSimpleBoolean`) drives **two** `MpiIfElse`: latent source
(`VAEEncode` vs `EmptyLatentImage`) **and** denoise (`Input_denoise` vs a dummy float).
⇒ `Input_denoise` is structurally inert unless `Input_Is_i2i` is `true`.

| op | `Input_Is_i2i` | `Input_denoise` | `Input_pose_reference` | `Input_Image` |
|---|---|---|---|---|
| `t2i` | `false` | — | `false` | **placeholder.png** |
| `i2i` | **`true`** | **inject** | `false` | user image |
| pose reference | `false` | — | **`true`** | user image |

**i2i and pose reference COMPOSE.** `Input_Image` (`LoadImage`, node 201) fans out to two
independent branches — `AIO_Preprocessor` (→ depth → ControlNet) and `ImageResizeKJv2`
(→ `VAEEncode`). Neither is gated on the other.

- `ImageResizeKJv2` sets `divisible_by: 16` — the ÷16 rule is enforced in-graph on i2i.
- `Krea2ControlImageEncode.latent ← EmptyLatentImage` (NOT the `MpiIfElse` output). Correct per
  the `match_latent_size` trap, but the control image sizes to the *empty* latent even during
  i2i. Unverified whether that matters when both are on.

### ⚠ placeholder.png — the t2i graph only (detailer/upscaler are FINE)

**Corrected 2026-07-10 (user).** Do **not** edit the detailer/upscaler JSON. They bake local
scratch filenames (`ComfyUI_temp_iacob_00003_.png`, `clipspace/*`) — and so does
**`Chroma_detailer.json` / `Chroma_upscaler.json`**, which have shipped for months. An op that
*always* receives an image has its `LoadImage` widget overwritten by the injector before submit,
so the baked value is never read. Nothing to fix.

**The t2i graph is the exception**, because it is the one op that may run with **no image at
all** (plain t2i, `Input_Is_i2i=false`, `Input_pose_reference=false`). Nothing is injected into
`Input_Image`, so ComfyUI validates the **baked** filename and fails if the file is absent
(`commandExecutor.js:81-84`: *"baked placeholder filenames must exist in the engine input/ or
the graph fails validation"*).

Precedent — every other text-to-X workflow with an OPTIONAL image bakes `placeholder.png`:

| workflow | LoadImage nodes | baked |
|---|---|---|
| `LTX_t2v*.json` | `Input_Start_Frame`, `Input_End_Frame` | `placeholder.png` |
| `Wan5B_t2v.json` | `Input_Start_Frame` | `placeholder.png` |
| `Chroma_t2i.json` | *(none)* | — |
| **`krea2_turbo_t2i.json`** | `Input_Image` (node 201) | `ComfyUI_temp_duvbo_00001_.png` ❌ |

**Two things are needed, and only one is a workflow change:**

1. **Bake `placeholder.png` into t2i node 201** (set in ComfyUI, re-export — never hand-edit).
   User says the app injects the placeholder on first run; verify that covers a graph whose
   `LoadImage` is *optional* rather than *required*.
2. **`_prepareWorkflowInputs` early-returns for image ops** —
   `commandExecutor.js:85` → `if (COMMANDS[op]?.mediaType !== 'video') return;`.
   `placeholder.png` is already in `WORKFLOW_INPUT_DEFAULTS` (`routes/comfy.js:65`) and on disk
   at `comfy_workflows/input/`, and the route already handles both engines (local copy vs Pod
   upload) — but it is **never staged for an image op**. Krea2 is the first image model whose
   t2i carries a `LoadImage`, so this gate has never had to open. **It must widen.**

## Other injection points

**t2i:** `Input_Positive` (`MpiText`), `Input_Seed`, `Input_Width`, `Input_Height` (`MpiInt`,
÷16), `Input_Lora_1..6` (`MpiLoraModel`, user rack), `Output_Image` (`PreviewImage`).

**detailer:** `Input_Image`, `Input_Mask` (`LoadImageMask`), `Input_Positive`, `Input_Seed`,
`Input_Denoise`, `Input_Lora_1..6`, `Output_image`.

**upscaler:** `Input_Image`, `Input_Positive`, `Input_Seed`, `Input_Denoise`, `Input_Auto_Grid`
(`MpiSimpleBoolean`), `Input_Upscale_Model` (`UpscaleModelLoader`), `Input_Lora_1..6`,
`Output_image`.

> `Output_image` (lowercase `i`) in detailer + upscaler is **correct** — capture titles match
> case-insensitively (`commandExecutor.js:7`) and `Chroma_detailer/upscaler.json` do the same.

**No style rack in the detailer or upscaler.** Styles are **t2i-only** — DECIDED (user,
2026-07-10): the prompt box must **hide the Style dropdown + Stylization slider on `detail`
and `upscale`**. Gate them per-op, the same shape as `capabilities.negativePrompt`. Krea2's
`i2i` and pose reference DO share the t2i graph, so they keep the style controls.

**No negative-prompt node anywhere** — `ConditioningZeroOut` supplies the uncond. Graph-level
confirmation of `capabilities.negativePrompt: false`.

## Doc-vs-graph discrepancy (do NOT "fix" without a live A/B)

`Krea2ControlImageEncode` ships `channel_mode: rgb`, `normalize: none`.
`docs/krea2/conditioning-and-control.md:108` says depth wants `grayscale` +
`per_image_minmax`. The graph is **live-proven**; the doc line is research. Likely the doc is
wrong for `DepthAnythingV2Preprocessor` (emits RGB). Left as-is.
