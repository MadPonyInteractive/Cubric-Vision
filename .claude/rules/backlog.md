# Developer Backlog & What's Next

> **AI INSTRUCTION:** This file contains the active sprint and backlog.
> 🔴 **CRITICAL RULE:** Do NOT make assumptions about how to implement these items. If a bullet point lacks detailed technical context, you MUST stop and ask the user, "Can you explain in detail how we should approach [Task]?" before writing any code.

---

## 🔴 HIGHEST PRIORITY: Download Manager — Non-Blocking Implementation

> **Plan:** `docs/superpowers/plans/2026-04-12-download-manager.md`
>
> **Tools** Use superpowers execute plan skill
>
> **Goal:** Replace the blocking `/comfy/models/download` with a non-blocking, progress-tracking download system supporting pause/resume/cancel, shared dependency ref-counting, SHA256 verification, and automatic ComfyUI restart when custom nodes are installed.
>
> **Key decisions (2026-04-12 session):**
> - `state.downloadJobs` stays in `state.js` for shutdown persistence, but progress writes are throttled to 5-sec intervals; real-time progress flows via Events bus only (no `state:changed` spam)
> - SSE reconnect calls `/comfy/downloads/status` to re-sync state after dropped events
> - Phase 6 dead code removal covers all 4 affected files: `MpiInstalledDisplay.js`, `MpiModelsModal.js`, `components.js`, `types.js`
> - SHA256 phase includes batch automation note for bulk deps
> - `streamDownload` import removed from `routes/comfy.js` after old handler deletion

---

## 🔴 HIGH PRIORITY: Architecture Refactor

> These two plans must be executed in order. Only one plan should be executed per session. If you do plan one, you should leave the testing for another session. If you are doing the testing, you should leave the following plan for another session. And so on.

### Plan 1 — Shell Global Layer + MpiGalleryBlock
**✅ COMPLETE** — Committed `ba1bca8`

Establishes the shell-level PromptBox singleton (via `PromptBoxService`), moves `MpiModelsModal` to a shell singleton, and replaces `gallery.js` with `MpiGalleryBlock` (a proper `ComponentFactory` Block). After this plan, the gallery works end-to-end with zero PromptBox/ModelsModal duplication.

### Plan 2 — GroupHistory Decomposition
**✅ COMPLETE** — Committed `3981dfb`

Decomposes `groupHistory.js` (1027 lines, 35+ state variables) into three focused components: `MpiHistoryList` (Compound), `MpiCanvasViewer` (Compound), and `MpiGroupHistoryBlock` (Block coordinator). Requires Plan 1 to be complete first.

**🔴 FIXED in this session** — Temporal Dead Zone (TDZ): `_canvasHasMask` declared with `let` on line 115 but first referenced in `_opOptions()` on line 112. Moved declaration to line 111.

---


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

## ✅ Completed: Zero-Installed State

> **Spec:** `docs/superpowers/specs/2026-04-11-zero-installed-state-design.md`
> **Plan:** `.claude/plans/quirky-orbiting-newell.md`

**Implementation approach changed during fix:** `MpiModelsModal` was promoted to a Block (not a Compound) to properly own its `MpiInstalledDisplay` card list internally — avoiding external `appendToContainer()` calls that broke the compound encapsulation pattern.

**Files changed:**
- `js/state.js` — added `s_installedModelIds: []`
- `js/data/modelRegistry.js` — `syncModelInstalled()` now emits `models:checked`; exported `reSyncInstalledModels()`; added `export { MODELS }` so the Block can import it
- `js/components/Compounds/MpiInstalledDisplay/` — added `image` prop, image slot, replaced raw DOM with `ce()`
- `js/components/Blocks/MpiModelsModal/` — **New Block** — self-contained overlay that renders model cards internally via `MpiInstalledDisplay`; owns Refresh + Install flow; delegates to `MpiOverlay`
- `js/components/Blocks/MpiInstallModelsList/` — **Deleted** — merged into `MpiModelsModal` Block
- `js/components/Compounds/MpiModelsModal/` — **Deleted** — superseded by Block version
- `js/workspaces/gallery/gallery.js` — mounts `MpiModelsModal` Block; subscribes to `state:changed` (show on zero) and `models:all-installed` (hide)
- `js/workspaces/groupHistory/groupHistory.js` — same as gallery.js
- `js/shell.js` — no longer mounts `MpiModelsModal` or `InstallModelsList`; event subscriptions drive `state.s_installedModelIds` only
- `js/shell/preloadStyles.js` — registered `MpiModelsModal.css`; removed stale `InstallModelsList.css`
- `js/components/types.js` — `MpiModelsModalProps` updated to Block; removed `InstallModelsListProps`
- `.claude/rules/component-mounts.md` — documented `MpiModelsModal` in gallery.js and groupHistory.js

---

## 🔴 High Priority: Model Manager Bugfixes

> **Plan:** `docs/superpowers/plans/2026-04-11-model-manager-bugfixes.md`
>
> Fix five bugs in MpiModelsModal:
> 1. **Installed models disappear** — `renderList()` filters to uninstalled only; needs split into Installed + Available sections
> 2. **Wrong badge/button** — "INSTALLED" badge always shown regardless of state; button always "Install"; needs `installed` prop on MpiInstalledDisplay
> 3. **404 on Install click** — `/comfy/model/download` searches wrong ID namespace; new `POST /comfy/models/download` route receives pre-resolved dep objects from frontend
> 4. **No size/VRAM shown** — `_vramText()` is a TODO stub; replace with `_computeModelStats()` using real DEPS data
> 5. **PromptBox not shown after modal close** — `models:closed` event not handled; add shell listener to re-show PromptBox
>
> **Execution:** Subagent-driven (Tasks 2+3 parallel, then 1, then 4, then 5)

### Status (2026-04-12)

**FIXED ✅:**
- Bug 1 — `renderList()` now splits into Installed + Available sections
- Bug 2 — Conditional badge: "INSTALLED" (green/success) vs "NOT INSTALLED" (red/danger); `installed` prop added to `MpiInstalledDisplay`
- Bug 4 — Size (`X.XGB`) and VRAM (`XGB VRAM`) now computed from `DEPS` data and shown on cards
- Bug 5 (modal side) — `models:closed` event now emitted when overlay is closed

**STILL BROKEN 🔴:**
- Bug 5 (shell side) — `models:closed` listener added to `shell.js` but PromptBox does not re-appear on modal close. PromptBox reappears after visiting history tab and returning — suggests workspace navigation resets PromptBox visibility.
  - **Fix applied:** Wrapped `PromptBoxService.show()` in `requestAnimationFrame()` to defer until overlay removal and stash restore settle. Awaiting user test.
  - All 5 bugs are now fixed (Bug 3 and t2i workflow filename mismatch resolved by user).

**Files changed (committed unstaged):**
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
- `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js`
- `js/components/types.js`
- `routes/comfy.js`
- `js/shell.js`
- `js/data/modelConstants/models.js` (workflow filename fix)

**Media Import (Immediate Upload)**
- [ ] Modify media import flow: when a user adds an image/video from the filesystem, upload it to the ComfyUI backend immediately (do not wait for workflow execution).
- [ ] **Images:** Upload via `POST /upload/image` using a static filename for caching.
- [ ] **Videos:** Save directly to the project media folder; inject the absolute local path into the `VHS_LoadVideoPath` node via `"Input_Video"` title mapping.

**Video Workflows**
- [ ] Activate `interpolate` and `videoUpscale` handlers inside `groupHistory.js` (currently stubs).
- [ ] Add video support to the `groupHistory` workspace (swap out the canvas for a video player).
- [ ] Update `commandExecutor.js` and `comfyController.js` to listen for `nodeOutput.gifs` (VHS_VideoCombine output key) alongside `nodeOutput.images`.
- [ ] Populate `dependencies[]` in `UNIVERSAL_WORKFLOWS` for video operations once `.json` files are ready.

**Bug Reports 🔴**
- [ ] **Download Manager auto-show for missing deps:** When deps for the current model are missing (but some other models are installed, so zero-installed state doesn't trigger), the Download Manager doesn't appear. User must manually navigate to download it. Will be addressed by the Download Manager implementation above — the new system surfaces progress UI automatically when a model install is initiated.
- [x] **Download Manager close requires double-click:** Root cause was `_isHiding` re-entrancy guard missing in MpiOverlay. First click set `_toolContainer = null`, second click early-returned with no visible effect. Fixed by adding `_isHiding` flag to `MpiOverlay.hide()` and `_isShowing`/`_isHiding` guards to `MpiModelsModal` show/hide wrappers. Files: `MpiOverlay.js`, `MpiModelsModal.js`.

---

## 📅 Other To-Dos (Low Priority)
- [X] **Model Sizes:** Calculate install size dynamically from each model's dependencies.
- [X] **VRAM Requirements:** Calculate VRAM footprint dynamically from each model's dependencies.
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
