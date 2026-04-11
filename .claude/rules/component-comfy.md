# Component ComfyUI Injection Map

> **AI INSTRUCTION:** This file is machine-generated. Use it when you need to know what gets injected into ComfyUI workflows and from which component.

## Sub-Agent Briefing
> Use this file when you need to know what gets injected into ComfyUI workflows and from which component.

---

## Injection Points

| Control ID | Component        | nodeTitle(s)                     | Params injected                  | Operations (from commandRegistry)          |
|------------|------------------|----------------------------------|----------------------------------|--------------------------------------------|
| `ratio`    | `MpiRatioSelector` | `"Width"`, `"Height"` (separate nodes) | `{ Width: number, Height: number }` | `t2i`, `i2i`, `t2v`, `i2v`             |

> **Note:** `nodeTitle` for `ratio` is `null` in the registry because it injects into two separate nodes (`Width` and `Height`) rather than a single node. The `getInjectionParams()` return `{ Width: w, Height: h }` which `_buildParams()` maps to the standard node title table.

---

## Standard Node Title → Field Mapping (from comfy_injection rules)

These are additional params injected by `_buildParams()` in `commandExecutor.js` / `comfyController.js`, not from PromptBoxControls:

| Param key         | ComfyUI node title  | Field              |
|-------------------|---------------------|--------------------|
| `Width`           | `"Width"`           | `inputs.value`     |
| `Height`          | `"Height"`          | `inputs.value`     |
| positive prompt   | `"Positive"`        | `inputs.value`     |
| negative prompt   | `"Negative"`        | `inputs.value`     |
| seed              | `"Seed"`            | `inputs.int`       |
| checkpoint        | `"Checkpoint"`      | `inputs.ckpt_name` |
| input image       | `"Input_Image"`     | `inputs.image` (auto-uploaded) |
| input mask        | `"Input_Mask"`      | `inputs.mask` (auto-uploaded)  |
| lora slots        | `"Lora_1"`…`"Lora_6"` | `{ lora_name, strength_model, strength_clip }` |

---

## Execution Flow

```
MpiPromptBox 'run' event
  → { operation, positive, negative, mediaItems, injectionParams }
  → gallery.js / groupHistory.js runCommand() call
  → commandExecutor.runCommand({ operation, modelId, positive, negative, mediaItems, maskDataUrl, injectionParams })
    → _buildParams() merges injectionParams + model settings (loras, upscale, checkpoint)
    → ComfyUIController.runWorkflow(workflowFile, params, onProgress)
      → nodes targeted by _meta.title (case-insensitive)
      → "Output" node captures final result images
      → "Detected" node (auto-mask only) captures segmentation preview URLs
```

`injectionParams` flows: `PromptBoxControls.getInjectionParamsFromControls(_activeControls)` → merged into `run` event payload → passed through to `runCommand` → merged into final workflow params.

---

## PromptBoxControls Registry — static, do not regenerate

**Location:** `js/components/Blocks/MpiPromptBox/PromptBoxControls.js`

**Current controls:**

| ID      | Component         | nodeTitle | defaultValue | `getInjectionParams()` return |
|---------|-------------------|-----------|--------------|-------------------------------|
| `ratio` | `MpiRatioSelector` | `null` (Width + Height separate) | `'1:1'` | `{ Width: number, Height: number }` — defaults to `{ Width: 1024, Height: 1024 }` |

**Adding a new control:**
1. Create the component (e.g. `js/components/Compounds/MpiDenoiseSlider/`)
2. Import and add an entry to `PROMPT_BOX_CONTROLS` in `PromptBoxControls.js` with:
   - `nodeTitle` (string or null)
   - `mount(el, opts)` — mounts the component and wires `this.value`
   - `getValue()` — returns current value
   - `getInjectionParams()` — returns `{ NodeTitle: value }` object
3. Add the control ID string to the desired operation's `components[]` array in `commandRegistry.js`

---

## Operations and their controls[] (from commandRegistry.js)

| Operation key     | Label              | mediaType | requiresImages | requiresVideo | requiresMask | components          |
|-------------------|--------------------|-----------|----------------|---------------|--------------|---------------------|
| `t2i`             | Text to Image      | image     | 0              | —             | —            | `['ratio']`         |
| `i2i`             | Image to Image     | image     | 1              | —             | —            | `['ratio']`         |
| `upscale`         | Upscale            | image     | 1              | —             | —            | `['']`              |
| `edit`            | Edit               | image     | 1              | —             | —            | `['']`              |
| `detail`          | Detail             | image     | 1              | —             | true         | `[]`                |
| `change`          | Change             | image     | 1              | —             | true         | `[]`                |
| `remove`          | Remove             | image     | 1              | —             | true         | `[]`                |
| `t2v`             | Text to Video      | video     | 0              | —             | —            | `['ratio']`         |
| `i2v`             | Image to Video     | video     | 1              | —             | —            | `['ratio']`         |
| `extend`          | Extend             | video     | 0              | 1             | —            | `[]`                |
| `interpolate`     | Interpolate        | video     | 0              | —             | —            | `[]` (universal, stub) |
| `videoUpscale`    | Video Upscale      | video     | 0              | —             | —            | `[]` (universal, stub) |
| `autoMaskImg`     | Auto Masking       | image     | 1              | —             | —            | `[]` (universal)    |

> `universal: true` operations are NOT shown in the PromptBox dropdown — they are wired to toolbar buttons in groupHistory workspace.
> `stub: true` operations are registered but disabled in UI.
> `components: ['']` means the array contains an empty-string entry — `getCommandComponents` returns `['']`, which maps to no control in `PROMPT_BOX_CONTROLS` (the empty string key does not exist).
