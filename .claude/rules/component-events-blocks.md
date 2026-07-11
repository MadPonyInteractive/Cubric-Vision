## Sub-Agent Briefing
> Use this file when you need to know what events a Block emits or listens to.
> Primitives/Compounds live in `component-events-primitives.md`. Organisms live in `component-events-organisms.md`.
> Generation lifecycle (commandExecutor, StatusBar, Active Generation Registry) lives in `component-events-lifecycle.md`.

---

## Blocks

### MpiGalleryGrid
EMITS:   `open-group`      `{ group: ItemGroup }`
         `compare`         `{ groups: [ItemGroup, ItemGroup] }`
         `delete`          `{ groups: ItemGroup[] }` — context menu OR `Delete` hotkey while in selection mode (grid auto-exits selection after emit)
         `download`        `{ groups: ItemGroup[] }`
         `gc-group`        `{ group: ItemGroup }`
         `gc-remove`       `{ groupId: string }`
         `favourite`       `{ group: ItemGroup, favourite: boolean }`
         `rename`          `{ group: ItemGroup }` — user set `group.customName` via the context-menu **Rename** action (inline MpiInput swaps the card name span; Enter/blur commits, Escape cancels, empty clears to derived). Block persists via `updateGroup(group)`. Precedence `group.customName || derived` at all name read sites.
         `reuse`           `{ positive: string, negative: string }`
         `select`          `{ group: ItemGroup, selected: boolean }`
         `media-missing`   `{ group: ItemGroup, itemId: string }`
         `combine`         `{ groups: ItemGroup[] }` — Combine chosen from context menu (≥2 selected, all `type === 'video'`; click-order via Set insertion)
         `add-to-project`  `{ groups: ItemGroup[] }` — "Add to project" from context menu (any selection ≥1). Block copies each group's selected item into a chosen OTHER project.
         `selection-start` `{}` — selection mode activated (hide PromptBox)
         `selection-end`   `{}` — selection mode exited (show PromptBox)
         `preview:continue`     `{ group: ItemGroup, item: MediaItem }` — Continue button on preview-stage card. Block runs `validatePreviewAssets(item.id)` first. Fast path: enqueue stage-2 with `isStage2: true` and NO `replaceItemId` (final lands as a NEW gallery card; preview stays). Cold fallback: enqueue stage-1 rerun (`previewOnly: true`, `replaceItemId: item.id`) to rebuild the latent in place; then on `gallery:item-updated` auto-enqueue the stage-2 branch. Blocked: toast + no-op. Gated by `commandAllowsBranchingContinue(item.operation)` — button is hidden when the op disallows branching.
         `preview:finish`       `{ group: ItemGroup, item: MediaItem }` — Finish button on preview-stage card. Block runs `validatePreviewAssets(item.id)` first. Fast path: enqueue stage-2 with `isStage2: true` AND `replaceItemId: item.id` (preview becomes final video). Cold fallback: enqueue the full base `_ms` workflow with `previewOnly: false` AND `replaceItemId: item.id` — single submission, stage-1+stage-2 fused, no `isStage2` swap, no `LoadLatent` override. Blocked: toast + no-op.
         `preview:pop-continue` `{ group: ItemGroup, item: MediaItem }` — Cancel button on a queued Finish card; Block calls `removeCueJob` keyed on `replaceItemId` to drop the matching pending job and revert the card to preview state. Branching Continue jobs are not popped via this event — they are removed by clearing the Cue queue or letting them complete.

         **Preview-stage delete:** there is no dedicated Discard button. Preview cards are removed via the normal multi-select Delete flow. The backend `DELETE /project-media/:id/:filename?itemId=...` route reads the sidecar before unlinking and, when `stage === 'preview'`, also drops `<projectMedia>/.latents/<itemId>.latent` plus any `<projectMedia>/.preview-assets/<itemId>/` snapshot folder.

         **Preview-stage selection:** Preview cards participate in normal selection (shift / ctrl-click) just like any other gallery card. Right-click opens the context menu without entering selection mode. Only the bare-click "open into history" action is suppressed because previews stay on the gallery surface.
LISTENS: (none — internal MpiButton tab events handled internally)
API:     `el.setStage2Count(groupId, n)` — write the small `xN` badge on a preview card reflecting how many branching Continue jobs are queued/running.
         `el.setPreviewAssetsWarning(groupId, state)` — write the warning badge on a preview card. `state` is `null` for clear; `{ mode: 'fallback', missing? }` renders an amber "Cold" badge (latent missing, stage-1 will rerun); `{ mode: 'blocked', missing? }` renders a red "Missing" badge and hides the Continue/Finish action row via a card CSS modifier. State Map is re-applied inside `_rerenderJustified` so debounced rebuilds don't drop badges.
         `el.getSelectionOrder()` → `string[]` — selected group ids in click order via Set iteration. Used by Combine handler in MpiGalleryBlock to sequence concat inputs chronologically.
         Card API: `cardEl.setSelectionBadge(n)` — numeric `#N` badge top-center when `_selectedIds.size >= 2`; `0` clears. Re-applied in `_syncCardSelectedState` (every selection mutation) AND in the initial-state branch of `_makeCard` so debounced `_rerenderJustified` keyed-reuse paths stay consistent.
NOTE:    Tab buttons (order/filter) write directly to `state.gallerySort`; active-state sync via `_syncTabActive()` on `state:changed`. Card selection: ctrl/cmd-click toggles, shift-click range-selects, right-click opens `MpiContextMenu`. Preview cards participate in selection like any other card; "open into history" suppressed. No `MpiSelectionBar` or `MpiCheckbox`.

### MpiPromptBox
EMITS:   `input`            `{ positive: string, negative: string, activeMode: 'positive'|'negative' }`
         `copy`             `{ text: string }`
         `mode-change`      `{ mode: 'positive'|'negative' }`
         `media-change`     `{ imageCount: number, videoCount: number, items: MediaItem[] }`
         `media-imported`   `{ url: string, filename: string, mediaType: string, source: 'file' }` — also emitted on EventBus as `media:imported`
         `run`              `{ operation: string, positive: string, negative: string, mediaItems: MediaItem[], injectionParams: Object }`
         `cancel`           `{}`
         `queue-clear`      `{}`
         `model-change`     `{ model: ModelDef }`
         `operation-change` `{ operation: string }`
         `settings`         `{ model: ModelDef }`
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:model:select` `{ modelId }` — on model dropdown change (ensures modelSettings key exists)
         `settings:model:update` `{ modelId, opName, key, value }` — from PromptBoxControls. `opName` resolved from each control's `scope`: `'shared'` (ratio/orientation/quality, batch, previewStage, duration, motionIntensity) or the active op key (denoise, useGrid, upscaleFactor). Never includes generation mode.
LISTENS: `workspace:inject-prompts` `{ positive, negative }` — sets textarea values
         `promptbox:generation-end` — clears generating state
         `state:changed` — updates Cue button label on `generationQueueCount` change; re-renders Cue/Loop label on `loopArmed` change
         Hotkeys `generation.run` (Ctrl+Enter) cue, `generation.stop` (Ctrl+Alt+Enter) stop, `generation.loop` (Ctrl+L) toggle `state.loopArmed` — all bound in setup
         (NOT `workspace:set-operation` — parent block validates op + calls `el.setOperation()`)
API:     `el.getRunPayload()` returns the current live run payload. Loop re-fire reads it via `getNextGeneration` callback so prompt/model/control changes apply to the next iteration.
         `el.setModel(model)` / `el.setModelList(list)` auto-pick `activeOperation` for current media context (image/video counts) and emit `operation-change` when the picked op differs. Block-side `model-change` listeners must NOT force-reset op to `model.supportedOps[0]` — only override when current op is unsupported by the new model.
         `el.injectMedia({ url, mediaType, role?, name? })` adds one item to the strip (overflow evicts oldest of same type). Optional `role` ('startFrame' | 'endFrame') is honored by `_withAssignedRoles` so role-tagged chips map to their slot regardless of insertion order. Optional `name` is the user-facing chip label (a card's `customName`/derived name); it is threaded through `_tryAddMedia` → `item.name` and MUST also be serialized by `_saveMedia` (and re-passed on restore) or the label reverts to the filename after workspace nav. Bulk callers should query `el.remainingCapacity(mediaType)` first and inject only that many — exceeding capacity silently evicts earlier items, which is rarely what bulk drops want.
         `el.getMediaByRole(role)` returns the chip currently tagged with that role, or `null`.
         `el.removeMediaByRole(role)` drops the role-tagged chip from `_media`.
         `el.swapMediaRoles(roleA, roleB)` swaps role tags on existing chips (no re-upload).
         `el.updateContext({ historyMode })` flips the `mpi-prompt-box--history-mode` root modifier (CSS hides the media strip; chips still exist) and propagates `historyMode: true` through generation payloads.
GESTURE: Cue button — tap = enqueue 1 job. Hold ≥700ms = arm loop (color sweep fills button left→right; suppresses trailing click). Tap while armed = disarm. Hold while armed = no-op.
REMOUNT: On fresh mount, `_renderRunCluster` reconciles `isGenerating` against BOTH `state.generationQueueCount` AND `activeGenerations.list()` running entries. Long-running jobs (e.g. video) can outlive the Cue queue depth, so depth=0 alone does NOT mean idle — without the `activeGenerations` check, Stop/Clear would mount disabled when a workspace remount happens mid-flight (e.g. returning to Gallery from History while video still rendering). Parent block must also call `_pb.el.setGenerating(true)` post-mount when block-owned busy state (continue / queued-continue / stage2 branches) is non-empty, since PromptBox can't see those flags itself.

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
Owns the Gallery workspace. Mounts MpiGalleryGrid, MpiMediaDropOverlay, and handles generation lifecycle. No MpiSelectionBar.
GRID HANDLER: `grid 'add-to-project'` — `listProjects()` (excludes `state.currentProject.id`; toast if none), builds `cards[]` from each group's `getSelectedItem`, mounts `MpiAddToProject` (dropdown) on demand; on confirm POSTs `/project-media/:targetId/add-from-cards` `{ folderPath, cards }` and emits `ui:success`. Copy, not move — source untouched.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `state:changed` (`s_installedModelIds`) — mounts/unmounts PromptBox based on installed model count. Zero-model + empty project → shows a one-shot MpiOkCancel "Go to Projects" dialog (NOT a `models:open` auto-emit — that was removed to kill a re-open flicker loop). Zero-model + existing media → read-only browse, no prompt.
         `media:imported` `{ url, filename, itemId, mediaType }` — creates ItemGroup from OS-dropped file; registered unconditionally (not gated by PromptBox presence)
         `generation:started` `{ id, scope, tempId, placeholderGroup, extraTempIds, extraPlaceholders, replaceItemId }` — seeds `_myGenIds`; in Queue mode only the first running generation's placeholders are visible. Block uses `replaceItemId` to flip queued-Continue cards from "Queued…" → "Generating final…"
         `generation:preview` `{ id, url }` — updates preview only for the first running visible placeholder set
         `generation:complete` `{ id, item, group, tempId, extraTempIds }` — removes all N placeholders, `setGroups` from state
         `generation:error` `{ id, tempId, extraTempIds }` — removes all N placeholders, restores group list
         `generation:cancelled` `{ id, tempId, extraTempIds }` — removes all N placeholders, restores group list
EMITS:   `tool:running`   `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`      `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled` `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
         `app:open` `{ appId }` (MPI-256) — via `openAppFromReuse(payload.item)` at the TOP of `_applyPromptReuse`: Reuse on an app card (sidecar `appId`) reopens the App with `appInputs` restored instead of filling the PromptBox. Deferred one tick past the reuse popup's `ui:close-all-popups`. Missing model → `apps:open` + `ui:warning` instead.
         `gallery:item-updated` `{ groupId, item, group }` — fired by `generationService` after a `replaceItemId` run mutates an existing history slot (preview → final). Block listens and refreshes the matching card via `grid.el.refreshGroup(group)`; clears any continuing-state flag.
         `gallery:item-removed` `{ groupId, itemId }` — fired by Block after a `preview:discard` confirms and deletes the sidecar + media file
         `grid.on('rename')` handler: `({ group }) => updateGroup(group)` — persists `group.customName` (same path as `grid.on('favourite')`). customName lives inline in `project.json` `itemGroups[]`; `persistGroups()` must whitelist the key (it is not spread).
         `grid.on('combine')` handler: POSTs `/combine-videos { folderPath, itemIds, jobId }` (item ids derived from each group's `getSelectedItem`); awaits `trackConcatJob`; on success creates fresh video group via `createVideoItem` + `createItemGroup` + `addGroup`, then snapshots pre-add `currentGroups` and calls `grid.el.setGroups([populated, ...currentGroups])` so the new card appears immediately (keyed reuse preserves existing cards' DOM/state). Errors truncated to first line / 160 chars via `ui:error`. Full ffmpeg stderr stays in `logs/app.log`.
NOTE:    Reads `state.s_selectedModelIdByType` (via `resolveActiveModel('image')`), `state.currentProject`; writes selected model via `setSelectedModelId(model.mediaType, id)` (in `js/utils/modelHelpers.js`), `state.currentProject`. NEVER writes at mount time.
         On mount: rehydrates from `activeGenerations.listFor('gallery', null)` — placeholder card shown immediately with cached preview. After PromptBox mount, also calls `_refreshPbGenerating()` so Stop/Clear buttons restore enabled state when remounting mid-flight (e.g. returning from History while a gallery-scoped job is still running). `_refreshPbGenerating` busy predicate = `_continuingGroupIds.size > 0 || _queuedContinueGroupIds.size > 0 || stage2Total > 0 || activeGenerations.listFor('gallery', null).some(e => e.status === 'running')`.
         Cancel targets the first running gallery entry. Clear calls `clearPendingQueue()`.
         commandExecutor emits tool:loading-model and tool:sampling-start during generation (see component-events-lifecycle.md)
         Window-level drag listeners (`dragenter`/`dragleave`/`dragover`/`drop`) managed here; removed in `destroy()`
         Continue (`preview:continue`) enqueues a final-pass job via `enqueueGeneration` (rides the in-app Cue queue, single-dispatch). Block tracks `_queuedContinueGroupIds` (Map: groupId→itemId, "Queued…" badge) and `_continuingGroupIds` (Set, "Generating final…" badge); flips queued→continuing on `generation:started` by matching `replaceItemId`. PromptBox shows generating while either set is non-empty. On Continue, Block also auto-syncs PB model + op to the preview's (`item.modelId` / `item.operation`) when mismatched. `preview:pop-continue` calls `removeCueJob(job => job.config.replaceItemId === item.id)`; the cleared job's `onCancel` reverts the card. Cue Clear and per-job cancellation both fire `onCancel` chains, so card markers stay coherent.
         On mount, Block rehydrates `_queuedContinueGroupIds` from `peekCueQueue()` (gallery-scoped jobs with `replaceItemId`) and `_continuingGroupIds` from `activeGenerations.listFor('gallery')` running entries with `replaceItemId`, so Queued/Continuing overlays survive workspace nav. Stage-2 branching xN counts (`_stage2BranchCounts`) are derived: `_recomputeStage2Counts()` reads `peekCueQueue()` + `activeGenerations` filtered by `sourceGroupId` (carried through `enqueueGeneration` opts and stored on the active-generations entry) and runs on mount + every `generation:started/complete/cancelled/error` event, so counts decrement correctly even when the dispatching block instance is gone.

### MpiGroupHistoryBlock (Block — js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js)
Owns the Group History workspace. Mounts MpiHistoryTools, MpiCanvasViewer (image) or MpiVideoViewer (video), MpiHistoryList, MpiMediaDropOverlay, and wires them via Events.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `radial:will-open` — pre-render hook; calls `refreshGroupHistoryRadial(_opOptions())` so radial mirrors PromptBox availability (live mask check via `viewer.el.hasMask()`)
         `generation:started` `{ id, scope, groupId, operation }` — seeds `_myGenIds` if scope+groupId match. Branches on `operation`: tool-only transforms (`resize`/`resizeVideo`) call `_setBusy(true)` (no mascot); everything else calls `_setGenerating(true)` (mascot + spinner). `operation` is added to the `generation:started` payload by `activeGenerations.start` so listeners can route without inspecting the registry.
         `generation:preview` `{ id, url }` — loads preview into canvasViewer if id in `_myGenIds`
         `generation:complete` `{ id, item, group }` — appends history entry, updates canvas/video viewer, clears generating state. **Snapshot `_wasReplace = _group.history?.some(entry => entry.id === item.id)` BEFORE reassigning `_group = group`** — `group` is the post-append snapshot so `.some(...)` would always be true and route every completion to `replaceEntry` (which silently bails for new ids not yet in the list). Mascot animation is gated on `item.operation` — `resize`/`resizeVideo` (tool transforms) skip the mascot. Resize tool stays mounted across Apply: after `loadVideo`/`loadEntry` the block calls `_options?.el?.setCurrentItem?.(item)` so the compound re-extracts the source thumbnail and refreshes the inline preview on the new entry. There is no canvas-mode re-enter step (the Phase 3 `enterResizeMode`/`exitResizeMode` viewer API is gone).
         `generation:error` `{ id }` — clears generating state
         `generation:cancelled` `{ id }` — clears generating state
         `controlBar.range-change` (component-local on MpiVideoControlBar instance, video groups only) `{ in, out }` — debounced 250ms; POSTs `/project-media/:projectId/update-meta` with `{ itemId, updates: { trim } }` (or `{ trim: null }` at full clip). Mirrors `item.trim` in memory for sidecar parity. Block-owned `MpiVideoControlBar` mount lives in `#controls-slot`; subscribed via `videoControlBar.on('range-change', ...)`, NOT via the viewer.
EMITS:   `tool:running`       `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`         `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled`    `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
         `app:open` `{ appId }` (MPI-256) — via `openAppFromReuse(payload.item)` at the TOP of `_applyPromptReuse` (above the cross-mediaType reject): Reuse on an app card reopens the App with `appInputs` restored. Same helper/behavior as the Gallery block.
NOTE:    Reads `state.currentProject`; writes `state.currentProject`
         On mount: rehydrates from `activeGenerations.listFor('groupHistory', _group.id)` — canvas shows cached preview immediately
         `destroy()` unsubscribes all events but does NOT cancel exec — generation continues across navigation
         StatusBar listens to tool:running, tool:loading-model, tool:sampling-start, tool:idle, tool:cancelled and updates progress label/variant
         commandExecutor emits tool:loading-model and tool:sampling-start (see component-events-lifecycle.md)
         Window-level drag listeners (`dragenter`/`dragleave`/`dragover`/`drop`) managed here; removed in `destroy()`
         MpiMediaDropOverlay onDrop: loops dropped files, uploads each + calls _pb.el.injectMedia() per file (organism handle on Block) (no history card created)
         **Active tool:** block-local `_options` (current MpiToolOptions* instance). NOT in global `state`. `mountOptions(mode)` is the mediator — destroys previous instance, mounts new one into `#right-top-slot`. `prompt` mode toggles `--prompt-active` CSS class (shows PromptBox, hides slot). No channel bus for tool events.
         **Image groups:** mask tool → MpiToolOptionsMask (unified auto+manual panel; no apply button; additive composite). Auto-detect composites onto existing manual paint. B/E hotkeys owned by panel while mounted.
         Resize tool → MpiToolOptionsResize. Live-previews through Comfy on a 512px thumbnail extracted from the source via `viewer.el.getSourceElement()` (HTMLImageElement for image, HTMLVideoElement for video — first frame). Apply appends a new history entry, preserving the source item.
         imageUpscale tool → MpiToolOptionsUpscale (shared with video, `kind:'image'`). Emits `apply { factor, model }`; Block builds `{ Upscale_Factor, Upscale_Using_Model:!!model, Upscale_Model? }` and submits via `_runImageTool` (image universal workflow `image_upscale.json`). Persists `toolSettings.imageUpscale` via `settings:tool:update`.
         **Video groups:** MpiVideoViewer mounted instead of MpiCanvasViewer. Tool options in `#right-top-slot` via mediator: crop → MpiToolOptionsCrop, resizeVideo → MpiToolOptionsResize, videoUpscale → MpiToolOptionsUpscale (`kind:'video'`), interpolate → MpiToolOptionsInterpolate, prompt → MpiToolOptionsPrompt (video + i2v-capable model only). PromptBox only if `_hasPromptOps()` true — bypassed in video-history workspace when the active video model exposes any `i2v*` op so the toolbar can mount before frames are injected. Block force-mounts PromptBox + passes `historyMode: true` via `updateContext` so the media strip is hidden and `Preview_Only` is forced `false` for any `_ms` op.
         **Video-history extras:**
         - Listens for `video-viewer:context-menu { x, y }` (right-click on video). Opens `MpiContextMenu` with `Set as start frame` / `Set as end frame` items (disabled when no installed model exposes `i2v*`). Click handler snapshots the frame via `viewer.el.captureSnapshot()`, uploads via shared upload helper, auto-switches the selected video model to an i2v-capable installed model when current lacks i2v, then calls `_pb.el.injectMedia({ url, mediaType: 'image', role })` and `mountOptions('prompt')`.
         - Listens for `prompt-box-tools:create-new` (Events bus) → runs `_runGenerate(getRunPayload, historyMode:true)`. Standard I2V save; lands as new history entry.
         - Listens for `prompt-box-tools:extend` (Events bus) → same submit path with `extend:true` and `sourceItemId:<currentItem.id>` plumbed into `config.extend` / `config.sourceItemId`. `generationService.startGeneration` runs the I2V, POSTs `/extend-video` after save-generation, awaits `trackConcatJob`, then DELETEs the intermediate sidecar via `/project-media/<projectId>/<filename>?folderPath=...&itemId=...` and swaps `builtItems[0]` to the extended item (carries `extendedFrom`). Concat failure path: short single-line `ui:error` toast, intermediate stays as regular history entry — no work lost.
         - Listens for `combine-requested { indices }` from MpiHistoryList → `_runCombine(itemIds)` POSTs `/combine-videos`, appends to current video group.
         - Listens for `add-to-gallery { index }` from MpiHistoryList → `_addItemToGallery(item, mediaType)` refetches source blob, re-uploads via shared `uploadMediaFile`, creates fresh gallery group via `createItemGroup` + `addGroup`. Toast "Added to gallery".
         - Single video-history mount at a time — do NOT pre-wire `prompt-box-tools:extend` / `prompt-box-tools:create-new` listeners outside this block.
         - `_applyPreview` short-circuits for `isVideo`. Latent previews are PNGs that can't load into `<video>`; viewer stays on the previously-loaded video so the user can queue parallel ops. Mascot + StatusBar still drive feedback.
         **PromptBox gating:** `_shouldShowPromptBox() = _hasPromptOps() || _modelHasFrameOps()` drives mount + show + tool-button enable. `_hasPromptOps()` returns true iff active model exposes ≥1 enabled op. `_modelHasFrameOps()` returns true iff any `supportedOps` starts with `i2v` or `v2v` — keeps PromptBox visible BEFORE chips land so external drag-drop can stage a start/end-frame. Recomputed on `s_selectedModelIdByType` (filtered by `modeKind`), `s_installedModelIds`, `project:changed`.
         **PromptBox model list:** `s_installedModelIds` listener also calls `_pb?.el?.setModelList?(getModelsByType(modeKind).filter(m => m.installed !== false))` — live dropdown refresh on install/uninstall.
