# MPI-82 Checklist

## Phase 0 — Undo remote-only first attempt
- [x] Remove `/comfy/models/remote-presence` route (routes/comfy.js)
- [x] Remove `loraRemotePresence`/`upscaleRemotePresence` state keys
- [x] Remove `_annotateRemotePresence` (assetService.js)
- [x] Drop presenceMap/`⚠ not on Pod` plumbing (MpiModelSettings.js)
- [x] Repoint guard to local list (commandExecutor.js)

## Phase 1 — Local drag-drop import + missing guard (build+test now)
- [x] Backend `POST /comfy/import-model` (validated copy into a configured folder)
- [x] Backend `GET /comfy/model-folders` (primary + extras, for drop zones)
- [x] `MpiFolderDrop` drop-zone primitive (webUtils.getPathForFile + import POST + 409 confirm)
- [x] Settings: drop zones per configured folder (MpiSettings.js)
- [x] Picker modal: drop zones per configured folder (MpiModelSettings.js)
- [x] Red-background (`mpi-dropdown--missing`) + `(missing)` synthetic option
- [x] LoRA pre-gen guard: missing → blocking toast + abort (commandExecutor.js)
- [x] Upscale missing → warn + fall back to SIAX (NOT block); red `(missing)` in picker (commandExecutor `_resolveUpscaleParam`)
- [x] Drop zones + paths render in app (verified by screenshots)
- [x] Drag-drop LoRA verified — dropped file lands in folder + appears in picker (USER)
- [x] Drag-drop upscale verified — dropped file lands + appears (USER)
- [x] Missing-LoRA verified — red `(missing)` + blocking toast (USER)
- [x] Fix: drop on settings modal left gallery media-drop overlay stuck open — removed stopPropagation so gallery's window-level drop cleanup (hide + counter reset) fires (MpiFolderDrop.js)
- [x] Picker live-rerenders on availableLoras/upscaleModels state:changed while open (folder removal / drag-drop reflect without close-reopen) (MpiModelSettings.js)
- [x] Fixed TDZ regression: _unsubs/_isOpen/_context used before declaration broke gallery PromptBox mount — declarations moved to top of setup() (USER-confirmed prompt box back)
- [x] Fixed duplicate drop zones: overlapping async _renderDropZones (live-rerender fired mid-fetch) double-appended — added render-token guard + clear-after-await (MpiModelSettings.js)
- [x] Fixed red-vs-exists contradiction: saved subfolder path gone but same file at root. Heal-on-resolve — unique basename → silently update stored path (not red); ambiguous (multiple same-name) → stays red, user re-picks. Applied at picker (heal+persist) AND injection (commandExecutor). Offline logic test 7/7.
- [x] Re-test: drop LoRA into settings modal → UI updates, no duplicate drop zones (USER ✓)
- [x] Re-test: moved-file case (remove subfolder, file at root) → no longer red, generation loads it (USER ✓; ambiguous two-same-name path verified offline, user skipped live)
- [x] Re-test: drop on settings modal in gallery workspace → overlay does NOT stick after close (USER ✓)
- [x] Final test: remove a folder holding pre-selected upscale+LoRA, drag-drop the missing ones back → repopulate in list (USER ✓)

## Phase 1b — Windows path-separator fix (pre-existing bug, found during test)
- [x] list-files emits ENGINE-OS separator (local Windows `\`, remote `/`) — routes/comfy.js
- [x] Separator-agnostic resolve of saved value → list string at injection (commandExecutor `_resolveModelName`)
- [x] Separator-agnostic resolve in picker (LoRA slots + upscale) — no project.json migration
- [x] Logic verified offline: emit==ComfyUI enum, legacy fwd-slash resolves to backslash
- [x] After app RESTART: subfolder LoRA generation succeeds (no "value not in list" 400) — USER ✓

## Phase 2 — Remote upload + presence (GATED on MPI-81 rebuild — NOT NOW)
- [ ] Wrapper `POST /wrapper/models/upload` (mpi-ci) + WRAPPER_VERSION bump
- [ ] `POST /proxy/models/upload` + `remoteUploadModel()`
- [ ] Re-add remote presence check + state maps
- [ ] Drop zones upload to Pod in remote mode

## Phase 3 — Remote verification (after rebuilt image)
- [ ] Live-Pod sign-off — USER
