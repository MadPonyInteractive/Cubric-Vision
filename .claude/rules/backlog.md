# Developer Backlog & What's Next

> **AI INSTRUCTION:** This file contains the active sprint and backlog.
> 🔴 **CRITICAL RULE:** Do NOT make assumptions about how to implement these items. If a bullet point lacks detailed technical context, you MUST stop and ask the user, "Can you explain in detail how we should approach [Task]?" before writing any code.
 
## 📅 Active To-Dos

### Verification steps remaining
- [X] **Step 1:** Start ComfyUI. Open MpiModelsModal. Start a large model download (SDXL base ~6.9GB). Observe progress bar fill with speed text.
- [X] **Step 2:** While downloading, install a second model that shares a dep — verify both progress bars fill independently.
- [X] **Step 3:** Pause a download — bar freezes, Resume button appears. Resume — continues from where it was.
- [X] **Step 4:** Cancel one of two concurrent downloads — other download continues uninterrupted.
- [X] **Step 5:** Close the modal, navigate away (e.g. to history), come back — download still in progress with correct bar position.
- [ ] **Step 6:** After download completes (custom nodes) — "Installing" label animates dots
- [ ] **Step 7:** Model with custom node deps → auto-restart ComfyUI before generation
- [ ] **Step 8:** Shared dep progress visible on Model B card even before Model B starts
- [ ] **Step 9:** No `showDeleteModels` / `deleteModels` references in codebase
- [ ] **Step 10:** Close app mid-download — partial files cleaned up on shutdown

**Media Import (Immediate Upload)**
- [ ] Modify media import flow: when a user adds an image/video from the filesystem, upload it to the ComfyUI backend immediately (do not wait for workflow execution).
- [ ] **Images:** Upload via `POST /upload/image` using a static filename for caching.
- [ ] **Videos:** Save directly to the project media folder; inject the absolute local path into the `VHS_LoadVideoPath` node via `"Input_Video"` title mapping.

**Video Workflows**
- [ ] Activate `interpolate` and `videoUpscale` handlers inside `groupHistory.js` (currently stubs).
- [ ] Add video support to the `groupHistory` workspace (swap out the canvas for a video player).
- [ ] Update `commandExecutor.js` and `comfyController.js` to listen for `nodeOutput.gifs` (VHS_VideoCombine output key) alongside `nodeOutput.images`.
- [ ] Populate `dependencies[]` in `UNIVERSAL_WORKFLOWS` for video operations once `.json` files are ready.

**Bug Reports**
- [ ] **Download Manager auto-show for missing deps:** When deps for the current model are missing (but some other models are installed, so zero-installed state doesn't trigger), the Download Manager doesn't appear. User must manually navigate to download it. Will be addressed by the Download Manager implementation above — the new system surfaces progress UI automatically when a model install is initiated.

---

## 📅 Other To-Dos (Low Priority)
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
