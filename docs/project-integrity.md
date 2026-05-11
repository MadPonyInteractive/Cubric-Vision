# Project Data & Meta File System

This document explains the project data model, how items are stored, how reconciliation works, and the critical distinction between in-memory state and on-disk format.

---

## The Golden Rule: Memory ≠ Disk

**In memory** (`state.currentProject.itemGroups[].history[]`):
- Full item objects with all fields: `id`, `filePath`, `operation`, `prompt`, `negativePrompt`, `seed`, `modelId`, etc.
- Everything components need is available without extra lookups.

**On disk** (`project.json`):
- History arrays contain **UUID strings only** — one per history entry.
- All actual item data lives in `.meta/<uuid>.json` sidecar files.

**Conversion happens exactly once:**
- On write: `_persistGroups()` serializes full objects → UUID strings
- On read: `reconcileAndHydrate()` deserializes UUID strings → full objects from `.meta/` files

**Important:** Never try to hydrate UUIDs to full objects during runtime (e.g., on navigation or state change). This causes bugs. Keep full objects in memory always. Hydration only happens on project load.

---

## Disk Structure

### `project.json`

Located at `<projectFolder>/project.json`. Example structure:

```json
{
  "id": "proj-12345abc",
  "name": "My Project",
  "folderPath": "C:\\Users\\Fabio\\Documents\\CubricStudio\\projects\\my-project",
  "createdAt": "2026-04-15T10:30:00Z",
  "updatedAt": "2026-04-17T14:22:15Z",
  "thumbnail": null,
  "schemaVersion": 1,
  "itemGroups": [
    {
      "id": "group-abc123",
      "type": "image",
      "name": "Portrait session",
      "createdAt": "2026-04-15T...",
      "selectedIndex": 2,
      "open": true,
      "favourite": false,
      "history": [
        "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
        "a1b2c3d4-e5f6-4c7b-8d9e-f0g1h2i3j4k5",
        "x7y8z9a0-b1c2-4d3e-4f5g-6h7i8j9k0l1m"
      ]
    }
  ],
  "modelSettings": { /* ... */ },
  "toolSettings": { /* ... */ }
}
```

**Key field: \****`schemaVersion`** — Identifies which data schema this project was saved in. On project open, if this doesn't match `SCHEMA_VERSION` from `appVersion.js`, migrations are run first.

**Key field: \****`id`** — UUID assigned at `/create-project`. **Authoritative project identifier.** All destructive ops (`/delete-project`) require the caller to pass `expectedId`; server refuses (409) if the on-disk `project.json` id differs from the expected id. This prevents stale `folderPath` values (e.g., imported projects moved on disk, or JSON copied between folders) from causing the wrong folder to be deleted.

**Stale `folderPath` safety:** The `folderPath` field inside `project.json` is NOT trusted by the server. `/list-projects`, `/get-project`, and `/validate-project` all overwrite it with the actual disk path where the JSON was found before returning it to the client. This keeps `project.folderPath` in UI state always pointing at the real folder even if the JSON was moved manually.

**Key field: \****`history[]`** — Array of UUID strings (NOT full objects). Each UUID corresponds to a `.meta/<uuid>.json` file in the Media folder.

### `toolSettings`

`toolSettings` stores per-project, per-tool UI settings. Components must not
write this object directly. Tool panels emit `settings:tool:update`; the
singleton `projectService` queues, merges, and saves the update through
`/update-project-settings`.

Known keys:

```json
{
  "videoUpscale": {
    "upscaleModel": null
  },
  "resize": {
    "width": 1024,
    "height": 1024,
    "upscale_method": "lanczos",
    "keep_proportion": "crop",
    "pad_color": { "r": 0, "g": 0, "b": 0 },
    "crop_position": "center",
    "divisible_by": 1,
    "flip": "none",
    "rotation": "none"
  }
}
```

`getToolSettings(project, toolKey, defaults)` accepts tool-specific defaults.
Existing callers that omit `defaults` still receive `{ upscaleModel: null }`.

### `.meta/<uuid>.json` Sidecar Files

Located at `<projectFolder>/Media/.meta/<uuid>.json`. One file per history item. Example:

```json
{
  "id": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "type": "image",
  "filePath": "/project-file?path=C%3A%5CUsers%5CFabio%5CDocuments%5CCubricStudio%5Cprojects%5Cmy-project%5CMedia%5Ct2i_001.png",
  "operation": "t2i",
  "displayName": "t2i_001",
  "prompt": "a hamster in the snow",
  "negativePrompt": "",
  "seed": 42,
  "modelId": "sdxl-realistic",
  "createdAt": "2026-04-15T10:35:22.340Z",
  "name": null,
  "uploaded": false,
  "pixelDimensions": {
    "w": 1024,
    "h": 1024
  },
  "generationMs": 15087
}
```

**Key fields:**
- **`id`** — UUID matching the entry in `project.json` history. This is the primary key.
- **`filePath`** — Server-relative URL to the actual image/video file. NOT a simple filename — it's a `/project-file?path=...` query string.
- **`type`** — `'image'` or `'video'`.
- **`operation`** — Which operation created this item (e.g., `'t2i'`, `'upscale'`, `'autoMaskImg'`, `'interpolate'`, `'videoUpscale'`, `'snapshot'`, `'crop'`). Reserved for the operation key — never overwritten with a filename or human label.
- **`displayName`** — Human-readable label derived from the saved filename stem (e.g., `'t2i_001'`, `'upscale_002'`, `'crop_001'`). Source of truth for `MpiHistoryList` card labels and gallery group names. Distinct from `operation` so the same item displays identically before and after project reload.
- **`pixelDimensions`** — `{w, h}` of the actual saved media. Images use client-supplied Width/Height when present, else `sharp.metadata()` in `/project/save-generation`; generated videos use `ffprobe` in `/project/save-generation`. Crop writes the crop rect dims directly.
- **`generationMs`** — Elapsed sampling time in milliseconds (from `tool:sampling-start` to completion). `null` for crop and uploaded items. Rendered as rounded seconds (`Ns`) on history cards.
- **`uploaded`** — True if this item was imported by the user (not generated). Uploaded items don't have operation metadata.
- All other fields are copied from the generation request or ComfyUI output.

**Multi-stage video preview-gate fields** (present only when `type === 'video'` AND the item was produced by a multi-stage op like `t2v_ms` / `i2v_ms`):
- **`stage`** — `'preview'` | `'final'` | absent. Items saved by a `previewOnly: true` run are tagged `'preview'`; the resulting gallery card renders the `--preview` variant (badge + Continue/Discard, click-gated so it cannot navigate to history). Continue re-runs the workflow with `replaceItemId` set, which overwrites the same sidecar with `stage: 'final'`, drops `frozenParams` / `loraSnapshot`, and replaces the media file on disk. Legacy and non-multi-stage items intentionally have NO `stage` key (in-memory MediaItem mirrors this — see `feedback_sidecar_inmemory_parity.md`).
- **`frozenParams`** — `{ seed, prompt, negative, dims: { w, h }, frames | null }`. Snapshot of the determinism-critical inputs taken at preview time. Continue replays these into the final run so the final video matches the preview's intent. Removed when stage transitions to `'final'`.
- **`loraSnapshot`** — `[{ name, strengthModel, strengthClip }, ...]` from `modelSettings[modelId].loras` at preview time. Informational only (NOT used by Continue — Continue uses the user's current LoRA selection). Removed alongside `frozenParams` on finalize.

**Video-specific sidecar fields** (present when `type === 'video'`):
- **`thumbPath`** — Server-relative URL to a first-frame thumbnail JPG (256px wide). Written by `services/ffmpegThumb.js` for upload/crop/generated video saves. Used by `MpiHistoryList` for row previews and `MpiGalleryGrid` for card thumbnails.
- **`fps`** — Frame rate as probed by ffprobe (number). Written by `services/ffprobeVideo.js` for upload/generated video saves.
- **`duration`** — Duration in seconds (number). Written by `services/ffprobeVideo.js` for upload/generated video saves.
- **`frameCount`** — Total frame count (number). Written by `services/ffprobeVideo.js` for upload/generated video saves.
- **`hasAudio`** — Whether the video has an audio stream (boolean). Written by `services/ffprobeVideo.js` for upload/generated video saves.
- **`sourceItemId`** — UUID of the source item, present on crop/upscale/interpolate outputs. Traces lineage back to original.
- **`sourceGroupId`** — Group ID of the source item, present on crop outputs.
- **`videoMeta`** — Object containing raw ffprobe output fields (optional; used for future enrichment).

> **Note:** `fps`, `duration`, `frameCount`, `hasAudio` are probed once at import/upload/generated-save time and written into the sidecar. They are available in memory as `item.fps`, `item.duration`, etc. after hydration.

**Source of truth:** This file is THE source of truth for everything about the item. Nothing in `project.json` duplicates this data.

---

## In-Memory State

After loading, `state.currentProject.itemGroups[n].history[m]` is a full object like:

```javascript
{
  id: '6e409682-8b95-4ff7-aa77-e24e7656cbf8',
  type: 'image',
  filePath: '/project-file?path=C%3A%5CUsers%5CFabio%5C...',
  operation: 't2i',
  displayName: 't2i_001',
  prompt: 'a hamster in the snow',
  negativePrompt: '',
  seed: 42,
  modelId: 'sdxl-realistic',
  createdAt: '2026-04-15T10:35:22.340Z',
  name: null,
  uploaded: false,
  pixelDimensions: { w: 1024, h: 1024 },
  generationMs: 15087
}
```

**Components never change.** They read `.operation`, `.filePath`, `.prompt`, etc. from the history item exactly as they do today. No component knows about UUIDs or `.meta/` files.

**Sidecar / in-memory parity is mandatory.** `projectReconciler.reconcileAndHydrate()` injects the sidecar JSON directly as the in-memory item. Any client-side flow that builds a fresh item (e.g. `generationService.js`, `MpiCanvasViewer` crop) must emit the same fields with the same semantics, otherwise the same item displays differently before vs after a project reload. When adding a sidecar field, update in equal measure: (a) `createImageItem`/`createVideoItem` defaults in `projectModel.js`, (b) every fresh-item construction site, (c) every server route that writes a sidecar (`save-generation`, `crop-media`, `upload`), and (d) `projectReconciler._constructSyntheticItem`.

---

## The `openProject()` Flow

`projectService` (or reconciliation hook) runs this sequence:

1. **Load \****`project.json`** from disk.

2. **Run schema migrations** (via `POST /migrate-project` route):
  - Server compares `project.schemaVersion` against `SCHEMA_VERSION`.
  - If behind, runs all pending migrations (e.g., `migrateV0toV1`, `migrateV1toV2`).
  - Writes updated `project.json` back to disk.
  - Returns migrated project to client.

3. **Reconcile and hydrate** (client-side, via `reconcileAndHydrate()`):
  - For each group in `itemGroups`:
    - For each UUID in `history[]`:
      - Try to load `Media/.meta/<uuid>.json` (via `GET /load-meta?id=<uuid>&folderPath=<path>` route).
      - If `.meta/` file exists, check if the referenced media file exists (via `GET /file-exists?path=...`).
      - If media file exists: keep the entry (fully hydrated).
      - If media file missing: remove UUID from history, delete orphaned `.meta/` file.
      - If `.meta/` file missing: remove UUID from history silently.
    - If group has `uploaded: true` items (legacy, no `.meta/` file by design), construct a synthetic item from the filename.
  - If any group becomes empty after cleanup, remove the group.
  - If anything was removed (`wasModified = true`), re-persist the cleaned project.json.

4. **Load full hydrated project into state** (`state.currentProject = projectData`).

---

## Reconciliation Rules

| Condition | Action | Rationale |
| --- | --- | --- |
| UUID in history + `.meta/` exists + media exists | Keep, hydrate | Normal case |
| UUID in history + `.meta/` missing | Remove from history | Corrupted or incomplete save |
| UUID in history + `.meta/` exists + media missing | Remove from history + delete `.meta/` | User deleted file externally; clean up sidecar |
| Group empty after cleanup | Remove group | No items left |
| Item has `uploaded: true` (legacy) | Construct synthetic item | Backward compat; no `.meta/` expected |

All removals are **silent** — no error shown to the user. The project is simply cleaned up.

---

## Deletion

### App-side deletion (user clicks delete button)

1. User selects an item in the history and clicks delete.
2. App calls `DELETE /project-media?id=<uuid>&folderPath=<path>` route.
3. Server:
  - Deletes the media file(s) at the path specified in `.meta/<uuid>.json`
  - Deletes the `.meta/<uuid>.json` sidecar file
  - Returns success
4. Client removes the UUID from the history array in state.
5. Next save writes the updated history to `project.json`.

### In-place replacement (multi-stage preview → final)

Multi-stage video ops Continue path POSTs `/project/save-generation` with `replaceItemId: <uuid>`. The route forces the new sidecar id to that uuid (overwriting `<uuid>.json`), stamps `stage: 'final'`, drops `frozenParams` / `loraSnapshot`, then deletes the previous media file (and `<uuid>.thumb.jpg` if any) once the new file is committed. The history slot in `project.json` is unchanged because the uuid is reused. Listeners refresh via the `gallery:item-updated` event emitted by `generationService`.

### Orphaned sidecars (garbage collection)

If a user deletes a file manually (outside the app), the next project open runs reconciliation, detects the missing media file, and silently removes the UUID and its `.meta/<uuid>.json` sidecar.

**Critical:** When reading the meta file to check if media exists, ALWAYS read the `filePath` field from the `.meta/` JSON — do NOT assume the UUID is the media filename. The UUID might be `6e409682-...` but the actual file could be `t2i_001.png` or `my_custom_name.png`.

---

## Uploaded Items (Special Case)

Users can drag-drop image/video files into the gallery. These are "uploaded" items with `uploaded: true` and no `.meta/` file.

**On save:**
- The file is moved to `Media/` and renamed to `<uuid>.<ext>`.
- A `.meta/<uuid>.json` is created with `uploaded: true` and minimal metadata.

**On load:**
- If a `.meta/` file exists with `uploaded: true`, it's treated as a normal item.
- If a file in `Media/` has no corresponding `.meta/` (orphaned upload), `reconcileAndHydrate()` constructs a synthetic item with the UUID extracted from the filename.

---

## Persistence: `_persistGroups()`

When the app saves the project, `persistGroups()` in `projectService.js` serializes state back to disk:

1. For each group and history item, extract the UUID.
2. Write `project.json` with history arrays containing only UUIDs.
3. For each history item, write/update its `.meta/<uuid>.json` sidecar with all the full data.

This is the only place where full objects are converted to UUIDs. No other code path touches this.

### Server Write Safety

All full-file `project.json` updates on the server must go through `updateProjectJson()` in `routes/projects.js`. That helper serializes writes per resolved `project.json` path and writes via a temporary file followed by `rename()`.

This applies to `/update-project`, `/update-project-settings`, `/migrate-project`, and project template routes. Do not add another `readJson -> merge -> writeJson` route for `project.json`; concurrent settings saves and group persistence can otherwise interleave and leave concatenated or truncated JSON on disk.

---

## Path Normalization

Windows uses backslashes; the client sends forward slashes in some contexts. **On the server, always normalize folder paths using \****`path.normalize(folderPath)`** before using them for file operations.

Example:
```javascript
// routes/projects.js
const folderPath = req.query.folderPath;  // might be "C:/Users/..." or "C:\\Users\\..."
const normalized = path.normalize(folderPath);  // always "C:\\Users\\..." on Windows
```

---

## Relationship to Versioning

- **`SCHEMA_VERSION`** in `project.json` identifies the data structure.
- **`appVersionIntroduced`** in each operation's `operationRegistry.js` entry identifies when that operation was added.
- If a project references an operation (in the `operation` field of a history item) that was introduced in a later app version, the app should warn the user — they may not be able to regenerate that item with the current app.

See `docs/versioning.md` for the full versioning system.

---

## Troubleshooting

**Problem:** Project won't open; reconciliation removes all items.
**Cause:** `.meta/` files are missing or media files were deleted.
**Solution:** Check `Media/.meta/` directory; restore missing files if available. Projects without media are safe to open; items are simply removed.

**Problem:** `selectedIndex` is out of bounds after opening a project.
**Cause:** Items were removed during reconciliation; history length changed.
**Solution:** Reconciliation automatically clamps `selectedIndex` to the new history length. No manual fix needed.

**Problem:** History item shows file not found, but file exists in Media/.
**Cause:** Path normalization bug; backslashes vs forward slashes.
**Solution:** Check server logs for the path comparison. Use `path.normalize()` on all incoming paths.

---

## References

- `js/services/projectService.js` — Group mutation, saving, basic operations
- `js/managers/projectReconciler.js` — `reconcileAndHydrate()` implementation
- `js/migrations/projectMigrations.js` — migration functions
- `routes/projects.js` — `/migrate-project`, `/load-meta`, `/file-exists`, `/delete-meta` routes
- `docs/versioning.md` — schema versioning and operation registry
