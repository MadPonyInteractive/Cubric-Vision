# Resize tool — Dependencies + Docs/Rules sync findings

## 1. dependencies.js entries

**comfyui-kjnodes** (line 170–178): currently NO `installOnEngine` flag
```javascript
'comfyui-kjnodes': {
    id: 'comfyui-kjnodes',
    name: 'ComfyUI KJNodes',
    type: 'custom_nodes',
    filename: 'comfyui-kjnodes',
    url: 'https://github.com/kijai/ComfyUI-KJNodes/archive/refs/heads/main.zip',
    installRequirements: true,
    size: '28MB',
},
```
**ACTION:** Phase 1 adds `installOnEngine: true`.

---

**ComfyUI-MpiNodes** (line 131–140): `installOnEngine: true` confirmed
```javascript
'ComfyUI-MpiNodes': {
    id: 'ComfyUI-MpiNodes',
    name: 'ComfyUI-MpiNodes',
    type: 'custom_nodes',
    filename: 'ComfyUI-MpiNodes',
    url: 'https://github.com/MadPonyInteractive/ComfyUi-MpiNodes/archive/refs/heads/main.zip',
    installRequirements: false,
    size: '1.76MB',
    installOnEngine: true,
},
```

---

**ComfyUI-VideoHelperSuite** (line 150–159): `installOnEngine: true` confirmed
```javascript
'ComfyUI-VideoHelperSuite': {
    id: 'ComfyUI-VideoHelperSuite',
    name: 'ComfyUI-VideoHelperSuite',
    type: 'custom_nodes',
    filename: 'comfyui-videohelpersuite',
    url: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/archive/refs/heads/main.zip',
    installRequirements: false,
    size: '806KB',
    installOnEngine: true,
},
```

---

## 2. installOnEngine consumer

**Function:** `getUniversalWorkflowDepIds()` — `routes/shared.js:317–322`

```javascript
function getUniversalWorkflowDepIds() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    return Object.entries(DEPS)
        .filter(([, dep]) => dep.installOnEngine === true)
        .map(([id]) => id);
}
```

**Call sites:**
- `routes/shared.js:334` — used in `checkUniversalWorkflowDepsStatus()`
- `routes/downloadManager.js:31` (export), `:663` (used in `cleanupDependenciesAfterModelUninstall()`)
  - At line 677–681: universal deps are always preserved on model uninstall ("Rule 1: always preserve universal workflow deps")

**Effect:** Changing `comfyui-kjnodes.installOnEngine` to `true` will add it to the list returned by `getUniversalWorkflowDepIds()`, causing it to be installed with the engine and never deleted on model cleanup. This is the intended behavior for resize tool support.

---

## 3. UNIVERSAL_WORKFLOWS

**Location:** `js/data/modelConstants/universal_workflows.js` (complete file)

```javascript
// ── Universal Workflows (not model-tied) ──────────────────────────────────────
// Available regardless of which model is active.
// Keys must match commandRegistry entries marked universal: true.
//
// Dependencies for universal workflows are defined once in DEPS (dependencies.js)
// with installOnEngine: true — they are installed automatically with the engine
// and are never tracked per-workflow.

/**
 * @typedef {Object} UniversalWorkflowDef
 * @property {string} workflow - Workflow filename in comfy_workflows/
 */

/** @type {Record<string, UniversalWorkflowDef>} */
export const UNIVERSAL_WORKFLOWS = {
    interpolate: {
        workflow: 'video_interpolate.json',
    },
    videoUpscale: {
        workflow: 'video_upscale.json',
    },
    autoMaskImg: {
        workflow: 'img_auto_mask.json',
    },
};
```

**Add pattern for resize:**
```javascript
resize: {
    workflow: 'resize.json',
},
resizeVideo: {
    workflow: 'resize_video.json',
},
```

---

## 4. Rule files needing sync

### component-comfy.md

**Existing entry for autoMaskImg** (line 149) shows `status: universal`:
```
| `autoMaskImg`     | Auto Masking       | image     | 1              | —             | —            | no             | (none)              | universal   |
```

**Template for resize entries:**
Add two rows to "Operations and their controls[] (from commandRegistry.js)" table (line 131–150):
```
| `resize`          | Resize             | image     | 1              | —             | —            | no             | (none)              | universal   |
| `resizeVideo`     | Resize Video       | video     | 0              | 1             | —            | no             | (none)              | universal   |
```

**Injection section:** Resize does not add new PromptBoxControls — it is a tool-panel-only operation. No new entries needed in the PromptBoxControls registry or Injection Points tables.

---

### component-events.md

**Existing entry at line 488:**
```
**Video groups:** MpiVideoViewer mounted instead of MpiCanvasViewer. Tool options in `#right-top-slot` via mediator: crop → MpiToolOptionsCrop, videoUpscale → MpiToolOptionsUpscale, interpolate → MpiToolOptionsInterpolate. PromptBox only if `_hasPromptOps()` true.
```

**Tool registry at line 54–59:**
```javascript
const TOOL_OPTIONS_REGISTRY = {
    crop:         MpiToolOptionsCrop,
    mask:         MpiToolOptionsMask,
    videoUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
};
```

**Template for resize:** Add entries to both locations:
- Line 488: add `resize → MpiToolOptionsResize` to the list
- Line 54–59: add `resize: MpiToolOptionsResize,` and `resizeVideo: MpiToolOptionsResize,` (same component reused)

---

### component-mounts.md

**Existing entries at line 52–59:**
```
**Image mode tools:** `prompt`, `crop`, `mask`
**Video mode tools:** `prompt`, `crop`, `videoUpscale`, `interpolate`
```

**Template for resize:** Update both lists:
```
**Image mode tools:** `prompt`, `crop`, `mask`, `resize`
**Video mode tools:** `prompt`, `crop`, `videoUpscale`, `interpolate`, `resizeVideo`
```

Also update the TOOL_OPTIONS_REGISTRY pattern (line 54–59) — same as component-events.md.

---

### component-state.md

**No entry needed.** The resize tool uses `project.toolSettings.resize` which is a generalized pattern already established (see line 9, 43, 45 entries for `toolSettings.*`).

Template for Phase 2 documentation only (NO code required for Phase 1):
- `project.toolSettings.resize` — record storing last-used params: `{ width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, flip, rotation }`
- Persisted per-project via `updateProjectJson()` (atomic writes rule)
- Restored on tool reopen via `getToolSettings(project, 'resize', defaults)`

---

## 5. Docs sync targets

### docs/comfy.md

**No new section required.** Resize is a universal tool (not model-tied), so it follows the existing pattern at line 37–56 (Workflow Injection Pattern). 

**Potential future addition** (not Phase 1): a new "Universal Workflows" section documenting that `interpolate`, `videoUpscale`, `autoMaskImg`, and `resize` do not inject model settings (LoRAs, checkpoints) — they consume only tool-panel control params.

---

### docs/PROJECT.md

**No new section required.** The kanban entry line 17 already documents universal commands:
```
- **Group History:** Single card detail — history timeline, canvas, PromptBox for running model-tied + universal commands.
```

Resize is a universal command and fits this existing description.

---

### docs/project-integrity.md

**Potential future addition** (Phase 5 sync): A section documenting `toolSettings` shape for resize (width, height, upscale_method, etc.) alongside the existing `generationMs` and `stage` field docs (line 57–107).

Current pattern: `project.toolSettings.crop`, `project.modelSettings[modelId].*` for model-specific controls. Resize adds `project.toolSettings.resize` to the `toolSettings` bucket (existing structure, no schema change).

---

## 6. Workflow files

**resize.json** — PRESENT at `comfy_workflows/resize.json`
**resize_video.json** — PRESENT at `comfy_workflows/resize_video.json`

Both files exist (user-authored per kanban scope). Ready for Phase 1 wiring.

---

**Universal workflow template files** in `comfy_workflows/`:
- `video_interpolate.json` — interpolate operation (existing)
- `video_upscale.json` — videoUpscale operation (existing)
- `img_auto_mask.json` — autoMaskImg operation (existing)

No additional template files needed for resize. The two workflows (image + video) are self-contained.

---

## 7. Follow-up kanban entry no-dup check

**Existing crop entry** ("When applying a crop, the crop box goes away.") — line 500–509:
```md
### When applying a crop, the crop box goes away.

- Let's make sure that the crop box stays until another tool is selected or a selection is made. 
- Let's use this kanban entry also to update the looks of the crop box, as the handles still do not match the mock-up design. You may ask the user for a visual of how it should look.
```

**Scope difference from Phase 5 resize follow-up:**
- **Crop entry:** Bug fix (crop box disappears) + Style update (handles don't match mockup)
- **Phase 5 resize follow-up entry ("Tool panel UI refresh — Stage mockup match"):** Comprehensive redesign pass for ALL tool panels (crop + mask + resize + resizeVideo) to match Stage mockup + implement `toolSettings` persistence parity

**NO DUPLICATION.** Phase 5 entry is a broader surface redesign that *includes* the crop handle update but also covers mask and resize panels. The existing crop bug entry can be left as-is (subsumes the handle fix) or merged into Phase 5 once that entry is created. Decision: leave crop entry standalone for now; Phase 5 author coordinates during planning.

---

## Key files for this phase

- `js/data/modelConstants/dependencies.js:170` — kjnodes entry (add `installOnEngine: true`)
- `js/data/modelConstants/universal_workflows.js` — add `resize` + `resizeVideo` entries
- `js/data/commandRegistry.js:185+` — resize operation stubs (already present, search `resize:` in file)
- `routes/shared.js:317–322` — getUniversalWorkflowDepIds() (no change needed; flag change auto-includes kjnodes)
- `routes/downloadManager.js:677` — preserves universal deps (no change needed)
- `.claude/rules/component-comfy.md:131–150` — add resize rows to operations table
- `.claude/rules/component-events.md:488,54–59` — add resize to video tools list + registry
- `.claude/rules/component-mounts.md:52–59,54–59` — add resize to tool lists + registry
- `.claude/rules/component-state.md` — document `toolSettings.resize` shape (Phase 5)
- `comfy_workflows/resize.json` — present (no edits)
- `comfy_workflows/resize_video.json` — present (no edits)
