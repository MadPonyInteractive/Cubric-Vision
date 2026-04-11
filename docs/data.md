# Data Layer

Three core data files. All are plain JS objects — no ORM, no database.

## modelRegistry (`js/data/modelRegistry.js`)

**Single source of truth for all generative models.**

- `MODELS`: Array of `ModelDef` objects `{ id, name, mediaType, supportedOps, workflows, dependencies }`.
- `getModelsByType(mediaType, opts?)`: Returns models filtered by media type. Accepts `{ installed: true|false }` to filter by install state.
- `getModelById(id)`: Lookup by ID.
- `getWorkflowFile(modelId, op)`: Returns the workflow JSON filename for a model+op combination.
- `syncModelInstalled()`: Hits `GET /comfy/models/check` with all deps, populates `installed: true/false` at runtime. **Never hardcode `installed: true` in MODELS.**
- `resolveDep(depId)`, `getModelDependencies(modelId)`: Resolve dependency graph.

## commandRegistry (`js/data/commandRegistry.js`)

**Defines what operations are available for a given model+media context.**

- `CommandDef`: `{ key, name, mediaType, supportedOps, inputRequirements }`
- `getAvailableCommands(mediaType, model, ctx)`: Filters commands by model's `supportedOps` and input availability.
- `getToolCommands(mediaType)`: Returns universal-only commands (interpolate, videoUpscale, autoMaskImg) — these do not require a model.
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
