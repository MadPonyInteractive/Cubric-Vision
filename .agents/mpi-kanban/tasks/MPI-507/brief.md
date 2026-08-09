# MPI-507 - Move NVIDIA PiD out of the model picker into the image upscale dropdown

**Fabio, 2026-08-09:** *"PiD has four different models instead of being a separate
model, which at the moment doesn't make much sense because it's a model that just
upscales and doesn't generate anything. PiD will also come in the upscale dropdown
for images in the History workspace. I honestly think it's a much better home for
these types of models, and it will make our upscale section much more valuable."*

Depends on the plugin-contributes-a-dropdown-entry mechanism built in
[MPI-506](../MPI-506/brief.md) §4. Build that first, reuse it here unchanged.

---

## 1. What PiD is today

`js/data/modelConstants/models.js:820` - a full **ModelDef** occupying a tile in
the model picker:

```
id: 'nvidia-pid', name: 'NVIDIA PiD Upscaler', type: 'pid',
dropdownMeta: 'UPSCALE', mediaType: 'image', showSettings: false,
supportedOps: ['pid'], workflows: { pid: 'nvidia_pid.json' }
```

One workflow with an internal **4-path VAE-locked selector** (`pidVariant` ->
`Input_Type`, a 1-indexed `MpiAnySwitch`), an output-size selector
(`pidResolution` -> `Input_Resolution`), and a denoise slider mapped to PiD's
`degrade_sigma`. Research: `docs/models/pid/upscaler.md`.

It generates nothing. Its only op is `pid`. It is an upscaler wearing a model's
clothes - hence this card.

## 2. The four paths and what splitting them buys

All four weights are **`1024 -> 4096`, 4-step, bf16**, from `Comfy-Org/PixelDiT`:

| Variant | Weight | + its VAE | Per-variant |
|---|---:|---:|---:|
| Flux1 | `pid_flux1_1024_to_4096_4step_bf16` 2.54 GB | `vae/ae.safetensors` 0.34 GB | **2.88 GB** |
| SDXL | `pid_sdxl_1024_to_4096_4step_bf16` 2.54 GB | `vae/sdxl_vae.safetensors` 0.33 GB | **2.87 GB** |
| SD3 | `pid_sd3_1024_to_4096_4step_bf16` 2.54 GB | `vae/sd3_vae.safetensors` 0.17 GB | **2.71 GB** |
| Qwen-Image | `pid_qwenimage_1024_to_4096_4step_bf16` 2.54 GB | `vae/qwen_image_vae.safetensors` 0.25 GB | **2.79 GB** |

Plus **one shared, mandatory text encoder**: `pid-gemma`
(`text_encoders/gemma_2_2b_it_elm_bf16.safetensors`) - **5.23 GB**.

**Today it is all-or-nothing: 16.48 GB** to use any one path. Split into four
plugins, a user who wants only the SDXL path installs **~8.1 GB** (5.23 shared +
2.87), and each extra path costs ~2.8 GB. `pluginRequiredDepIds()` unions every
plugin's deps, so the shared gemma encoder survives while *any* PiD plugin is
installed - the same property the SeedVR2 VAE relies on.

The 5.23 GB shared encoder means the *first* PiD install is still heavy. Worth
saying in the plugin description so the number is not a surprise.

## 3. The three real problems - none of them are the dropdown

**Two of the three are now decided (Fabio, 2026-08-09).** Only §3c is open.

### 3a. PiD has controls the upscale tool does not have - DECIDED: add them, conditionally

`commandRegistry.js:612` - `pid` declares
`components: ['pidVariant', 'pidResolution', 'denoise']`, `promptRequired: false`,
`defaults: { denoise: 0.0 }`, and its own help text saying the prompt is optional
guidance. Those controls live in the **PromptBox**
(`PromptBoxControls.js:876-926`). `MpiToolOptionsUpscale` has a model dropdown, a
factor radio and a Run button - **no prompt, no denoise, no resolution**.

**Fabio, 2026-08-09:** *"PiD has Denoise and Prompt Box Input, so we can just add
a Text Input in the toolbar and the Denoise when PiD is selected."*

So: **grow the panel, conditionally.** Three consequences:

- `pidVariant` **disappears** - the chosen plugin *is* the variant.
- `pidResolution` is absorbed by the factor radio - see §3b.
- `denoise` + an optional **text input** appear in the tool-options panel **only
  when a PiD entry is selected**, keeping `defaults: { denoise: 0.0 }` (faithful)
  and an empty prompt as the do-nothing default.

Build this as **MPI-506 §4a.1b** - a declared control list on the dropdown entry,
not an `if (isPid)` branch. The second consumer already exists and it is the
opposite extreme: **SeedVR2 declares no extra controls at all** (verified - it
takes no prompt and has no denoise; MPI-506 §2a). An entry declaring `[]` and an
entry declaring `['prompt', 'denoise']` must both work on day one.

Reuse the existing `denoise` control from `PromptBoxControls.js`; do not
re-implement it in the tool panel.

### 3b. PiD is fixed 4x - DECIDED: Fabio adds the missing resolutions

Every weight is literally `1024_to_4096`, and output size is `pidResolution`
rather than a multiplier. **Fabio, 2026-08-09:** *"When it comes to resolutions,
how much it needs to be upscaled, I can add the missing resolutions so that it
matches what we have: 1.5, 2K, 3K, 4K."* So the workflow side grows the
`pidResolution` switch until all four radio positions resolve, and the radio
stays as-is. No hiding, no disabling.

**One thing to settle before the labels are touched:** the radio's current labels
are **multipliers** - `x1.5 / x2 / x3 / x4` - and for both the `.pth` path and
SeedVR2 the factor genuinely multiplies the source. For PiD they are **absolute
targets** (1.5K / 2K / 3K / 4K). Same four buttons, two meanings, and a 512px
source makes the difference visible immediately. Either the labels become
absolute everywhere, or the radio relabels itself per selected entry. Cheap to
decide, expensive to discover after shipping.

### 3c. A Flow depends on the ModelDef

`js/data/flowsRegistry.js:107` - `flowSdxl4k` declares
`requiredModels: ['sdxl-nsfw', 'nvidia-pid']`, and the comment at line 100 says it
**deliberately exercises the multi-model install path**. `commandRegistry.js:953`
repeats the pairing. Deleting the ModelDef breaks that Flow's dependency
resolution and removes the only test of that path.

Options, in order of preference:

1. **Keep the ModelDef, hide it from the picker.** Cheapest and safest - the Flow
   keeps resolving, the plugins own the dropdown, and the two share deps.
   Needs a check that nothing else keys off tile visibility.
2. **Teach Flows to require a plugin** (`requiredPlugins`, or a namespaced entry in
   `requiredModels` using `pluginDepKey`). Cleaner long-term, more surface.
3. Point the Flow at another 4x path. Loses the multi-model install coverage;
   only if 1 and 2 both fail.

**Whichever wins: do NOT delete the `pid-*` / `vae-*` / `pid-gemma` dep entries.**
The orphan sweep reads `DEPS`, so a deleted entry strands those weights on existing
users' disks **forever** - MPI-470 and MPI-466 both kept theirs. See
`docs/playbooks/add-model/README.md` § "Removing or re-tiering a model", which this
card must follow for the removal half.

## 4. Other consumers to sweep

- `type: 'pid'` - check the ratios/type tables and every `type` consumer.
- `enhanceRecipe: 'sdxl'` - the prompt-enhance path; moot if the prompt is dropped.
- `dev_configs/smoke-evidence.json:236,489` - `nvidia-pid` appears in the smoke
  matrix. If the model stops being a model, the smoke runner needs to reach the op
  another way, or the entry needs re-pointing. **`npm run release:check` gates on
  this file**, so an unhandled change blocks a release.
- `js/data/progressStages.js`, `js/core/operationRegistry.js` - the `pid` op is
  registered; confirm the op key survives the move unchanged (it should - the op
  is not going away, only its entry point).
- `routes/downloadManager.js:2832` carries a PiD-specific comment about a
  miscounted uninstall; re-read it before touching install paths.

## 5. Scope boundary

This is a **migration**, not an addition, and it touches a shipped model, a
shipped Flow and the release gate. MPI-506 is additive and can land alone. Land
506 first, then this.

## 6. Open questions for Fabio

1. §3c - hide the ModelDef, or teach Flows about plugins?
2. Four plugins, or one PiD plugin with a variant sub-choice in the tool? (Four
   matches "each one could be a plugin" and gives per-path install granularity;
   one keeps the dropdown short.)
3. Does PiD stay reachable from the model picker at all during a transition, or is
   the tool the only entry point from day one?
4. §3b - multiplier labels or absolute-resolution labels on the factor radio?

**Answered 2026-08-09, do not re-ask:** §3a (grow the panel with a conditional
text input + denoise) and §3b (Fabio adds the missing `pidResolution` entries so
all four radio positions resolve).
