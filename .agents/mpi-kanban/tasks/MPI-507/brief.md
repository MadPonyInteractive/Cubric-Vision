# MPI-507 - Move NVIDIA PiD out of the model picker into the image upscale dropdown

**Fabio, 2026-08-09:** *"PiD has four different models instead of being a separate
model, which at the moment doesn't make much sense because it's a model that just
upscales and doesn't generate anything. PiD will also come in the upscale dropdown
for images in the History workspace. I honestly think it's a much better home for
these types of models, and it will make our upscale section much more valuable."*

Depends on the plugin-contributes-a-dropdown-entry mechanism built in
[MPI-506](../MPI-506/brief.md) §4. Build that first, reuse it here unchanged.

---

## 0. PiD is IMAGE-ONLY - it must never reach the video tool

Fabio, 2026-08-09: *"PiD is an image upscaler, so it cannot land on the video
workspace."* The ModelDef already says `mediaType: 'image'` and the `pid` op is
`MEDIA_TYPE.IMAGE` with `requiresImages: 1`. So PiD entries appear **only** in
`toolSettings.imageUpscale`, never in the video dropdown.

That makes the MPI-506 §4 entry declaration need a **tool scope** field, not just
a label - and the two cards prove both halves of it: **SeedVR2 declares both**
tools (it has official image *and* video templates, MPI-506 §2b), **PiD declares
image only**. An entry that leaks into the wrong tool is a run-time failure with
no useful error, so scope it in data, not in the component.

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

**RESOLVED 2026-08-10 (Fabio + code check) - neither option. The mechanism already
exists and it is `requiredDeps`.**

Fabio: *"Flows are going to be just like models... we already have a head-swap
that proves extra dependencies apart from just model dependencies... You install
one thing, you unlock another if the other has the exact same dependencies."*
Verified in the codebase, not assumed:

- `FlowDef.requiredDeps` takes **DEP ids** on top of `requiredModels` (MPI-304,
  `flowsRegistry.js:28`). `head-swap` already ships it:
  `requiredDeps: ['qwen-lora-headswap', 'comfyui-inpaint-cropandstitch']`.
- `flowAvailability()` gates the badge and the Run guard on **both** lists, and
  dep status comes from `syncModelInstalled` stat'ing filenames through the
  **id-agnostic** `/comfy/models/check` (`flowsRegistry.js:232-238`) - the route
  takes `{id, deps}` and never touches `MODELS`. **That is exactly Fabio's unlock
  rule, already implemented:** whatever puts those files on disk satisfies every
  declarer of the same dep ids. A plugin install unlocks the Flow for free.
- `MpiFlowLibrary._installMissing` already installs flow deps as their own job
  under `flowDepKey(flow.id)` (`MpiFlowLibrary.js:130-141`), so the install
  affordance needs no work either.

**So: drop `nvidia-pid` from `requiredModels` and declare the dep ids instead.**

```js
// flowsRegistry.js flowSdxl4k — was: requiredModels: ['sdxl-nsfw', 'nvidia-pid']
requiredModels: ['sdxl-nsfw'],
requiredDeps: ['pid-sdxl', 'vae-sdxl', 'pid-gemma', 'comfyui-kjnodes'],
```

This is a **strict improvement, not a workaround.** The `nvidia-pid` ModelDef
declares all four architectures - `pid-flux1, pid-sdxl, pid-sd3, pid-qwenimage,
vae-flux-ae, vae-sdxl, vae-sd3, vae-qwen-image, pid-gemma, comfyui-kjnodes`
(`models.js:820`) - so today an SDXL 4K flow downloads four PiD transformers and
four VAEs to use one pair. `requiredDeps` fetches only what the graph loads.

No `requiredPlugins` field, no picker-hiding hack, no new registry concept.

**One real cost, flag it rather than bury it:** `flowSdxl4k` was pairing two
models *deliberately*, as the only exercise of the multi-model install path
(comment at `flowsRegistry.js:100`). After this change it declares one model, so
that coverage moves to the model+dep path instead. Either accept the swap - the
dep path is now the one more flows will use - or give the multi-model exercise to
another flow. Do not let it lapse silently.

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

## 4b. DECIDED: four separate PiD workflows, one per model

**Fabio, 2026-08-09:** *"I will export 4 different workflows for PiD. All of them
will have this input resolution setting."* Four files it is - and this **fully
solves the validation trap below**, because each file names only its own weight,
so a user holding one plugin never has an unresolvable `unet_name` in the graph.
The one-file alternative analysed here is recorded for context, not as a pending
objection.

What four files cost, so it is not a surprise later: any shared fix is applied
**four times**, and the plugin entry (MPI-506 §4) must carry **which workflow file
it runs** rather than the op mapping to a single file the way
`workflows: { pid: 'nvidia_pid.json' }` does today. Make that a field on the
plugin entry - it generalises, and SeedVR2 needs the same field for a different
reason (§4d).

What four files buy beyond the validation fix: each path stays independently
tunable. That matters here because the paths are not interchangeable - they are
VAE-locked and could want different sampler settings later.

### Why one file would ALSO have worked - the analysis, kept for reference

Checked `comfy_workflows/nvidia_pid.json` (43 nodes) node by node. **The
four branches are structurally identical.** They differ in exactly three literals:

| Branch | `UNETLoader.unet_name` | `VAELoader.vae_name` | `PiDConditioning.latent_format` |
|---|---|---|---|
| Flux1 | `pid_flux1_1024_to_4096_4step_bf16` | `ae.safetensors` | `flux` |
| SD3 | `pid_sd3_1024_to_4096_4step_bf16` | `sd3_vae.safetensors` | `sd3` |
| Qwen-Image | `pid_qwenimage_1024_to_4096_4step_bf16` | `qwen_image_vae.safetensors` | `qwenimage` |
| SDXL | `pid_sdxl_1024_to_4096_4step_bf16` | `sdxl_vae.safetensors` | `sdxl` |

Everything else is shared or duplicated verbatim: all four `BasicScheduler` are
`simple / steps 4 / denoise 1`; all four `SamplerCustom` are `add_noise true /
cfg 1` and point at the **same** `KSamplerSelect` (1565), the same negative
(1567), the same latent (1569) and the same seed (1628); all four `VAEEncode`
read the same pixels (1624); the gemma `CLIPLoader` (1571) and the `pixel_space`
`VAELoader` (1576) are already single and shared.

`latent_format` is a **COMBO with a fixed option list**
(`['flux','sd3','sdxl','qwenimage']`, verified on :48188), so it is always valid
no matter which weights are installed.

One branch plus three injected literals would have dropped 43 nodes to ~25 and
deleted the `Input_Type` `MpiAnySwitch` (1607). Fabio chose four files instead;
either shape removes the hardcoded names that break under plugins, which is the
part that actually mattered. Each exported file drops `Input_Type`, the `Types`
note and the other three branches on its own.

### And keeping the four-branch shape is not merely wasteful - it BREAKS

This is the part that forces the change. `UNETLoader.unet_name` is a COMBO
populated from the `diffusion_models` folder listing. ComfyUI's
`validate_prompt` walks every node reachable from the outputs and checks each
COMBO value against its option list - `execution.py` emits
`{"type": "value_not_in_list", "message": "Value not in list"}` - and **that
check has no lazy-evaluation exemption, because validation runs before
execution.** All four `UNETLoader`s feed the `Input_Type` switch, so all four are
reachable.

Today that is invisible: installing `nvidia-pid` installs all four weights, so
all four names resolve. **The moment PiD becomes four plugins, a user with only
the SDXL plugin has a graph naming three files that are not on disk, and the
prompt is rejected before it runs.** Collapsing to one injected loader fixes this
by construction - only the installed weight is ever named.

(The repo's one-master-template pattern on klein-4b relies on lazy pruning, but
klein has a *single* checkpoint across its branches, so it never hits this.)

### 4d. SeedVR2 does NOT need six files - the asymmetry is real

Do not copy the four-file decision across to MPI-506. PiD's four paths differ in
**three** literals (`unet_name`, `vae_name`, `latent_format`) *and* are VAE-locked
to different architectures. SeedVR2's three variants differ in **exactly one**
literal - `unet_name` - and share a single VAE
(`seedvr2_ema_vae_fp16.safetensors`), which is why the 3B and 7B image templates
are node-for-node identical.

So SeedVR2 wants **two** workflow files, one per tool
(`seedvr2_image` / `seedvr2_video`), with `unet_name` injected from the selected
plugin. That is safe for the same reason four PiD files are safe: only the
installed weight is ever named in the dispatched graph. Six files would be four
redundant copies.

Net across both cards: **4 PiD files + 2 SeedVR2 files = 6 workflows**, and the
plugin entry carries the file plus, for SeedVR2, the `unet_name` to inject.

## 4c. PiD's resolution problem is a TRAINING-REGIME problem - RESOLVED as technique A

**Fabio, 2026-08-09:** *"SeedVR2 actually works with a multiplier. It's only PiD
that doesn't. Unless I change how PiD works and adopt the same technique, I'm not
sure if that's gonna work. I'll need to test it."*

He is right that this is the open one, and the reason is in the weight filenames:
every PiD checkpoint is `pid_*_**1024_to_4096**_4step_bf16`. The current graph
enforces exactly that regime - `MpiScaledDimensions` normalises the input to
**1024** (`side: use_max`) through an `MpiCrop` at `divisible_by 16`, and a second
`MpiScaledDimensions` at **4096** sizes the `EmptyChromaRadianceLatentImage`. So
PiD is not "absolute" by preference; it is a **fixed 4x trained at one input
size**.

Two techniques can produce 1K/2K/3K/4K from that. They are worth naming because
they fail differently:

- **A - native then downscale.** Always run 1024 -> 4096 as trained, then resize
  the *output* to the chosen target. Cannot go off-regime, so correctness needs
  no testing. Cost: 1K and 2K take the same time and VRAM as 4K, which is a real
  price on the slowest tool in the app.
- **B - scale the input, keep 4x.** Feed 512 for a 2K target, 256 for 1K. Stays
  at the 4x ratio the model expects but changes the *absolute* input resolution,
  and PixelDiT's patching may well be resolution-sensitive. **This is the one to
  test** - it is Fabio's "adopt the same technique", and if it holds it is
  strictly better than A.

**Fabio built A** (observed in the live graph, 2026-08-09): three
`MpiScaledDimensions` at 1024 / 2048 / 3072 all take their `image` input from
**`VAEDecode`**, and `Input_Resolution` selects between them with `any_4` passing
the raw 4096 through - the note beside it reads `1 = 1k, 2 = 2k, 3 = 3k,
4 = 4k`. So PiD always generates at its trained 1024 -> 4096 and the target is a
downscale of the finished image.

Correctness is therefore not in question and needs no bench. **The one thing to
know and to say in the UI: 1K is not faster than 4K.** Every target costs a full
4096 generation, on the slowest tool in the app. If that becomes a complaint,
technique B is the upgrade path - test B at 512 -> 2048 against A downscaled to
2048 on the same source, and if B is not visibly worse, take B.

**Do not assume the answer generalises from SeedVR2.** SeedVR2 has no trained
input size, which is exactly why the multiplier works there and is the open
question here.

### Also worth doing while the graph is open

`Input_Resolution` (1614) currently has **three** entries - `1618` (1024),
`1619` (2048) and `1570` (passthrough). The 1K/2K/3K/4K radio needs four real
targets, so that is where the missing 3072 and 4096 go, and the passthrough entry
needs a decision.

Note also that PiD's sampler regime is its own: `KSamplerSelect` is **`lcm`** at
4 steps, not SeedVR2's `euler` at 1 step. Nothing transfers between the two
graphs except the tool that launches them.

## 5. Scope boundary

This is a **migration**, not an addition, and it touches a shipped model, a
shipped Flow and the release gate. MPI-506 is additive and can land alone. Land
506 first, then this.

## 6. Open questions for Fabio

1. §3c - hide the ModelDef, or teach Flows about plugins? **This is the last real
   blocker.**
2. Does PiD stay reachable from the model picker at all during a transition, or is
   the tool the only entry point from day one?

**Answered 2026-08-09, do not re-ask:**

- §0 - PiD is **image-only**, so its entries are scoped to `imageUpscale`.
- §3a - grow the panel with a conditional text input + denoise.
- §3b - the radio relabels to **1K / 2K / 3K / 4K** when a generative upscaler is
  selected, and Fabio adds the missing `pidResolution` entries so all four
  resolve. **Still open (§4c): HOW PiD reaches a non-4K target** - native-then-
  downscale, or scale the input and keep 4x. Fabio is benching it. SeedVR2 is
  natively a multiplier and needs no such trick (MPI-506 §2c).
- §4b - **four separate workflow files**, one per model, Fabio's call. Each names
  only its own weight, which is what the four-loader single file could not do
  once weights become optional. The plugin entry carries the file it runs.
- §4c - **technique A**, already built: native 1024 -> 4096, then downscale the
  output. Correctness needs no bench; 1K is not faster than 4K.
- §4d - four plugins (one per path). SeedVR2 does **not** copy this: its three
  variants differ in one injectable literal, so it needs two files, not six.
