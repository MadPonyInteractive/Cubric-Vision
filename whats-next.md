<original_task>
Brainstorm and design a per-project, per-model settings system for MpiAiSuite that allows users to select user LoRAs and upscale models scoped to each model they work with. This grew into a broader state architecture overhaul after discovering that state.js contains significant legacy dead code that would conflict with the new design.
</original_task>

<work_completed>

## 1. Backlog Updated
File: `.claude/rules/backlog.md`
- Moved "State Architecture Overhaul" to top priority with full technical context
- Added "Model Settings Overlay" as a new active to-do (new component for LoRA + upscale model selection)
- Removed the vague "Upscale Refactor — consider for future" item (now an active task)
- Added `defaultUpscale` field requirement to models.js as part of the overlay task
- Added backend route requirement: scan ComfyUI `loras/` and `upscale_models/` folders

## 2. Injection Rules Updated
File: `.claude/rules/comfy_injection.md`
- Completely rewritten to be concise and agent-readable
- Added full Standard Node Title Map table covering all injection parameters including:
  - `"Lora_1"` … `"Lora_6"` — user LoRA slots (system LoRAs are baked in, NOT injected)
  - `"Upscale_Model"` — upscale model filename
  - `"Input_Video"`, `"Upscale_Factor"`, `"Auto_Grid"`, `"Grid_H"`, `"Grid_V"`, `"Creative"`, `"sams"`, `"Box"`, `"Selected_Masks_Input"`, `"Detected"`, `"Output"`
- Added image/mask upload rules (static filenames for caching)
- Added example showing LoRA and upscale injection in a params payload
- Source of truth for this update: `.agents/workflows/comfyui_mapping_rules.md`

## 3. Full Brainstorming Session Completed
Key decisions made and approved by user:

### Two-Tier LoRA Architecture
- **System LoRAs** — baked into workflows, invisible to user, stay in `dependencies[]` (e.g. `spo-sdxl-lora`, `dmd2_sdxl_4step_lora`)
- **User LoRAs** — dynamic, scoped per project+model, injected via `Lora_1`…`Lora_6` node titles at runtime

### Two-Track Settings State
- **`modelSettings`** — keyed by `modelId`, holds user LoRA slots (6x) + upscale model. For model-based operations triggered from the prompt box.
- **`toolSettings`** — keyed by tool command key (e.g. `'videoUpscale'`), holds upscale model only. For universal tools in the history workspace toolbar.

### Scope
- Settings are **project-scoped** — each project carries its own per-model and per-tool selections
- Workflow JSON files are NEVER modified — all injection happens at runtime via `comfyController.runWorkflow()`
- The settings overlay is context-aware: shows LoRA slots + upscale when invoked from prompt box (model context), shows only upscale when invoked from a universal tool like Video Upscaler

### State.js Audit Results
Confirmed live keys (keep):
- `currentProject`, `currentPage`, `currentParams`, `previousPage`, `previousParams`
- `comfyRootPath`, `allComfyWorkflows`
- `upscaleModels` (runtime list of available upscalers)
- `g_selectedModel` — used by `navigation.js` and `gallery.js`
- `g_abortControllers` — used by `llmService.js` (LLM re-implementation pending)
- `currentLoadedModel` — used by `llmService.js`

Confirmed dead (remove):
- All `g_*` except `g_selectedModel` and `g_abortControllers` (old Prompt Builder tool, gone)
- `generatorPrompt`, `generatorSeed` — old generator tool
- `toolModelIds`, `descriptorImages`, `activeSubPage` — old tool system
- `pendingImageUrl` — never read outside state.js
- `defaultComfySettings`, `toolComfySettings`, `getToolComfySettings()` — replaced by new structure
- `detailerInputImage`, `detailerInputMask`, `detailerMaskMode`, `detailerSelectedMasks`, `detailerDetectionMode` — old detailer tool
- `upscalerInputImage`, `upscalerAutoGrid`, `upscalerGridH`, `upscalerGridV`, `upscalerCreative` — old upscaler tool
- `downloadingWorkflows` — old download system
- `runningComfyTool`, `runningLlmTool` — old tool tracking

To add:
- `availableLoras: []` — runtime list of available LoRA filenames from ComfyUI backend

## 4. Implementation Plan Written
File: `docs/superpowers/plans/2026-04-10-state-architecture-overhaul.md`

6 tasks, fully specified with exact code:
- **Task 1**: Add `defaultUpscale` to image models in `models.js` (sdxl-realistic → `4x-NMKD-Siax`, anime models → `4x-AnimeSharp`)
- **Task 2**: Update `projectModel.js` — add `modelSettings` + `toolSettings` to typedef and `createProject()` factory
- **Task 3**: Update `projectManager.js` — replace old `toolComfySettings`/`comfySettings` restore with new two-track restore
- **Task 4**: Clean `state.js` — strip dead keys, add `availableLoras`, full replacement code included
- **Task 5**: Add helper functions to `projectModel.js`: `getModelSettings()`, `setModelSettings()`, `getToolSettings()`, `setToolSettings()`
- **Task 6**: Add `saveProjectSettings()` to `projectManager.js` for persisting changes to disk

User approved using **Subagent-Driven execution** (fresh subagent per task, review between tasks).

</work_completed>

<work_remaining>

## Immediate: Execute the Implementation Plan
File: `docs/superpowers/plans/2026-04-10-state-architecture-overhaul.md`

Use the `superpowers:subagent-driven-development` skill to execute the plan task by task. The plan is complete and self-contained — each task has exact file paths, exact code, and exact git commit commands.

Order is important — execute in sequence:
1. Task 1 (models.js — no dependencies)
2. Task 2 (projectModel.js — no dependencies)
3. Task 3 (projectManager.js — depends on Task 2 shape)
4. Task 4 (state.js — can run after Task 3)
5. Task 5 (projectModel.js helpers — depends on Task 2)
6. Task 6 (projectManager.js helper — depends on Task 5)

After Task 4, manually verify the app still loads without console errors before continuing.

## After State Overhaul: Model Settings Overlay Component
This is the next major feature (already in backlog). Requires the state overhaul to be complete first.

What it needs:
- A new reusable overlay component (Tier 2 Compound, follows ComponentFactory pattern)
- Shows LoRA slots (up to 6) with filename picker + strength sliders per slot
- Shows upscale model selector (single dropdown)
- Context-aware: hides LoRA section when invoked from a universal tool (no model context)
- Reads from `state.currentProject.modelSettings[modelId]` or `state.currentProject.toolSettings[toolKey]`
- Writes via `setModelSettings()` / `setToolSettings()` helpers then calls `saveProjectSettings()`
- LoRA list populated from `state.availableLoras` (fetched at runtime from ComfyUI backend)
- Upscale list populated from `state.upscaleModels` (already exists in state, needs backend route to populate)
- A backend route is needed: scan ComfyUI `loras/` and `upscale_models/` folders and return filenames

## After Overlay: Wire Injection into Workflows
When `commandExecutor.js` / `comfyController.js` runs a workflow for a model operation, it must:
1. Read `getModelSettings(state.currentProject, modelId)`
2. Build `Lora_1`…`Lora_6` params from non-null lora slots
3. Resolve upscale model: use `modelSettings.upscaleModel` if set, else fall back to the model's `defaultUpscale` dep id → resolve to actual filename via `dependencies.js`
4. Inject `Upscale_Model` param

For `videoUpscale` tool:
1. Read `getToolSettings(state.currentProject, 'videoUpscale')`
2. Inject `Upscale_Model` param

</work_remaining>

<attempted_approaches>

## No Failed Approaches
This session was a brainstorming + planning session — no code was written yet, so no approaches failed.

## One Rejected Edit
When updating `comfy_injection.md`, the first draft was too long and used the same structure as the original file. User asked for it to be more concise and agent-readable. The second version (table format, no verbose sections) was accepted.

## Considered but Deferred
- Using a single unified settings track (tool-only key) rather than splitting into model vs tool — rejected because model settings need LoRA slots which tools don't have, and model settings need to be scoped to a specific model id, not just a tool name
- Making LoRA slots dynamic count (not fixed at 6) — deferred, 6 slots matches the existing injection standard (`Lora_1`…`Lora_6` in comfyui_mapping_rules.md)

</attempted_approaches>

<critical_context>

## Architecture Rules (MUST READ before coding)
- Read `.claude/rules/dos_and_donts.md` before writing any code — universal rules
- Read `.claude/rules/components.md` before building the overlay component
- Read `.claude/rules/comfy_injection.md` for the full node title injection map
- Read `.claude/rules/comfy_engine.md` for model registry patterns

## Key Architectural Facts
- `state.js` uses a Proxy — mutating any property automatically fires `Events.emit('state:changed', { key, value })`. Never manually emit `state:changed`.
- `projectModel.js` is pure data/factory — no side effects, no imports from state or events. All functions return new objects (immutable pattern).
- `projectManager.js` handles persistence — `updateProject()` POSTs to `/update-project` and writes to `project.json` on disk.
- Components follow ComponentFactory pattern — never modify `js/components/factory.js`.
- CSS: BEM mandatory (`.mpi-component__element--modifier`), use `styles/01_base.css` variables, never hardcode colors.
- Icons: never paste raw SVG — always import from `js/utils/icons.js`.
- Event bus: `Events.on()` returns unsubscribe fn — always store and call on destroy.

## Two-Tier LoRA Distinction (CRITICAL)
System LoRAs (e.g. `spo-sdxl-lora`, `dmd2_sdxl_4step_lora`) are in `dependencies[]` and are **baked into workflow JSON files**. Users never see or touch them. User LoRAs are completely separate — dynamically fetched from ComfyUI `loras/` folder, stored in `modelSettings`, injected via `Lora_1`…`Lora_6` node titles at runtime.

## ComfyUI Workflows Folder
Workflow JSON files live in `comfy_workflows/`. They are loaded by `comfyController.runWorkflow()` by filename. They must have a node titled `"Output"` for result capture to work.

## Tools in groupHistory Workspace
- **Crop** — native, no workflow, no settings needed
- **Mask** — native canvas tool, produces mask data URI
- **AutoMask** — universal ComfyUI workflow (`autoMaskImg` command key), no user-configurable settings
- **Compare** — native, triggered by multi-select, no settings
- **Interpolate** — universal ComfyUI workflow (`interpolate` command key), UI not yet implemented, no user settings currently
- **VideoUpscale** — universal ComfyUI workflow (`videoUpscale` command key), UI not yet implemented, needs upscale model selection → `toolSettings['videoUpscale']`

## Dependency IDs vs Filenames
`dependencies.js` uses dep IDs (e.g. `'4x-NMKD-Siax'`) which map to actual filenames (e.g. `upscale_models/4x_NMKD-Siax_200k.pth`). When injecting `Upscale_Model` into a workflow, the actual **filename** (not the dep id) must be used. Resolution: look up the dep id in `DEPS` from `dependencies.js` to get `filename`, then strip the folder prefix to get just the model filename that ComfyUI expects.

## projectManager.js Migration Note
The old `project.json` files on disk may still have `toolComfySettings` or `comfySettings` keys. The new `openProject()` simply ignores them (no migration needed — the new keys `modelSettings`/`toolSettings` will be `{}` by default and populated as users make selections). The old keys will persist harmlessly in the JSON until a user saves new settings, at which point `updateProject()` will overwrite only the keys it sends.

## What `g_selectedModel` Actually Is
This holds the currently selected model object from the prompt box. It is used by `navigation.js` and `gallery.js`. It is NOT the same as `currentProject.modelSettings`. This key should be kept as-is until those files are refactored.

</critical_context>

<current_state>

## Deliverables Status

| Deliverable | Status |
|:---|:---|
| `.claude/rules/backlog.md` | ✅ Complete — state overhaul at top, overlay as second priority |
| `.claude/rules/comfy_injection.md` | ✅ Complete — full node title map, concise format |
| `docs/superpowers/plans/2026-04-10-state-architecture-overhaul.md` | ✅ Complete — 6 tasks, ready to execute |
| `js/data/modelConstants/models.js` | ⬜ Not started — Task 1 of plan |
| `js/data/projectModel.js` | ⬜ Not started — Tasks 2 + 5 of plan |
| `js/managers/projectManager.js` | ⬜ Not started — Tasks 3 + 6 of plan |
| `js/state.js` | ⬜ Not started — Task 4 of plan |
| Model Settings Overlay component | ⬜ Not started — after state overhaul |
| Backend LoRA/upscale scan route | ⬜ Not started — after state overhaul |
| Workflow injection wiring | ⬜ Not started — after overlay component |

## No Temporary Changes in Place
No code has been modified yet. The plan is written but execution has not begun. The codebase is in the same state as before this session, except for the two `.claude/rules/` files and the new plan doc.

## Next Action
Start a fresh session and immediately invoke `superpowers:subagent-driven-development` skill to execute `docs/superpowers/plans/2026-04-10-state-architecture-overhaul.md` task by task.

</current_state>
