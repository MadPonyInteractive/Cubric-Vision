# 04 — New ops, runtime selectors, one-graph-many-ops

> Part of the [add-model playbook](README.md). Covers two patterns: a new-op model
> with a runtime in-workflow selector (PiD), and one graph serving several ops via
> baked booleans (Krea2 t2i/i2i/poseReference).

## Image upscaler / new-op model with a runtime in-workflow selector (PiD pattern, MPI-182)

A prompt-box-driven model that adds a NEW op + a runtime switch inside ONE workflow
(no per-op file split). PiD = the worked example: one workflow, a 4-path VAE selector +
an output-size selector, both `MpiAnySwitch` picked at submit time. Lessons that cost real
debugging:

- **Image output CAPTURE node title is `Output_Image` (single naming law — MPI-252).**
  The old two-tier system (a `tier` field on `models.js`, bare vs `Input_`/`Output_`) is GONE:
  tier-1 dropped, the `tier` field removed, the whole fleet converted. Matched by
  `commandExecutor.js` `_imageOutputTitle = 'output_image'`, **case-insensitive** so
  `Output_image` also resolves (Chroma's detailer/upscaler use that spelling). The bare
  `'output'` base string survives in the matcher only as a defensive fallback — no shipping
  image workflow relies on it.
  - Preview capture (multi-stage `previewOnly` runs) titles its node `Output_Preview`.
  - Set the title IN ComfyUI and re-export — do NOT hand-edit the workflow JSON (a manual
    edit is silently lost on the next re-export → the bug returns).
  - Use `PreviewImage`, not `SaveImage` — all Cubric image workflows use PreviewImage, type
    `temp`; the app builds a `/view?...type=temp` URL fine.
  - **TRAP (MPI-217):** the match is on the EXACT lowercased title. A typo (`Ouptput_Image`)
    matches nothing → the run completes with no error, reporting "Generation completed but no
    output returned." If a workflow generates fine (`Prompt executed in N seconds`) but the app
    captures nothing, check the capture node's title first.
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
- **Image gating is FREE** — an image-required op declares `requiresImages: 1` +
  `mediaInputs:[{ key:'inputImage', title:'Input_Image', required:true }]` (clone `upscale`).
  That inherits the block-Run-if-no-image toast (`generationService.js`) + auto-op-switch. No
  new gating code. The workflow's `LoadImage` node MUST be titled `Input_Image` to receive it.
- **Hide the model-settings gear** for a model that configures no upscale-model and no LoRAs:
  set `showSettings: false` on the ModelDef (honored in `MpiPromptBox.js` beside
  `props.showSettings`). Prevents an empty/irrelevant settings popup.
- **A NEW op adds to `operation_registry.json` AND `js/core/operationRegistry.js`** (two
  mirrors), `appVersionIntroduced` = current `APP_VERSION`. NOT `js/data/operationRegistry.js`
  (doesn't exist). Adding a model/op is still NOT an app version bump.
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
poseReference: { …, injectParams: { Input_pose_reference: true } },
t2i:           { …  /* no injectParams — both booleans stay baked false */ },
```

`commandExecutor._buildParams` merges `COMMANDS[op].injectParams` **before** the user's
`injectionParams`, so a control can still override. One declarative line per op; no
per-op branching in the executor.

### THE TRAP THAT ATE TWO DAYS: injection silently skips unmatched titles

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
- [ ] i2i (or any latent-space op): add `'denoise'` to `components` + a `defaults.denoise`,
      **after** tracing that the denoise node is reachable on that branch
- [ ] `progressStages.js`: keyed by **FILE**, not op — a shared graph needs no new entry.
      (If a branch adds its own tqdm bar — e.g. a depth preprocessor — it needs a per-op split.)
- [ ] `js/core/operationRegistry.js`: new op → entry with `appVersionIntroduced` = current
      APP_VERSION. `operation_registry.json` is generated (`/mpi-version-bump`), never hand-edited
- [ ] Run `tests/inject-params-titles.test.cjs`

### Known live bug (not yours to fix here)

`MpiPromptBox.setModelList()` re-runs `_pickOpForModel` on every model-list refresh, so a
workspace switch silently reverts the user's chosen op to the first entry in `supportedOps`
that matches the current media state (image chip present → `i2i`; no chip → `t2i`).
Adding ops makes it more visible. Tracked as **MPI-247** — do not "fix" it inside a model card.
