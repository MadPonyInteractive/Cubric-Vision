# Developer Backlog & What's Next

> **AI INSTRUCTION:** This file contains the active sprint and backlog.
> 🔴 **CRITICAL RULE:** Do NOT make assumptions about how to implement these items. If a bullet point lacks detailed technical context, you MUST stop and ask the user, "Can you explain in detail how we should approach [Task]?" before writing any code.


## ✅ Completed: MpiPromptBox Internal Model Swap

> **Plan:** `docs/superpowers/plans/2026-04-11-mpi-prompt-box-internal-model-swap.md`
>
> All tasks complete. `el.setModel(model)` and `el.setModelList(list)` added to Block. Workspaces use setModel() sync — no remount. `activeModel` local variables replaced by `activeModelId` strings derived from `state.s_selectedModelId`. `injectionParams` now flows from PromptBox controls → `run` event → `runCommand()` → `_buildParams()` → ComfyUI workflow.

---

## ✅ Completed: PromptBoxControls — Control Injection Architecture

> **New infrastructure.** `js/components/Blocks/MpiPromptBox/PromptBoxControls.js` is the control registry. Each entry maps a control ID to a component + `nodeTitle` (ComfyUI injection target) + `getInjectionParams()`. Controls are mounted dynamically into `#bottom-bottom-slot` when operation changes, driven by the `components[]` array in `commandRegistry.js`. Only `ratio` is wired currently (MpiRatioSelector → Width/Height injection). The architecture supports multiple controls per operation.

---

## ✅ Completed: MpiPromptBox Block + State Architecture

> **Plan:** `docs/superpowers/plans/2026-04-11-mpi-prompt-box-block.md`
>
> All tasks complete. `s_selectedModelId` is the canonical model ID. `MpiPromptBox` is a Block. Old Compound deleted.

---

## ✅ Fixed: MpiPromptBox — model dropdown and operation dropdown not visible

**Root cause:** Two issues found and fixed:
1. **Mount target isolation bug:** `MpiButton.mount(el.querySelector('#bottom-center-slot'), ...)` for the negative toggle replaced the entire innerHTML of `#bottom-center-slot`, destroying the `#op-dropdown-slot` div inside it. Fixed by adding a dedicated `#bottom-neg-slot` for the negative toggle.
2. **Filter condition:** Changed `availableOps.length <= 1` to `=== 0` (show dropdown with 1+ ops) and `modelList.length > 1` to `>= 1` (show dropdown with 1+ models).

**Files changed:** `MpiPromptBox.js`, `MpiPromptBox.css`

---

## ✅ Fixed: GroupHistory — operations dropdown not showing correct operations

**Symptoms:** In groupHistory workspace, `t2i` appeared in the dropdown when it shouldn't (groupHistory always has an input image). `upscale` was grayed out when it should be available. Operations requiring a mask (`detail`) remained disabled even after applying a mask.

**Root cause:** Three issues found and fixed:
1. **`imageCount` not passed to MpiPromptBox context**: `_baseCtx` (`imageCount: 1, videoCount: 0`) was not spread into `updateContext`, so `upscale` appeared disabled (default `imageCount = 0`).
2. **`hasMask` not passed to MpiPromptBox context**: When `_hasMask` changed, the new value wasn't passed to `_context`, so `detail` remained disabled after applying mask.
3. **`t2i` appearing in dropdown**: MpiPromptBox showed ALL available operations without filtering. Added `filterNoInputOps` context flag to exclude ops with `requiresImages === 0 && requiresVideo === 0`.

**Fixes:**
- `updateContext` in MpiPromptBox now merges context (`_context = { ..._context, ...ctx }`) instead of replacing
- Added `filterNoInputOps` context flag: when true, filters out operations that don't require images/video
- groupHistory spreads `_baseCtx` in all `updateContext` calls: `{ ..._baseCtx, hasMask, filterNoInputOps: true }`

**Files changed:** `MpiPromptBox.js`, `groupHistory.js`

---

## 📅 To-Dos (Medium Priority)

**Model UI & Installation State**
- [ ] Zero-installed state: Show `MpiModelsModal` overlay (using `MpiInstalledDisplay` inside it) when no models are installed — displays installed models, available models, disk space specs, and install options. **Do this after the MpiPromptBox Block is done** (the Block is needed for clean zero-installed state handling).
- [ ] Add a visual badge to gallery cards if their associated model was uninstalled.
- [ ] Build Model Installer UI (browse, download, progress bar).
- [ ] Build a route/UI for Model uninstallation and Garbage Collection (GC).

**Media Import (Immediate Upload)**
- [ ] Modify media import flow: when a user adds an image/video from the filesystem, upload it to the ComfyUI backend immediately (do not wait for workflow execution).
- [ ] **Images:** Upload via `POST /upload/image` using a static filename for caching.
- [ ] **Videos:** Save directly to the project media folder; inject the absolute local path into the `VHS_LoadVideoPath` node via `"Input_Video"` title mapping.

**Video Workflows**
- [ ] Activate `interpolate` and `videoUpscale` handlers inside `groupHistory.js` (currently stubs).
- [ ] Add video support to the `groupHistory` workspace (swap out the canvas for a video player).
- [ ] Update `commandExecutor.js` and `comfyController.js` to listen for `nodeOutput.gifs` (VHS_VideoCombine output key) alongside `nodeOutput.images`.
- [ ] Populate `dependencies[]` in `UNIVERSAL_WORKFLOWS` for video operations once `.json` files are ready.

---

## 📅 Other To-Dos (Low Priority)
- [ ] **Model Sizes:** Calculate install size dynamically from each model's dependencies.
- [ ] **VRAM Requirements:** Calculate VRAM footprint dynamically from each model's dependencies.
- [ ] **Event Bus Cleanup:** `groupHistory.js` imports `StatusBar` directly — refactor to use the event bus once `tool:running`/`tool:idle` subscription architecture is finalized.
- [ ] **Event Bus Cleanup:** `openProject()` in `projectManager.js` dispatches `project:changed` via `document.dispatchEvent(new CustomEvent(...))` instead of `Events.emit()`. Pre-existing bug — any subscriber using `Events.on('project:changed', ...)` will not receive it.
- [ ] **Router Cleanup:** Remove `PAGE_WORKSPACE` alias from `router.js` when confirmed unused.
- [ ] **Component Gallery:** Add `MpiSelectionBar` to the Dev Components Gallery (`js/pages/components.js`).

---

## 🔮 Things to Consider for the Future

- Integrate ComfyUI `seed.js` utility generator into workflows.

**LLM Tool Integration (`routes/llm.js` & `js/services/llmService.js`)**
- [ ] Wire up frontend tools that require Local LLM inference.
- [ ] Connect `llmService.js` to the Event Bus (replace legacy `showError` TODOs with `Events.emit('ui:error', ...)`).
- [ ] Manage installation and UI loading states for LLM models (llama-server booting, VRAM allocation failures).

**Model Capabilities & Workflows**
- [ ] **Capability Unlocking:** Allow users to select model capabilities based on filesize limits (e.g. Wan t2v vs i2v).
- [ ] **Workflow Chaining:** Chain multiple operations in sequence with different settings (e.g. `i2v` → `video_upscale` → `video_interpolate` → `crop video`).
