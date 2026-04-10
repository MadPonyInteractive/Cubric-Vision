# Developer Backlog & What's Next

> **AI INSTRUCTION:** This file contains the active sprint and backlog. 
> 🔴 **CRITICAL RULE:** Do NOT make assumptions about how to implement these items. If a bullet point lacks detailed technical context, you MUST stop and ask the user, "Can you explain in detail how we should approach [Task]?" before writing any code.

## 🚀 Active To-Dos (Highest Priority)

**Model UI & Installation State**
- [ ] Filter model dropdowns so only `installed === true` models are visible.
- [ ] **Zero-installed state:** If no models exist, hide the prompt box and display an install prompt.
- [ ] Add a visual badge to gallery cards if their associated model was uninstalled.
- [ ] Build Model Installer UI (browse, download, progress bar).
- [ ] Build a route/UI for Model uninstallation and Garbage Collection (GC).

**Media Import (Immediate Upload)**
- [ ] Modify media import flow: When a user adds an image/video to a project from the filesystem, upload it to the ComfyUI backend *immediately* (do not wait for a workflow execution).
- [ ] **Images:** Upload via `POST /upload/image` and use a static filename for caching.
- [ ] **Videos:** Save directly to the project media folder; inject the absolute local path into the `VHS_LoadVideoPath` node (via `"Input_Video"` title mapping). No manual upload needed, just direct path injection.

**Video Workflows**
- [ ] Activate `interpolate` and `videoUpscale` handlers inside `groupHistory.js` (currently stubs).
- [ ] Add video support to the `groupHistory` workspace (swap out the canvas for a video player).
- [ ] Update `commandExecutor.js` and `comfyController.js` to listen for `nodeOutput.gifs` (the VHS_VideoCombine output key) alongside `nodeOutput.images`.
- [ ] Populate `dependencies[]` in `UNIVERSAL_WORKFLOWS` for video operations once the `.json` files are ready.

---

## 📅 Other To-Dos (Low/Medium Priority)
- [ ] **Model Sizes:** Calculate the install size on disk dynamically based on each model's dependencies (`js/data/modelConstants/models.js`).
- [ ] **VRAM Requirements:** Calculate VRAM footprints dynamically by pulling the highest VRAM value from all of a model's dependencies.
- [ ] **Event Bus Cleanup:** `groupHistory.js` currently imports `StatusBar` directly. Refactor this to use the event bus once the `tool:running`/`tool:idle` subscription architecture is finalized.
- [ ] **State Sweep:** Clean up legacy flat properties inside `state.js` once confirmed they are wholly unused.
- [ ] **Router Cleanup:** Remove `PAGE_WORKSPACE` alias from `router.js` when confirmed unused.
- [ ] **Component Gallery:** Add `MpiSelectionBar` to the Dev Components Gallery (`js/pages/components.js`).

---

## 🔮 Things to Consider for the Future
*(Add future architectural thoughts, planned features, and structural refactors here)*
- Integrate ComfyUI `seed.js` utility generator into workflows.

**LLM Tool Integration (`routes/llm.js` & `js/services/llmService.js`)**
- [ ] Wire up frontend tools that require Local LLM inference.
- [ ] Connect `llmService.js` to the Event Bus (replace legacy `showError` TODOs with `Events.emit('ui:error', ...)`).
- [ ] Manage the installation and UI loading states for LLM models (llama-server booting, VRAM allocation failures).

**Model Capabilities & Workflows**
- [ ] **Capability Unlocking:** Consider allowing users to select model capabilities based on filesize limits (e.g., Wan t2v vs i2v, unlock only selected operations to save disk space).
- [ ] **Upscale Refactor:** Consider refactoring upscale models to work similarly to LoRAs (selected and injected dynamically at runtime).
- [ ] **Workflow Chaining:** Consider a feature that chains multiple operations in sequence with different settings (e.g., `i2v` -> `video_upscale` -> `video_interpolate` -> `crop video`).
