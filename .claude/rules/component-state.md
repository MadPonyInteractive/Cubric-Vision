# Component State Map

> **AI INSTRUCTION:** This file is machine-generated. Use it when you need to know which state keys a component reads or writes.

## Sub-Agent Briefing
> Use this file when you need to know which state keys a component reads or writes.

---

All keys below live in `js/state.js` as a reactive Proxy. Writing any key automatically fires `state:changed`. Never manually emit `state:changed`.

| state key              | type                        | readers                                                                                 | writers                                                                            |
|------------------------|-----------------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `currentProject`       | `Object\|null`              | gallery.js, groupHistory.js, MpiModelSettings, MpiRadialMenu (via `updateProject`)      | gallery.js (`state.currentProject = addGroupToProject(...)` etc.), groupHistory.js, MpiModelSettings (`state.currentProject = setModelSettings(...)`) |
| `currentPage`          | `'landing'\|'gallery'\|'groupHistory'` | router.js (read at routing time)                                               | router.js (`navigate()` writes this)                                               |
| `currentParams`        | `Object`                    | router.js                                                                               | router.js                                                                          |
| `previousPage`         | `string\|null`              | router.js                                                                               | router.js                                                                          |
| `previousParams`       | `Object`                    | router.js                                                                               | router.js                                                                          |
| `comfyRootPath`        | `string\|null`              | routes/comfy.js (backend)                                                               | (backend sync at init)                                                             |
| `allComfyWorkflows`    | `Array`                     | comfyController.js                                                                      | comfyController.js (populated at startup)                                          |
| `upscaleModels`        | `string[]`                  | MpiModelSettings (`_mountUpscaleDropdown`)                                              | assetService.js (`loadAll()` at runtime — backend sync)                            |
| `availableLoras`       | `string[]`                  | MpiModelSettings (`_mountLoraSlots`)                                                    | assetService.js (`loadAll()` at runtime — backend sync)                            |
| `s_selectedModelId`    | `string\|null`              | gallery.js (derives `activeModel` on mount), groupHistory.js (derives `activeModel` on mount), groupHistory.js `_onStateModelChange` handler | gallery.js (on model-change event from promptBox), groupHistory.js (on model-change + on mount sync) |
| `g_abortControllers`   | `Object`                    | llmService.js (legacy)                                                                  | llmService.js (legacy)                                                             |
| `currentLoadedModel`   | `string\|null`              | llmService.js (legacy)                                                                  | llmService.js (legacy)                                                             |

