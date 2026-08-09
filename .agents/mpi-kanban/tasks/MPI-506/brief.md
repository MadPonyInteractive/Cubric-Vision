# MPI-506 - SeedVR2 as three plugins feeding the upscale dropdown

Goal: the History **video** Upscale tool lets the user pick between **None**, an
**upscale model in `.pth` format** (today's list), and any **installed SeedVR2
plugin**. Three plugins ship: **SeedVR2 3B**, **SeedVR2 7B**, **SeedVR2 7B Sharp**.
Fabio updates `comfy_workflows/video_upscale.json` himself; this card owns the app
side plus the mechanism that lets a plugin contribute a dropdown entry.

**Decided (Fabio, 2026-08-09):** these are **plugins**, not a ModelDef. A weight
that only upscales and generates nothing has no business in the model picker.
[MPI-507](../MPI-507/brief.md) moves NVIDIA PiD onto the same mechanism for the
**image** upscale tool - build the mechanism here, reuse it there.

---

## 1. What SeedVR2 is, and why it is not "another upscaler"

ByteDance-Seed's **SeedVR2** is a **one-step diffusion video restoration** model,
not a tiled ESRGAN. It re-synthesises detail rather than sharpening what is
there, and it processes video in **temporal chunks** with an overlap so frames
stay consistent - hence the `SeedVR2TemporalChunk` / `SeedVR2TemporalMerge`
node pair. Practical consequences for the tool:

- It **hallucinates** detail. On a clean source that is a win; on a face it can
  drift identity. It is a *restorer*, so degraded/compressed footage is where it
  earns its size.
- It has no native "xN" concept - the pipeline is *resize to target, pad
  (`SeedVR2Preprocess`), restore, unpad+colour-correct (`SeedVR2PostProcessing`)*.
  The existing **x1.5 / x2 / x3 / x4** radio still works: it drives the pre-resize.
  No UI change needed there. (Contrast PiD on MPI-507, which is fixed 1024->4096.)
- VRAM is governed by **`frames_per_chunk`**, not by clip length. That is the
  knob that turns an OOM into a slow run - but `chunking_mode: auto` picks it for
  us (see §4a).

**Licence: Apache-2.0** on all ByteDance-Seed and Comfy-Org repos. No territory
restriction, unlike MiniMax H3 - see memory `project_model_licences_can_be_territory_restricted`.

## 2. Engine: nothing to bump (verified, not assumed)

Native ComfyUI support landed in **PR #14424, merged 2026-07-10**, first
released in **v0.28.0** (2026-07-15). `dev_configs/node_lock.json` pins
**v0.30.0** (2026-08-03), so the nodes already ship.

Probed the running engine on **:48188** (the app engine, not the :8188 bench):

```
SeedVR2Preprocess, SeedVR2Conditioning, SeedVR2PostProcessing,
SeedVR2TemporalChunk, SeedVR2TemporalMerge     (python_module: comfy_extras.nodes_seedvr)
```

`comfyui_version: 0.30.0`. **No engine bump, no custom node pack.** Explicitly do
**not** wire `numz/ComfyUI-SeedVR2_VideoUpscaler` - it predates core support and
would add a pack to `node_lock.json` for nothing.

### 2a. SeedVR2 TAKES NO PROMPT - answered, not assumed

Fabio asked what SeedVR2 needs. Full node signatures pulled from `/object_info`
on :48188:

| Node | Inputs | Outputs |
|---|---|---|
| `SeedVR2Preprocess` | `resized_images: IMAGE` | `images: IMAGE` |
| `SeedVR2Conditioning` | `model: MODEL`, `vae_conditioning: LATENT` | `positive`, `negative` CONDITIONING |
| `SeedVR2PostProcessing` | `images: IMAGE`, `original_resized_images: IMAGE`, `color_correction_method: COMBO` | `images: IMAGE` |
| `SeedVR2TemporalChunk` | `latent: LATENT`, `temporal_overlap: INT`, `chunking_mode: dynamic combo` | `latents: LATENT`, `temporal_overlap: INT` |
| `SeedVR2TemporalMerge` | `latents: LATENT`, `temporal_overlap: INT` | `latent: LATENT` |

**`SeedVR2Conditioning` builds BOTH positive and negative conditioning from a VAE
latent** - `"Build SeedVR2 positive/negative conditioning from a VAE latent."`
There is no text input, no CLIP input and no text encoder anywhere in the weight
set (only `diffusion_models/` + `vae/`, §3). So:

**SeedVR2 needs NO prompt field and NO denoise slider.** It is one-step; there is
no denoise to expose. It contributes a plain dropdown entry with **zero extra
controls** - the opposite of PiD on MPI-507, which needs both. That is the pair
of cases the conditional-controls mechanism (§4a) has to cover.

The knobs it *does* have, and the recommendation for each:

| Knob | Where | Values | Ship as |
|---|---|---|---|
| `chunking_mode` | `SeedVR2TemporalChunk` | `auto` \| `manual` | **`auto`** - the tooltip says it *"predict[s] the largest chunk that fits free VRAM"*. That is the VRAM problem solved with no UI. |
| `frames_per_chunk` | manual mode only | default 21, **must be 4n+1** | not exposed - `auto` owns it. The 4n+1 constraint is a UI trap avoided by not having the UI. |
| `temporal_overlap` | `SeedVR2TemporalChunk` | INT, default 0 | fixed default; crossfaded with a Hann window at merge. Raise only if seams show. |
| `color_correction_method` | `SeedVR2PostProcessing` | `lab` (default) \| `wavelet` \| `adain` \| `none` | **`lab`** - documented as *"most faithful"*. Workflow-side constant unless benching says otherwise. |

## 3. The weights - full size table

Canonical repo: **`Comfy-Org/SeedVR2`** on Hugging Face (Apache-2.0). Sizes read
from the HF API, GB = 10^9 bytes. Mirror to R2 per the usual weight-hosting rule.

`diffusion_models/`:

| File | Size | Notes |
|---|---:|---|
| `seedvr2_3b_fp16.safetensors` | 6.78 GB | 3B reference precision |
| **`seedvr2_3b_fp8_e4m3fn.safetensors`** | **3.39 GB** | **-> plugin `seedvr2-3b`** |
| `seedvr2_3b_int8_convrot.safetensors` | 3.46 GB | bigger than fp8, needs the rotation path |
| `seedvr2_3b_mxfp8.safetensors` | 3.56 GB | Blackwell-class format |
| `seedvr2_3b_nvfp4.safetensors` | 2.00 GB | Blackwell-only (RTX 50xx) |
| `seedvr2_7b_fp16.safetensors` | 16.48 GB | 7B reference precision |
| **`seedvr2_7b_fp8_e4m3fn.safetensors`** | **8.24 GB** | **-> plugin `seedvr2-7b`** |
| `seedvr2_7b_int8_convrot.safetensors` | 8.33 GB | |
| `seedvr2_7b_mxfp8.safetensors` | 8.58 GB | Blackwell-class |
| `seedvr2_7b_nvfp4.safetensors` | 4.76 GB | Blackwell-only |
| `seedvr2_7b_sharp_fp16.safetensors` | 16.48 GB | "sharp" tune |
| **`seedvr2_7b_sharp_fp8_e4m3fn.safetensors`** | **8.24 GB** | **-> plugin `seedvr2-7b-sharp`** |
| `seedvr2_7b_sharp_int8_convrot.safetensors` | 8.33 GB | |
| `seedvr2_7b_sharp_mxfp8.safetensors` | 8.58 GB | |
| `seedvr2_7b_sharp_nvfp4.safetensors` | 4.76 GB | |

`vae/`:

| File | Size | Notes |
|---|---:|---|
| **`seedvr2_ema_vae_fp16.safetensors`** | **0.50 GB** | **shared by ALL THREE plugins - mandatory** |
| `ema_vae_fp16.safetensors` | 0.50 GB | same weight, legacy name from `numz/SeedVR2_comfyUI` |

There is **one VAE for all variants**. It is not optional and not per-size, so it
is a single dep listed by all three plugins. That is exactly what
`pluginRequiredDepIds()` already handles: it unions every plugin's deps, so the
shared VAE survives while *any* SeedVR2 plugin is still installed.

### Per-plugin footprint

| Plugin | Weight | + shared VAE | Install cost (first) | (subsequent) |
|---|---:|---:|---:|---:|
| `seedvr2-3b` | 3.39 GB | 0.50 GB | **3.89 GB** | 3.39 GB |
| `seedvr2-7b` | 8.24 GB | 0.50 GB | **8.74 GB** | 8.24 GB |
| `seedvr2-7b-sharp` | 8.24 GB | 0.50 GB | **8.74 GB** | 8.24 GB |
| all three | 19.87 GB | 0.50 GB | **20.37 GB** | - |

### Why fp8_e4m3fn for all three

- **fp8 over fp16** - half the download and roughly half the weight VRAM. Nobody
  has published a quality delta that justifies 6.78/16.48 GB for a restoration
  pass. fp8_e4m3fn is native on Ada (RTX 40xx) and above, and falls back elsewhere.
- **not int8_convrot** - *larger* than fp8 (3.46 vs 3.39, 8.33 vs 8.24) and buys
  nothing unless the convolution-rotation path is specifically exercised.
- **not mxfp8 / nvfp4** - Blackwell-class numeric formats. `nvfp4` is the only
  genuinely small 7B (4.76 GB) and is worth revisiting **as a fourth plugin**
  once the RTX 50xx share matters, but it cannot be the default on a product that
  still ships to 30-series cards.

### 3B vs 7B vs 7B Sharp - the actual difference

| | 3B | 7B | 7B Sharp |
|---|---|---|---|
| Transformer blocks | 32 | 36 (and wider) | 36, sharpening-tuned |
| fp8 download | 3.39 GB | 8.24 GB | 8.24 GB |
| Speed | fast enough for whole clips | markedly slower per chunk | same as 7B |
| VRAM | the consumer-card option | wants a big card | wants a big card |
| Where it wins | **video** - the quality/speed ratio for a full clip, and temporal consistency at a usable chunk size | **hero shots and stills** - maximum recovered detail | soft/blurry sources that need bite |
| Where it hurts | least detail recovered | slow | **over-sharpens a clean source** - halos, crunchy texture |

Community consensus is consistent: **3B is the right default**, 7B is the
"absolute perfection on one shot" option, Sharp is a deliberate aggression dial
rather than a strictly better 7B. **Do not default the dropdown to 7B or Sharp.**

Numbers still to measure on a real card (no published figure is trustworthy):
per-clip wall-clock and the VRAM ceiling per `frames_per_chunk`. Bench item, not
a blocker for the UI.

## 4. The mechanism - a plugin that contributes a dropdown entry

This is the reusable half. MPI-507 consumes it unchanged.

Today a `PluginDef` (`js/data/pluginsRegistry.js`) is *"a capability other
surfaces call"* with a **singular `operation`**, and the only instance
(`image-describer`) gates a right-click action. Three SeedVR2 plugins all serve
`videoUpscale`, so `operation` no longer identifies a plugin and is not what the
dropdown needs anyway.

What has to exist:

1. **A way for a plugin to declare a tool-dropdown entry** - which tool
   (`videoUpscale` / `imageUpscale`), the label, and the value the injector
   receives. Keep it a plain data field on `PluginDef`; do not invent a fourth
   registry entity.
1b. **Per-entry extra controls, declared by the entry.** Fabio (2026-08-09) on
   PiD: *"we can just add a Text Input in the toolbar and the Denoise when PiD is
   selected."* So the tool-options panel shows extra controls **conditional on
   the selected entry**. The two cases are already known and they are the
   extremes: **SeedVR2 declares none** (§2a - no prompt, no denoise), **PiD
   declares prompt + denoise** (MPI-507 §3a). Build it as a declared list on the
   entry, not an `if (isPid)` branch - the second consumer already exists.
   The controls themselves exist in `PromptBoxControls.js` (`denoise`); reuse,
   do not re-implement.
2. **Install-state-driven options.** `getPluginDepStatus()` already exists and is
   populated by `syncModelInstalled()` off the same id-agnostic
   `/comfy/models/check` the models and apps use. An uninstalled plugin still
   shows in the dropdown, but as an **install affordance**, not a silent failure
   at run time.
3. **Value namespacing.** Today the dropdown value is either `''` (None) or a
   bare `.pth` filename. A plugin entry needs a prefix that cannot collide -
   `plugin:seedvr2-3b` matches the existing `pluginDepKey()` convention.
   `coerceSettings()` must drop a stale persisted value whose weight is no longer
   on disk, exactly as it already does for a removed `.pth`.
4. **Injection mapping** - selected value -> the weight filename + whatever the
   graph's variant switch expects. Fabio's workflow decides the shape; see
   `.claude/rules/comfy_injection.md` and `docs/workflow-authoring/`.

**Free already, do not rebuild:** the Model Library renders plugins today
(`MpiModelManager.js` ~1044-1166) with search, install, uninstall and download-job
tracking keyed by `pluginDepKey`, and `routes/downloadManager.js:363` gives every
plugin dep GC protection. Three new `PLUGINS` entries get all of that for free.

## 5. Why plugins and not `engineAsset`

`videoUpscale` is a **universal** workflow, and per
`js/data/modelConstants/universal_workflows.js` universal deps are the universal
DEPS set: every `type:'custom_nodes'` node plus every `engineAsset:true` weight,
**installed automatically with the engine**. Marking SeedVR2 `engineAsset` would
push **20 GB onto every user at engine install**. Plugins are the opt-in path -
`image-describer` owns a 4.88 GB encoder for the *universal* `imageDescribe` op
and its dep carries **neither `engineAsset` nor `bakedOnPod`**.

**Settle the remote/Pod half before coding.** An `engineAsset` is baked into the
Pod image; a plugin dep is not. Check how `image-describer`'s encoder reaches a
Pod and whether SeedVR2 needs the same, is downloaded on the Pod at run time, or
is simply unavailable remotely.

## 6. App-side files

- **`js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js`** -
  the dropdown. One component serves both tools via its `kind` prop
  (`'video'` | `'image'`), persisting to `toolSettings.videoUpscale` vs
  `toolSettings.imageUpscale`. **Build the entry source `kind`-aware from the
  start** - MPI-507 needs the image side and should not have to refactor this.
- **`js/data/pluginsRegistry.js`** - three new entries + the dropdown-entry field.
- **`js/data/modelConstants/modelDeps.js`** (or `assetDeps.js`) - four new deps
  (3 weights + 1 shared VAE), R2-hosted with `mirrorUrl` to HF and sha256.
- **`comfy_workflows/video_upscale.json`** - Fabio. Currently branches on the
  `Upscale_Using_Model` boolean through `MpiIfElse` (nodes 748/755/608/607);
  becomes a multi-way branch.

## 7. Open questions for Fabio

1. Does **`imageUpscale`** get the SeedVR2 entries too, or video only? (SeedVR2 7B
   is the community pick for stills, and the component is the same one.)
2. fp8 only, or also expose fp16 for people with the VRAM (as separate plugins)?

**Answered 2026-08-09, do not re-ask:**

- *Does SeedVR2 need a prompt?* **No** - §2a, verified against the node
  signatures, not inferred. No prompt, no denoise, no extra controls at all.
- *`frames_per_chunk`?* **Not exposed** - `chunking_mode: auto` predicts the
  largest chunk that fits free VRAM (§2a).
- *Resolution / factor?* The existing radio stands. Fabio is adding the missing
  resolutions on the workflow side so all four - **1.5 / 2K / 3K / 4K** - are
  available. **Flag before building:** the radio's current labels are
  *multipliers* (`x1.5 x2 x3 x4`) and SeedVR2's factor genuinely multiplies the
  source, but PiD's are *absolute targets* (MPI-507 §3b). Four buttons, two
  meanings - confirm which wording wins before the labels are touched.

## Sources

- [SeedVR2 in ComfyUI - official docs](https://docs.comfy.org/tutorials/utility/seedvr2)
- [ComfyUI PR #14424 - native SeedVR2 support](https://github.com/comfyanonymous/ComfyUI/pull/14424)
- [Comfy-Org/SeedVR2 (HF, Apache-2.0)](https://huggingface.co/Comfy-Org/SeedVR2)
- [ByteDance-Seed/SeedVR2-3B](https://huggingface.co/ByteDance-Seed/SeedVR2-3B) / [SeedVR2-7B](https://huggingface.co/ByteDance-Seed/SeedVR2-7B)
- [One-step 4K video upscaling in ComfyUI with SeedVR2 - AInVFX](https://www.ainvfx.com/blog/one-step-4k-video-upscaling-and-beyond-for-free-in-comfyui-with-seedvr2/)
- [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) - the pre-core custom pack, **not** what we wire
