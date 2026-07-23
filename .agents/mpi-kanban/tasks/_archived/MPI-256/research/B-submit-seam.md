# MPI-256 research — Agent B: generation submit seam / results / queue / invariants

## Q1. THE entry point + payload
**Entry: `enqueueGeneration(config, callbacks, opts)` — `js/services/generationService.js:380`.**

Chain: MpiPromptBox.js:1255 run click → `_emitRun()` :1167 → `el.getRunPayload()` :1148 → MpiGalleryBlock.js:1306 `pb.on('run')` → `_galleryGenerationFromPayload` :1296 → `enqueueGeneration` → `_cueQueue.push` → `_dispatchNextCue` :336 → `startGeneration` :631 → `runCommand` (commandExecutor.js:992) → engine/arch resolve → `generationStore.register(jobId, engine)` :1056 → `_buildParams` → load workflow JSON → dispatch.

**config (GenerationConfig, generationService.js:590-610):** `{operation, model (FULL registry object), positive, negative, mediaItems[{url,mediaType,role?,source?,filePath?,trim?}], maskDataUrl?, injectionParams (Width/Height/Batch_Size/Steps/CFG...), previewOnly, historyMode, extend?, sourceItemId?, trimIn/Out?, replaceItemId?, isStage2?, latent fields...}`

**opts (MpiGalleryBlock.js:1247):** `{scope:'gallery'|'groupHistory', tempId, placeholderGroup, extraTempIds[], extraPlaceholders[], forceLocal (from state.engineOverride==='local'), existingGroup?, groupId?, queueJobId (auto-gen if absent), source:'manual'|'loop', isLoop}`

**callbacks:** `{onComplete(item,group), onCancel(), onError(), getNextGeneration()}` — getNextGeneration = loop re-fire; APPS SHOULD NOT PROVIDE IT (else armed loop re-fires app gens endlessly).

Risks: `model` must be FULL registry object (getModelById/resolveWorkflowFile/mediaType/capabilities read from it); forceLocal must be derived from state.engineOverride by the producer; injectionParams keys must match workflow Input_* names.

## Q2. Implicit global-state dependencies of the submit path
| Dep | Where | Note |
|---|---|---|
| state.currentProject (+ .folderPath, .itemGroups) | generationService.js:958,818,922,1030,1151,1174 | null ⇒ saveGeneration SKIPPED, memory-only results (404-on-reload family) |
| state.loopArmed | :308,399 | loop re-fire on drain |
| state.generationQueueCount | :259 | DERIVED — never hand-set |
| state.engineOverride | MpiPromptBox.js:1163 | producer derives forceLocal |
| state.remoteEnginePhase / remoteEngineClient.isRemote() | :1278 / commandExecutor.js:1041 | lane resolution |
| getModelSettings(project, model.id) | commandExecutor ~650, genService:819 | **LoRA slots/upscale/qualityTier/styles injected SILENTLY — no per-call LoRA override exists** |
| getSharedSettings / getOpSettings / getToolSettings | :820/:848/commandExecutor:716 | ratio/batch/duration; per-op; universal upscale model |
| state.availableLoras / state.upscaleModels | commandExecutor `_findMissingModel` | pre-dispatch validation |

App must: have non-null currentProject w/ folderPath; pass real installed model (or universal `{id:null, mediaType}`); build own injectionParams (PromptBox's getInjectionParamsFromControls not reusable as-is); respect engineOverride.
TRAP: app gen on a model w/ active project LoRAs will CARRY those LoRAs silently.

## Q3. Where results land
- `exec.onComplete(urls)` genService:743 → `saveGeneration(...)` → server `POST /save-generation` (downloads from ComfyUI → project/Media/ → .meta sidecar → updateProjectJson queued) → `createImageItem/createVideoItem` → **gallery mode: `addGroup(group)` projectService.js:401 (CREATES a fresh group — NO pre-existing group required)** | groupHistory mode: `updateGroup` | replace mode: `replaceHistoryItemById`.
- Then `generation:complete {id,item,group,tempId,extraTempIds,scope}` → MpiGalleryBlock.js:1416 `_rebuildAfterEnd` → grid setGroups from state.currentProject.itemGroups.
- **App result in gallery = identical to PromptBox result: a new ItemGroup card, displayName from saveGeneration or operation.**
- INV-7 trap: saveGeneration failure is warn-swallowed (:987) → in-memory card, no sidecar, 404 on reload. generation:complete ≠ persisted.

## Q4. Queue mechanics
- Two lanes 'remote'/'local', max 1 active per lane (generationStore.js:74). `_laneOf` (genService:80-84): forceLocal→local else isRemote()?remote:local — MUST mirror commandExecutor's resolution (MPI-213 phantom-running).
- Store broadcasts `generation-store:changed` (generationStore.js:143) → genService:272 re-derives queueCount + emits `generation-queue:changed` → MpiQueuePanel re-renders. Status bar subscribes tool:running/accepted/loading-model/sampling-start/progress/stage/idle/cancelled with {tool,id}, latches id (MPI-203).
- Producer cancel: `cancelRunningCueJob(queueJobId)` :447 (identity guard at :509 before `_onLaneDrain` — replicate or one Stop spawns 2-3 gens); `cancelPendingCueJob` :441; `clearPendingQueue` :1250.

## Q5. EXISTING SECOND PRODUCER = MpiGroupHistoryBlock (the precedent)
1. History PromptBox run (:870, 1102-1113): `enqueueGeneration(config, callbacks, {existingGroup, scope:'groupHistory', groupId, forceLocal})`.
2. **Video/image tool ops (:1116-1173 `_runVideoTool`/`_runImageTool`): `model: { id: null, mediaType }` — UNIVERSAL workflows needing NO real model id.** ← Apps' closest template.
3. Resize (:1198-1222) same pattern, operation 'resize'/'resizeVideo'.
Apps = same recipe: build config, callbacks, pick scope/gallery-vs-existingGroup, call enqueueGeneration.
Caveat: `{id:null}` works ONLY for universal workflows; model-tied app workflows need the real installed model object.

## Q6. Invariants (INV-1..10)
1. `cancelled→done` illegal (store LEGAL_TRANSITIONS; settle no-ops silently).
2. `_laneOf` must mirror commandExecutor engine resolution (MPI-213).
3. Loop re-fire runs SYNC inside cancel — stop handlers capture cancelled-intent ref + identity-guard (MPI-234).
4. Double-drain identity guard (cancelRunningCueJob:509) — custom cancel paths must replicate (MPI-226).
5. setLoopCallback slot is consumed-once per drain; never persistent callback.
6. generationQueueCount derived — never hand-set.
7. saveGeneration failure warn-swallowed → generation:complete ≠ persisted.
8. Post-cancel placeholder reconciliation from activeGenerations, not project groups (MpiGalleryBlock.js:1335-1342).
9. currentProject?.folderPath gates saving (:958) — no project = ephemeral results, silent.
10. `tool:cancelled` must be emitted WITH the gen's id (cancelRunningCueJob:492) or status bar strands.
