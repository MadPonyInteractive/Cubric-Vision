# Developer Backlog & What's Next

> **AI INSTRUCTION:** This file contains the active sprint and backlog. 
> 🔴 **CRITICAL RULE:** Do NOT make assumptions about how to implement these items. If a bullet point lacks detailed technical context, you MUST stop and ask the user, "Can you explain in detail how we should approach [Task]?" before writing any code.

## 🚀 Active To-Dos (Highest Priority)

**State Architecture Overhaul (`js/state.js`, `js/data/projectModel.js`, `js/managers/projectManager.js`)**
- [ ] **Audit & strip legacy state:** `state.js` contains dead properties from a previous app version (e.g. `g_currentGuide`, `g_promptEN`, `g_wizardStep`, `g_images`, `g_imageContext`, tool-specific flat keys like `detailerInputImage`, `upscalerAutoGrid`, etc.). Confirm each is unused before removing. Ask user before deleting anything.
- [ ] **Design two-track settings state:**
  - **Model settings** (keyed by model id, persisted per-project): selected user LoRAs (up to 6 slots with strength values) + selected upscale model. Shape: `project.modelSettings[modelId] = { loras: [...], upscaleModel: '...' }`.
  - **Tool settings** (keyed by tool name, persisted per-project): for tools that are not model-based (e.g. Video Upscaler in history workspace). Shape: `project.toolSettings[toolName] = { upscaleModel: '...' }`.
- [ ] **Update `projectModel.js`:** Add `modelSettings` and `toolSettings` to the `Project` typedef and `createProject()` factory defaults.
- [ ] **Update `projectManager.js`:** Replace the current `toolComfySettings` save/restore logic with the new two-track structure. Ensure migration handles old `toolComfySettings` / `comfySettings` keys gracefully.
- [ ] **Update `state.js`:** Replace `defaultComfySettings` / `toolComfySettings` with clean equivalents that reflect the new structure. Remove confirmed legacy keys.

**Model Settings Overlay (new component)**
- [ ] Build a reusable overlay component that shows LoRA slots and upscale model selector for the currently active model. Context-aware: shows only upscale selector when invoked from a non-model tool (e.g. Video Upscaler). Selections are persisted into the two-track state above and injected into workflows at run time via `Lora_1`…`Lora_6` and `Upscale_Model` node titles.
- [ ] Add `defaultUpscale` field to each model entry in `js/data/modelConstants/models.js` so a sensible default is pre-selected when no user preference exists.
- [ ] Backend route: scan ComfyUI `loras/` and `upscale_models/` folders and return available filenames (for populating the overlay dropdowns at runtime).

---

## 📅 Other To-Dos (Medium Priority)

**Model UI & Installation State**
- [ ] Filter model dropdowns so only `installed === true` models are visible.
- [ ] **Zero-installed state:** If no models exist, hide the prompt box and display an install prompt.
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
