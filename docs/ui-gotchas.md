# UI & Component Gotchas

Hard-won facts about UI components, gallery behaviour, and model-manager wiring in Cubric Vision.
Verify a named file/function/flag still exists before relying on an entry.

---

## Status bar

### status-bar progress — WS events are useless, ComfyUI stdout is the truth (MPI-147)

The status-bar progress bar is driven by **parsing ComfyUI's stdout**, NOT the WS `progress`/`progress_state` events. Why: ComfyUI 0.26's WS reports the SLOW phases (model-init, VAE decode) as binary `0/1` nodes, and LTX samplers are tiny (3-7 steps, done in seconds) — so a WS-weighted bar froze at 0%, snapped to a wrong %, or hung at 90%. The rich signal (tqdm `N/M [elapsed<eta]` per step + `Model Initializing` markers) exists ONLY on stdout. Flow: `routes/comfy.js _handleComfyOutput` parses tqdm → broadcasts `comfy:step-progress` (and `comfy:tile-progress` for `USDU:` bars, `comfy:segment-total` for detailer `# of Detected SEGS:`) over the `/comfy/events/stream` SSE → `commandExecutor.js` SSE listeners → `phaseProgress.js` (createStageProgress) → `tool:stage` + `tool:progress` → statusBar.

Model: the bar runs **0-100% PER tqdm bar** and the status bar shows `Stage N/M` so each reset reads as "next stage", not a bug. `M` (bar count) is RECORDED per workflow+run-mode in `js/data/progressStages.js` (can't be derived from JSON; same file = different count single/preview/stage2). Self-declaring nodes need no entry: UltimateSDUpscale (`USDU: t/T` = tiles), detailer (`SEGS: N` = areas). ImageUpscaleWithModel (ESRGAN) emits NO signal → indeterminate pulse (`shell-info__fill--indeterminate`). Which kinds open the SSE: `STEP_EMITTING_KINDS` in commandExecutor + `buildWeightMap` kinds in progressAggregator. Timer/card/toast all anchor at `prompt_ack` (`tool:accepted`) so they match + exclude ComfyUI cold-start boot. REMOTE (MPI-147, wrapper ≥0.2.19): the Pod wrapper now ALSO parses ComfyUI stdout — `wrapper.py` spawns ComfyUI with `stdout=PIPE` (stderr merged) and a reader task drains it as raw CHUNKS (not `readline` — tqdm `\r`-redraws a live bar with no `\n` until done, so readline would collapse per-step progress into one final event) and broadcasts the SAME `comfy:step/tile/segment` SSE events the local engine does (`_parse_comfy_line` is a direct port of `_handleComfyOutput`). `remoteProxyForward.js` (MPI-175 split; was remoteProxy.js) relays `/wrapper/events/stream` → `/comfy/events/stream` unchanged, so the app's listeners are identical local vs remote — no app change. Verified live on an A4500 Pod: LTX t2v showed Stage 1→2→3 with per-step fill, same as local. (The old WS-aggregator fallback still kicks in only if a Pod runs a pre-0.2.19 wrapper that emits no step events.)

### stop/cancel + two lanes — every shared singleton needs per-gen identity (MPI-195/203)

The recurring hazard around **Stop** and **cloud+local concurrency (MPI-74 P6)**: several pieces of app state are singletons that assume ONE generation at a time, but two things break that assumption — (a) ComfyUI `/interrupt` is **advisory**, so a Stopped gen can still finish with real output and emit a LATE terminal; (b) two lanes (`_lanes.remote`, `_lanes.local`) run concurrently, so two gens emit lifecycle events into the same singleton. A late/foreign event corrupting shared state was the root of five bugs in one saga. The fix pattern is always the same: **tag the event with the gen's id and guard the consumer on identity.**

- **Gallery card / group-history viewer** (`MpiGalleryBlock`, `MpiGroupHistoryBlock`): Stop deletes the id from `_myGenIds` synchronously; a gen that finishes anyway then had its `generation:complete` dropped and the saved card never rendered (silent loss — `addGroup` persisted it but the grid never rebuilt). Fix: `_stoppedPendingComplete` bridge set — record ids Stopped-but-maybe-finishing, re-admit their late complete, prune on error/empty-cancel.
- **Missed terminal WS** (`comfyController._reconcileFromHistory`): remote terminal events are `broadcast=False` + not replayed; when reaped, the reconcile resolved the `runWorkflow` promise but **nobody consumes that value** → gen wedged (card RUNNING forever, output stranded in `/history`). Fix: reconcile REPLAYS synthetic `executed` + `execution_success` through the prompt's own listener so the normal completion path drives (card + bar + lane). commandExecutor dedups replayed nodes via `_executedSeenNodes`.
- **Cue lane** (`generationService._dispatchNextCue` wrapper): a Stopped job's late settle called `finishCueDispatch` and freed the lane a SECOND time — after the stop already promoted the next job — wiping the successor's active slot (queue 0 JOBS, successor unstoppable). Fix: identity guard — free the lane only if `_lanes[lane].active === next`.
- **Status bar** (`statusBar.js`): a global singleton keyed only on `tool === 'groupHistory'`, no gen identity. A late terminal from a Stopped gen reset the bar off a running successor; and with two lanes, one lane's events stomped the other (a LOCAL gen ran with an idle bar). Fix: every DRIVING `tool:*` event carries `id` (from `exec.genId` / `_regId`) and `_latch(id)`s the bar (last-active-wins); a terminal clears the bar ONLY if it still owns `_activeGenId`; a surviving lane's next event re-latches (fallback). Untagged null id = legacy explicit cancel, honored unconditionally.
  - **MPI-208 Phase 4 — the bar now DERIVES ownership + idleness from `generationStore`, not the tool-event race.** The `tool:*` listeners still paint visual DETAIL (label, %, stage), but a `generation-store:changed` subscription answers the two questions the race got wrong: (a) **survivor re-latch** — when the bar's owner leaves `running` but another lane is still live, re-derive the display job from the store's `running` set and re-latch (fixes "empty bar while a gen runs"); (b) **self-heal to idle** — store has no running job → force idle, gated on `_activeGenId !== null` so a normal completion flash isn't stomped (fixes stuck-bar / missed-terminal). The store job's `genId` === the `tool:*` `id` (wired via `startGeneration → payload.genId → store.register`), so the snapshot correlates to `_activeGenId`. The `job.genId !== null` re-latch guard is LOAD-BEARING — it excludes suppressed tool-panel previews (MpiToolOptionsResize `runCommand`, no genId, no `tool:*` events) from flashing "Starting". `_stageText` cleared on display-job change fixes the stale "4/4" suffix bleeding onto a later non-upscale gen.

- **Dead STOP on an orphaned card** (`generationService.cancelRunningCueJob`, MPI-245): the Cue panel renders its RUNNING row from `_lanes[lane].active` (`getGenerationQueueSnapshot`), but STOP resolves the job through the `activeGenerations` **registry**. When a gen dies early (ComfyUI rejects the prompt), `exec.onError` → `activeGenerations.end()` **deletes the registry entry** while the lane intent survives → the panel still shows a live STOP whose lookup finds nothing and hard-returns `false`. Silent no-op, card stuck forever, pending job never promotes. No race, no timing window — just two surfaces disagreeing about whether the job exists. Fix: when the registry has no entry, fall back to draining the orphaned lane (`_onLaneDrain`).

Rule of thumb when adding ANY new per-gen UI/state: if two gens (or a Stopped gen's late echo) can touch it, tag the signal with the gen id and reject foreign ids — don't key on `tool` alone. And if a control is *rendered* from one source of truth, it must *act* on that same source — a button drawn from `_lanes` but wired to `activeGenerations` is a dead button waiting to happen.

---

## Components

### hero-stats "MODELS X / Y" counts USABLE models, not fully-installed (Notes 2026-06-29)

The bottom-left landing hero stat counts a model as installed when its **base OR at least one operation** is on disk — NOT only when ALL ops are present. Bug found: Wan 2.2 with only **text-to-video** installed (i2v absent) showed "MODELS 2 / 7" while the model-manager list + pickers already showed Wan as installed → the count and the list disagreed. Fix (`js/data/modelRegistry.js`, `syncModelInstalled`): `installedModelIds` now filters on `isModelUsable(id)` (which for op-keyed models is `deriveInstalledOps(...).fullyInstalled` = `installedOps.length > 0`, i.e. ≥1 op) instead of the raw all-deps-present `result.installed` flag. The `_modelDepStatusCache` is populated in the same function just above the filter, so `isModelUsable` resolves correctly. **Rule: usable = installed for display/count purposes — keep the hero count, the manager list, and the pickers all gated on `isModelUsable`, never on `model.installed` (which is all-ops-present and wrongly excludes a deliberate partial install).**

### MpiRadioGroup emits 'select' not 'change'

`MpiRadioGroup` emits `'select'` on user pick, not `'change'`. Listening for `'change'` results in silent no-op. Always use `.on('select', ...)`. Smoke-test that values round-trip to project.json before considering wiring correct.

### MpiInput size='sm' width cap

`MpiInput size='sm'` sets `.mpi-input--sm .mpi-input__field { width: 6ch }` on the `<input>` element directly, not the wrapper. Setting width on `.mpi-input` does nothing. To widen: target the field with equal-or-higher specificity (e.g. `.mpi-model-settings__lora-strengths .mpi-input--sm .mpi-input__field { width: 8ch }`). 8ch clears `-1.00`; 7ch still clips. Overlay renders 0-size on the landing page — don't measure through the overlay. CSS cache trap: edit + reload full page before measuring, not just re-mount.

### MpiCanvasViewer spinner flags

`MpiCanvasViewer` spinner visibility = `_isGenerating || _isLoading`. Two separate setters, both flip `.mpi-canvas-viewer__spinner--visible` via `_syncSpinner()`. `el.setGenerating(bool)` = model-driven generation flow; `el.setLoading(bool)` = internal-only async stalls (4K/8K decode + canvas remount). When adding any async path that leaves canvas blank, wrap with `_setLoadingSpinner(true/false)` via try/finally. Do NOT route through `setGenerating` — consumers (mascot peek) read it separately. `MpiVideoViewer` mirrors the same pattern.

### MpiSlideOver popup-open opt-out (MPI-79)

`Overlays.request()` fires `ui:close-all-popups { reason: 'overlay-open' }` on every overlay/modal open. `MpiSlideOver` ignores `reason === 'overlay-open'`; Escape and `Overlays.reset()` still close it. Click-away close was REMOVED entirely (per card: annoying). Transient popups (dropdowns, context menus) ignore the arg and still close on any pulse. Only long-lived panels opt out by checking `payload?.reason === 'overlay-open'`.

### MpiToast DOM as source of truth

MpiToast caps visible toasts at `MAX_VISIBLE_TOASTS = 2`. Visible count = live DOM query (`qsa(':scope > .mpi-toast:not(.mpi-toast--queued)', stack)`), NEVER a counter var. Queued toasts mount INSIDE `.mpi-toast-stack` hidden via `.mpi-toast--queued { display:none }` — NEVER park a toast in `document.body`. Queued toasts get NO timer until promoted. `dismiss()` is idempotent. One clean drain path. Verify any toast change with a burst test: fire 5+ toasts, assert never >2 visible, none at top-left/out-of-stack, full drain to zero.

**A full-page `body`-mount `MpiOverlay` (e.g. Model Library, MPI-215) buries a toast fired while it's open**, even though the stack is `z-index: 20000` (way above the overlay's ~10000-10030) — z-index alone did NOT save it. Root cause was DOM, not paint order: `MpiOverlay._doShow` stashes (detaches) every `document.body` child except the backdrop + titlebar, and `.mpi-toast-stack` used to get swept up in that stash. `MpiOverlay.js` now explicitly exempts `.mpi-toast-stack` from stashing. Belt: `MpiToast`'s safety-net `MutationObserver` (detects a toast yanked from the DOM outside its own dismiss path) used to fire-and-drain on the FIRST mutation — a stash/rebuild transiently detaching the toast's ancestor tripped it and instant-killed a just-mounted toast (`--closing`, opacity 0, straight to dead) before the user ever saw it. It now re-checks one `requestAnimationFrame` later before treating the detach as permanent. Debugging note: a toast dying instantly reads as "did the emit even fire" — verify with the DOM (`document.querySelector('.mpi-toast-stack .mpi-toast')`, check `classList` + computed `opacity`), not just the `Events.emit` call site.

---

## Gallery

### gallery video thumbnail pattern

Three-stage pattern in `MpiGalleryGrid.js`: (1) Poster paint — `<img src=thumbPath>` (256px JPG from `services/ffmpegThumb.js`) renders instantly. (2) Lazy promotion — grid-level `IntersectionObserver` (rootMargin 200px) calls `card.el.promoteVideo()` when wrapper enters viewport; creates `<video preload=auto>`, fades in once `loadeddata` fires. (3) Hover playback — `mouseenter` calls `play()`; `mouseleave` pauses + resets to frame 0. Element persists so replay works on second hover. `--hover-video-ready` class must NOT be removed on mouseleave — it keeps the paused still visible.

### gallery slider sizing — items-per-row bands

Drive seed from desired items-per-row, not pixel: `target = ((containerWidth - (N-1)*gap) / (N * aspectRef)) * 0.92`. `aspectRef` 1.6. Justified-layout per-row rescaling collapses any two seed pairs that land in the same items-per-row band → two adjacent pixel targets produce identical visual output. Current map: `ITEMS_PER_ROW_TARGET { 1:6, 2:4, 3:3, 4:2 }`. Recompute on BOTH slider input AND ResizeObserver.

### gallery card chrome — inverse info mode

`MpiGalleryGrid` card chrome uses inverse `galleryShowInfo` model: info OFF = clean media until hover reveals metadata/actions; info ON = metadata by default, hover hides metadata and shows actions. State/preview/selection badges stay persistent. Local chip/button backgrounds, not card-wide radial scrims. Prompt excerpts stay out of gallery cards; bottom metadata = compact dimensions/time only.

### gallery window-drop — no stopPropagation

`MpiGalleryBlock` binds `dragenter/dragleave/dragover/drop` on **`window`** to show/hide its `MpiMediaDropOverlay`. The window `drop` handler ONLY hides the overlay + resets a drag counter — actual import runs from the overlay element's own listener. Any other drop target must call `preventDefault()` but NOT `stopPropagation()` — swallowing the bubble starves the gallery's window-level cleanup, leaving the overlay stuck open. Found MPI-82.

### post-cancel UI writes must reconcile — loop re-fire is SYNCHRONOUS (MPI-234)

An armed-loop re-fire runs **synchronously inside any cancel call** (`activeGenerations.cancel` / `cancelRunningCueJob`): store cancel → lane drain → loop callback → `enqueueGeneration` → `startGeneration` all complete BEFORE the cancel call returns — a NEW gen is running (registry entry, mounted placeholder, latched status bar) by the next line. Any UI write placed AFTER a cancel must reconcile from the registry/store, never assume idle. Two stompers shipped this way: the gallery Stop handler's `setGroups(projectGroups)` wiped the re-fire's just-mounted placeholder (fix: `setGroups([..._placeholdersForFirst(), ...groups])`); statusBar's store reconcile only healed active→idle, so a `_latch` while idle left `genId === owner` and the owner-equality check skipped re-arming forever (fix: re-arm when a live store job exists and the bar is idle — store truth wins BOTH directions). Cost 6 failed point-fixes in MPI-226 because every patch targeted the lifecycle handlers while the stomper ran after them.

### gallery hover audio + scroll-stop

MPI-132: hovering a gallery VIDEO card unmutes+plays its `<video>`; hovering an AUDIO card plays its hidden `<audio>`. Gated by `Storage.getPlayAudioOnHover()` (`mpi_play_audio_on_hover`, default true). One-card-at-a-time via `_stopOtherGalleryMedia(except)` covering BOTH `audio[data-src]` AND `video.mpi-group-card__thumb--video`. SCROLL BUG: `mouseleave` does NOT fire when the card scrolls out from under a STATIONARY cursor. Fix = a `scroll` listener on the grid scroll container that stops every playing media whose card is no longer `:hover`. Do NOT rely on mouseleave alone for "stopped hovering" in a scrollable list.

---

## Models

### download:complete lingers in state.downloadJobs

`download:complete` sets `status='complete'` but NEVER removes the job from `state.downloadJobs`. Any gate keyed on `downloadState !== 'idle'` will mis-wire a card with a lingering complete job (MPI-99: Uninstall button had no listener; MPI-102: Install button had no listener after reinstall). Gate on genuinely-ACTIVE states explicitly (`downloading`/`paused`/`installing`), NOT `!== 'idle'`. `MpiModelManager.renderList()` has TWO twin branches with this gate (installed ~L251, uninstalled ~L362) — both now use the identical `isActiveDownload` whitelist predicate. **Keep them in sync.**

### Model Library flash on install (MPI-235)

`renderList()` tears down + rebuilds EVERY tile. During an install it must fire only on a genuine section move (a model jumping Available → Installed on complete). `download:started` / `download:progress` patch ONLY the one changing tile via `_patchTile` — NOT `renderList()`. The flash storm had two sources: (1) the backend broadcasts `download:complete` **per-dep** with `modelId:null` (then once model-level with a real id) — the frontend `download:complete` SSE handler ran `reSyncInstalledModels()` + re-emitted unconditionally, so every dep fired `models:checked` → grid rebuild ×N; gated on `data.modelId`. (2) `download:started` (fired twice — client-side in `downloadService.start()` + the backend SSE echo) and `_install()` both called `renderList()`; both replaced with `_patchTile`. Rule: on a download hot event, patch the tile, never rebuild the grid.

### op-selectable models (MPI-122)

Model shape: flat (`dependencies: string[]`) OR operation-keyed (`commonDeps: string[]` + `operations: { <opKey>: { deps[], requiresOps?[] } }`). Resolver chokepoint = `js/data/modelConstants/resolveModelDeps.js` — NEVER read `model.dependencies` directly. Methods: `resolveDeps(model, selectedOps)`, `resolveFullUniverse(model)`, `deriveInstalledOps(model, depStatusFn)`, `canonicalModelId`. GOTCHA: model pickers must use `isModelUsable()` (modelRegistry), NOT `model.installed` — `installed` is false for a partial op-keyed install → model vanishes from dropdowns.

### queue panel diff render

`MpiQueuePanel._render()` uses signature-based diff render (identity + status + display fields + `previewUrl ? 1 : 0` flag). If sig matches, only `<img src>` is swapped via `_cardByJobId` map; if different, full rebuild. Why: Latent preview ticks fire `generation-queue:changed` rapidly — rebuilding the whole list each tick loses CSS `:hover` mid-frame → hover background flickered. Include "presence" boolean in signature so first-tick transitions (null → url) still force one rebuild.

---

## Build / data

### notes feature — project.md and card sidecar

MPI-76 (2026-06-14): two surfaces. Project notes = `project.md` per project; routes: `POST /project-notes` + `POST /project-notes/save` in `routes/projects.js`; triggered from project picker right-click. Card notes = `notes` field on card sidecar (`Media/.meta/<itemId>.json`); persisted via existing `POST /project-media/:id/update-meta`. Both use `MpiNotesEditor` (textarea + Save/Cancel over MpiModal). `grid.on('card-notes')` cleaned by `grid.destroy()` (not `_unsubs`).

### group field persist whitelist

Adding a new scalar field to an ItemGroup (e.g. MPI-130 `group.customName`) needs THREE edits: (1) `createItemGroup` factory in `js/data/projectModel.js`; (2) **`persistGroups()` in `js/services/projectService.js`** — the serialize map is an EXPLICIT WHITELIST (`{id, type, name, createdAt, selectedIndex, open, favourite, history}`), NOT a spread. Any key not listed is SILENTLY DROPPED on every save → field never survives reload. (3) Read-back is already safe (`projectReconciler.js` uses spread). Groups live INLINE in `project.json` `itemGroups[]`, NOT in `.meta/<uuid>.json` sidecars. When adding any group-level property, grep `persistGroups` first.

### import depth and case sensitivity

Relative import depth varies by how deep a component sits under `js/`. Reference depths to reach `js/` root: `js/components/Compounds/<X>/file.js` → 3 ups; `js/components/Compounds/LandingPages/<X>/file.js` → 4 ups (extra `LandingPages/` segment). Wrong-depth import → boot JS halts → app stuck forever on the landing spinner; server log stays clean (error is browser-side). Case sensitivity (Linux-only): dev box is Windows (case-insensitive); Linux portables are case-sensitive. A relative import whose CASE doesn't match the on-disk filename resolves fine on Windows but 404s on Linux → same spinner failure. SWEEP before any portable/Linux release: walk the whole `js/` import graph and verify EXACT-CASE existence.
