# MPI-256 research — Agent A: Model Library wiring (App Library clone target)

## Q1. Component + mount
- `MpiModelManager` (js/components/Compounds/LandingPages/MpiModelManager/, 1244 lines, `.mpi-model-library`). Lazy singleton: `shell.js:346-350` `Events.on('models:open', ...)` → mount once into detached div → `el.open()` each time. Self-hosts `MpiOverlay {closable:true, mountTarget:'body'}` (MpiModelManager.js:101-103) → `overlay.el.appendToContainer(el)`; show via `Overlays.request()`.

## Q2. Open/close + zero-model
- Emitters of `models:open`: Landing hero nav "Models" (projectUI.js:76), dev components gallery (components.js:920). **component-mounts.md:194 documents a PromptBox download button emitting models:open that does NOT exist in code — stale doc.**
- Close: overlay X → hide → 'close' → `_closeDetail()` (:107); Escape via closeTopOverlay; `ui:close-all-popups` (unless reason overlay-open); `el.close()` :1227.
- **workspaces.md:14 zero-model auto-open is STALE**: MpiGalleryBlock.js:1547-1565 removed auto-emit (re-open flicker loop); now zero-model+no-media → one-shot MpiOkCancel "Go to Projects" → navigate(PAGE_LANDING).

## Q3. Grid + tiles + installed state
- `renderList()` :1073-1121; sections Installed/Available (`_section` :1061), Image/Video sub-grids (`_mediaBlock` :1043), featured-first sort :1047. Grid CSS `.mpi-model-library__sheet` repeat(auto-fill, minmax(220px,1fr)) (css:209-214).
- `_buildTile(model)` :694-758: button.mpi-tile → __thumb (4/5 img | 16/9 hover-video, src `comfy_workflows/display/${...}`), justInstalled heat dot, featured sparkle, __name, __meta, media badge, fixed-22px `__state` via `_tileState(st)` :663-686 (Installed chip | progress bar % | Verifying sweep | partial | Install chip).
- State: `state.s_installedModelIds` (state.js:69) ← shell.js:1287 subscribes `models:checked` ← `syncModelInstalled()/reSyncInstalledModels()` (modelRegistry.js:175, patches MODELS[].installed :149, fills `_modelDepStatusCache` :29 → `getModelDepStatus`). Also s_modelOpDraftByModel/:46, s_modelArchDraftByModel/:52 (localStorage-mirrored), state.downloadJobs (downloadService + SSE).

## Q4. Detail slide-over (the pattern to clone)
- NOT a separate component: inline `<aside class="mpi-detail" id="detail-panel">` + scrim in template (:73-80). Tile click → `openDetail(model)` :854-981. CSS translateX(100%) ↔ `.is-open` (css:421-437); `_closeDetail()` :983-994; Escape-detail-first chain.
- Shows: thumb (fullscreen-on-click video), title/meta, description, op toggles (`_buildToggleRow` :766), arch toggles (`_buildArchRow` :811), VRAM trade table (`_tradeTableHtml` :216), disk size, dynamic footer MpiButtons.
- Footer button state machine (:950-977): anyInstalled → Update/Uninstall (draft diff → `_applyUpdate`; else `_confirmWholeUninstall`); isBusy → Pause/Resume/Cancel; else Install → `_install(model)` :454-467 → `_draftDepIds` → **`downloadService.start(model.id, dependencies)` (downloadService.js:46)** → emits `download:started` sync.
- Live updates: `download:started/paused/resumed/installing` → `_patchTile(modelId)` (:1176, patches tile + rebuilds detail footer); `download:progress` → `_patchTile(id, {rebuildDetail:false})`; `download:complete` → `awaitReSync()` → `renderList()` (sig-guarded); `state:changed(s_installedModelIds)` → renderList (:1124).

## Q5. Reuse vs rewrite for App Library
REUSE VERBATIM: MpiOverlay body-mode; shell lazy-singleton `apps:open` handler (same shape); detail slide-over CSS+logic; grid CSS; tile CSS skeleton; `_mkTag` filter tags; `_lastSig`/`_listSignature` flash-free re-render guard; `_patchTile` in-place hot-update pattern; section/media-head CSS; MpiOkCancel; MpiButton.
REWRITE: data source (MODELS/DEPS → apps registry); card content fields; install state machine (`_modelState`/`_tileState` internals — but app avail = required MODELS installed, so can DERIVE from existing model state!); ops/arch toggles (apps have none); VRAM table; engine-split dep resolution; event name `apps:open`; counts line; installed/available split logic.

## Q6. Gotchas (App Library must honor)
1. Toast-stack stash exemption (MPI-215, MpiOverlay.js:121-122) — any new body.appendChild element may need exempting (MpiOverlay.js:113).
2. **NEVER renderList() on hot download events** (MPI-235) — `_patchTile` only for started/progress.
3. `download:complete` lingers in state.downloadJobs — busy whitelist `['downloading','paused','installing','queued']`, never `!== 'idle'` (MPI-99/102).
4. Render sig MUST include filter/search axes (`##media:##size:##q:`).
5. Featured flag static, excluded from sig.
6. MpiOkCancel `checkbox` prop pattern for uninstall (checkboxChecked in 'ok' payload).
7. Overlay X z-35 vs detail panel z-40 — detail's X owns the corner when drawer open (intentional).
8. Body overlay blocks hotkeys w/ overlay-depth `when()` guards (hotkeyRegistry.js:230).

## Risks
- Tile listeners pushed to `_unsubs` are only drained at component destroy — full renderList rebuilds leak listeners over high churn; App Library w/ component-backed cards needs a destroy loop.
- `_patchTile` on filtered-out tile silently updates detached DOM (stale until next renderList) — safe but know it.
- Preview media path `comfy_workflows/display/` — apps need own asset path.
- Body-mode covers status bar — FINE for App Library (picker, same as Model Library); NOT fine for the App overlay (see D findings).
