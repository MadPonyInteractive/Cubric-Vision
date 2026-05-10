## Sub-Agent Briefing
> Use this file when you need to know which state keys a component reads or writes.
> All keys live in `js/state.js` as a reactive Proxy. Writing any key auto-fires `state:changed`. Never manually emit `state:changed`.

---

| state key              | type                        | readers                                                                                 | writers                                                                            |
|------------------------|-----------------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `currentProject`       | `Object\|null`              | MpiGalleryBlock, MpiGroupHistoryBlock, MpiModelSettings, MpiRadialMenu (via `updateProject`), PromptBoxControls (reads `getModelSettings` on mount)      | MpiGalleryBlock (`addGroup/updateGroup/removeGroup`), MpiGroupHistoryBlock, projectService (sole writer for `modelSettings`/`toolSettings` via event queue) |
| `currentPage`          | `'landing'\|'gallery'\|'groupHistory'` | router.js (read at routing time)                                               | router.js (`navigate()` writes this)                                               |
| `currentParams`        | `Object`                    | router.js                                                                               | router.js                                                                          |
| `previousPage`         | `string\|null`              | router.js                                                                               | router.js                                                                          |
| `previousParams`       | `Object`                    | router.js                                                                               | router.js                                                                          |
| `comfyRootPath`        | `string\|null`              | routes/comfy.js (backend)                                                               | (backend sync at init)                                                             |
| `allComfyWorkflows`    | `Array`                     | comfyController.js                                                                      | comfyController.js (populated at startup)                                          |
| `upscaleModels`        | `string[]`                  | MpiModelSettings (`_mountUpscaleDropdown`)                                              | assetService.js (`loadAll()` at runtime — backend sync)                            |
| `availableLoras`       | `string[]`                  | MpiModelSettings (`_mountLoraSlots`)                                                    | assetService.js (`loadAll()` at runtime — backend sync)                            |
| `s_selectedModelId`    | `string\|null`              | MpiGalleryBlock (derives `activeModel` on mount), MpiGroupHistoryBlock (derives `activeModel` on mount) | MpiGalleryBlock (on model-change event from promptBox), MpiGroupHistoryBlock (on model-change + on mount sync) |
| `s_installedModelIds`  | `string[]`                  | MpiGalleryBlock (checks length to decide PromptBox/models modal), MpiGroupHistoryBlock (derives supported ops) | modelRegistry.js (on `models:checked` event from syncModelInstalled)               |
| `g_abortControllers`   | `Object`                    | llmService.js (legacy)                                                                  | llmService.js (legacy)                                                             |
| `currentLoadedModel`   | `string\|null`              | llmService.js (legacy)                                                                  | llmService.js (legacy)                                                             |
| `downloadJobs`         | `DownloadJob[]`             | MpiModelsModal, downloadService.js                                                      | downloadService.js                                                                 |
| `downloadQueueActive`  | `boolean`                   | (read by components polling state)                                                      | downloadService.js                                                                 |
| `comfyNeedsRestart`    | `boolean`                   | comfyController.js (ensureServerRunning guard)                                          | downloadService.js (set on `comfy:needs-restart` SSE event)                        |
| `gallerySort`          | `{ order: string, filter: string }` | MpiGalleryGrid (`_rerenderJustified`)                                         | MpiGalleryGrid (tab click handler)                                                 |
| `galleryShowInfo`      | `boolean`                   | MpiGalleryGrid (info button active state, card sync)                                    | MpiGalleryGrid (info button click)                                                 |
| `gallerySizeLevel`     | `number` (1–5)              | MpiGalleryGrid (slider initial value, `_cardWidth` init)                                | MpiGalleryGrid (slider input handler)                                              |
| `focusMode`            | `boolean`                   | (shell + components that hide on focus)                                                 | focusModeService.js (F-key toggle)                                                 |
| `loopArmed`            | `boolean`                   | MpiPromptBox (Cue/Loop button label + armed CSS class), generationService (re-fire gate) | MpiPromptBox (hold-to-arm gesture, tap-to-disarm, Ctrl+L hotkey)                   |
| `generationQueueCount` | `number`                    | MpiPromptBox (Cue label), generationService, StatusBar                                  | generationService own-queue dispatcher (`_cueQueue.length + (_cueDispatchInFlight ? 1 : 0)`); updated synchronously on enqueue/dispatch/clear — no Comfy polling |
| `projectStats`         | `{ count, bytes }`          | landing project rows + future status-bar / project-meta consumers                       | `projectStatsService.refreshProject()` (auto-fired on `media:imported`/`media:deleted`/`generation:complete`/`project:stats-dirty`/`project:changed`) |
| `historyStats`         | `{ groupId, count, bytes }` | `MpiGroupHistoryBlock` meta strip + future consumers                                    | `projectStatsService.refreshGroup(group)` (auto-fired on `history:stats-dirty`)    |
| `lastGeneration`       | `{ label, elapsed } \| null`| timing/meta consumers via `generation:timing`                                           | `statusBar.js` (writes on generation `complete()`)                                 |

> **Block-local (NOT in `state`):** `MpiGroupHistoryBlock` tracks the active tool mode in block-local variable `_options` (the currently-mounted `MpiToolOptions*` instance). This is intentionally NOT a `state` key — it is workspace-scoped and must not persist across navigation. Do NOT add an `activeTool` key to `state.js`.

> **Loop armed flag is session-only:** `state.loopArmed` controls whether the Cue dispatcher re-fires on queue drain. Never persisted to `project.json` or `modelSettings`. There is no "Single mode" — Cue is the only execution path; Loop is a flag layered on top. The Cue cluster (Cue/Stop/Clear) is always the same shape regardless of `loopArmed`; only the run button label + armed CSS class change.

> **PromptBox reads `modelSettings[modelId].previewStage`** — boolean, persisted per-model via `settings:model:update`. Drives the "Preview initial stage" toggle (control id `previewStage`) and the `previewOnly` field on the run payload. Only present in operations whose `components[]` includes `'previewStage'` (today: `t2v_ms`, `i2v_ms`).

> **Model LoRA settings shape:** most models, including LTX, use the flat shape `modelSettings[modelId].loras: Array<6>`. Models that declare `model.loraStages` (WAN) use a staged object, e.g. `loras: { high: Array<6>, low: Array<6> }`. `MpiModelSettings`, `commandExecutor`, and preview `loraSnapshot` handling must support both shapes.

> **Cue queue depth is local:** `state.generationQueueCount` includes the active Cue dispatch plus pending jobs. StatusBar subtracts the active dispatch and only displays pending depth, e.g. `GENERATING (2 queued)`. Do not poll ComfyUI queue depth for Cue mode.

> **MpiCanvas pan/zoom is NOT in `state`:** `scale`, `offsetX`, `offsetY` live inside `ViewManager` (instance-local). Pan/zoom is applied as a CSS `transform` on `.mpi-canvas__stack` — not via `ctx.translate/scale`. Never reach into `state` for canvas view parameters.

> **MpiCanvas VRAM lifecycle:** When prompt tool is active, `MpiCanvasViewer` destroys `MpiCanvas` completely (`_cv.inst.el.destroy()` zeros canvas dims → immediate GPU texture release) and mounts `MpiMaskedImagePreview` (zero GPU backing). On switch back, a fresh `MpiCanvas` is remounted. The internal `_cv` mutable ref + `canvas` Proxy ensure all `canvas.*` calls in `MpiCanvasViewer` transparently forward to the current live instance. Do NOT hold a direct ref to the `MpiCanvas` instance from outside `MpiCanvasViewer` — the instance is replaced on every prompt↔tool swap.

> **MpiCanvas pan/zoom is NOT in `state`:** `scale`, `offsetX`, `offsetY` live inside `ViewManager` (instance-local). Pan/zoom is applied as a CSS `transform` on `.mpi-canvas__stack` — not via `ctx.translate/scale`. Never reach into `state` for canvas view parameters.
