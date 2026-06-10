# Additive user folders for loras + upscale_models only

## Current State

Project mode: scalable-foundation (file source-of-truth).

Today the ComfyUI model paths are **single-root**. `buildExtraModelPathsYaml(basePath)`
([routes/yamlHelper.js](../../../../routes/yamlHelper.js)) writes one `comfyui:` block with one
`base_path`. `set-path` ([routes/comfy.js:287](../../../../routes/comfy.js)) **wholesale overwrites**
that file. Disk scan `GET /comfy/list-files?subDir=<x>` ([routes/comfy.js:406](../../../../routes/comfy.js))
recursively reads `path.join(modelsRoot, subDir)` for a single `modelsRoot` and feeds
`state.availableLoras` / `state.upscaleModels` via [assetService.js](../../../../js/services/assetService.js).

**Goal:** let users add **multiple extra, read-only** folders for **only** `loras` and
`upscale_models`. Our managed `models/loras` + `models/upscale_models` (custom root or engine default)
stay primary and GC-managed. Extras are scanned on disk (no registry; user edits them behind our back),
unioned into the lists, never garbage-collected, never deleted, additive (not substitution).

**Research-confirmed facts:**
- GC/delete = single path `POST /comfy/models/uninstall` ([routes/downloadManager.js:646](../../../../routes/downloadManager.js)),
  resolves `dep.filename` against `getCustomRoot()` (single primary) only. Safe as long as extras stay
  out of `getCustomRoot()` and out of the dep registry.
- `getCustomRoot()` regex matches `base_path:` only, so it is immune to extra per-key YAML lines.
- Local ComfyUI confirms multiline path values: `utils/extra_config.py` splits each key's YAML value on
  `\n` and calls `folder_paths.add_model_folder_path(...)` for each path. Our Node code never parses
  per-key paths, so injection (`Lora_N`, `Upscale_Model` by filename) is unaffected; ComfyUI resolves
  filenames across all configured roots.
- `buildExtraModelPathsYaml(basePath)` is currently synchronous and called by both `set-path` and
  engine install. Keep the builder pure/sync by passing an `extras` object into it; do not make it read
  config from disk internally.
- Current `MpiModelSettings` stores selected upscale models as registry dep IDs when possible. Extra
  upscalers are not in `DEPS`, so this contract must be normalized to preserve raw filenames for
  user-selected upscalers while still resolving registry defaults from dep IDs.
- **THE TRAP:** `set-path` rebuilds the whole YAML, which would erase extras. Extras MUST persist
  separately and be re-merged on every YAML write.

**Conventions in play:** No hardcoded paths; use `platformEngine.js` helpers. BEM, `ComponentFactory`,
`qs/qsa/on/off`, `icons.js`, CSS vars only, `Events.on/emit` with stored unsubscribes + `destroy()`.
Frontend log via `clientLogger`, backend via `routes/logger.js`.

## Implementation

- [ ] Add multi-folder support for `loras` + `upscale_models` end to end:
  1. **Persist extras separately.** New config (e.g. `extra_model_folders.json` beside
     `extra_model_paths.yaml`, shape `{ loras: string[], upscale_models: string[] }`). Add read/write
     helpers in `routes/shared.js` (e.g. `getExtraFolders()` / `setExtraFolders()`). Normalize/dedupe
     paths, require each path to exist, and keep these OUT of `getCustomRoot()`. Treat each configured
     path as the actual bucket folder (a LoRA folder for `loras`, an upscaler folder for
     `upscale_models`), not as a parent models root.
  2. **Merge extras into YAML with a pure builder.** Change `buildExtraModelPathsYaml(basePath)` to
     `buildExtraModelPathsYaml(basePath, extras = {})`. Route helpers read the separate extras config
     asynchronously, then pass it into the sync builder. Emit `loras` + `upscale_models` as ComfyUI
     multiline values (primary subfolder + each extra absolute path). Only these two keys ever go
     multi-path; all other keys stay single.
  3. **Routes.** Add `POST /comfy/extra-folders` (set `{ loras:[], upscale_models:[] }`, validate each
     path exists, rewrite YAML) + `GET /comfy/extra-folders` (read back). Update `set-path` so it
     always rewrites through a shared "write YAML from primary root + extras" helper. When the user
     clears the custom primary path, remove `extra_model_paths.yaml` only if extras are empty; if extras
     exist, rewrite YAML against the same default primary root used by `list-files`/model checks so
     extras survive engine/app restart.
  4. **Union disk scan.** `GET /comfy/list-files` scans primary `path.join(modelsRoot, subDir)` AND each
     configured extra folder for that same bucket; union + de-dupe by normalized relative filename.
     Preserve the current response contract (`{ success: true, files: string[] }`) so
     `assetService.loadAll()` and dropdowns remain unchanged. Primary wins on collisions; optional
     collision metadata may be returned additively, but duplicate same-name files are not separately
     selectable in this plan.
  5. **Upscaler filename persistence contract.** Update `MpiModelSettings` so user-selected upscalers
     save raw filenames when the selected file is not a registry default. Existing registry defaults may
     still resolve from dep IDs for fallback display, but runtime injection must receive a filename.
     LoRA persistence already stores filenames and should stay unchanged. `MpiToolOptionsUpscale`
     already stores raw filenames; keep it aligned.
  6. **Refresh asset lists after folder edits.** After saving extra folders, refresh
     `state.availableLoras` / `state.upscaleModels` (e.g. by calling `assetService.loadAll()` or by
     emitting a narrow refresh event consumed by the asset service). Without this, already-populated
     dropdown state may not show new extra-folder files until restart/open in a fresh session.
  7. **Safety assert.** In `POST /comfy/models/uninstall`, before `_trash`, assert non-custom-node model
     deps resolve under the primary managed models root using the same root contract as
     `resolveComfyPath`/model checks. Keep custom-node deletion guarded separately under
     `defaultCustomNodesRoot`; do not apply the models-root assertion to custom nodes. This hard-blocks
     any future regression from reaching an extra folder.
  8. **Settings UI.** In [MpiSettings.js](../../../../js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js),
     under the existing single root-path picker, add two repeatable folder lists (LoRAs, Upscale Models):
     default/primary row is fixed (read-only label), `+` adds an extra folder (via existing
     `POST /choose-folder` native picker), `-` removes an extra row. Persist via
     `POST /comfy/extra-folders`; hydrate via `GET /comfy/extra-folders` on open. BEM, dom utils,
     existing `plus`/`minus` icons from `icons.js`. Destroy/recreate mounted row controls cleanly on
     re-render; no raw `addEventListener`.

  **Verify:** (a) Add an extra loras folder with a `.safetensors` in it -> appears in the
  MpiModelSettings LoRA dropdown alongside primary ones. (b) Add an extra upscale folder -> file appears
  in both MpiModelSettings + MpiToolOptionsUpscale dropdowns immediately after save and remains
  selectable after close/reopen. (c) Selecting an extra upscaler persists a raw filename and injects that
  filename into `Upscale_Model`. (d) Change primary models path via set-path -> extras survive (still in
  YAML + still listed). (e) Clear the primary models path while extras exist -> YAML still preserves
  extras and restart re-lists them. (f) Uninstall a managed model -> only the primary-root file is
  trashed; extra-folder files untouched on disk. (g) `extra_model_paths.yaml` shows `loras` +
  `upscale_models` as multiline with each extra abs path; no other key multi-path. (h) Restart
  engine/app -> extras persist and re-list.

## Completed

- [x] Implemented separate persisted extras config for `loras` and `upscale_models`.
- [x] Refactored YAML generation to merge extras only into `loras` and `upscale_models`.
- [x] Added `GET/POST /comfy/extra-folders` and preserved extras across primary path changes/clears.
- [x] Unioned primary and extra bucket scans while preserving the `files: string[]` response shape.
- [x] Preserved raw filenames for user-selected upscalers outside the registry.
- [x] Refreshed LoRA/upscaler asset state after extra-folder edits.
- [x] Added uninstall guards for model roots and custom-node roots.
- [x] Added Settings UI controls for additive LoRA/upscaler folders, including per-row Browse replacement.
- [x] Added focused backend smoke coverage.
- [x] User verified implementation.

## Remaining Work

- None for MPI-6. Suggested follow-up: update docs/rules for the new Comfy extra-folder routes and Settings UI wiring if the user approves documentation changes.

## Plan Drift

- 2026-06-01: Hardened after viability review. Added pure YAML-builder contract, clear-primary
  behavior, stable list-files response/collision policy, raw filename persistence for user upscalers,
  asset-list refresh after folder edits, custom-node-aware uninstall guards, and focused automated
  smoke coverage expectations.

## Verification

Automated/smoke checks before desktop walkthrough:
- Unit/smoke the YAML builder: only `loras` and `upscale_models` become multiline, absolute extras are
  preserved, all other keys stay single-path.
- Route smoke `GET/POST /comfy/extra-folders`: validates existing paths, rejects missing paths, persists
  normalized arrays, rewrites YAML.
- Route smoke `POST /comfy/set-path`: changing and clearing primary path preserves extras whenever
  extras are configured.
- Route smoke `GET /comfy/list-files`: primary + extras are unioned, sorted, de-duped, and returned as
  `files: string[]`.
- Uninstall guard smoke: non-custom-node deps outside the managed primary root are refused; custom nodes
  remain guarded by the custom-nodes root.

Run the app (`npm start` / desktop). Walk the (a)-(h) checks in the Implementation **Verify** block.
Inspect `extra_model_paths.yaml` on disk to confirm only `loras` + `upscale_models` carry extra paths.
Confirm GC safety by uninstalling a model with an extra folder configured and checking the extra folder's
files remain on disk (OS trash empty of them).

## Preservation Notes

- If this changes component wiring (new settings events, new routes), CLAUDE.md cardinal rule requires
  asking the user before updating `.claude/rules/` (component-mounts / component-events / comfy_engine).
  Flag at end-session.
- Consider a short note in `docs/comfy.md` on the extras config + multiline YAML once shipped.
- Memory candidate: "extras persist in separate config, re-merged into YAML on every write -- set-path
  overwrite would otherwise erase them." Link [[project_comfy_models_path_source]].
