## Sub-Agent Briefing
> Use this file when you need to know what gets injected into ComfyUI workflows and from which component.

---

## Injection Points

| Control ID | Component        | nodeTitle(s)                     | Params injected                  | Operations (from commandRegistry)                          |
|------------|------------------|----------------------------------|----------------------------------|------------------------------------------------------------|
| `ratio`    | `MpiOptionSelector` (variant: ratio) | `"Width"`, `"Height"` (separate nodes) | `{ Width: number, Height: number }` | `t2i`, `i2i`, `t2v`, `i2v`, `t2v_ms`, `i2v_ms`     |
| `batch`    | `MpiBatchSelector` | `"Batch_Size"` (MpiInt.inputs.int) | `{ Batch_Size: 1\|2\|3\|4 }`     | `t2i`, `i2i`                                               |
| `qualityTier` | `MpiOptionSelector` (variant: quality) | none — does not inject | shares state under `ratioSelector.qualityTier`; emits `ratio:quality-change` so sibling `ratio` control re-renders its set | `t2v`, `i2v`, `t2v_ms`, `i2v_ms` (only renders when `RATIO_MODES[modelType] === 'quality'`, e.g. `wan`, future `ltx`) |
| `previewStage` | `MpiButton` (size: sm, toggleable, icon: frameForward) | `"Preview_Only"` (`MpiBoolean.inputs.boolean`) | run payload `previewOnly: boolean`; `commandExecutor._buildParams` injects `Preview_Only: <boolean>` **only for `_ms` ops** (key endsWith `_ms`) so non-multi-stage workflows do not receive a stray `Preview_Only` field | `t2v_ms`, `i2v_ms` |
| `duration` | `MpiProgressBar` (interactive, wheel, handle, suffix `s`) | `"Duration"` (`MpiInt.inputs.int`) | `{ Duration: 1..30 }` (int, step 1) | `t2v`, `i2v`, `t2v_ms`, `i2v_ms` |
| `motionIntensity` | `MpiProgressBar` (interactive, wheel, handle) | `"Motion_Intensity"` (`MpiFloat.inputs.float`) | `{ Motion_Intensity: 0..1 }` (float, step 0.01) | `i2v`, `i2v_ms` |
| `resize` | `MpiToolOptionsResize` (tool panel) | `"Resize Image v2"`, `"ImageFlip"`, `"Image Rotate"`, Boolean node titled `"Flip"` | `{ width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, flip, rotation }` via standalone injector, not `_buildParams` | `resize`, `resizeVideo` |

> **Note:** `nodeTitle` for `ratio` is `null` in the registry because it injects into two separate nodes (`Width` and `Height`) rather than a single node. The `getInjectionParams()` return `{ Width: w, Height: h }` which `_buildParams()` maps to the standard node title table.

> **Batch semantics:** `Batch_Size = N` → workflow runs once, returns N images. Gallery creates N separate cards (one per output URL). N placeholder cards shown from generation start, broadcasting the single ComfyUI preview to all N. Persisted per-model as `modelSettings[modelId].batch`.

---

> Standard node title → field mapping is authoritative in `.claude/rules/comfy_injection.md`. Refer there for the full table.

---

## Execution Flow

```
MpiPromptBox 'run' event
  → { operation, positive, negative, mediaItems, injectionParams }
  → MpiGalleryBlock / MpiGroupHistoryBlock runCommand() call
    → commandExecutor.runCommand({ operation, modelId, positive, negative, mediaItems, maskDataUrl, injectionParams })
    → _buildParams() merges injectionParams + model settings (loras, upscale, checkpoint)
    → if COMMANDS[operation].injector exists, commandExecutor applies INJECTORS[name](workflow, injectionParams)
    → ComfyUIController.runWorkflow(workflowFile, params, onProgress)
      → nodes targeted by _meta.title (case-insensitive)
      → "Output" node captures final result images
      → "Detected" node (auto-mask only) captures segmentation preview URLs
```

**Group History selected-entry invariant:** `MpiGroupHistoryBlock` owns `_currentIdx` and promotes the clicked history item via `entry-selected`. Prompt-driven operations must inject `_group.history[_currentIdx]` when the user has not supplied a dropped image. Auto-mask detection is owned by `MpiCanvasViewer`; because the viewer survives history switches, it must resolve `_currentItem.filePath` at detect time rather than reusing `initialImageUrl`.

**Standalone workflow injectors:** Universal tool-panel operations can declare `injector: '<name>'` in `commandRegistry.js`. `commandExecutor.runCommand()` loads workflow JSON, applies `INJECTORS[name](workflow, payload.injectionParams || {})`, removes those consumed `injectionParams` from the generic title-keyed params map, then submits the mutated workflow object to `ComfyUIController.runWorkflow()`. Injectors must use `_meta.title` lookups, not numeric node IDs. Current injector: `resize` in `js/services/workflowInjectors/resizeInjector.js`, shared by `resize` and `resizeVideo`. The consume step prevents collisions such as `flip` matching the Boolean node titled `Flip` and overwriting the injector's boolean value.

## Model Settings Injection

- `_buildParams()` merges model settings for LoRAs and upscale models. Checkpoints are app/workflow-owned and are not user-selectable in Model Settings.
- Flat-LoRA models inject `Lora_1` ... `Lora_6` from `modelSettings[modelId].loras`.
- Models with `model.loraStages` inject staged keys from `stage.injectionPrefix`, e.g. WAN emits `Lora_High_1` ... `Lora_High_6` and `Lora_Low_1` ... `Lora_Low_6`.
- LoRA dropdowns show every file returned by the active models root `loras/` folder. They are not filtered by `model.type`; users own their LoRA folder naming.

---

## PromptBoxControls Registry — static, do not regenerate

**Location:** `js/components/Organisms/MpiPromptBox/PromptBoxControls.js`

**Current controls:**

| ID             | Component         | nodeTitle      | defaultValue | `getInjectionParams()` return |
|----------------|-------------------|----------------|--------------|-------------------------------|
| `ratio`        | `MpiOptionSelector` (variant: ratio) | `null` (Width + Height separate) | `'1:1'` | `{ Width: number, Height: number }` — defaults to `{ Width: 1024, Height: 1024 }` |
| `batch`        | `MpiBatchSelector` | `'Batch'` (registry string; injection key is `Batch_Size` via `MpiInt.inputs.int`) | `1` | `{ Batch_Size: 1\|2\|3\|4 }` |
| `qualityTier` | `MpiOptionSelector` (variant: quality) | `null` | `'medium'` | does NOT contribute to `injectionParams` — quality picks a tier-specific ratio set, and the resolved Width/Height still come from the `ratio` control. Persisted per-model under `modelSettings[modelId].ratioSelector.qualityTier` (shared key with the `ratio` control). Emits `ratio:quality-change` so the sibling `ratio` control re-renders via its `el.setQualityTier(tier)` API. Renders nothing for orientation-mode models. |
| `previewStage` | `MpiButton` (toggleable) | `'Preview_Only'` (`MpiBoolean.inputs.boolean`) | `false` | does NOT contribute to `injectionParams`; instead `el.getRunPayload()` reads the toggle and sets payload `previewOnly: boolean`. `commandExecutor._buildParams` injects `Preview_Only: <boolean>` **only for `_ms` ops** (payload `operation` endsWith `_ms`) — single-stage workflows never receive the field, so a stale toggle from a prior `_ms` op cannot leak into them. Persisted per-model under `modelSettings[modelId].previewStage`. |
| `duration` | `MpiProgressBar` under a Stage-style label row (`DURATION` left, live `N s` right) — own full-width row in popup | `'Duration'` (`MpiInt.inputs.int`) | `5` | `{ Duration: 1..30 }` (int, step 1). Persisted per-model under `modelSettings[modelId].duration`. |
| `motionIntensity` | `MpiProgressBar` under a Stage-style label row (`MOTION` left, live `X.XX` right) — own full-width row in popup | `'Motion_Intensity'` (`MpiFloat.inputs.float`) | `0` | `{ Motion_Intensity: 0..1 }` (float, step 0.01). Persisted per-model under `modelSettings[modelId].motionIntensity`. |

---

## PromptBoxControl Protocol — adding a new control

Every new PromptBoxControl MUST follow this checklist. Skipping any step breaks recall, persistence, or injection.

**1. Pick or build the UI component.** Reuse existing primitives/compounds (`MpiOptionSelector`, `MpiButton`, `MpiProgressBar`, `MpiDropdown`). Build a new component only if none fits.

**2. Add entry to `PROMPT_BOX_CONTROLS`** in `js/components/Organisms/MpiPromptBox/PromptBoxControls.js` with this shape:

```javascript
controlId: {
    nodeTitle: 'Workflow_Node_Title',   // or null if no single node (e.g. ratio)
    defaultValue: <primitive>,
    mount(hostEl, opts = {}) {
        const model = opts.model || {};
        const modelId = model.id;
        // Recall: read persisted value from project
        const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
        const initial = /* clamp + coerce saved.<controlId> */;
        this.value = initial;
        // Mount UI primitive bound to initial
        this._instance = SomePrimitive.mount(hostEl, { value: initial, ... });
        // Persist: emit settings:model:update on user change
        this._instance.on('change', ({ value }) => {
            const v = /* clamp + coerce */;
            this.value = v;
            if (modelId) {
                Events.emit('settings:model:update', {
                    modelId,
                    key: '<controlId>',
                    value: v,
                });
            }
        });
    },
    getValue() { return this.value ?? this.defaultValue; },
    getInjectionParams() {
        return { Workflow_Node_Title: this.value ?? this.defaultValue };
    },
},
```

**3. Register on operations.** Add `controlId` to `commandRegistry.js` `components[]` array for every operation that should expose it.

**4. Workflow contract.** Ensure each registered operation's workflow JSON contains an `MpiInt` / `MpiFloat` / `MpiBoolean` / etc. node with `_meta.title === 'Workflow_Node_Title'`. Inject loop hits `inputs.int`, `inputs.float`, `inputs.boolean`, `inputs.value`, etc. — match field type to node class. **Agents must NOT edit workflow JSON** — document the contract here and ask the user.

**5. Update title map.** Add a row in `.claude/rules/comfy_injection.md` "Standard Node Title Map" with the new title + which `inputs.*` field it writes.

**6. Update injection table.** Add a row to the table above (control ID, component, nodeTitle, defaultValue, getInjectionParams).

**7. Update operations table** below if new control changes any operation's `components[]`.

**Persistence invariants:**
- Storage path: `project.modelSettings[modelId][controlId]` — flat per-model key.
- Recall: `getModelSettings(state.currentProject, modelId)` on every `mount()`. Never cache across mounts.
- Save: emit `Events.emit('settings:model:update', { modelId, key, value })` — `projectService` debounces + atomically writes `project.json` via `updateProjectJson()`.
- Never call `setModelSettings()` directly from a control; never write `project.json` directly.
- Clamp + coerce both on save (in `change` handler) AND on recall (in `mount`), since persisted values may be from older builds with different ranges.

**Operation-level vs payload-level signals:** most controls flow through `getInjectionParams()` → merged into `injectionParams` → `commandExecutor._buildParams()` → ComfyUI. Exception: `previewStage` exposes itself through `el.getRunPayload().previewOnly` because the executor needs the flag *before* params merge (to select capture-title filter). Default to the standard `getInjectionParams()` path unless executor needs out-of-band knowledge.

**Resize live preview (image AND video):** `MpiToolOptionsResize` extracts a 512px-longest-edge thumbnail from the source via `viewer.el.getSourceElement()` (HTMLImageElement for the image canvas viewer, HTMLVideoElement first frame for the video viewer) and submits it through the **image** `resize` workflow with `width`/`height`/`divisible_by` proportionally scaled to thumbnail space. The call uses `runCommand({ operation: 'resize', mediaItems: [{ url: <thumbDataUrl>, mediaType: 'image' }], injectionParams: <scaledParams>, previewOnly: true, suppressLifecycleEvents: true })`. `previewOnly` remains a "do not save" hint; `suppressLifecycleEvents: true` tells `commandExecutor` to NOT emit `tool:sampling-start` / `tool:loading-model` / `tool:running` / `tool:idle` — tool-panel previews bypass `generationService` and have no `tool:running`/`tool:idle` pair to bracket them, so any lifecycle emit would strand StatusBar in the active state. Multi-stage `_ms` previews go through `generationService` and DO want lifecycle events; do NOT gate suppression on `previewOnly` alone. The result paints into the inline `<img>` slot inside the resize tool panel — never into the viewer canvas/video. Apply emits `{ params }` (no cached preview URL) and the block always re-runs the workflow at full resolution via `startGeneration` (`resize` for image, `resizeVideo` for video).

---

## Operations and their controls[] (from commandRegistry.js)

| Operation key     | Label              | mediaType | requiresImages | requiresVideo | requiresMask | promptRequired | components          | status      |
|-------------------|--------------------|-----------|----------------|---------------|--------------|----------------|---------------------|-------------|
| `t2i`             | Text to Image      | image     | 0              | —             | —            | yes            | `['ratio','batch']` | active      |
| `i2i`             | Image to Image     | image     | 1              | —             | —            | yes            | `['ratio','batch']` | active      |
| `upscale`         | Upscale            | image     | 1              | —             | —            | no             | (none)              | active      |
| `edit`            | Edit               | image     | 1              | —             | —            | yes            | (none)              | active      |
| `detail`          | Detail             | image     | 1              | —             | true         | yes            | (none)              | active      |
| `change`          | Change             | image     | 1              | —             | true         | yes            | (none)              | active      |
| `remove`          | Remove             | image     | 1              | —             | true         | yes            | (none)              | active      |
| `t2v`             | Text to Video      | video     | 0              | —             | —            | yes            | `['ratio','duration']`                                       | active      |
| `i2v`             | Image to Video     | video     | 1              | —             | —            | no             | `['ratio','duration','motionIntensity']`                     | active      |
| `t2v_ms`          | Text to Video (multi-stage) | video | 0           | —             | —            | yes            | `['ratio','previewStage','duration']`                        | active      |
| `i2v_ms`          | Image to Video (multi-stage) | video | 1          | —             | —            | no             | `['ratio','previewStage','duration','motionIntensity']`      | active      |
| `extend`          | Extend             | video     | 0              | 1             | —            | no             | (none)              | active      |
| `interpolate`     | Interpolate        | video     | 0              | —             | —            | no             | (none)              | universal   |
| `videoUpscale`    | Video Upscale      | video     | 0              | —             | —            | no             | (none)              | universal   |
| `autoMaskImg`     | Auto Masking       | image     | 1              | —             | —            | no             | (none)              | universal   |
| `resize`          | Resize             | image     | 1              | —             | —            | no             | (none)              | universal   |
| `resizeVideo`     | Resize Video       | video     | 0              | 1             | —            | no             | (none)              | universal   |

> `status: active` — operation has a workflow file and is working.
> `status: stub` — operation is defined but not yet implemented (`stub: true` in commandRegistry).
> `status: universal` — operation does not use model-tied ComfyUI workflows; wired to toolbar buttons in groupHistory workspace, NOT shown in the PromptBox dropdown.
