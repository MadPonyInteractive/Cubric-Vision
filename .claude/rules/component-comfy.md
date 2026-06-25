## Sub-Agent Briefing
> Use this file when you need to know what gets injected into ComfyUI workflows and from which component.

---

## Injection Points

| Control ID | Component        | nodeTitle(s)                     | Params injected                  | Operations (from commandRegistry)                          |
|------------|------------------|----------------------------------|----------------------------------|------------------------------------------------------------|
| `ratio`    | `MpiOptionSelector` (variant: ratio) | `"Width"`, `"Height"` (separate nodes) | `{ Width: number, Height: number }` | `t2i`, `i2i`, `t2v`, `i2v`, `t2v_ms`, `i2v_ms`     |
| `batch`    | `MpiBatchSelector` | `"Batch_Size"` (MpiInt.inputs.int) | `{ Batch_Size: 1\|2\|3\|4 }`     | `t2i`, `i2i`                                               |
| `qualityTier` | `MpiOptionSelector` (variant: quality) | none — does not inject | shares state under `ratioSelector.qualityTier`; emits `ratio:quality-change` so sibling `ratio` control re-renders its set | `t2v`, `i2v`, `t2v_ms`, `i2v_ms` (only renders when `RATIO_MODES[modelType] === 'quality'`, e.g. `wan`, future `ltx`) |
| `previewStage` | `MpiButton` (size: sm, toggleable, icon: frameForward) | `"Preview_Only"` (`MpiBoolean.inputs.boolean`) | run payload `previewOnly: boolean`; `commandExecutor._buildParams` injects `Preview_Only: <boolean>` **only for `_ms` ops** (key endsWith `_ms`) so non-multi-stage workflows do not receive a stray `Preview_Only` field. **`payload.historyMode === true` overrides the toggle to force `Preview_Only: false`** regardless of persisted value — video-history workspace must never produce preview cards. | `t2v_ms`, `i2v_ms` |
| `duration` | `MpiProgressBar` (interactive, wheel, handle, suffix `s`) | `"Duration"` (`MpiInt.inputs.int`) | `{ Duration: 1..30 }` (int, step 1) | `t2v`, `i2v`, `t2v_ms`, `i2v_ms` |
| `motionIntensity` | `MpiProgressBar` (interactive, wheel, handle) | `"Motion_Intensity"` (`MpiFloat.inputs.float`) | `{ Motion_Intensity: 0..1 }` (float, step 0.01) | `i2v`, `i2v_ms` |
| `audioMode` | `MpiRadioGroup` (sm, 2 columns: Reference\|Original) | none (radio is a router; injects 3 gate booleans) | **only when an audio clip is present** (`setAudioPresent(true)`) → `{ Input_Use_Reference_Audio: mode==='reference', Input_Use_Input_Audio: mode==='original', Input_Use_Transition: true }`. No clip → `{}` (workflow baked gates apply). | `t2v_ms`, `i2v_ms` — **capability-gated**: mounts only when `model.capabilities.audio === true` (LTX yes, WAN no) |
| `useAudio` | `MpiButton` (sm, toggleable, icon: audio, label: 'Generate Audio') | `"Input_Use_Audio"` (`MpiSimpleBoolean.inputs.boolean`) | **only when NO audio clip is present** → `{ Input_Use_Audio: boolean }`. Clip present → `{}` (yields to `audioMode`; toggle is disabled+dimmed in the UI). | `t2v_ms`, `i2v_ms` — **capability-gated** (`model.capabilities.audio === true`). Sits directly under the `audioMode` radio; the two share the `setAudioPresent` signal but disable INVERSELY. |
| `resize` | `MpiToolOptionsResize` (tool panel) | `"Resize Image v2"`, `"ImageFlip"`, `"Image Rotate"`, Boolean node titled `"Flip"` | `{ width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, flip, rotation }` via standalone injector, not `_buildParams` | `resize`, `resizeVideo` |
| `upscale` | `MpiToolOptionsUpscale` (tool panel, shared image+video) | `"Upscale_Factor"` (MpiFloat), `"Upscale_Model"` (UpscaleModelLoader), `"Upscale_Using_Model"` (MpiBoolean gate) | `{ Upscale_Factor: number, Upscale_Using_Model: boolean, Upscale_Model?: filename }` — `Upscale_Model` injected only when user picks a model. When dropdown is `None`, `Upscale_Using_Model:false` flips the workflow's MpiIfElse to the no-model branch (plain `ImageScaleBy` lanczos). Persisted per-kind under `toolSettings.imageUpscale` / `toolSettings.videoUpscale`. | `imageUpscale`, `videoUpscale` |
| `useGrid` | `MpiButton` (size: sm, toggleable, icon: grid, label: 'Use Grid') | `"Auto_Grid"` (`MpiBoolean.inputs.boolean`) | `{ Auto_Grid: boolean }` | model-tied `upscale` |
| `upscaleFactor` | `MpiRadioGroup` (size: sm, columns: 4) | `"Upscale_Factor"` (`MpiFloat.inputs.float`/`inputs.value`) | `{ Upscale_Factor: 1.5\|2\|3\|4 }` | model-tied `upscale` |
| `denoise` | `MpiProgressBar` (interactive, wheel, handle) | `"Denoise"` (`MpiFloat.inputs.float`) | `{ Denoise: 0..1 }` (float, step 0.01) | model-tied `upscale` (default 0.20), `detail` (default 0.30) — defaults via `commands[op].defaults.denoise`; persisted under `operations[opName].denoise` so each op has independent state |

> **Note:** `nodeTitle` for `ratio` is `null` in the registry because it injects into two separate nodes (`Width` and `Height`) rather than a single node. The `getInjectionParams()` return `{ Width: w, Height: h }` which `_buildParams()` maps to the standard node title table.

> **Multi-stage workflow files:** Each `_ms` op resolves to TWO workflow files —
> `<name>.json` (stage-1) and `<name>_stage2.json` (stage-2). The stage-2 file
> is authored in ComfyUI by toggling the stage-1 KSampler to Bypass mode and
> using Save (API). On a stage-2 run (`payload.isStage2 === true`),
> `commandExecutor._toStage2Filename` swaps the basename before fetch.
>
> **LoadLatent injection (always-on for `_ms`):** Before every stage-1 run,
> `commandExecutor` calls `POST /comfy/prepare-workflow-inputs` to copy the
> repo-owned default latent `comfy_workflows/input/ComfyUI_00001_.latent` into
> the active ComfyUI `input/` folder, then injects
> `LoadLatent: 'ComfyUI_00001_.latent'`. On stage-2 runs, the per-preview
> `<previewUuid>.latent` is copied in by `POST /comfy/stage-preview-latent` and
> the same `LoadLatent` slot receives that filename. ComfyUI validates the
> `LoadLatent` selector on every submission regardless of reachability, so the
> param must always be set.
>
> **Preview → Continue (branching) vs Finish (replace):** Preview cards expose
> two icon-only buttons (Continue, Finish). Continue enqueues a stage-2 run
> with NO `replaceItemId` — the final lands as a new gallery card and the
> preview card stays for further branches. The preview card shows a small
> `xN` badge (via `grid.el.setStage2Count(groupId, n)`) reflecting how many
> stage-2 jobs are pending+running from that preview. Finish enqueues a
> stage-2 WITH `replaceItemId: item.id` — the stage-2 output overwrites the
> preview sidecar (preview is replaced by the final video). Continue is
> gated per-op by `commandAllowsBranchingContinue(opKey)` (read from
> `commands[opKey].allowsBranchingContinue` in `commandRegistry.js`); when
> `false`, only the Finish button renders (planned: LTX and future
> single-LoRA multi-stage ops). Removing a preview without finishing it is
> done through the normal multi-select Delete flow; the backend DELETE
> route auto-cleans `<projectMedia>/.latents/<itemId>.latent` plus
> `<projectMedia>/.preview-assets/<itemId>/` when the sidecar's `stage` is
> `'preview'`. Preview cards also participate in normal selection (shift /
> ctrl / right-click) like any other card — only the "open into history"
> action is suppressed because previews stay on the gallery.
>
> **Preview asset validation + cold fallback:** Before each Continue/Finish
> dispatch, the block calls `projectService.validatePreviewAssets(itemId)`
> (→ `GET /project-media/:projectId/validate-preview-assets`). Result drives
> the warning badge on the preview card via
> `grid.el.setPreviewAssetsWarning(groupId, state)`:
>
> - `null` / fast path → no badge, fast stage-2 path runs as above.
> - `{ mode: 'fallback' }` (amber) → latent missing but `frozenParams`
>   complete and any required I2V snapshots present. Continue reruns
>   stage-1 (`previewOnly: true`, `replaceItemId: previewId`) to rebuild
>   the latent in place, then on `gallery:item-updated` auto-enqueues the
>   stage-2 branch with the refreshed latent. Finish runs the full base
>   `_ms` workflow with `previewOnly: false` and `replaceItemId` — a single
>   submission, no `isStage2` swap, no `LoadLatent` override.
> - `{ mode: 'blocked' }` (red) → no fast path and no fallback. Continue
>   and Finish buttons are hidden by the CSS modifier on the card; user
>   recovers by deleting the preview.
>
> The validation kick fires on gallery mount and on every
> `gallery:item-updated` for the affected group. Click-time re-validation
> closes the TOCTOU window between badge render and button press.

> **Batch semantics:** `Batch_Size = N` → workflow runs once, returns N images. Gallery creates N separate cards (one per output URL). N placeholder cards shown from generation start, broadcasting the single ComfyUI preview to all N. Persisted cross-model under `project.shared[mediaType].batch`.

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

**Trim-aware universal video tools:** `MpiGroupHistoryBlock` attaches the live trim range to video `mediaItems` for `interpolate`, `videoUpscale`, and `resizeVideo`. `commandExecutor` must prepare those inputs through `POST /api/video/trim-input` before Comfy submission, replacing the media URL with a temporary project-data MP4 and cleaning it via `/api/video/trim-input/cleanup` after the run. Trim out is frame-inclusive: exporting frames `in..out` adds one frame duration to the ffmpeg slice and resets PTS with `setpts=PTS-STARTPTS` / `asetpts=PTS-STARTPTS`.

## Model Settings Injection

- `_buildParams()` merges model settings for LoRAs and upscale models. Checkpoints are app/workflow-owned and are not user-selectable in Model Settings.
- Flat-LoRA models inject `Lora_1` ... `Lora_6` from `modelSettings[modelId].loras`.
- Models with `model.loraStages` inject staged keys from `stage.injectionPrefix`, e.g. WAN emits `Lora_High_1` ... `Lora_High_6` and `Lora_Low_1` ... `Lora_Low_6`.
- LoRA dropdowns show every file returned by the active models root `loras/` folder. They are not filtered by `model.type`; users own their LoRA folder naming.

---

## PromptBoxControls Registry — static, do not regenerate

**Location:** `js/components/Organisms/MpiPromptBox/PromptBoxControls.js`

**Default source:** shared PromptBox control defaults live in `js/data/promptControlDefaults.js` (`PROMPT_CONTROL_DEFAULTS`). `PromptBoxControls.js` and Reuse Prompt replay both import this module. Do not duplicate default literals in recall/replay code. Per-operation overrides remain in `commandRegistry.commands[op].defaults`.

**Current controls:**

| ID             | Component         | nodeTitle      | defaultValue | `getInjectionParams()` return |
|----------------|-------------------|----------------|--------------|-------------------------------|
| `ratio`        | `MpiOptionSelector` (variant: ratio) | `null` (Width + Height separate) | `'1:1'` | `{ Width: number, Height: number }` — defaults to `{ Width: 1024, Height: 1024 }`. **scope: `shared`** — `project.shared[mediaType].ratioSelector`. |
| `batch`        | `MpiBatchSelector` | `'Batch'` (registry string; injection key is `Batch_Size` via `MpiInt.inputs.int`) | `1` | `{ Batch_Size: 1\|2\|3\|4 }`. **scope: `shared`** — `project.shared[mediaType].batch`. |
| `qualityTier` | `MpiOptionSelector` (variant: quality) | `null` | `'medium'` | does NOT contribute to `injectionParams` — quality picks a tier-specific ratio set, and the resolved Width/Height still come from the `ratio` control. **scope: `shared`** — `project.shared[mediaType].ratioSelector.qualityTier` (co-resides with `ratio` control). Emits `ratio:quality-change` so the sibling `ratio` control re-renders via its `el.setQualityTier(tier)` API. Renders nothing for orientation-mode models. |
| `previewStage` | `MpiButton` (toggleable) | `'Preview_Only'` (`MpiBoolean.inputs.boolean`) | `false` | does NOT contribute to `injectionParams`; instead `el.getRunPayload()` reads the toggle and sets payload `previewOnly: boolean`. `commandExecutor._buildParams` injects `Preview_Only: <boolean>` **only for `_ms` ops** (payload `operation` endsWith `_ms`) — single-stage workflows never receive the field, so a stale toggle from a prior `_ms` op cannot leak into them. **scope: `shared`** — `project.shared[mediaType].previewStage`. |
| `duration` | `MpiProgressBar` under a Stage-style label row (`DURATION` left, live `N s` right) — own full-width row in popup | `'Duration'` (`MpiInt.inputs.int`) | `5` | `{ Duration: 1..30 }` (int, step 1). **scope: `shared`** — `project.shared.video.duration`. |
| `motionIntensity` | `MpiProgressBar` under a Stage-style label row (`MOTION` left, live `X.XX` right) — own full-width row in popup | `'Motion_Intensity'` (`MpiFloat.inputs.float`) | `0` | `{ Motion_Intensity: 0..1 }` (float, step 0.01). **scope: `shared`** — `project.shared.video.motionIntensity`. |
| `audioMode` | `MpiRadioGroup` (sm, 2 columns) under an `Audio` label row | `null` (router — no single node) | `'reference'` | `{}` when no audio clip; with clip → `{ Input_Use_Reference_Audio, Input_Use_Input_Audio, Input_Use_Transition: true }`. Emits `'select'` (NOT `'change'`). `setAudioPresent(bool)` enables/disables the radio (disabled until a clip is present). **scope: `shared`** — `project.shared.video.audioMode`. **Capability-gated** — MpiPromptBox skips mount unless `model.capabilities.audio === true`. |
| `useAudio` | `MpiButton` (sm, toggleable, icon: audio, label: 'Generate Audio') — directly under the `audioMode` radio | `'Input_Use_Audio'` (`MpiSimpleBoolean.inputs.boolean`) | `true` | `{}` when an audio clip is present (yields to `audioMode`); else `{ Input_Use_Audio: boolean }`. `setAudioPresent(bool)` DISABLES+dims the toggle when a clip IS present (inverse of `audioMode`). **scope: `shared`** — `project.shared.video.useAudio`. **Capability-gated** (`model.capabilities.audio === true`). |
| `useGrid` | `MpiButton` (toggleable, icon: grid, label: 'Use Grid') | `'Auto_Grid'` (`MpiBoolean.inputs.boolean`) | `false` | `{ Auto_Grid: boolean }`. **scope: `perOp`** — `operations[opName].useGrid`. |
| `upscaleFactor` | `MpiRadioGroup` (sm, 4 columns) under Stage-style label row (`UPSCALE` left) | `'Upscale_Factor'` (`MpiFloat.inputs.float`) | `2` | `{ Upscale_Factor: 1.5\|2\|3\|4 }`. **scope: `perOp`** — `operations[opName].upscaleFactor`. |
| `denoise` | `MpiProgressBar` under Stage-style label row (`DENOISE` left, live `X.XX` right) — own full-width row in popup | `'Denoise'` (`MpiFloat.inputs.float`) | `0.2` (override via `commands[op].defaults.denoise`: `upscale=0.20`, `detail=0.30`) | `{ Denoise: 0..1 }` (float, step 0.01). **scope: `perOp`** — `operations[opName].denoise`. |

---

## PromptBoxControl Protocol — adding a new control

Every new PromptBoxControl MUST follow this checklist. Skipping any step breaks recall, persistence, or injection.

**1. Pick or build the UI component.** Reuse existing primitives/compounds (`MpiOptionSelector`, `MpiButton`, `MpiProgressBar`, `MpiDropdown`). Build a new component only if none fits.

**2. Add entry to `PROMPT_BOX_CONTROLS`** in `js/components/Organisms/MpiPromptBox/PromptBoxControls.js` with this shape:

```javascript
controlId: {
    nodeTitle: 'Workflow_Node_Title',   // or null if no single node (e.g. ratio)
    scope: 'shared' | 'perOp',          // REQUIRED. See "Persistence scope" below.
    defaultValue: <primitive>,           // Fallback; perOp controls can override per op via commands[op].defaults[controlId].
    mount(hostEl, opts = {}) {
        // Recall: read persisted value from the right bucket (shared vs per-op).
        const saved = _readSaved(this, opts);
        const fallback = _resolveDefault(this, 'controlId', opts);
        const initial = /* clamp + coerce saved.<controlId> ?? fallback */;
        this.value = initial;
        // Mount UI primitive bound to initial
        this._instance = SomePrimitive.mount(hostEl, { value: initial, ... });
        // Persist: emit through helper — payload carries opName resolved from scope + opts.
        this._instance.on('change', ({ value }) => {
            const v = /* clamp + coerce */;
            this.value = v;
            _emitUpdate(this, opts, 'controlId', v);
        });
    },
    getValue() { return this.value ?? this.defaultValue; },
    getInjectionParams() {
        return { Workflow_Node_Title: this.value ?? this.defaultValue };
    },
},
```

`_readSaved`, `_resolveDefault`, `_emitUpdate` are top-of-file helpers in `PromptBoxControls.js`. Use them — do NOT call `getModelSettings` / `getSharedSettings` or emit `settings:model:update` / `settings:shared:update` directly from a control. The helpers resolve the storage bucket from the control's `scope` plus `opts.opName` and `opts.model.mediaType` (passed by `MpiPromptBox._refreshOpSlot`).

**Persistence scope:**
- `scope: 'shared'` → reads/writes `project.shared[mediaType].<controlId>` (cross-model, partitioned by `mediaType` = `'image' | 'video'`). Use for controls whose value should persist across model switches within the same media type (ratio, batch, duration, motionIntensity, qualityTier, previewStage). All image models share one bucket; all video models share another.
- `scope: 'perOp'` → reads/writes `modelSettings[modelId].operations[opName].<controlId>`. Use when each op should hold an independent value per model (denoise — upscale vs detail; useGrid; upscaleFactor).

**Per-op defaults:** A `perOp` control with different sensible defaults per op declares the override in `commandRegistry.commands[opName].defaults[controlId]` (e.g. `upscale.defaults.denoise = 0.20`, `detail.defaults.denoise = 0.30`). `_resolveDefault` reads this before falling back to the control's own `defaultValue`. Do NOT branch on op name inside the control mount.

**3. Register on operations.** Add `controlId` to `commandRegistry.js` `components[]` array for every operation that should expose it. If the control is `perOp` and needs an op-specific default, add `defaults: { controlId: <value> }` to the same op entry.

**4. Workflow contract.** Ensure each registered operation's workflow JSON contains an `MpiInt` / `MpiFloat` / `MpiBoolean` / etc. node with `_meta.title === 'Workflow_Node_Title'`. Inject loop hits `inputs.int`, `inputs.float`, `inputs.boolean`, `inputs.value`, etc. — match field type to node class. **Agents must NOT edit, add, rename, or rewire nodes in `comfy_workflows/*.json` under any circumstance** — see `.claude/rules/comfy_injection.md`. Document the contract here, then ask the user to author the node in the ComfyUI graph editor.

**5. Update title map.** Add a row in `.claude/rules/comfy_injection.md` "Standard Node Title Map" with the new title + which `inputs.*` field it writes.

**6. Update injection table.** Add a row to the table above (control ID, component, nodeTitle, defaultValue, getInjectionParams).

**7. Update operations table** below if new control changes any operation's `components[]`.

**8. Snapshot/replay surfaces (preview-gate, history-recall, any future params-locked run).** Generation-state surfaces that snapshot user inputs and replay them later MUST carry your control's value. Today this means: `generationService.js` snapshots the entire `injectionParams` map into `frozenParams.injectionParams` on `previewOnly` runs, and `MpiGalleryBlock` "preview:continue" spreads that whole map back before overlaying `Width`/`Height`/`Seed`. Rules for ANY new control:
- If the control flows through the standard `getInjectionParams()` path → automatic, no code change needed.
- If the control flows through an out-of-band path (like `previewStage` → `el.getRunPayload().previewOnly`) → you MUST extend `frozenParams` in `js/services/generationService.js` and the replay in `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` ("preview:continue" handler) to carry the signal. Same rule applies to any future snapshot/replay surface (recall-from-history, retry-with-same-params, etc.) — audit those sites when adding any out-of-band control.
- NEVER re-read live PromptBox state inside a replay handler. Snapshots are the source of truth.

**Reuse Prompt replay:** `js/utils/promptReuse.js` builds reusable prompt payloads for Gallery and History. Gallery source `'current'` is strict and must use the card's active `selectedIndex` entry, even when that entry is a promptless generated action; do not fall back to Original for Current. Reuse must apply recovered values when present and otherwise apply defaults from `PROMPT_CONTROL_DEFAULTS` plus `commandRegistry` per-op overrides for controls in the recalled operation. For I2V frame media, materialized snapshots under `Media/.preview-assets/<itemId>/startFrame.png` and `endFrame.png` are the primary source; saved `generationSettings.mediaItems` / `frozenParams.mediaItems` are fallback only. New I2V saves must materialize their input frames into that folder even when the run is not a preview-stage run. Do not depend on source gallery cards for frame recall, because users can delete cards.

**Persistence invariants:**
- Storage path: `project.modelSettings[modelId].operations[scope].<controlId>` — `scope` resolves to `'shared'` or the op key.
- Recall: `_readSaved(this, opts)` on every `mount()` (it wraps `getOpSettings`). Never cache across mounts.
- Save: `_emitUpdate(this, opts, controlId, v)` — wraps `Events.emit('settings:model:update', { modelId, opName, key, value })`. `projectService` debounces + atomically writes `project.json` via `updateProjectJson()`.
- Never call `setModelSettings` / `setOpSettings` directly from a control; never write `project.json` directly.
- Clamp + coerce both on save (in `change` handler) AND on recall (in `mount`), since persisted values may be from older builds with different ranges.
- Model-wide values (`loras`, `upscaleModel`) live at `modelSettings[modelId]` top level and bypass the `operations` bucket. Only `MpiModelSettings` writes them; emit `{ modelId, key, value }` (no `opName`) — projectService's back-compat guard routes those to the model bucket.

**Operation-level vs payload-level signals:** most controls flow through `getInjectionParams()` → merged into `injectionParams` → `commandExecutor._buildParams()` → ComfyUI. Exception: `previewStage` exposes itself through `el.getRunPayload().previewOnly` because the executor needs the flag *before* params merge (to select capture-title filter). Default to the standard `getInjectionParams()` path unless executor needs out-of-band knowledge.

**Resize live preview (image AND video):** `MpiToolOptionsResize` extracts a 512px-longest-edge thumbnail from the source via `viewer.el.getSourceElement()` (HTMLImageElement for the image canvas viewer, HTMLVideoElement first frame for the video viewer) and submits it through the **image** `resize` workflow with `width`/`height`/`divisible_by` proportionally scaled to thumbnail space. The call uses `runCommand({ operation: 'resize', mediaItems: [{ url: <thumbDataUrl>, mediaType: 'image' }], injectionParams: <scaledParams>, previewOnly: true, suppressLifecycleEvents: true })`. `previewOnly` remains a "do not save" hint; `suppressLifecycleEvents: true` tells `commandExecutor` to NOT emit `tool:sampling-start` / `tool:loading-model` / `tool:running` / `tool:idle` — tool-panel previews bypass `generationService` and have no `tool:running`/`tool:idle` pair to bracket them, so any lifecycle emit would strand StatusBar in the active state. Multi-stage `_ms` previews go through `generationService` and DO want lifecycle events; do NOT gate suppression on `previewOnly` alone. The result paints into the inline `<img>` slot inside the resize tool panel — never into the viewer canvas/video. Apply emits `{ params }` (no cached preview URL) and the block always re-runs the workflow at full resolution via `startGeneration` (`resize` for image, `resizeVideo` for video).

---

## Operations and their controls[] (from commandRegistry.js)

| Operation key     | Label              | mediaType | requiresImages | requiresVideo | requiresMask | promptRequired | components          | status      |
|-------------------|--------------------|-----------|----------------|---------------|--------------|----------------|---------------------|-------------|
| `t2i`             | Text to Image      | image     | 0              | —             | —            | yes            | `['ratio','batch']` | active      |
| `i2i`             | Image to Image     | image     | 1              | —             | —            | yes            | `['ratio','batch']` | active      |
| `upscale`         | Upscale            | image     | 1              | —             | —            | no             | `['useGrid','upscaleFactor','denoise']` (denoise default 0.20 via `defaults`) | active      |
| `edit`            | Edit               | image     | 1              | —             | —            | yes            | (none)              | active      |
| `detail`          | Detail             | image     | 1              | —             | true         | yes            | `['denoise']` (default 0.30 via `defaults`) | active      |
| `change`          | Change             | image     | 1              | —             | true         | yes            | (none)              | active      |
| `remove`          | Remove             | image     | 1              | —             | true         | yes            | (none)              | active      |
| `t2v`             | Text to Video      | video     | 0              | —             | —            | yes            | `['ratio','duration']`                                       | active      |
| `i2v`             | Image to Video     | video     | 1              | —             | —            | no             | `['ratio','duration','motionIntensity']`                     | active      |
| `t2v_ms`          | Text to Video (multi-stage) | video | 0           | —             | —            | yes            | `['audioMode','useAudio','qualityTier','duration','ratio','previewStage']` (audioMode+useAudio capability-gated, LTX only; previewStage multiStage-gated, WAN only) | active      |
| `i2v_ms`          | Image to Video (multi-stage) | video | 1          | —             | —            | no             | `['audioMode','useAudio','qualityTier','duration','motionIntensity','ratio','previewStage']` (audioMode+useAudio capability-gated, LTX only; previewStage multiStage-gated, WAN only) | active      |
| `extend`          | Extend             | video     | 0              | 1             | —            | no             | (none)              | active      |
| `interpolate`     | Interpolate        | video     | 0              | —             | —            | no             | (none)              | universal   |
| `videoUpscale`    | Video Upscale      | video     | 0              | —             | —            | no             | (none)              | universal   |
| `imageUpscale`    | Image Upscale      | image     | 1              | —             | —            | no             | (none)              | universal   |
| `autoMaskImg`     | Auto Masking       | image     | 1              | —             | —            | no             | (none)              | universal   |
| `resize`          | Resize             | image     | 1              | —             | —            | no             | (none)              | universal   |
| `resizeVideo`     | Resize Video       | video     | 0              | 1             | —            | no             | (none)              | universal   |

> `status: active` — operation has a workflow file and is working.
> `status: stub` — operation is defined but not yet implemented (`stub: true` in commandRegistry).
> `status: universal` — operation does not use model-tied ComfyUI workflows; wired to toolbar buttons in groupHistory workspace, NOT shown in the PromptBox dropdown.
