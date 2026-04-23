# Master Dispatch Plan

**Goal:** Execute all active tracker items and architecture plans in correct order, one session at a time, with no file conflicts between sessions.

**Constraints:**
- Video branch must merge before Plan B (both touch `MpiGroupHistoryBlock.js`)
- localStorage centralization (jolly-whistling-forest) must run before Plan A (Plan A uses localStorage)
- NIM-11 children are safe anytime on master — no conflicts

**Redundant items (skip):** NIM-10 (done), NIM-11 (done), NIM-12 (done), `dec_mo7c7j69ir6nhh` (implemented), master versioning doc (reference only)

---

## Phase 1 — Video Branch (`feature/video-history-support`)

- [x] **SESSION 1** — Finish video history block support
  - Tracker: `tsk_mo9gwfh86znp6r`
  - Plan: `nimbalyst-local/plans/handoff-video-history-session-3.md`
  - Scope: Step 9 (wire video ops Run button for upscale + interpolate), Step 10 (docs pass)
  - Files: `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`, `js/components/Compounds/MpiVideoViewer/`, `js/events.js`

- [x] **SESSION 2** — Video op param UI
  - Trackers: NIM-6 ✅ in-review, NIM-4 ⏸ deferred (no video diffusion ops yet)
  - Scope: MpiBatchSelector→MpiNumberSelector refactor; upscale factor + model selectors; interpolate multiplier selector; injectionParams wired through _runVideoTool
  - Files: `js/components/Compounds/MpiNumberSelector/`, `js/components/Blocks/MpiPromptBox/PromptBoxControls.js`, `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`, `.claude/rules/comfy_injection.md`

- [x] **SESSION 3** — ffmpeg packaging + merge prep
  - Tracker: NIM-9
  - Scope: Package ffmpeg as extraResources in electron-builder config, verify binary path resolution on all platforms
  - Files: `electron-builder.yml` or equivalent, `services/ffmpegBinary.js`
  - **→ MERGE ****`feature/video-history-support`**** to master after this session**

---

## Phase 2 — Infra & Architecture (master)

- [x] **SESSION 4** — localStorage centralization
  - Plan: `nimbalyst-local/plans/jolly-whistling-forest.md`
  - Scope: Create `js/core/storageKeys.js` + `js/core/storage.js`, migrate 9 hardcoded keys across 8 files
  - Files: `js/core/storageKeys.js` (new), `js/core/storage.js` (new), 8 consumer files
  - **Unblocks Plan A**

- [x] **SESSION 5** — App versioning layer (Plan A)
  - Plan: `docs/plans/2026-04-16-plan-a-app-versioning.md`
  - Scope: `appVersion.js`, `operationRegistry.js` (13 operations), `versioningManager.js`, update `routes/engine.js`
  - Files: `js/core/appVersion.js` (new), `js/core/operationRegistry.js` (new), `js/managers/versioningManager.js` (new), `routes/engine.js`

- [x] **SESSION 6** — Engine provisioning (Plan D)
  - Plan: `docs/plans/2026-04-16-plan-d-engine-provisioning.md`
  - Scope: Engine version check route, SSE progress, `MpiEngineInstall` component, boot-time check in shell.js
  - Files: `routes/engine.js`, `js/components/Compounds/MpiEngineInstall/` (new), `js/shell.js`

- [x] **SESSION 7** — Project service event queue
  - Plan: `docs/plans/2026-04-21-project-service-event-queue.md`
  - Scope: Canonical events in `events.js`, queue + debounce in `projectService.js`, migrate `PromptBoxControls.js` + `MpiModelSettings.js` + `MpiPromptBox.js`
  - Files: `js/events.js`, `js/services/projectService.js`, `js/components/Compounds/MpiPromptBox/PromptBoxControls.js`, `js/components/Compounds/MpiModelSettings/MpiModelSettings.js`

- [x] **SESSION 8** — Project integrity / UUID meta (Plan B) ⚠️ riskiest
  - Plan: `docs/plans/2026-04-16-plan-b-project-integrity.md`
  - Scope: UUID `.meta/` sidecars as SSOT, history as ID arrays, migration system, reconciler
  - Files: `js/models/projectModel.js`, `js/managers/projectManager.js`, `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`, `js/migrations/projectMigrations.js` (new), `js/managers/projectReconciler.js` (new), `routes/save-generation.js`, `routes/project.js`
  - **Requires video branch merged (same history block file)**

---

## Phase 3 — Polish & Code Quality (master)

- [x] **SESSION 9** — Status bar badge + generation timing
  - Plan: `nimbalyst-local/plans/implement-tracker-item-gleaming-meteor.md`
  - Scope: Blue badge variant on status bar, "Loading model…" → "Generating…" label, timing to sidecar
  - Files: 5 files per plan

- [x] **SESSION 10** — NIM-13 + NIM-14 + NIM-15 (component rule enforcement batch 1)
  - Trackers: NIM-13, NIM-14, NIM-15
  - Scope: Migrate `console.*` → `clientLogger`, `querySelector` → `qs/qsa`, `window keydown` → `Hotkeys.register`
  - Files: All components flagged in NIM-11 audit (`nimbalyst-local/plans/implement-tracker-item-nim-11-ethereal-dream.md`)

- [x] **SESSION 11** — NIM-16 + NIM-17 + NIM-18 (component rule enforcement batch 2)
  - Trackers: NIM-16, NIM-17, NIM-18
  - Scope: Remove hardcoded `'#000'` in `MpiCanvas.js:332`, extract SVGs in `MpiRadialMenu` → `icons.js`, register `MpiGalleryDropOverlay` in `preloadStyles.js` + `types.js`
  - Files: `js/components/Compounds/MpiCanvas/MpiCanvas.js`, `js/utils/icons.js`, `js/components/Compounds/MpiRadialMenu/MpiRadialMenu.js`, `js/shell/preloadStyles.js`, `js/components/types.js`

- [x] **SESSION 12** — Primitive drift cleanup
  - Tracker: NIM-2
  - Scope: Identify and replace sliders/buttons bypassing primitives, route through `ComponentFactory.create()`
  - Files: Components using raw `<input type="range">` or `<button>` instead of primitives

- [x] **SESSION 13** — Small features batch
  - Trackers: `feat_mo9477jgtiqxnj` (Hotkey F focus mode), `feat_mo90qos2dlq3x7` (system notification on generation finish)
  - Scope: Register F hotkey, hide non-essential UI per page; Electron notification API on generation complete
  - Files: `js/shell.js` or hotkey registration point, `routes/save-generation.js` or generation completion hook

---

## Deprioritized (no session assigned)

- NIM-8 — Video masking (future capability)
- NIM-3 — Trim tool + timeline thumbnails (future polish)
- `feat_mo9gv6aje8qpn0` — Photoshop raw options (large scope, no plan)
- `bug_mo9je5hqwae0f8` — Unreplicable empty history bug (reassess after Plan B — reconciler may fix)
- `id_mo2uty5w4vqpox` — Additive model folders in settings (idea stage)
- `parallel-pondering-book` — Gallery grid refactor (assess after Plan B settles history block)
