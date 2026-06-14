# MPI-82 Plan — External connections (local LoRA / upscale): drag-drop + missing guard

> Re-scoped 2026-06-14 after alignment. ORIGINAL framing was remote-only and
> wrong: the goal is a LOCAL drag-drop import + a missing-model guard, fully
> testable without a Pod. Remote upload is the LATER phase.

## Summary
The picker (MpiModelSettings) already lists LoRA/upscale from the folders the
system points at (`/comfy/list-files` union of primary + extra folders). What's
missing for the user:
1. **Local drag-drop import** — drop a LoRA/upscale file onto a *specific*
   configured folder path and it copies there, then re-lists. Pure local, fully
   testable.
2. **Missing-model guard** — if a generation uses a LoRA/upscale that is NOT in
   any pointed-at folder, toast on Generate + red-background on that dropdown
   item, so the user goes and fixes his folders.

Drop targets = the **configured folder paths themselves** (primary + each extra),
each rendered as a labeled drop zone. Both in **Settings** (folder rows become
drop zones) AND in the **picker modal** (render the same paths as named drop
areas). "Missing" = not found in ANY pointed-at folder.

Reuse: `webUtils.getPathForFile` drop pattern from
`js/components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.js`;
`fs.copy(localPath, target)` backend pattern from `routes/projects.js:250`.

---

## Phase 0 — Undo the remote-only first attempt
The earlier build aimed the guard at the REMOTE Pod (`/wrapper/models/status`).
Re-aim at LOCAL list presence; keep what's reusable.
- `routes/comfy.js` — REMOVE `POST /comfy/models/remote-presence` (remote-only;
  belongs to Phase 2, re-add there).
- `js/state.js` — REMOVE `loraRemotePresence` / `upscaleRemotePresence` (Phase 1
  needs no presence map — the picker list IS the presence source). Re-add in
  Phase 2 for remote.
- `js/services/assetService.js` — REMOVE `_annotateRemotePresence` + its call.
- `js/components/Compounds/MpiModelSettings/MpiModelSettings.js` — drop the
  `presenceMap`/`⚠ not on Pod` plumbing; replace with local-missing red-bg (Step 3).
- `js/services/commandExecutor.js` — repoint `_findRemoteMissingModel` →
  `_findMissingModel` using LOCAL `state.availableLoras`/`state.upscaleModels`
  (Step 4). Drop the `runpodConfig.enabled` gate.

---

## Phase 1 — Local drag-drop import + missing guard (BUILD + TEST NOW)

### Step 1 — Backend: `POST /comfy/import-model`
**File:** `routes/comfy.js`.
Copy a dropped file from its absolute local path into a chosen target folder.
- Body: `{ sourcePath, targetFolder, bucket }` (`bucket` = `loras`|`upscale_models`).
- Validate: `sourcePath` exists, ext in the model set
  (`.safetensors/.ckpt/.pt/.bin/.pth`), `targetFolder` is one of the currently
  configured folders for that bucket (primary root or a stored extra) — reject
  arbitrary destinations.
- `await fs.copy(sourcePath, path.join(targetFolder, basename), { overwrite:false })`
  (refuse silent overwrite; return a conflict status so UI can confirm).
- Return `{ success, filename }`. Log via `routes/logger.js`.
- `verify:` POST with a real file path + a configured folder → file appears there;
  bad ext / unknown folder → 400.

### Step 2 — Drop zones (shared primitive)
New primitive `MpiFolderDrop` (or extend the existing drop pattern) that wraps a
labeled element as an OS drop target:
- Props: `{ label, bucket, folderPath, onImport(filename) }`.
- Uses `webUtils.getPathForFile(file)` (Electron) like `MpiProjectDropOverlay`;
  on drop POSTs `/comfy/import-model` with `{ sourcePath, targetFolder: folderPath, bucket }`,
  then calls `onImport`. dragover → `dropEffect='copy'` + a visual `--drag-over` state.
- BEM, ComponentFactory, `on/off`, icons from `icons.js`, CSS vars only.
- `verify:` drag a .safetensors onto a zone → file copies, toast/refresh fires.

### Step 2a — Settings: make each folder path a drop zone
**File:** `MpiSettings.js` `_renderPrimaryFolder` + `_renderExtraFolderBucket`
(~1399-1459). Wrap each rendered path row as an `MpiFolderDrop` (label = the path,
bucket = loras/upscale_models, folderPath = that row's path). On import →
`loadAssets()` so the picker list refreshes. Register the new CSS in
`preloadStyles.js`; document props in `types.js`.

### Step 2b — Picker modal: render configured paths as named drop areas
**File:** `MpiModelSettings.js`. Add a drop-area section per bucket listing each
configured folder (fetch via `GET /comfy/extra-folders` + primary root) as a
labeled `MpiFolderDrop`. On import → `loadAssets()` + re-mount the dropdowns so
the new file appears immediately. Only show for the bucket(s) relevant to the
open context (loras hidden in tool context, mirroring existing logic).

### Step 3 — Red-background on missing dropdown item
**File:** `MpiModelSettings.js` + `MpiModelSettings.css`.
A selected LoRA/upscale whose saved value is NOT in `state.availableLoras` /
`state.upscaleModels` (the pointed-at union) is "missing". When mounting a
dropdown whose current value is missing, add a `--missing` modifier to that
option / trigger → red background (CSS var, e.g. `--danger`/`--warning`). When the
list lacks the value entirely, inject a synthetic disabled option labeled
`<name> (missing)` so the user sees what's selected-but-gone.
- `verify:` set a model's LoRA to a name not on disk → open settings → that slot
  shows red + `(missing)`.

### Step 4 — Pre-generation guard (local)
**File:** `commandExecutor.js`. Rework `_findRemoteMissingModel` → `_findMissingModel(params)`:
- For each `params[*].lora_name`: missing iff basename not in
  `state.availableLoras` (basename-compared).
- For `params['Upscale_Model']`: missing iff basename not in `state.upscaleModels`.
- No `runpodConfig` gate — applies local AND remote (remote still lists local in
  Phase 1; Phase 2 swaps the source to remote presence).
- On missing: `Events.emit('ui:warning', { message: '"<name>" not found in your
  LoRA/upscale folders. Add it in Settings → External Connections (drag-drop) or
  pick another.' })`, `exec.onError(new Error('model_missing'))`, clean abort.
- `verify:` select a missing LoRA + Generate → toast, no submit, spinner clears.

### Local test (no Pod)
- Drag a real .safetensors onto a Settings folder zone → confirm copy + it appears
  in the picker.
- Manually set a LoRA name that isn't on disk → red `(missing)` in picker +
  blocking toast on Generate.

---

## Phase 2 — Remote upload + remote presence (GATED on Pod-image rebuild = MPI-81)
> Needs a NEW wrapper endpoint = image rebuild + `wrapper_version` bump. NOT NOW.
> This is where the original remote-presence work returns.
- Wrapper `POST /wrapper/models/upload` (mpi-ci `cubric-vision-pod/wrapper.py`):
  stream a model file to `/workspace/mpi_models/<type>/`. Bump WRAPPER_VERSION.
- `routes/remoteProxy.js` `POST /proxy/models/upload`; `routes/remoteModels.js`
  `remoteUploadModel()` (mirror `remoteUploadInput`); re-add a remote-presence
  check (`/wrapper/models/status`) + state maps.
- In remote mode, the drop zones upload to the Pod instead of (or in addition to)
  local copy; the missing guard's source becomes remote presence. UX placement
  unchanged (Settings + picker modal).

## Phase 3 — Remote verification (after Phase 2 ships on a rebuilt image)
Live-Pod sign-off: drop → uploads to volume → picker reflects it → generation
with an uploaded LoRA succeeds; missing-on-Pod still toasts.

---

## Open questions / risks
1. **Overwrite on import** — refuse silent overwrite; confirm-then-replace if a
   same-name file exists.
2. **Large files** — `fs.copy` is local + streamed by fs-extra; fine for multi-GB.
3. **Browser dev mode** — `webUtils` is Electron-only; drop zones no-op in browser
   (acceptable; ship target is Electron).
4. **Folder validity** — import route must reject targets not in the configured
   set (no path traversal / arbitrary writes).

## Files likely touched
**Phase 1:** `routes/comfy.js` (import route; remove remote-presence route),
`js/state.js` (remove remote keys), `js/services/assetService.js` (remove remote
annotate), new `MpiFolderDrop` primitive (+css, preloadStyles, types),
`MpiSettings.js`, `MpiModelSettings.js` (+css), `commandExecutor.js`.
**Phase 2 (gated MPI-81):** `mpi-ci/cubric-vision-pod/wrapper.py`,
`routes/remoteProxy.js`, `routes/remoteModels.js`, re-add presence to the above.
