# Developer Backlog & What's Next

> **AI INSTRUCTION:** This file contains the active sprint and backlog.
> 🔴 **CRITICAL RULE:** Do NOT make assumptions about how to implement these items. If a bullet point lacks detailed technical context, you MUST stop and ask the user, "Can you explain in detail how we should approach [Task]?" before writing any code.

---

## ✅ HIGHEST PRIORITY: Replace ResumableDownloader with node-downloader-helper

> **Status:** ✅ **COMPLETE — RESUME NOW WORKS.** `node-downloader-helper` v2.1.11 is installed and fully integrated. The `ResumableDownloader` class was refactored to use the library's native events (`progress`, `end`, `error`, `pause`, `resume`) rather than wrapping promises. `resumeFromFile()` is used instead of the broken `resume()` method (which had a bug: called `start()` internally after pause, losing the Range header and truncating the file).

> **Library note:** `node-downloader-helper` is unmaintained (author notice on npm) but still functional. `resume()` has a confirmed bug — always use `resumeFromFile()` for resume.

### Implementation summary

**`ResumableDownloader` class (event-driven):**
- `_bindEvents()` — registers `progress`, `end`, `error` handlers on the `DownloaderHelper` instance once; events own completion/failure broadcasting
- `download()` — calls `_ensureDownloader()` then `_downloader.start()`; no try/catch
- `resume()` — calls `resumeFromFile()` with `getResumeState()`; no promise chain
- `_startPendingDeps()` — events handle all completion/error paths; no manual `.then()` / `.catch()`

**Bugs fixed during this session:**
- `resume()` was calling broken `downloader's.resume()` → fixed to use `resumeFromFile()`
- Completion (`download:complete` + `_checkModelJobsComplete()`) only called on error path → fixed: `end` event now handles it
- Unused code removed: `https`/`http` imports, `_readPartialMeta`/`_savePartialMeta` helpers, `partialPath` field, `_completed` flag

**UI improvements:**
- `MpiInstalledDisplay` now shows bytes downloaded: `"2.3GB / 6.9GB — 12.5 MB/s"`
- `MpiModelsModal` passes `downloadedBytes` and `totalBytes` from `downloadJob` to `MpiInstalledDisplay`

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

### New bugs found (2026-04-13)
- [] After installing the model, the new model is not available in the prompt box model selector drop-down. 
- [] When the user installs a new model and ComfyUi is not running in the background, running a generation Displays a popup warning that ComfyUi is restarting because new models have been installed. It should just show the starting engine pop-up. 
- [] Compound Component `../../js/components/Compounds/MpiGroupCard/MpiGroupCard.js` needs an heart toggleable icon on the top left for favorites Implementation. 
- [] The block component `../../js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` Needs buttons on the top left So the user can organize the gallery by oldest, newest, images, video, favourites and later on when audio is implemented, audio. 
- [x] **Progress bar denominator wrong:** Backend `modelJob.totalBytes` only sums MISSING deps, not ALL deps. Fix: pre-sum totalBytes from ALL deps, mark installed deps as `complete`.
- [x] **Uninstall button not rendered:** `MpiInstalledDisplay` has no Uninstall button branch — only Install, Pause/Resume/Cancel. Fix: add Uninstall button branch emitting `'uninstall'` event.
- [x] **No progress bar for partially installed models:** When deps are missing but no active download, no progress bar shows. Fix: enhance `/comfy/models/check` to return per-dep status; use for partial progress bar. `MpiModelsModal` computes partial progress for BOTH installed and uninstalled models; `hasPartialProgress` prop decouples progress-bar visibility from button logic.
- [x] **Uninstall not implemented:** Backend lacks `POST /comfy/models/uninstall` endpoint. Fix: add endpoint, wire from `downloadService.uninstall()`.
- [x] **Partial progress cache key bug:** Frontend payload to `/comfy/models/check` was missing the `id` (depId) field, causing `_modelDepStatusCache` to store all deps under `null` key — losing all but the last. Fix: include `id: depId` in the payload.
- [x] **No PARTIALLY INSTALLED badge:** Uninstalled models with some deps on disk had a progress bar but no badge. Fix: added `'PARTIALLY INSTALLED'` warning badge branch when `hasPartialProgress && !installed`.
- [x] **Installing label not animated:** "Installing..." label had no animated ellipsis. Fix: CSS `::after` pseudo-element drives cycling dots via `mpi-installing-dots` keyframes; JS now sets text to `'Installing'` (dots handled by CSS).

> **2026-04-13 session changes:**
> - `MpiInstalledDisplay.js` — PARTIALLY INSTALLED badge, "Installing" label text (CSS animates dots)
> - `MpiInstalledDisplay.css` — `@keyframes mpi-installing-dots` ellipsis animation
> - `types.js` — updated `MpiInstalledDisplayProps` JSDoc with missing props and `uninstall` event

> ⚠️ **Regressions introduced (2026-04-13):**
> - `MpiInstalledDisplay.js` — CRASH on mount: refactor accidentally removed `const actionsSlot = qs('#idactions-slot', el)`. **Fixed** by restoring the declaration before the action rendering code.

> **Plan:** `C:\Users\Fabio\.claude\plans\reactive-petting-token.md` — Use `superpowers:systematic-debugging` when executing.

### Files changed
- `routes/downloadManager.js` — event-driven `ResumableDownloader`, `resumeFromFile()` resume, SHA256 in `end` event
- `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js` — bytes display in progress label, `downloadedBytes`/`totalBytes` props
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` — passes `downloadedBytes`/`totalBytes` props
- `package.json` — `node-downloader-helper: ^2.1.11`

---

## ✅ PREVIOUSLY HIGHEST PRIORITY: Download Manager — Non-Blocking Implementation

> **Plan:** `docs/superpowers/plans/2026-04-12-download-manager.md`
>
> **Status (2026-04-12 session):** ✅ **COMPLETE.** All SHA256 hashes computed and populated in `dependencies.js`. Implementation ready for testing and integration.
>
> **Goal:** Replace the blocking `/comfy/models/download` with a non-blocking, progress-tracking download system supporting pause/resume/cancel, shared dependency ref-counting, SHA256 verification, and automatic ComfyUI restart when custom nodes are installed.
>
> **Key decisions (2026-04-12 session):**
> - `state.downloadJobs` stays in `state.js` for shutdown persistence, but progress writes are throttled to 5-sec intervals; real-time progress flows via Events bus only (no `state:changed` spam)
> - SSE reconnect calls `/comfy/downloads/status` to re-sync state after dropped events
> - Phase 6 dead code removal covers all 4 affected files: `MpiInstalledDisplay.js`, `MpiModelsModal.js`, `components.js`, `types.js`
> - SHA256 bootstrap: `scripts/computeDepHashes.py` — Python streaming hash script, writes nothing to disk, safe for 40GB+ files on space-constrained systems ✅ **COMPLETE**
> - `streamDownload` import removed from `routes/comfy.js` after old handler deletion
> - All HuggingFace deps now have real `sha256` hashes; git-based deps remain `sha256: null`

**Files created in this session:**
- `routes/downloadManager.js` — backend download manager with SSE, pause/resume/cancel, SHA256 verification
- `js/services/downloadService.js` — frontend singleton owning SSE connection and Events emission
- `scripts/computeDepHashes.py` — SHA256 bootstrap script (Python implementation, faster than JS) ✅ **COMPLETE**
- `scripts/addDepHashes.js` — ⚠️ staged for deletion (no longer needed)

**Files modified in this session:**
- `server.js` — registered downloadManager routes + SIGTERM/SIGINT shutdown
- `routes/comfy.js` — removed blocking `/comfy/models/download` handler; removed `streamDownload` import; added `/comfy/needs-restart` endpoint; `POST /comfy/start` now clears `comfyNeedsRestart` on user restart
- `routes/shared.js` — added `comfyNeedsRestart: false` to `processState`
- `js/state.js` — added `downloadJobs[]`, `downloadQueueActive`, `comfyNeedsRestart`
- `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js` — rewritten to handle download states; `MpiProgressBar` for active downloads; Pause/Cancel/Resume buttons driven by `downloadState`
- `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css` — added `.mpi-installed-display__progress-slot`, `__progress-label`, `__installing-label` + pulse animation
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` — `_installModel()` now calls `downloadService.start()`; `renderList()` passes `downloadState`, `progress`, `speed` props; wired `download:complete/failed/cancelled` event subscriptions
- `js/components/types.js` — updated `MpiInstalledDisplayProps`: removed `showDeleteModels`, `deleteModelsActive`, `deleteModels`; added `downloadState`, `progress`, `speed`, `canResume`
- `js/services/comfyController.js` — `ensureServerRunning()` now checks `state.comfyNeedsRestart` and auto-restarts ComfyUI before any generation
- `js/pages/components.js` — removed `showDeleteModels` and `deleteModels` from MpiInstalledDisplay gallery previews

---

## 📅 Active To-Dos

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
