## Sub-Agent Briefing
> Use this file when you need to know which state keys a component reads or writes.
> All keys live in `js/state.js` as a reactive Proxy. Writing any key auto-fires `state:changed`. Never manually emit `state:changed`.

---

| state key              | type                        | readers                                                                                 | writers                                                                            |
|------------------------|-----------------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `currentProject`       | `Object\|null`              | MpiGalleryBlock, MpiGroupHistoryBlock, MpiModelSettings, MpiRadialMenu (via `updateProject`)      | MpiGalleryBlock (`state.currentProject = addGroupToProject(...)` etc.), MpiGroupHistoryBlock, MpiModelSettings (`state.currentProject = setModelSettings(...)`) |
| `currentPage`          | `'landing'\|'gallery'\|'groupHistory'` | router.js (read at routing time)                                               | router.js (`navigate()` writes this)                                               |
| `currentParams`        | `Object`                    | router.js                                                                               | router.js                                                                          |
| `previousPage`         | `string\|null`              | router.js                                                                               | router.js                                                                          |
| `previousParams`       | `Object`                    | router.js                                                                               | router.js                                                                          |
| `comfyRootPath`        | `string\|null`              | routes/comfy.js (backend)                                                               | (backend sync at init)                                                             |
| `allComfyWorkflows`    | `Array`                     | comfyController.js                                                                      | comfyController.js (populated at startup)                                          |
| `upscaleModels`        | `string[]`                  | MpiModelSettings (`_mountUpscaleDropdown`)                                              | assetService.js (`loadAll()` at runtime — backend sync)                            |
| `availableLoras`       | `string[]`                  | MpiModelSettings (`_mountLoraSlots`)                                                    | assetService.js (`loadAll()` at runtime — backend sync)                            |
| `s_selectedModelId`    | `string\|null`              | MpiGalleryBlock (derives `activeModel` on mount), MpiGroupHistoryBlock (derives `activeModel` on mount) | MpiGalleryBlock (on model-change event from promptBox), MpiGroupHistoryBlock (on model-change + on mount sync) |
| `g_abortControllers`   | `Object`                    | llmService.js (legacy)                                                                  | llmService.js (legacy)                                                             |
| `currentLoadedModel`   | `string\|null`              | llmService.js (legacy)                                                                  | llmService.js (legacy)                                                             |
| `downloadJobs[]`      | `DownloadJob[]`                        | MpiModelsModal, downloadService.js | downloadService.js |
| `downloadQueueActive`| `boolean`                              | (read by components polling state) | downloadService.js |
| `comfyNeedsRestart`  | `boolean`                              | comfyController.js (ensureServerRunning guard) | downloadService.js (set on `comfy:needs-restart` SSE event) |

