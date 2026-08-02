# 04 — New ops, runtime selectors, one-graph-many-ops

> Part of the [add-model playbook](README.md). Covers two patterns: a new-op model
> with a runtime in-workflow selector (PiD), and one graph serving several ops via
> baked booleans (Krea2 t2i/i2i/poseReference).

## Image upscaler / new-op model with a runtime in-workflow selector (PiD pattern, MPI-182)

A prompt-box-driven model that adds a NEW op + a runtime switch inside ONE workflow
(no per-op file split). PiD = the worked example: one workflow, a 4-path VAE selector +
an output-size selector, both `MpiAnySwitch` picked at submit time. Lessons that cost real
debugging:

- **Output capture titles** (`Output_Image` / `Output_Video` / `Output_Preview`, single
  naming law MPI-252, case-insensitive, the MPI-217 silent-empty-capture trap) are
  **[shared] — canonical in [../common/output-capture-titles.md](../common/output-capture-titles.md).**
  Model-specific notes:
  - The old two-tier system (a `tier` field on `models.js`, bare vs `Input_`/`Output_`) is
    GONE: tier-1 dropped, the `tier` field removed, the whole fleet converted.
  - Preview capture (multi-stage `previewOnly` runs) titles its node `Output_Preview`.
  - Use `PreviewImage`, not `SaveImage` — all Cubric image workflows use PreviewImage, type
    `temp`; the app builds a `/view?...type=temp` URL fine.
- **Injecting an `MpiAnySwitch` needs `'select'` in the injector target list.** The switch's
  selector input is `select` (int). `comfyController.js` `_inject` targets did NOT include it
  until MPI-182 — injection matched the node by title but wrote nothing → the dropdown
  silently no-op'd. If you author ANY MpiAnySwitch driven by a control, confirm `'select'` is
  in that target array. **MpiAnySwitch is 1-INDEXED** (select starts at 1) — the control must
  inject 1-based values or it picks the wrong branch.
- **A runtime in-workflow selector = a `PROMPT_BOX_CONTROLS` entry + a `commandRegistry`
  component.** Clone the `upscaleFactor` control (an `MpiRadioGroup` whose
  `getInjectionParams()` returns `{ <Node_Title>: value }`). Add the control id to the op's
  `components` array and a default to `promptControlDefaults.js`. The control's
  `getInjectionParams()` return key must equal the switch node's `_meta.title` (an `Input_*`
  title). `_buildParams` renames any bare control key to its `Input_` form before injection
  (MPI-252), but author the control to return the `Input_*` key directly — the node title is
  the contract.
  - **Its `scope` (shared/perOp/perModel) is a [shared] contract — canonical in
    [../common/prompt-box-controls.md](../common/prompt-box-controls.md).** `scope` is the
    SINGLE source of truth for persistence + sidecar snapshot + Reuse; the machinery is
    `scope`-driven, so a new control needs NO edits to any key-list (`_MODEL_WIDE_KEYS`, the
    snapshot loop, the reuse loop). `upscaleFactor` above is `perOp` — the scope that needs
    the least; a **`perModel`** mode-control (turbo/style/quality) has the same zero-extra
    wiring only because of the MPI-336 fix. Read the common doc before choosing `scope`.
- **Image gating is FREE** — an image-required op declares `requiresImages: 1` +
  `mediaInputs:[{ key:'inputImage', title:'Input_Image', required:true }]` (clone `upscale`).
  That inherits the block-Run-if-no-image toast (`generationService.js`) + auto-op-switch. No
  new gating code. The workflow's `LoadImage` node MUST be titled `Input_Image` to receive it.
- **Hide the model-settings gear** for a model that configures no upscale-model and no LoRAs:
  set `showSettings: false` on the ModelDef (honored in `MpiPromptBox.js` beside
  `props.showSettings`). Prevents an empty/irrelevant settings popup.
- **A NEW op registers in `js/core/operationRegistry.js` + `operation_registry.json`**
  (the two-mirror registry — **[shared] canonical in
  [../common/op-registration.md](../common/op-registration.md)**), `appVersionIntroduced`
  = current `APP_VERSION`. Adding a model/op is still NOT an app version bump — which is
  exactly why you must write the `operation_registry.json` entry BY HAND here: the
  `/mpi-version-bump` skill is the only other thing that touches that file and it never
  runs for a model. Finish with `npm run release:check` (it fails on mirror drift).
- **Shared VAE/encoder deps get RESOURCE-named ids, not model-scoped.** `vae-flux-ae`,
  `vae-sdxl`, `vae-qwen-image` — because `ae.safetensors` will back Flux/Chroma/Z-Image/+ and
  the Qwen VAE backs Qwen-Image/Edit/+. A model-scoped id (`pid-vae-flux`) forces the next
  model to re-declare or reference a confusingly-named dep. Weights that ARE model-specific
  (the PiD checkpoints, the pixeldit Gemma encoder) keep the model prefix (`pid-*`). Dedup by
  id is automatic (`resolveModelDeps.js` `dedupeStable`) — list a shared id once.
- **VAE FILE must be the ComfyUI-repackaged safetensors**, not a community convert or raw
  NVIDIA `.pth`. Wrong-arch converts fail VAELoader with a `conv_in` shape mismatch; a `.pth`
  fails because VAELoader wants a `vae.`-prefixed safetensors state_dict. (PiD's qwen VAE took
  3 tries — see [../../models/pid/upscaler.md](../../models/pid/upscaler.md).)

## One graph, several ops — branch booleans + i2i denoise (Krea2 pattern, MPI-242)

A single `<model>_t2i.json` can serve `t2i`, `i2i` and `poseReference`. Each op selects its
branch by flipping ONE boolean that is **baked `false`** in the graph. Read this before
adding i2i (or any second op) to an existing image workflow.

### The mechanism: `CommandDef.injectParams`

Declare the op's constant params in `commandRegistry.js`, keyed by node title:

```js
i2i:           { …, injectParams: { Input_Is_i2i: true } },
poseReference: { …, injectParams: { Input_depth_reference: true } },
t2i:           { …  /* no injectParams — both booleans stay baked false */ },
```

`commandExecutor._buildParams` merges `COMMANDS[op].injectParams` **before** the user's
`injectionParams`, so a control can still override. One declarative line per op; no
per-op branching in the executor.

### THE TRAP THAT ATE TWO DAYS: injection silently skips unmatched titles

> The rule + the guard convention are **[shared] — canonical in
> [../common/inject-titles-guard.md](../common/inject-titles-guard.md).** This is the
> model-side worked backstory.

`comfyController` matches params to nodes by `_meta.title` (case-insensitive) and
**drops any param whose title matches no node — no error, no log, no toast.** Two
production bugs came from this, both invisible:

- **`Input_Is_i2i` was never injected.** It appeared in three source *comments* and in
  the graph, but no code ever set it. Krea2's `i2i` ran as `t2i`, silently ignoring the
  input image. Nobody noticed for four sessions.
- **`Input_Batch` never matched.** The `batch` control emits `Input_Batch_Size`. A node
  titled `Input_Batch` matches nothing, so **batch N rendered 1 image** — in Krea2 *and* in
  shipped Chroma.

**The injection key is `Input_<Name>` — exact.** `_buildParams` renames a bare control key to
its `Input_` form (`Batch_Size` → `Input_Batch_Size`) and does NOT abbreviate. Title the node
`Input_<Name>` to match, or it dies quietly. Params objects built OUTSIDE `_buildParams`
(`runAutoMask`) get no rename — they must use `Input_*` keys directly (MPI-253).

Guard: **`tests/inject-params-titles.test.cjs`** asserts every `injectParams` title exists
in every workflow its op can run. It is the diagnostic the injector refuses to give you.

### i2i needs the denoise slider — and it must be gated

i2i is a latent-space op: without `denoise` the user cannot control how far the result
departs from the source. The graph exposes it as an `MpiFloat` titled **`Input_denoise`**
(lowercase `d` is fine — matching is case-insensitive; the `denoise` control emits
`Input_Denoise`).

Wire it **only on i2i**:

```js
i2i: {
    injectParams: { Input_Is_i2i: true },
    components: [ …, 'denoise', 'ratio', 'batch' ],
    defaults: { denoise: 0.30 },   // match the graph's baked value
},
```

**Why not on t2i / poseReference:** in the Krea2 graph `Input_denoise` reaches the sampler
only through the `Input_Is_i2i` gate (`MpiIfElse`). On the other ops the node is inert, so
mounting the slider there would be dead UI. **Verify this per graph** — trace the denoise
node's consumer before deciding. If your graph feeds denoise unconditionally, it belongs on
every sampling op.

`defaults` is per-op (`commandRegistry.commands[op].defaults`), read by `scope:'perOp'`
controls. `upscale` uses 0.20, `detail` 0.30, `pid` 0.0 — pick the value your graph bakes.

### Checklist for a shared-graph op

- [ ] Boolean node is baked **`false`** and titled `Input_<Name>` (naming law)
- [ ] Op declares `injectParams: { Input_<Name>: true }` — the ONLY thing that sets it
- [ ] `models.js`: add the op to `supportedOps` **and** map `workflows.<op>` to the same file
- [ ] Media slot declared if the op needs one (`requiresImages`, `mediaInputs`)
- [ ] **Gating is automatic from that slot data (MPI-337) — no per-op radial wiring.**
      `getAvailableCommands` admits an op only when
      `requires* ≤ staged count ≤ #declared slots of that type` (+ `requiresMask`). A
      type's MAX capacity = the number of `mediaInputs` slots of that type — a 2-image
      op needs **2** image slots or it gates at 1. The op then enters the radial +
      dropdown, dims (not hides) when unavailable, and Run toasts a missing mask.
- [ ] i2i (or any latent-space op): add `'denoise'` to `components` + a `defaults.denoise`,
      **after** tracing that the denoise node is reachable on that branch
- [ ] `progressStages.js`: keyed by **FILE**, not op — a shared graph needs no new entry.
      (If a branch adds its own tqdm bar — e.g. a depth preprocessor — it needs a per-op split.)
- [ ] `js/core/operationRegistry.js`: new op → entry with `appVersionIntroduced` = current
      APP_VERSION
- [ ] `operation_registry.json`: the SAME entry, written BY HAND — nothing generates this
      file and `/mpi-version-bump` never runs for a model. Forgetting it fails the next build
- [ ] Run `tests/inject-params-titles.test.cjs`
- [ ] Run `npm run release:check` — the gate that catches a forgotten registry mirror

### Per-op control gates — a control must not appear where the graph ignores it

An op's `components` list says which controls EXIST. Four `ModelDef` fields then decide
which of them this model actually shows on that op. All four default to "unchanged", so a
model that stays silent behaves exactly as it did before the field existed.

| field | hides / sets | gate fn |
|---|---|---|
| `styleOps` | the style picker + Stylization slider | `modelShowsStyleRack` |
| `imageSizedOps` | the ratio picker | `modelShowsRatio` |
| `batchOps` | the batch control | `modelShowsBatch` |
| `controlDefaults` | a control's STARTING value, per model | `_resolveDefault` |

**Read every one of these off the GRAPH, never off the op name.** This is the rule the
section exists for. Trace the branch your op actually runs and ask:

- **Ratio** — does the sampler's `latent_image` reach `EmptyLatentImage(Input_Width,
  Input_Height)`, or a `VAEEncode` of the input? If the latter (typically via
  `ImageScaleToTotalPixels`), the op inherits the input's shape → list it in
  `imageSizedOps`.
- **Batch** — `Input_Batch_Size` reaches ONLY `EmptyLatentImage` in every graph we ship.
  So batch is real exactly where the ratio is: any op sampling a VAE-encoded latent
  returns one image while the control claims N → exclude it from `batchOps`.
- **Style/stylization** — does the rack exist on THAT branch, and does the model's LoRA
  set behave at the global strength? A distilled checkpoint may artefact above ~0.6, which
  is `controlDefaults: { stylization: 0.6 }` — a MODEL fact, so it does not belong in the
  op's `defaults` (that would push it onto every model running the op).

Getting one wrong does not error. Chroma shipped with `depth` missing from
`imageSizedOps` and the symptom was a ratio picker promising a shape the user did not get
**plus** a padded gallery card — the placeholder is sized `injectionParams.Width || 0`, and
the `ratio` control is what injects `Width`, so hiding the picker fixed both. Same family
as the silent-injection traps above: a wrong answer that looks like a working feature.

Precedence for `controlDefaults` is **op → model → global**, so an op's own `defaults`
still wins. Guards: `tests/op-strip-availability.test.cjs` pins each gate with a
cross-model negative control (SDXL keeps the ratio picker and batch on `depth`, because
its depth switches the conditioning pipe rather than the latent).

### Known live bug (not yours to fix here)

`MpiPromptBox.setModelList()` re-runs `_pickOpForModel` on every model-list refresh, so a
workspace switch silently reverts the user's chosen op to the first entry in `supportedOps`
that matches the current media state (image chip present → `i2i`; no chip → `t2i`).
Adding ops makes it more visible. Tracked as **MPI-247** — do not "fix" it inside a model card.

## Wiring a `depth` op — FOUR different mechanisms ship today (MPI-365)

`depth` is one op id, but how a model reaches it differs per family, and the routes are
not interchangeable. **Find out which one your model needs before you wire anything** —
picking wrong costs a hosted weight or a dead slider.

| model | mechanism | costs |
|---|---|---|
| SDXL family, **Chroma** | real **ControlNet checkpoint** | a hosted weight + `comfyui_controlnet_aux` |
| Krea 2 | **control-LoRA** via `Krea2ControlLoRALoader` / `…ImageEncode` / `…Apply` | a hosted LoRA + the `ComfyUI-Krea2-ControlNet` node pack |
| FLUX.2 Klein | **reference-control LoRA** on a plain `LoraLoaderModelOnly` + a trigger phrase concatenated into the prompt | a hosted LoRA |
| Qwen Image Edit | preprocessor output feeds the model's **own image conditioning** | the node pack only — **no checkpoint** |

The last two do NOT generalise. Klein's `flux2_klein_4b_refcontrol_depth` and Krea 2's
depth control-LoRA are trained per-model, and Krea 2's additionally **expands `img_in`**
to take a concatenated control latent, which locks it to that model's input dimension.
Do not try to port either to a new model — the same reasoning rules out Black Forest
Labs' `FLUX.1-Depth-dev-lora` for anything whose `in_channels` is not Depth-dev's.

### Is a ControlNet compatible with my model? Verify from the weights, not from a forum

For a FLUX-family model, three checks settle it — all cheap, all decisive:

1. **Does the forward pass apply control residuals at all?** Grep the model's
   `comfy/ldm/<arch>/model.py` for `if control is not None`. If the block-residual lines
   are absent, no ControlNet can work regardless of what any post claims. (Chroma has
   them, matching FLUX.)
2. **Same latent format?** `comfy/supported_models.py` — Chroma is `latent_formats.Flux`,
   i.e. the 16-channel FLUX latent, which is why FLUX ControlNets fit.
3. **Do the input dims match?** Read the ControlNet's safetensors header and compare its
   `x_embedder.weight` shape to the model's `in_channels` (in `comfy/model_detection.py`).
   Chroma is hardcoded to 64; Union Pro 2.0's is `[3072, 64]`. A mismatch here is the
   pixel-space trap — Chroma **Radiance** is 3-channel, so every FLUX ControlNet breaks
   on it even though plain Chroma is fine.

### TRAP — `SetUnionControlNetType` is SDXL-ordered, and may do nothing

`UNION_CONTROLNET_TYPES` (`comfy/cldm/control_types.py`) is a single global map using
**SDXL's** ordering (`depth: 1`). A union ControlNet from another family may number its
modes differently, so selecting "depth" can silently apply the wrong mode.

Worse, the node can be a **no-op**: `comfy/ldm/flux/controlnet.py` only reads `control_type`
when the checkpoint carries a `controlnet_mode_embedder`, and Shakker-Labs Union Pro 2.0
removed it. Check the safetensors header for that key. If absent, **leave the node out** —
keeping it reads as "depth mode is selected" to the next person when nothing is.

### Strength is per-model and must be measured

Model-card recommendations are for the model the ControlNet was trained on. Measured on
Chroma: past ~0.5 the image degrades, so the graph normalises the 0–1 `Input_depth_strength`
slider to 0–0.5 via `MpiNormalizeValue` and runs `end_percent` 0.570 — the ceiling is
structural rather than a number someone has to remember. The Union Pro 2.0 card recommends
0.8; that figure is for FLUX.1-dev and will fall apart on Chroma.

**Licence gate:** every FLUX ControlNet is a FLUX.1-dev derivative and may NOT be mirrored
to R2 — see `02-dependencies-r2.md` § "may we host it at all?".
