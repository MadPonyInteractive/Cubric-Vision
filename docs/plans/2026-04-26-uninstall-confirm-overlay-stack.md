# Model uninstall confirm dialog with shared-dep protection and overlay stacking

**Status:** complete
**Date:** 2026-04-26
**Owner:** Fabio
**Investigations:** `_investigation_backend.md`, `_investigation_frontend.md`, `_investigation_overlay.md` (same folder)

## Goal

Rebuild proper uninstall UX in `MpiModelsModal`:
1. Confirm dialog (`MpiOkCancel`) with checkbox `[x] Also delete model files from disk` (default checked).
2. Skip deletion of deps used by other installed models (shared-dep protection).
3. When checkbox unchecked: also skip deletion of any dep whose resolved disk path is **inside the user's models folder** (recursive, all subfolders). Models folder = `await getCustomRoot()` (reads `extra_model_paths.yaml` `base_path:` — written by engine install to `<ENGINE_ROOT>/mpi_models` by default; replaced by user's custom path via Settings). Fallback if yaml missing: `path.join(ENGINE_ROOT, 'mpi_models')`. NO hard-coded subfolder list.
4. ALWAYS skip custom_nodes deps where `dep.installRequirements === true` (uninstalling won't undo pip side-effects → could break engine).
5. Toast notifications for skipped/kept files.
6. Refactor `OverlayManager` from single-active+queue to a true stack so the confirm dialog renders ON TOP of `MpiModelsModal` instead of being queued behind it.

## Critical context

- Pre-refactor commit `7194188` replaced an uninstall stub with a no-safety implementation. The "rich" confirm flow this plan builds was never shipped before — it is new work.
- Backend already has `_depJobs` Map with `refCount`, `_trash()` helper (trash@8 ESM), `getCustomRoot()`, `resolveComfyPath()`, `cleanEmptyDirs()`.
- Frontend `MpiModelsModal` already has a skeleton `_uninstallDialog` from a prior session — that skeleton must be replaced/extended, not duplicated.
- `MpiOkCancel` already supports `props.checkbox = { label, checked }` and emits `'ok'` with `{ inputValue, checkboxChecked }`.
- OverlayManager only has 2 consumers: `MpiModal` and `MpiOverlay`. Refactor surface is contained.
- Enter-hotkey will double-fire if 2 modals stacked unless scoped to top of stack.

## To-dos

### [x] 1 — Backend: shared-dep helper + uninstall route extension

**File:** `routes/downloadManager.js`

Add helper `_findOtherModelsUsingDep(depId, excludeModelId)` that scans `MODELS` array (import from `js/data/modelConstants/models.js` via require — verify path resolves at backend runtime) and returns list of `{ modelId, modelName }` for any **installed** model (`installed === true`) other than `excludeModelId` whose `dependencies` array includes `depId`.

Extend `POST /comfy/models/uninstall` request body:
- New optional `deleteFiles: boolean` (default `true`).

Resolve `modelsRoot` once at top of route: `const modelsRoot = customRoot || path.join(ENGINE_ROOT, 'mpi_models')`. Use existing `customRoot = await getCustomRoot()` already at line 642. Note: post-engine-install, yaml's `base_path:` is always set (default `<ENGINE_ROOT>/mpi_models`, or user's custom path), so `customRoot` should be non-null in normal runtime; fallback is purely a safety net for missing/corrupt yaml.

For each dep, after resolving `localPath` (current logic at 648-660 stays):
- Compute `isInModelsFolder = path.resolve(localPath).startsWith(path.resolve(modelsRoot) + path.sep)`.
- Apply skip rules in order:
  1. If `_findOtherModelsUsingDep(dep.id, modelId)` returns non-empty → skip, push to `keptShared` with `{ depId, depName, sharedWith: [...modelNames] }`.
  2. Else if `dep.type === 'custom_nodes'` AND `dep.installRequirements === true` → skip, push to `keptPipInstalls` with `{ depId, depName }`. (Reason: pip side-effects can't be undone; uninstalling could break the engine.)
  3. Else if `deleteFiles === false` AND `isInModelsFolder === true` → skip, push to `keptModelFiles` with `{ depId, depName }`.
  4. Else → `await _trash(localPath)` if `await fs.pathExists(localPath)` and push to `removed`.

After loop:
- Decrement `_depJobs.get(dep.id).refCount` for each `removed` entry; clean up entry if `refCount <= 0`.
- Call existing `cleanEmptyDirs` for parents of removed paths.
- Broadcast SSE `download:uninstalled` with `{ modelId, removed, keptShared, keptModelFiles, keptPipInstalls }`.
- Respond JSON `{ success: true, removed, keptShared, keptModelFiles, keptPipInstalls }`.

Backend logger: `logger.info('download', \`uninstall ${modelId}: removed ${removed.length} kept ${keptShared.length} shared, ${keptModelFiles.length} model files\`)`.

**Verify:** Use Postman / curl / browser DevTools → POST `/comfy/models/uninstall` with body `{ modelId: <id>, dependencies: [...], deleteFiles: false }` and inspect:
- HTTP 200 response JSON contains `removed`, `keptShared`, `keptModelFiles`, `keptPipInstalls` arrays
- `logs/app.log` last lines show the uninstall summary log line including all 4 counts
- For a model whose deps are shared with another installed model: `keptShared` is non-empty
- For a model with `deleteFiles: false`: any dep resolving inside the user's configured models folder appears in `keptModelFiles`
- For a model with a custom_nodes dep marked `installRequirements: true`: that dep appears in `keptPipInstalls` regardless of `deleteFiles` value

### [x] 2 — Frontend service: pass `deleteFiles` + handle structured response

**File:** `js/services/downloadService.js`

Change `uninstall(modelId, dependencies, deleteFiles = true)`:
- Send `deleteFiles` in POST body
- On success, parse response JSON (`removed`, `keptShared`, `keptModelFiles`)
- Emit `Events.emit('download:uninstalled', { modelId, removed, keptShared, keptModelFiles })` BEFORE the existing `state.downloadJobs` filter (so toast wiring can react via Events without racing reSync)
- Keep existing failure path (`ui:error` toast)

Also extend the SSE listener (`addEventListener('download:uninstalled', ...)`) — currently ignores response payload; make it parse the new fields and forward them through `Events.emit('download:uninstalled', data)` so backend-initiated uninstalls also surface kept files.

**Verify:** Add a temporary `clientLogger.info('downloadService', 'uninstall response', json)` inside the success branch. Trigger an uninstall from the UI (after to-do 4 wires the dialog) — but at this stage just call `downloadService.uninstall(modelId, deps, false)` from the browser DevTools console with a known modelId. Check console for the logged response with `removed`/`keptShared`/`keptModelFiles` arrays. Remove the temporary log after confirmation.

### [x] 3 — OverlayManager: refactor to stack with per-layer z-index

**File:** `js/managers/overlayManager.js`

Replace `_active` + `_queue` with `_stack` (Array). Public API stays:
- `request(instance)` → push to `_stack`, immediately call `instance.show()`, return `{ depth, zIndex }` so caller can apply z-index to its DOM nodes. zIndex formula: `BASE + depth * STEP` (e.g. `BASE = 10000`, `STEP = 10` — backdrop at `zIndex - 1`).
- `release(instance)` → splice matching entry out of `_stack`, regardless of position. No queue advancement (no queue anymore).
- `closeTopOverlay()` → call `hide()` on top of `_stack` only (Escape).
- `clearAll()` → unchanged, empty `_stack`.

Drop `_setActive`, `_advanceQueue`. Keep `Hotkeys`/`Events` integration unchanged.

**Verify:** Look at the code — confirm `_stack` is an Array, `request()` returns `{ depth, zIndex }`, no `_queue` references remain, `closeTopOverlay()` only acts on the last element, `release()` works on non-top elements without breaking.

### [x] 4 — MpiModal + MpiOverlay: consume z-index from OverlayManager

**Files:** `js/components/Primitives/MpiModal/MpiModal.js`, `js/components/Primitives/MpiOverlay/MpiOverlay.js`

In `MpiModal.show()`:
- Capture return of `Overlays.request(_overlayEntry)` → `{ zIndex }`
- Apply `_backdrop.style.zIndex = zIndex - 1; _wrapper.style.zIndex = zIndex;`
- Scope `Hotkeys.bind('modal.confirm', ...)` to top-of-stack only: bind only when `depth` is current top; on subsequent push of another modal, the previous modal's Enter handler must be temporarily disabled. Simplest impl: add `Overlays.onDepthChange(cb)` subscription so MpiModal re-evaluates `Hotkeys.bind/unbind` each time the stack changes. (If subscription pattern is too invasive, alternative: each modal checks `Overlays.isTop(_overlayEntry)` inside its `_handleEnter` and no-ops when false. Pick whichever is simpler given current Hotkeys API.)

In `MpiOverlay.show()`:
- Same z-index capture + apply to its `_wrapper` / target container.

Update CSS: remove fixed `z-index: 9999/10000` from `.mpi-modal-backdrop` / `.mpi-modal-wrapper` / `.mpi-overlay` — let JS-assigned inline z-index take over. (Keep CSS fallback at the BASE value in case JS hasn't run yet.)

**Verify:** In the components dev page (or any page that opens MpiOverlay), open the Models modal, then from the browser DevTools console run:
```js
const dlg = MpiOkCancel.mount(document.createElement('div'), { title:'Test', text:'On top?' });
dlg.el.show();
```
Confirm the test dialog renders ABOVE the Models modal (not behind, not queued). Press Enter — only the test dialog should fire its confirm, not both. Press Escape — only the test dialog closes. Repeat with the test dialog still open: open another `MpiOkCancel`. The third dialog should sit above the second.

### [x] 5 — MpiModelsModal: replace skeleton with checkbox dialog + toast wiring

**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`

Update the existing `_uninstallDialog` (added in prior session) — DO NOT add a second dialog:
- Add `checkbox: { label: 'Also delete model files from disk', checked: true }` to the `MpiOkCancel.mount` props.
- Update dialog text to: `Permanently delete this model?\n• Files shared with other installed models will be kept.\n• Custom nodes that install pip packages will be kept (uninstalling them could break the engine).\n• Uncheck the option below to also keep model files (anything inside your configured models folder) on disk.`
- In the `'ok'` handler, read `checkboxChecked` from the emitted payload and pass as 3rd arg: `await downloadService.uninstall(pending.modelId, pending.deps, checkboxChecked)`.

Add toast wiring via `Events.on('download:uninstalled', ({ modelId, removed, keptShared, keptModelFiles, keptPipInstalls }) => {...})` — collected in `_unsubs`:
- Compute `keptTotal = (keptShared?.length || 0) + (keptModelFiles?.length || 0) + (keptPipInstalls?.length || 0)`.
- If `(removed?.length || 0) > 0 && keptTotal === 0` → `Events.emit('ui:success', { title: 'Uninstalled', message: '<modelName> removed' })`.
- Else if `(removed?.length || 0) === 0` → `Events.emit('ui:warning', { title: 'Nothing removed', message: 'All files were kept (shared with other models, pip-installed, or inside your models folder).' })`.
- Else → `Events.emit('ui:info', { title: 'Uninstalled with kept files', message })` where `message` lists only non-zero buckets, e.g. `Kept 3 shared, 2 pip-install, 5 model file(s).`
  - Optionally append model names from `keptShared[].sharedWith` if space allows; truncate with "and N more" beyond 3.

Resolve `modelName` from `MODELS.find(m => m.id === modelId)?.name || modelId` for toast titles.

Remove the temporary `clientLogger.info('MpiModelsModal', 'uninstall clicked', model.id)` diagnostic added in prior session.

**Verify:** Open Models overlay → click Uninstall on an installed model. Confirm:
1. Dialog renders ON TOP of the Models modal (z-index from to-do 4).
2. Dialog shows the new text + a checked `Also delete model files from disk` checkbox.
3. Cancel → no toast, no delete.
4. Uncheck checkbox → Uninstall → toast appears showing kept model file count; `.safetensors` files remain in the models folder (verify on disk).
5. Re-check checkbox → Uninstall a model whose deps are shared with another installed model → toast lists kept shared files; shared `.safetensors` not deleted; non-shared deps moved to OS Recycle Bin.
6. Uninstall a model whose deps are entirely shared → warning toast "All files kept"; no files deleted.

### [x] 6 — Regression sweep: other OverlayManager consumers

**Files:** `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`, `js/pages/components.js`, `js/shell/projectUI.js`, plus any other files surfaced in `_investigation_overlay.md` "All callers" section.

For each existing MpiModal/MpiOverlay/MpiOkCancel call site:
- Open the feature in the browser, exercise the open/close flow.
- Verify no z-index regression (overlay still appears above page content).
- Verify Escape closes the topmost overlay only (no over-close).
- Verify Enter inside an MpiOkCancel dialog still confirms.

Specifically test:
- Gallery delete dialog (MpiGalleryBlock) — open gallery → select cards → trigger delete → dialog renders above gallery, Enter confirms, Escape cancels.
- Component dev page (`/components`) — open the dev MpiOkCancel demos → still work.
- Project UI dialog (`js/shell/projectUI.js`) — exercise its trigger → verify.

**Verify:** Look at the browser screen for each tested flow — overlay/dialog visible above its parent page with correct z-order, Escape closes only the top, Enter confirms only the top dialog. No console errors. If any caller breaks, log the file + line in this to-do's notes and either fix in this same to-do (preferred) or open a follow-up.

## Out of scope

- Persisting `_depJobs.refCount` across restarts (mentioned in backend investigation as future work). The new shared-dep helper scans MODELS directly and does not depend on refCount surviving restarts.
- New Settings UI for the models folder — already exists.
- Rewriting MpiToast — uses existing `Events.emit('ui:info|success|warning|error', ...)` pattern.
