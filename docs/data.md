# Data Layer

Three core data files. All are plain JS objects — no ORM, no database.

## modelRegistry (`js/data/modelRegistry.js`)

**Single source of truth for all generative models.**

- `MODELS`: Array of `ModelDef` objects. A model declares its deps in ONE of two shapes:
  - **Flat** (ops are not separately installable — all image models): `{ id, name, mediaType, supportedOps, workflows, dependencies[], dropdownMeta? }`.
  - **Operation-keyed** (ops carry separable payloads — e.g. Wan 2.2): `{ ..., commonDeps[], operations: { <opKey>: { deps[], requiresOps?[] } } }` and NO flat `dependencies`. `commonDeps` is always installed (VAE, text encoder, shared nodes); each `operations[op].deps` is that op's unique payload the user can opt in/out of in the model manager. Optional `requiresOps` lists ops that op depends on — selecting it pulls them in; deselecting a prerequisite cascades the dependent off. An op only reads installed when its own deps AND its `requiresOps` are on disk.
  - **Op toggles + per-op install/uninstall:** the model-download page renders one toggle per `operations` key (only ops in both `supportedOps` and `operations` are selectable). The toggle draft persists in `state.s_modelOpDraftByModel` (survives restart). The action button reads Install (nothing installed), Update (draft differs from installed), or Uninstall (installed, no change). Update installs newly-selected ops and, after a confirm, uninstalls deselected ops' UNIQUE deps (deps still used by a remaining op are kept). A "base" toggle (commonDeps) appears only when the model has bundled ops that run on commonDeps alone (image models with upscale/detail); video models show only their op toggles.
  - `dropdownMeta`: Optional short category text shown in compact model selectors (for example `PHOTO`, `ANIME`, `VIDEO`). Keep this as model data rather than deriving it from names in UI code.
- `getModelsByType(mediaType, opts?)`: Returns models filtered by media type. Accepts `{ installed: true|false }` to filter by install state.
- `getModelById(id)`: Lookup by ID. Legacy split ids (`wan-22-t2v` / `wan-22-i2v`) are canonicalized to the merged `wan-22` via `canonicalModelId`.
- `getWorkflowFile(modelId, op)`: Returns the workflow JSON filename for a model+op combination.
- `syncModelInstalled()`: Hits `GET /comfy/models/check` with the **full dep universe** (`resolveFullUniverse`), populates `installed: true/false` at runtime. **Never hardcode `installed: true` in MODELS.**
- `resolveDep(depId)`, `getModelDependencies(modelId)`: Resolve dependency graph. `getModelDependencies` returns the full universe (common + every op).

### resolveModelDeps (`js/data/modelConstants/resolveModelDeps.js`)

Pure, framework-free resolver that collapses any model + op-selection into a stable, deduped flat dep-id list **before** it enters the download lifecycle — the downloader never learns about operations. **This is the chokepoint — NEVER read `model.dependencies` directly** (MPI-122). Loads under both `import` (browser) and `require` (Node tests / backend `createRequire`). Key exports:

- `resolveDeps(model, selectedOps?, depExists?, engine?)`: common + the selected ops' deps. `selectedOps == null` ⇒ all selectable ops (a fresh full install). `engine = null` ⇒ union of both engine sets (no filter). Throws on an unknown dep id when `depExists` is supplied.
- `resolveFullUniverse(model)`: common + EVERY selectable op — used for install-status checks and whole-model uninstall so no op payload is orphaned.
- `deriveInstalledOps(model, depStatusFn)`: `{ installedOps, fullyInstalled }` derived from per-dep disk/Pod status. An op is installed when common + its own deps are complete. Omitted ops are NOT partial failures.
- `expandRequiredOps(model, ops)`: expand a selection to include every op it (transitively) requires via `requiresOps`, in stable registry order.
- `dependentsOfOp(model, op)`: ops that (transitively) require `op` — the UI cascade-off set when `op` is deselected.
- `selectableOps(model)`, `hasOperationGroups(model)`, `canonicalModelId(id)`, `LEGACY_MODEL_ID_ALIASES`, `dedupeStable(ids)`.

Contract tests: `tests/resolve-model-deps.test.cjs` (incl. a real-registry integrity check).

## commandRegistry (`js/data/commandRegistry.js`)

**Defines what operations are available for a given model+media context.**

- `CommandDef`: `{ key, label, icon?, mediaType, requiresImages, requiresVideo?, requiresMask?, promptRequired?, universal?, stub?, components[] }`
  - `components[]`: Array of control IDs that `MpiPromptBox` mounts into its operation slot when this command is active. e.g. `['ratio', 'steps', 'seed']`. Each ID maps to an entry in `PromptBoxControls.js`.
  - `icon`: Optional MpiIcon registry key used by the model-manager operation toggles (e.g. `t2v_ms → 'text'`, `i2v_ms → 'image'`).
  - `universal`: If `true`, the command is not model-tied — it uses a separate workflow from `modelRegistry.universalWorkflows`. Toolbar-driven (e.g. interpolate, videoUpscale, autoMaskImg).
- `getAvailableCommands(mediaType, model, ctx)`: Filters commands by model's `supportedOps` and input availability. Returns `{ key, available, ...CommandDef }` including `components[]` for each command. When `ctx.installedOps` (a string[] from `deriveInstalledOps`) is supplied, a selectable op the user did NOT install is hidden — so a T2V-only Wan install never offers I2V. Absent `installedOps`, falls back to static `supportedOps` (no change for image / pre-check models).
- `getToolCommands(mediaType)`: Returns universal-only commands — these do not require a model and use their own layouts.
- `getCommandComponents(key)`: Returns the `components[]` array for a given command key.
- For the current list of operations, their `components[]`, media requirements, and status, see `.claude/rules/component-comfy.md` § "Operations and their controls[]" (authoritative table — sourced from `commandRegistry.js`).

## promptControlDefaults (`js/data/promptControlDefaults.js`)

**Single source for PromptBox control default values.**

`PROMPT_CONTROL_DEFAULTS` is imported by both `PromptBoxControls.js` and Reuse Prompt replay. Use `commandRegistry.commands[op].defaults` for per-operation overrides. Do not duplicate PromptBox default literals in recall/replay code, otherwise old sidecars and new UI defaults can drift.

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

## Gotchas

**Group field persist whitelist:** adding a new scalar field to an ItemGroup (e.g. MPI-130 `group.customName`) needs THREE edits: (1) `createItemGroup` factory in `js/data/projectModel.js`; (2) **`persistGroups()` in `js/services/projectService.js`** — the serialize map is an EXPLICIT WHITELIST (`{id, type, name, createdAt, selectedIndex, open, favourite, history}`), NOT a spread. Any key not listed is SILENTLY DROPPED on every save → field never survives reload. (3) Read-back is already safe (`projectReconciler.js` uses spread). Groups live INLINE in `project.json` `itemGroups[]`, NOT in `.meta/<uuid>.json` sidecars. When adding any group-level property, grep `persistGroups` first.

**Notes feature — project.md and card sidecar (MPI-76):** two surfaces. Project notes = `project.md` per project; routes: `POST /project-notes` + `POST /project-notes/save` in `routes/projects.js`; triggered from project picker right-click. Card notes = `notes` field on card sidecar (`Media/.meta/<itemId>.json`); persisted via existing `POST /project-media/:id/update-meta`. Both use `MpiNotesEditor` (textarea + Save/Cancel over MpiModal). `grid.on('card-notes')` cleaned by `grid.destroy()` (not `_unsubs`).

**Media roles are ROLE-AGNOSTIC (MPI-295):** snapshot/restore/reuse plumbing NEVER forces `startFrame`/`endFrame` by index — each media chip keeps its op's own `mediaInputs` slot-key role (`inputImage`/`inputImage2`, `startFrame`/`endFrame`, …). `routes/projects.js _snapshotRoleForMediaItem` persists `item.role` (positional frame-role only as a legacy role-LESS fallback); `promptReuse._mediaItemsFromPreviewAssets` resurfaces ALL image snapshots, not just frame roles. Restore fits the op to the saved image COUNT so a 2-image edit lands on krea2Edit (cap 2), not i2i: `MpiPromptBox._pickFallbackOp` is count-aware, and the restore guard compares the ACTIVE op's own cap (`_maxMediaForOperation`), NOT the model-wide max. Injection already remaps roles to the current op's slots at read time (`_withAssignedRoles` + `commandExecutor._buildParams`), so cross-op reuse (krea2Edit chips → Wan i2v Input_Start_Frame/Input_End_Frame) just works. NO data-shape change — prompt-box media is already an ordered list of `{url, mediaType, role, name, …}` dicts; NO migration (restore fits by count, old sidecars self-heal on next save).

**Reuse prompt recall (`state.promptReuseOptions` / `state.promptReuseSource`):** Ask is a behavior flag; Gallery can reuse Original or Current. I2V reads materialized frame snapshots from the sidecar `previewAssets.snapshots[].filePath`, which point at the content-addressed flat store `Media/.preview-assets/<sha256>.<ext>` (MPI-227 — the old per-item `<itemId>/startFrame.png` disk probe was removed; sidecar filePath is authoritative). Gallery Reuse source `current` uses the card's active `selectedIndex` entry. MPI-127: `_mergeReuseMedia(frames, saved)` in `js/utils/promptReuse.js` — preview-asset frames are authoritative for IMAGES, saved media supplies every OTHER type (audio, non-frame video); if frames present, saved images dropped to avoid dup start-frame chip. MPI-227: the Reuse dialog gains **Use Video** + **Use Audio** toggles (beside Use Images), each op-gated per source (`payloadHasReusableVideos`/`payloadHasReusableAudio`); saved video/audio is op-gated in `buildPromptReusePayload` (extend/interpolate/videoUpscale/resizeVideo accept video; LTX t2v_ms/i2v_ms accept audio). **Preview-assets are PERMANENT** — only the manual projects-page "Cleanup assets…" command (`POST /project/cleanup-assets`) deletes them; card delete never does. A reuse of a cleaned frame soft-fails to a `ui:warning` toast (comfyController tags the 404 `code:'input_asset_deleted'`), not the error dialog.

**Sidecar `controlState` schema (MPI-115, SCHEMA_VERSION 3):** `.meta/<uuid>.json` sidecar has ONE source per field. Replayable PromptBox state = `generationSettings.controlState = { shared?, op?, model? }`, snapshotted at gen time. Buckets: `shared` = `project.shared[mediaType]` (ratioSelector/qualityTier, batch, duration, motionIntensity, previewStage); `op` = per-op (denoise/useGrid/upscaleFactor); `model` = `{loras, upscaleModel}`. Removed dups: top-level `ratioLabel`, `videoMeta`, `generationSettings.modelSettings`. Deliberate dups KEPT: `pixelDimensions` vs `injectionParams.Width/Height`; `mediaItems` vs `previewAssets.snapshots`. Migration: `SCHEMA_VERSION = 3`; `migrateV2toV3` chains.

**`removeHistoryEntry` empty-group guard:** `removeHistoryEntry(group, index)` in `projectModel.js` silently returns original group when only one entry remains (`group.history.length <= 1`). Delete flows consuming every remaining entry must detect this BEFORE looping and switch to `removeGroup(id)` + `navigate(PAGE_GALLERY)`. Detect with `indices.length >= _group.history.length`. File DELETE fetches still fire for each item.

**Video trim frame semantics:** Out-points are frame-inclusive. Frame stepping/display must use probed stream fps with `frameCount` bounds — NOT `frameCount / HTMLVideoElement.duration`. Chromium can report a few ms of duration tail after the final decoded frame, manufacturing a fake one-past-last frame that makes next/previous controls appear stuck at the end.
