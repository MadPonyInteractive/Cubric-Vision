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

> **Block-local (NOT in `state`):** `MpiGroupHistoryBlock` tracks the active tool mode in block-local variable `_options` (the currently-mounted `MpiToolOptions*` instance). This is intentionally NOT a `state` key — it is workspace-scoped and must not persist across navigation. Do NOT add an `activeTool` key to `state.js`.

> **MpiCanvas pan/zoom is NOT in `state`:** `scale`, `offsetX`, `offsetY` live inside `ViewManager` (instance-local). Pan/zoom is applied as a CSS `transform` on `.mpi-canvas__stack` — not via `ctx.translate/scale`. Never reach into `state` for canvas view parameters.
