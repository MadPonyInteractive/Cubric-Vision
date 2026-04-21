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
  "folderPath": "C:\\Users\\Fabio\\Documents\\MpiAiSuite\\projects\\my-project",
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

### `.meta/<uuid>.json` Sidecar Files

Located at `<projectFolder>/Media/.meta/<uuid>.json`. One file per history item. Example:

```json
{
  "id": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "type": "image",
  "filePath": "/project-file?path=C%3A%5CUsers%5CFabio%5CDocuments%5CMpiAiSuite%5Cprojects%5Cmy-project%5CMedia%5Ct2i_001.png",
  "operation": "t2i",
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
  }
}
```

**Key fields:**
- **`id`** — UUID matching the entry in `project.json` history. This is the primary key.
- **`filePath`** — Server-relative URL to the actual image/video file. NOT a simple filename — it's a `/project-file?path=...` query string.
- **`type`** — `'image'` or `'video'`.
- **`operation`** — Which operation created this item (e.g., `'t2i'`, `'upscale'`, `'autoMaskImg'`).
- **`uploaded`** — True if this item was imported by the user (not generated). Uploaded items don't have operation metadata.
- All other fields are copied from the generation request or ComfyUI output.

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
  prompt: 'a hamster in the snow',
  negativePrompt: '',
  seed: 42,
  modelId: 'sdxl-realistic',
  createdAt: '2026-04-15T10:35:22.340Z',
  name: null,
  uploaded: false,
  pixelDimensions: { w: 1024, h: 1024 }
}
```

**Components never change.** They read `.operation`, `.filePath`, `.prompt`, etc. from the history item exactly as they do today. No component knows about UUIDs or `.meta/` files.

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
