## Sub-Agent Briefing
> Use this file when you need to know what gets injected into ComfyUI workflows and from which component.

---

## Injection Points

| Control ID | Component        | nodeTitle(s)                     | Params injected                  | Operations (from commandRegistry)          |
|------------|------------------|----------------------------------|----------------------------------|--------------------------------------------|
| `ratio`    | `MpiOptionSelector` (variant: ratio) | `"Width"`, `"Height"` (separate nodes) | `{ Width: number, Height: number }` | `t2i`, `i2i`, `t2v`, `i2v`             |
| `batch`    | `MpiBatchSelector` | `"Batch_Size"` (MpiInt.inputs.int) | `{ Batch_Size: 1\|2\|3\|4 }`     | `t2i`, `i2i`                               |

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
    → ComfyUIController.runWorkflow(workflowFile, params, onProgress)
      → nodes targeted by _meta.title (case-insensitive)
      → "Output" node captures final result images
      → "Detected" node (auto-mask only) captures segmentation preview URLs
```

**Group History selected-entry invariant:** `MpiGroupHistoryBlock` owns `_currentIdx` and promotes the clicked history item via `entry-selected`. Prompt-driven operations must inject `_group.history[_currentIdx]` when the user has not supplied a dropped image. Auto-mask detection is owned by `MpiCanvasViewer`; because the viewer survives history switches, it must resolve `_currentItem.filePath` at detect time rather than reusing `initialImageUrl`.

---

## PromptBoxControls Registry — static, do not regenerate

**Location:** `js/components/Organisms/MpiPromptBox/PromptBoxControls.js`

**Current controls:**

| ID      | Component         | nodeTitle | defaultValue | `getInjectionParams()` return |
|---------|-------------------|-----------|--------------|-------------------------------|
| `ratio` | `MpiOptionSelector` (variant: ratio) | `null` (Width + Height separate) | `'1:1'` | `{ Width: number, Height: number }` — defaults to `{ Width: 1024, Height: 1024 }` |
| `batch` | `MpiBatchSelector` | `'Batch'` (registry string; injection key is `Batch_Size` via `MpiInt.inputs.int`) | `1` | `{ Batch_Size: 1\|2\|3\|4 }` |

> **Adding a new control:** (1) create component, (2) add entry to `PROMPT_BOX_CONTROLS` with `nodeTitle` + `getInjectionParams()`, (3) add control ID to operation's `components[]` in `commandRegistry.js`

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
| `t2v`             | Text to Video      | video     | 0              | —             | —            | yes            | `['ratio']`         | active      |
| `i2v`             | Image to Video     | video     | 1              | —             | —            | no             | `['ratio']`         | active      |
| `extend`          | Extend             | video     | 0              | 1             | —            | no             | (none)              | active      |
| `interpolate`     | Interpolate        | video     | 0              | —             | —            | no             | (none)              | universal   |
| `videoUpscale`    | Video Upscale      | video     | 0              | —             | —            | no             | (none)              | universal   |
| `autoMaskImg`     | Auto Masking       | image     | 1              | —             | —            | no             | (none)              | universal   |

> `status: active` — operation has a workflow file and is working.
> `status: stub` — operation is defined but not yet implemented (`stub: true` in commandRegistry).
> `status: universal` — operation does not use model-tied ComfyUI workflows; wired to toolbar buttons in groupHistory workspace, NOT shown in the PromptBox dropdown.
