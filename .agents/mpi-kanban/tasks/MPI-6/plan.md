# Additive user folders for loras + upscale_models only

## Current State

Project mode: scalable-foundation (file source-of-truth).

Today the ComfyUI model paths are **single-root**. `buildExtraModelPathsYaml(basePath)`
([routes/yamlHelper.js](../../../../routes/yamlHelper.js)) writes one `comfyui:` block with one
`base_path`. `set-path` ([routes/comfy.js:287](../../../../routes/comfy.js)) **wholesale overwrites**
that file. Disk scan `GET /comfy/list-files?subDir=<x>` ([routes/comfy.js:406](../../../../routes/comfy.js))
recursively reads `path.join(modelsRoot, subDir)` for a single `modelsRoot` and feeds
`state.availableLoras` / `state.upscaleModels` via [assetService.js:21](../../../../js/services/assetService.js).

**Goal:** let users add **multiple extra, read-only** folders for **only** `loras` and
`upscale_models`. Our managed `models/loras` + `models/upscale_models` (custom root or engine
default) stay primary and GC-managed. Extras are scanned on disk (no registry — user edits them
behind our back), unioned into the lists, never garbage-collected, never deleted, additive (not
substitution).

**Research-confirmed facts:**
- GC/delete = single path `POST /comfy/models/uninstall` ([routes/downloadManager.js:646](../../../../routes/downloadManager.js)),
  resolves `dep.filename` against `getCustomRoot()` (single primary) only — **never iterates extras**.
  Safe as long as extras stay out of `getCustomRoot()` and out of the dep registry.
- `getCustomRoot()` regex matches `base_path:` only — immune to extra per-key YAML lines.
- ComfyUI reads the YAML natively (`--extra-model-paths-config`); supports multiline path values per
  key. Our Node code never parses per-key paths, so injection (`Lora_N`, `Upscale_Model` by filename)
  is unaffected — ComfyUI resolves filenames across all its roots.
- **THE TRAP:** `set-path` rebuilds the whole YAML -> would erase extras. Extras MUST persist
  separately and be re-merged on every YAML write.

**Conventions in play:** No hardcoded paths -- use `platformEngine.js` helpers. BEM, `ComponentFactory`,
`qs/qsa/on/off`, `icons.js`, CSS vars only, `Events.on/emit` with stored unsubscribes + `destroy()`.
Frontend log via `clientLogger`, backend via `routes/logger.js`.

## Implementation

- [ ] Add multi-folder support for `loras` + `upscale_models` end to end:
  1. **Persist extras separately.** New config (e.g. `extra_model_folders.json` beside
     `extra_model_paths.yaml`, shape `{ loras: string[], upscale_models: string[] }`). Add
     read/write helpers in `routes/shared.js` (e.g. `getExtraFolders()` / `setExtraFolders()`).
     Keep these OUT of `getCustomRoot()` -- primary root resolution unchanged.
  2. **Merge extras into YAML.** `buildExtraModelPathsYaml` reads the extras config and emits
     `loras` + `upscale_models` as ComfyUI multiline values (primary subfolder + each extra abs path).
     Only these two keys ever go multi-path; all other keys stay single. Because the writer now sources
     extras from the separate config, `set-path` overwrite no longer erases them.
  3. **Routes:** add `POST /comfy/extra-folders` (set `{ loras:[], upscale_models:[] }`, validates
     each path exists, rewrites YAML) + `GET /comfy/extra-folders` (read back). `set-path` stays as-is
     but now merges extras via the updated builder.
  4. **Union disk scan.** `GET /comfy/list-files` scans primary `path.join(modelsRoot, subDir)` AND
     each extra folder for that subDir; union + de-dupe results. Keep enough path info that the UI
     and injection still resolve correctly (prefer bare filename; flag collisions). Return combined
     sorted list. `assetService.loadAll()` unchanged (still calls the two subDirs).
  5. **Safety assert.** In `POST /comfy/models/uninstall`, before `_trash`, assert
     `path.resolve(localPath).startsWith(path.resolve(modelsRoot) + sep)`. Belt-and-suspenders --
     extras are never deps, but this hard-blocks any future regression from reaching an extra folder.
  6. **Settings UI.** In [MpiSettings.js](../../../../js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js),
     under the existing single root-path picker, add two repeatable folder lists (LoRAs, Upscale Models):
     default/primary row is fixed (read-only label), `+` adds an extra folder (via existing
     `POST /choose-folder` native picker), `-` removes an extra row. Persist via
     `POST /comfy/extra-folders`; hydrate via `GET /comfy/extra-folders` on open. BEM, dom utils,
     icons.js for +/- glyphs.

  **Verify:** (a) Add an extra loras folder with a `.safetensors` in it -> appears in the
  MpiModelSettings LoRA dropdown alongside primary ones. (b) Add an extra upscale folder -> file
  appears in both MpiModelSettings + MpiToolOptionsUpscale dropdowns. (c) Change primary models path
  via set-path -> extras survive (still in YAML + still listed). (d) Uninstall a managed model ->
  only the primary-root file is trashed; extra-folder files untouched on disk. (e)
  `extra_model_paths.yaml` shows `loras` + `upscale_models` as multiline with each extra abs path; no
  other key multi-path. (f) Restart engine/app -> extras persist and re-list.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement the 6 sub-parts above as one coherent flow (backend persistence + YAML merge + routes +
  union scan + safety assert + settings UI).

## Plan Drift

- None yet.

## Verification

Run the app (`npm start` / desktop). Walk the (a)-(f) checks in the Implementation **Verify** block.
Inspect `extra_model_paths.yaml` on disk to confirm only `loras` + `upscale_models` carry extra paths.
Confirm GC safety by uninstalling a model with an extra folder configured and checking the extra
folder's files remain on disk (OS trash empty of them).

## Preservation Notes

- If this changes component wiring (new settings events, new routes), CLAUDE.md cardinal rule
  requires asking the user before updating `.claude/rules/` (component-mounts / component-events /
  comfy_engine). Flag at end-session.
- Consider a short note in `docs/comfy.md` on the extras config + multiline YAML once shipped.
- Memory candidate: "extras persist in separate config, re-merged into YAML on every write -- set-path
  overwrite would otherwise erase them." Link [[project_comfy_models_path_source]].
