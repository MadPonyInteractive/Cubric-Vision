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

---

# RE-SCOPE 2026-06-17 (user) — Phase 2/3 replaced: on-demand auto-upload, NOT manual drop-to-Pod

> **The ORIGINAL Phase 2 below ("drop zones upload to the Pod", "missing guard's
> source becomes remote presence") is SUPERSEDED.** User does NOT want the user to
> upload LoRA/upscale into the cloud, nor manage "what's on the Pod" as a concept.
>
> **New model (mirrors the existing latent/media auto-upload):**
> - Local stays the SINGLE source of truth, ALWAYS. Drop zones (Phase 1) keep
>   copying into local configured folders. Dropdowns keep listing local folders.
>   **None of the Phase 1 UI changes.** No drop-to-Pod, no remote-presence picker,
>   no "remote validation" toggle (that toggle never existed in code — confirmed).
> - At **generate time**, in remote mode, if a selected LoRA/upscale is present
>   locally but NOT yet on the Pod volume → app auto-uploads it (toast
>   "Uploading <model> to cloud…"), waits, then generation proceeds. Exactly how
>   latents/media already work (`comfyController._uploadRemoteMedia`).
>
> Decisions locked with user 2026-06-17:
> 1. Upload AT generate, before submit (same spot as latent/media upload). Not eager-on-select.
> 2. Skip re-upload by asking the Pod via `/wrapper/models/status` (already works
>    for a bare `{type, filename}` — confirmed, see Investigation below). NOT an
>    app-side session cache (volume can be wiped on Pod restart).
> 3. Re-scope the card NOW; build the **app-side** guard rework now (ships + tests
>    standalone); the actual UPLOAD is gated on the MPI-81 Pod-image rebuild
>    (new `/wrapper/models/upload` endpoint).

## Investigation findings (2026-06-17) — reuse map

**Existing latent/media auto-upload (the pattern to copy):**
- `routes/remoteModels.js:334` `remoteUploadInput(localPath, filename, endpoint)` —
  already generic (endpoint param picks the wrapper route). Read file → multipart
  POST to wrapper, 4× retry on transient 404. **Reuse verbatim**, pass a new endpoint.
- `js/services/comfyController.js:721-736` — inside `runWorkflow`, BEFORE `/prompt`,
  video/audio params call `_uploadRemoteMedia(localPath)` iff `isRemote()`; the
  returned Pod path replaces the param value. **This is the exact hook point** —
  the model-upload check slots in alongside it (model params, not media params).
- Wrapper `_land_on_volume()` (`wrapper.py:726`) writes media/latent to `INPUT_DIR`.
  Models need `MODELS_DIR/<type>/<basename>` instead — that's the only wrapper diff.

**Presence check — `/wrapper/models/status` (`wrapper.py:814`) works AS-IS:**
- Reads only `dep.type` + `dep.filename`; `_is_complete_on_disk` (`wrapper.py:774`)
  = `os.path.exists(dest) && getsize > 0`. NO url/sha/size needed. A bare
  `{ models:[{ id, deps:[{ id, type:'loras', filename:'foo.safetensors' }] }] }`
  answers "is it on the volume?" today. `type` maps via `MODEL_SUBDIRS` → loras/,
  upscale_models/. **No new endpoint for the skip-check.**

**Upload endpoint — NEW, gated on rebuild:**
- `/wrapper/models/install` (`wrapper.py:1204`) is URL-download-only (rejects no-url).
  `/wrapper/upload/{media,latent}` land in `INPUT_DIR`, not `MODELS_DIR`. So there is
  NO existing way to push a local file into `MODELS_DIR/loras`. New endpoint required.

**The current guard `_findMissingModel` (`commandExecutor.js:334`):**
- Reads `state.availableLoras` only; basename-resolvable match; on miss → `ui:warning`
  toast + `exec.onError(new Error('model_missing'))` + abort. **No remote gate** —
  runs identically local + remote. Upscale missing handled separately by
  `_resolveUpscaleParam` (`commandExecutor.js:296`) → warn + fall back to SIAX.

## Phase 2A — App-side: remote-aware guard + upload plumbing (BUILD NOW, upload disabled until 2B)
Ships + tests without the rebuilt image. The presence check works today; only the
upload POST 404s until the wrapper endpoint exists — so wire it behind the rebuild.

1. **`routes/remoteModels.js`** — add `remoteUploadModel(localPath, type, filename)`
   mirroring `remoteUploadInput`, hitting `POST /wrapper/models/upload` (multipart
   `file`, `filename`, `type`, `overwrite`). Add `remoteModelPresent(type, filename)`
   → POSTs `/wrapper/models/status` with the bare single-dep body, returns the
   `installed` bool. Reuse the existing `wrapperFetch` retry path.
2. **`routes/remoteProxy.js` / `routes/comfy.js`** — Express routes the renderer
   calls: `POST /remote/upload/model` and `POST /remote/model/present` (or fold the
   presence check into the existing model-check route). Mirror `/remote/upload/media`.
3. **`js/services/comfyController.js`** — at the same pre-`/prompt` point as media
   upload, resolve the workflow's selected LoRA(s) + upscale model. For each, in
   remote mode: call presence → if absent, `Events.emit('ui:info', { message:
   'Uploading <name> to cloud…' })`, await upload, then proceed. The Pod resolves
   the model from `MODELS_DIR` by basename (filenames already ship in the workflow
   JSON), so NO param rewrite is needed — unlike media, the basename is the value.
4. **`js/services/commandExecutor.js`** — `_findMissingModel` becomes remote-aware:
   - LOCAL mode: unchanged — local-missing blocks (file truly gone).
   - REMOTE mode: local-missing STILL blocks (can't upload what isn't on disk). But
     present-locally-yet-absent-on-Pod must NOT block — that's the upload path, not
     an abort. So the guard's job in remote mode is "is it on local disk to upload?",
     and the Pod-presence/upload decision lives in comfyController (step 3).
   - Make the upscale path (`_resolveUpscaleParam`) consistent: in remote mode an
     absent-on-Pod upscale uploads rather than silently SIAX-fallback. Confirm the
     2026-06-17 silent-no-output repro is now a visible upload (or a real toast).
5. **Toast UX** — "Uploading <model> to cloud…" while the multi-GB transfer runs.
   Reuse the StatusBar `ui:info` feed. (Latents are silent because tiny; models are
   GB-scale and slow → the user MUST see why generate is paused. This is the one UX
   addition over the latent pattern.)
   `verify:` remote gen with a Pod-absent local LoRA → presence=false → (once 2B
   lands) upload toast → generate succeeds; second gen same LoRA → presence=true →
   no re-upload. Until 2B: presence works, upload 404s — guard cleanly, don't crash.

## Phase 2B — Wrapper `POST /wrapper/models/upload` (GATED on MPI-81 Pod-image rebuild)
> Separate-repo work (mpi-ci). **Can be dispatched to a separate agent / built as a
> standalone image task** to keep the app-side context clean (user offered this).
- `mpi-ci/cubric-vision-pod/wrapper/wrapper.py` — new `POST /wrapper/models/upload`:
  copy of `/wrapper/upload/media` but resolve dest via `_model_dest(type, filename)`
  (→ `MODELS_DIR/<type>/<basename>`) instead of `INPUT_DIR`. Multipart `file`,
  `filename`, `type`, `overwrite`. `_safe_basename` guard already there. Bump
  `WRAPPER_VERSION`. Build the cu124/cu128 matrix per the mpi-ci pod-build procedure.
- After the image is public + the running app is restarted (image pin is baked at
  boot), enable the upload POST in Phase 2A step 1/3.

## Phase 3 — Live-Pod verification (after 2B image ships)
Live-Pod sign-off on a rebuilt image:
- Remote gen with a Pod-absent local LoRA → upload toast → uploads to
  `MODELS_DIR/loras` → generation uses it → output produced. ✓
- The 2026-06-17 repro (custom local upscaler `1xDeNoise_realplksr_otf.pth`,
  Pod-absent) → now uploads + produces output instead of silent no-output. ✓
- Re-gen same model → presence=true → no re-upload (instant). ✓
- Pod reset (volume wiped) → next gen re-uploads (presence=false again). ✓
- True local-missing (not on disk at all) in remote mode → still blocks with toast. ✓

---

## ~~ORIGINAL Phase 2/3 (SUPERSEDED 2026-06-17 — kept for history)~~
> ~~drop zones upload to the Pod; missing guard's source becomes remote presence;
> re-add remote-presence state maps + picker annotation.~~ Replaced by on-demand
> auto-upload above — user does not want manual drop-to-Pod or a Pod-presence picker.

---

## Open questions / risks
1. **Overwrite on import** (Phase 1, shipped) — refuse silent overwrite; confirm-then-replace.
2. **Large model upload** — `remoteUploadInput` reads the WHOLE file into a Buffer
   (`fs.readFile`) before POSTing. Fine for latents/short media; a multi-GB LoRA may
   spike RAM. Check whether to stream instead (`fetch` with a file ReadStream body)
   before 2A step 1 ships. Flag if RAM-bound.
3. **Upload time UX** — GB-scale transfer can take minutes; the "Uploading…" toast
   must persist for the whole transfer (not auto-dismiss) and ideally show progress.
   Decide toast-vs-progress-bar in 2A step 5.
4. **Browser dev mode** — Electron-only; remote upload no-ops in browser (acceptable).
5. **Presence false-positive after partial** — `_is_complete_on_disk` reports a
   `.part` as not-installed (good); a zero-byte file as not-installed (good). Trust it.

## Files likely touched
**Phase 1 (shipped):** `routes/comfy.js`, new `MpiFolderDrop` primitive (+css,
preloadStyles, types), `MpiSettings.js`, `MpiModelSettings.js` (+css), `commandExecutor.js`.
**Phase 2A (app-side, build now):** `routes/remoteModels.js` (`remoteUploadModel` +
`remoteModelPresent`), `routes/remoteProxy.js` / `routes/comfy.js` (Express routes),
`js/services/comfyController.js` (generate-time upload hook), `js/services/commandExecutor.js`
(remote-aware guard + upscale path).
**Phase 2B (gated MPI-81, separate mpi-ci agent):** `mpi-ci/cubric-vision-pod/wrapper/wrapper.py`
(`/wrapper/models/upload`), WRAPPER_VERSION bump, image build.
