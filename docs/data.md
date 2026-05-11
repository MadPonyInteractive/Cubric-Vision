# Data Layer

Three core data files. All are plain JS objects — no ORM, no database.

## modelRegistry (`js/data/modelRegistry.js`)

**Single source of truth for all generative models.**

- `MODELS`: Array of `ModelDef` objects `{ id, name, mediaType, supportedOps, workflows, dependencies, dropdownMeta? }`.
  - `dropdownMeta`: Optional short category text shown in compact model selectors (for example `PHOTO`, `ANIME`, `VIDEO`). Keep this as model data rather than deriving it from names in UI code.
- `getModelsByType(mediaType, opts?)`: Returns models filtered by media type. Accepts `{ installed: true|false }` to filter by install state.
- `getModelById(id)`: Lookup by ID.
- `getWorkflowFile(modelId, op)`: Returns the workflow JSON filename for a model+op combination.
- `syncModelInstalled()`: Hits `GET /comfy/models/check` with all deps, populates `installed: true/false` at runtime. **Never hardcode `installed: true` in MODELS.**
- `resolveDep(depId)`, `getModelDependencies(modelId)`: Resolve dependency graph.

## commandRegistry (`js/data/commandRegistry.js`)

**Defines what operations are available for a given model+media context.**

- `CommandDef`: `{ key, label, mediaType, requiresImages, requiresVideo?, requiresMask?, promptRequired?, universal?, stub?, components[] }`
  - `components[]`: Array of control IDs that `MpiPromptBox` mounts into its operation slot when this command is active. e.g. `['ratio', 'steps', 'seed']`. Each ID maps to an entry in `PromptBoxControls.js`.
  - `universal`: If `true`, the command is not model-tied — it uses a separate workflow from `modelRegistry.universalWorkflows`. Toolbar-driven (e.g. interpolate, videoUpscale, autoMaskImg).
- `getAvailableCommands(mediaType, model, ctx)`: Filters commands by model's `supportedOps` and input availability. Returns `{ key, available, ...CommandDef }` including `components[]` for each command.
- `getToolCommands(mediaType)`: Returns universal-only commands — these do not require a model and use their own layouts.
- `getCommandComponents(key)`: Returns the `components[]` array for a given command key.
- Commands: t2i, i2i, upscale, edit, detail, change, remove, t2v, i2v, extend, interpolate, videoUpscale, autoMaskImg, createGroupFromSelection (stub), promoteToNewGroup (stub).

## projectModel (`js/data/projectModel.js`)

**Plain serializable objects — the project file shape on disk.**

Project JSON: `{ id, name, folderPath, createdAt, updatedAt, thumbnail, itemGroups, tutorialSeen, modelSettings, toolSettings }`

- `createImageItem() / createVideoItem()`: Make a media item for a group.
- `createItemGroup()`: Makes a group containing items.
- `getSelectedItem() / appendToHistory() / promoteHistoryEntry() / removeHistoryEntry()`: History management.
- `createProject() / updateGroupInProject() / addGroupToProject() / removeGroupFromProject()`: Project-level operations.
- `getModelSettings(project, modelId) / setModelSettings(project, modelId, settings)`: Model-specific settings (LoRA slots, upscale model).
- `getToolSettings(project, toolKey) / setToolSettings(project, toolKey, settings)`: Tool-specific settings.

Model settings are persisted to the project JSON. LoRA picks and upscale model selections live here.
Most models use a flat six-slot `loras` array. Models that declare `model.loraStages`
use a staged object instead; WAN stores `{ high: [...], low: [...] }`. LTX uses the
standard flat LoRA shape.
