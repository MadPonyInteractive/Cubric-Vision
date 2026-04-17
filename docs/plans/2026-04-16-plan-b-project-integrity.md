# Plan B: Project Integrity — Migration, Meta Source of Truth & Reconciliation

**Status:** Ready for implementation (after Plan A)
**Created:** 2026-04-16
**Depends on:** Plan A (`SCHEMA_VERSION` from `js/core/appVersion.js`)

---

## Context

Two problems exist today:

**1. Duplicate data.** Every history item in `project.json` stores: `prompt`, `negativePrompt`, `seed`, `modelId`, `operation`, `createdAt`, `filePath`, `pixelDimensions`, etc. The `.meta/<filename>.json` sidecar file stores most of the same data. This is redundant and will diverge over time. On large projects (thousands of images), `project.json` becomes enormous and slow to load.

**2. No reconciliation.** If a user deletes an image file from the filesystem (outside the app), the history entry remains in `project.json` pointing to a non-existent file. There is no cleanup mechanism on project open.

**Solution:**

- `project.json` history arrays contain **only UUIDs** — one ID per history entry, nothing more
- `.meta/<uuid>.json` becomes the **single source of truth** for everything about a generated item: file path, operation, prompts, seed, model, dimensions, timestamps
- On every `openProject()`, the app loads each `.meta/` file by ID and builds the full in-memory objects that all existing components expect — **no component changes required**
- Missing `.meta/` files or missing media files are silently removed from the history during load
- Schema versioning (`schemaVersion`) is stamped on all projects so future migrations have a baseline

---

## Critical Files to Read Before Implementing

| File | Role | Key lines |
|---|---|---|
| `js/managers/projectManager.js` | `openProject()` — migration + reconciliation hooks go here | 57–74 |
| `js/data/projectModel.js` | Item creators, history mutations, `createProject()` | 30–186 |
| `routes/projects.js` | `/create-project`, `/save-generation`, `DELETE /project-media` | 1–566 |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` | Creates history items after generation | 289–349 |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | Group deletion, primary itemGroups consumer | 48, 75, 130–197 |
| `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` | `group.history[selectedIndex]` direct access | 194–227 |
| `js/components/Compounds/MpiHistoryList/MpiHistoryList.js` | Iterates history, reads item fields directly | 57–114 |

---

## Data Model

### `project.json` — history becomes an array of IDs

```json
{
  "id": "proj-uuid",
  "name": "My Project",
  "schemaVersion": 1,
  "itemGroups": [
    {
      "id": "group-uuid",
      "type": "image",
      "name": "Portrait session",
      "createdAt": "2026-04-15T...",
      "selectedIndex": 2,
      "open": true,
      "favourite": false,
      "history": [
        "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
        "a1b2c3d4-...",
        "e5f6g7h8-..."
      ]
    }
  ],
  "modelSettings": { ... },
  "toolSettings": { ... }
}
```

### `.meta/<uuid>.json` — single source of truth for everything

Named by item UUID, not by filename. Lives in `Media/.meta/<uuid>.json`.

```json
{
  "id": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "type": "image",
  "filePath": "/project-file?path=C%3A%5C...%5Ct2i_003.png",
  "operation": "t2i",
  "prompt": "a hamster in the snow",
  "negativePrompt": "",
  "seed": 42,
  "modelId": "sdxl-realistic",
  "createdAt": "2026-04-15T23:46:19.340Z",
  "name": null,
  "uploaded": false,
  "pixelDimensions": { "w": 1024, "h": 1024 }
}
```

### In-memory state — full objects, unchanged from today

Components never change. `state.currentProject.itemGroups[n].history` is still an array of full objects in memory — assembled from `.meta/` files on project load:

```javascript
// In memory only (not persisted to project.json):
{
  id: "6e409682-...",
  type: "image",
  filePath: "/project-file?path=...",
  operation: "t2i",
  prompt: "a hamster in the snow",
  negativePrompt: "",
  seed: 42,
  modelId: "sdxl-realistic",
  createdAt: "2026-04-15T...",
  name: null,
  uploaded: false,
  pixelDimensions: { w: 1024, h: 1024 }
}
```

---

## Reconciliation Rules (on project open)

| Condition | Action |
|---|---|
| ID in history + `.meta/<id>.json` exists + `filePath` media file exists | Load, hydrate, keep |
| ID in history + `.meta/<id>.json` missing | Remove ID from history, no media to delete |
| ID in history + `.meta/<id>.json` exists + media file missing | Remove ID from history, delete orphaned `.meta/` file |
| `uploaded: true` item — no `.meta/` by design | Load from legacy inline data if present (see migration note below) |
| Group becomes empty after reconciliation | Remove the group entirely |

All removals are silent. `selectedIndex` is clamped to the new history length after cleanup.

---

## Step 1: Rename `.meta/` files from filename-based to UUID-based

**Current naming:** `Media/.meta/t2i_003.png.json` (keyed by filename)
**New naming:** `Media/.meta/6e409682-8b95-4ff7-aa77-e24e7656cbf8.json` (keyed by item UUID)

This change is made in the write path (Step 2) going forward. Existing filename-based sidecars are handled by the legacy migration in Step 6.

---

## Step 2: Update `/save-generation` in `routes/projects.js`

**Route:** `POST /project/save-generation` (~line 497)

The client now generates the item UUID before calling this route and passes it in the request body. The route writes the `.meta/` file named by UUID.

```javascript
// Request body now includes: itemId (UUID), operation, meta { prompt, negativePrompt, seed, modelId }, filePath
const metaContent = {
  id: req.body.itemId,
  type: req.body.type ?? 'image',
  filePath: `/project-file?path=${encodeURIComponent(savedAbsPath)}`,
  operation: req.body.operation,
  prompt: req.body.meta.prompt ?? '',
  negativePrompt: req.body.meta.negativePrompt ?? '',
  seed: req.body.meta.seed ?? -1,
  modelId: req.body.meta.modelId ?? null,
  createdAt: new Date().toISOString(),
  name: null,
  uploaded: false,
  pixelDimensions: req.body.pixelDimensions ?? { w: 0, h: 0 },
};

const metaDir = path.join(mediaDir, '.meta');
fs.mkdirSync(metaDir, { recursive: true });
const metaPath = path.join(metaDir, `${req.body.itemId}.json`);
fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2));
```

Response returns `{ success, itemId, filePath }` — client uses `itemId` to append to history array.

---

## Step 3: Update history item creation in `MpiGroupHistoryBlock.js`

**File:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` (~line 289)

Generate UUID before the `save-generation` call. After it returns, append just the UUID to history (for persistence). Keep the full object in memory for immediate UI update.

```javascript
const itemId = crypto.randomUUID(); // Generated before the request

// Pass itemId to save-generation route
const data = await fetch('/project/save-generation', {
  method: 'POST',
  body: JSON.stringify({ itemId, operation, type: 'image', meta: { prompt, negativePrompt, seed, modelId }, pixelDimensions }),
});

// Full object for immediate in-memory use (never written to project.json):
const fullItem = {
  id: itemId,
  type: 'image',
  filePath: data.filePath,
  operation,
  prompt,
  negativePrompt,
  seed,
  modelId,
  createdAt: new Date().toISOString(),
  name: null,
  uploaded: false,
  pixelDimensions: { w: 0, h: 0 },
};

// Append full object to in-memory group for immediate rendering
_group = appendToHistory(_group, fullItem);

// Persist: only UUID goes to project.json
_persistGroup(); // _group.history in state = full objects; serialized = UUID strings
```

`_persistGroup()` must serialize `group.history` as an array of ID strings when writing to disk. See Step 5.

---

## Step 4: Update `_persistGroup()` serialization

**File:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`

When calling `/update-project`, serialize history as ID arrays:

```javascript
function _persistGroup() {
  const toSave = {
    ...state.currentProject,
    itemGroups: state.currentProject.itemGroups.map(g => ({
      ...g,
      history: g.history.map(item => item.id ?? item), // full object → UUID string
    })),
  };
  fetch('/update-project', { method: 'POST', body: JSON.stringify({ folderPath, updates: { itemGroups: toSave.itemGroups } }) });
}
```

Same pattern applies in `MpiGalleryBlock.js` wherever `_persistGroups()` is called.

---

## Step 5: Update `projectModel.js`

**File:** `js/data/projectModel.js`

**5a.** `appendToHistory()` still works with full objects in memory — no change needed.

**5b.** `removeHistoryEntry()` still works by index in memory — no change needed.

**5c.** Add `schemaVersion` to `createProject()`:

```javascript
import { SCHEMA_VERSION } from '../core/appVersion.js';

export function createProject(name, folderPath) {
  return {
    id: crypto.randomUUID(),
    name,
    folderPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    itemGroups: [],
    modelSettings: {},
    toolSettings: {},
    tutorialSeen: false,
  };
}
```

**5d.** `createImageItem()` and `createVideoItem()` remain unchanged — they still produce full objects. They are used only for in-memory construction, never persisted directly.

---

## Step 6: Update `routes/projects.js` — `/create-project`

Add `schemaVersion: 1` to the server-side initial project object:

```javascript
const project = {
  id: uuid(),
  name: req.body.name,
  folderPath: projectPath,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  schemaVersion: 1,
  itemGroups: [],
  modelSettings: {},
  toolSettings: {},
  tutorialSeen: false,
};
```

---

## Step 7: Add server routes for reconciliation

Two new lightweight routes in `routes/projects.js`:

**`GET /file-exists`** — checks if an absolute path exists on disk:
```javascript
router.get('/file-exists', (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.json({ exists: false });
  res.json({ exists: fs.existsSync(filePath) });
});
```

**`GET /load-meta`** — loads a `.meta/<uuid>.json` file by media absolute path:
```javascript
router.get('/load-meta', (req, res) => {
  const { id, folderPath } = req.query;
  if (!id || !folderPath) return res.status(400).json({ error: 'Missing params' });

  const metaPath = path.join(folderPath, 'Media', '.meta', `${id}.json`);
  if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Not found' });

  try {
    res.json(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
  } catch {
    res.status(500).json({ error: 'Parse error' });
  }
});
```

**`DELETE /project-media`** (existing route, ~line 242) — already deletes `.meta/<filename>.json`. Update to also delete `Media/.meta/<uuid>.json` using the item ID passed in the request. Both naming schemes must be cleaned up during the transition period.

---

## Step 8: Create `js/migrations/projectMigrations.js`

New file. Migration runner with empty migrations map. The first real migration (`v0 → v1`) handles legacy projects: it converts inline history objects to ID arrays, writes `.meta/<uuid>.json` files for any items that don't already have one, and removes the inline fields from `project.json`.

```javascript
// js/migrations/projectMigrations.js
import { SCHEMA_VERSION } from '../core/appVersion.js';

const MIGRATIONS = {
  /**
   * v0 → v1: Convert inline history objects to UUID-only arrays.
   * Writes .meta/<uuid>.json for any legacy inline items.
   * Called server-side as part of openProject flow.
   */
  0: async (project, folderPath) => {
    const mediaMetaDir = path.join(folderPath, 'Media', '.meta');
    fs.mkdirSync(mediaMetaDir, { recursive: true });

    const migratedGroups = project.itemGroups.map(group => {
      const migratedHistory = group.history.map(item => {
        if (typeof item === 'string') return item; // Already an ID

        // Write .meta/<uuid>.json for legacy inline item
        const metaPath = path.join(mediaMetaDir, `${item.id}.json`);
        if (!fs.existsSync(metaPath)) {
          fs.writeFileSync(metaPath, JSON.stringify(item, null, 2));
        }
        return item.id; // Replace object with ID
      });
      return { ...group, history: migratedHistory };
    });

    return { ...project, itemGroups: migratedGroups, schemaVersion: 1 };
  },
};

export async function migrateProject(project, folderPath) {
  const fromVersion = project.schemaVersion ?? 0;
  if (fromVersion >= SCHEMA_VERSION) return project;

  let migrated = { ...project };
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) {
      migrated = await MIGRATIONS[v](migrated, folderPath);
    } else {
      migrated = { ...migrated, schemaVersion: v + 1 };
    }
  }
  return migrated;
}
```

Note: this migration runs server-side (Node.js), so it can use `fs` directly.

---

## Step 9: Create `js/managers/projectReconciler.js`

New file. Loads `.meta/<uuid>.json` for each ID in history. Drops IDs where the meta file or media file is missing. Returns fully hydrated project ready for state.

```javascript
// js/managers/projectReconciler.js

export async function reconcileAndHydrate(project) {
  let wasModified = false;
  const hydratedGroups = [];

  for (const group of (project.itemGroups ?? [])) {
    const hydratedHistory = [];

    for (const id of (group.history ?? [])) {
      // Load .meta/<uuid>.json from server
      const meta = await fetchMeta(id, project.folderPath);
      if (!meta) {
        wasModified = true;
        continue; // Meta missing — drop this entry
      }

      // Check media file still exists on disk
      const mediaExists = await checkFileExists(meta.filePath);
      if (!mediaExists) {
        await deleteMeta(id, project.folderPath); // Clean up orphaned meta
        wasModified = true;
        continue;
      }

      hydratedHistory.push(meta); // Full object in memory
    }

    if (hydratedHistory.length === 0) {
      wasModified = true;
      continue; // Drop empty group
    }

    hydratedGroups.push({
      ...group,
      history: hydratedHistory,
      selectedIndex: Math.min(group.selectedIndex, hydratedHistory.length - 1),
    });
  }

  return {
    project: { ...project, itemGroups: hydratedGroups },
    wasModified,
  };
}

async function fetchMeta(id, folderPath) {
  try {
    const res = await fetch(`/load-meta?id=${encodeURIComponent(id)}&folderPath=${encodeURIComponent(folderPath)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function checkFileExists(filePath) {
  try {
    const absPath = filePath?.match(/[?&]path=([^&]+)/)?.[1];
    if (!absPath) return false;
    const res = await fetch(`/file-exists?path=${encodeURIComponent(decodeURIComponent(absPath))}`);
    return (await res.json()).exists === true;
  } catch { return false; }
}

async function deleteMeta(id, folderPath) {
  await fetch(`/delete-meta?id=${encodeURIComponent(id)}&folderPath=${encodeURIComponent(folderPath)}`, { method: 'DELETE' });
}
```

Add `DELETE /delete-meta` route to `routes/projects.js` alongside the other two new routes.

---

## Step 10: Hook into `projectManager.js`

**File:** `js/managers/projectManager.js`

`openProject()` becomes `async`. The migration runs server-side first (via a route), then reconciliation runs client-side.

```javascript
import { reconcileAndHydrate } from './projectReconciler.js';

export async function openProject(project) {
  // 1. Run server-side migration (schema upgrade + legacy inline → ID conversion)
  const migratedRes = await fetch('/migrate-project', {
    method: 'POST',
    body: JSON.stringify({ folderPath: project.folderPath }),
  });
  const migrated = await migratedRes.json(); // Returns migrated project object

  // 2. Reconcile: load .meta/ files, drop broken entries, hydrate full objects
  const { project: reconciled, wasModified } = await reconcileAndHydrate(migrated);

  // 3. Persist slim project.json if reconciliation removed entries
  if (wasModified) {
    await updateProject(reconciled.folderPath, {
      itemGroups: reconciled.itemGroups.map(g => ({
        ...g,
        history: g.history.map(item => item.id), // Full objects → UUID strings for disk
      })),
    });
  }

  // 4. Load fully hydrated project into state — history = full objects
  state.currentProject = reconciled;
  localStorage.setItem('mpi_last_project', reconciled.folderPath);
  Events.emit('project:changed', { project: reconciled });
  navigate(PAGE_GALLERY);
}
```

Add `POST /migrate-project` route to `routes/projects.js` — reads `project.json`, runs `migrateProject()`, writes updated `project.json`, returns updated project object.

Check all callers of `openProject()` (currently `projectUI.js` card click handlers) — wrap in `await` or handle the returned promise.

---

## Step 11: Verify `.meta/` deletion on app-side history item delete

The existing `DELETE /project-media` route (~line 242) deletes `Media/.meta/<filename>.json` (filename-based). Update it to also delete `Media/.meta/<uuid>.json` when an item UUID is passed. Accept optional `itemId` in the request body.

`MpiGroupHistoryBlock.js` removes individual history entries — verify it calls the delete route (not just removes the entry from state). If it only removes from state, add the delete route call.

---

## Implementation Steps (in order)

- [ ] Confirm Plan A is in place (`js/core/appVersion.js` exists with `SCHEMA_VERSION = 1`)
- [ ] Add `schemaVersion: 1` to `/create-project` route in `routes/projects.js`
- [ ] Update `/save-generation` to write `.meta/<uuid>.json` (named by itemId, full schema)
- [ ] Add `GET /file-exists` route
- [ ] Add `GET /load-meta` route (by id + folderPath)
- [ ] Add `DELETE /delete-meta` route
- [ ] Add `POST /migrate-project` route (reads project.json, runs migration, writes back, returns result)
- [ ] Create `js/migrations/projectMigrations.js` with v0→v1 migration
- [ ] Create `js/managers/projectReconciler.js`
- [ ] Update `projectModel.js` — add `schemaVersion` to `createProject()`
- [ ] Update `js/managers/projectManager.js` — `openProject()` becomes async, calls migrate route + reconcileAndHydrate
- [ ] Update `MpiGroupHistoryBlock.js` — generate UUID before save-generation, append UUID to history for persistence, keep full object in memory for state
- [ ] Update `_persistGroup()` / `_persistGroups()` serialization — history → UUID string arrays on disk write
- [ ] Update `DELETE /project-media` to also delete `Media/.meta/<uuid>.json` when itemId provided
- [ ] Update all callers of `openProject()` to handle async
- [ ] Verify individual history entry deletion in `MpiGroupHistoryBlock.js` calls delete route

---

## Verification

1. **New project:** `project.json` has `schemaVersion: 1`; new history entries are UUID strings
2. **Generate image:** `.meta/<uuid>.json` written with all fields; `project.json` history array gains one UUID string
3. **Reopen project:** All history items display correctly — full objects in state assembled from `.meta/` files
4. **Filesystem delete:** Delete a PNG manually → reopen project → entry gone, no broken images shown
5. **Legacy project (old schema):** Open existing project with inline history objects → migration writes `.meta/<uuid>.json` for each, rewrites history as UUID arrays, stamps `schemaVersion: 1`
6. **App delete (single item):** Delete one entry from history → file deleted, `.meta/<uuid>.json` deleted, UUID removed from history array in project.json
7. **App delete (whole group):** Delete group → all files, all `.meta/` sidecars, entire group removed from project.json
8. **Empty group after filesystem delete:** Delete all PNGs in a group → reopen → group is gone entirely

---

## Risk Notes

- `openProject()` becoming async — check every call site, especially `projectUI.js` card click handlers
- During persistence, `group.history` in state is an array of full objects; on disk it must be UUID strings only — the serialization step in `_persistGroup()` is the critical conversion point
- The v0→v1 migration writes `.meta/` files for legacy items. If an item has no meta file and cannot be written (permissions, missing fields), log and skip rather than crash
- `uploaded: true` items have no generation metadata (prompt, seed, etc.) — their `.meta/` files still get written with whatever fields are available; missing fields default to null

---

## Implementation Deviations & Lessons Learned

### 1. Windows Path Normalization (routes/projects.js)

**Issue:** Client sends `folderPath` with forward slashes (e.g., "C:/AI/..."), but `path.join()` on Windows doesn't normalize these, causing `fs.readdir()` to return empty arrays even when files exist.

**Fix:** Added `path.normalize()` to convert forward slashes to backslashes on Windows:

```javascript
// routes/projects.js line 521, 743
const normalizedFolderPath = path.normalize(folderPath);
```

This ensures consistent path handling across Windows/Linux/macOS.

### 2. Meta File GC Bug — UUID-Based Sidecars Were Being Deleted

**Issue:** Meta files were created successfully but immediately deleted by the garbage collection logic.

**Root Cause:** The GC checked if a file named `<UUID>` existed in the Media directory:
```javascript
const mediaPath = path.join(mediaDir, baseName); // UUID as filename!
if (!(await fs.pathExists(mediaPath))) {
    await fs.remove(metaFilePath); // Deleted because UUID != actual filename
}
```

Since actual media files are named `t2i_001.png`, not the UUID, this check always failed and newly-created meta files were deleted.

**Fix:** GC now reads the meta file to get the actual `filePath` and checks if that file exists:
```javascript
const metaContent = await fs.readJson(metaFilePath);
if (metaContent.filePath) {
    const match = metaContent.filePath.match(/path=(.+)$/);
    if (match) mediaPath = decodeURIComponent(match[1]);
}
```

Also skip GC for the UUID that was just created in the same request.

### 3. In-Memory State vs Disk Persistence — The Critical Realization

**Issue:** Multiple consecutive generations caused empty cards. Navigating away and back caused empty cards. Hydration patches were tried and didn't work.

**Root Cause:** The architecture mixed in-memory representation with serialized format:
- `state.currentProject.itemGroups` stored UUID strings (for disk)
- `grid` display required full items with `filePath`
- When state changed, full items were lost and only UUIDs remained

**Wrong Approach Tried:** Various hydration patches that tried to convert UUIDs → full items on navigation or state change. This was complex, bug-prone, and fundamentally wrong.

**Correct Fix:** Keep **full item objects** in `state.currentProject.itemGroups` during the session. Only convert to UUIDs when persisting to disk:

```javascript
// MpiGalleryBlock.js - generation handler
group = { ...group, history: [...group.history, item] }; // Full item in memory!

// _persistGroups() converts for disk:
history: g.history.map(item => (typeof item === 'string' ? item : item.id))
```

This is simple, correct, and requires no hydration anywhere.

### 4. MpiGroupHistoryBlock Async Hydration (for edge case)

**When needed:** If user navigates to groupHistory before `reconcileAndHydrate()` runs on project open.

**Implementation:** Added `_hydrateGroupHistory()` function that fetches meta files for UUID strings:

```javascript
async function _hydrateGroupHistory(group, folderPath) {
    // Fetch meta files for UUID strings, return group with full items
}
```

Called after component mount, updates components via `setGroups()` and `loadEntry()`.

### 5. Console.log Cleanup

Removed debug `console.log` statements from:
- `js/managers/hotkeyManager.js`
- `js/managers/overlayManager.js`
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
- `js/shell/windowControls.js`
- `js/components/shaderBackground.js`

---

## Summary of Changes Made

| File | Change |
|------|--------|
| `routes/projects.js` | Added `path.normalize()` for Windows; Fixed GC to read meta file for actual media path |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | Keep full items in memory; `_persistGroups()` serializes to UUIDs |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` | Added `_hydrateGroupHistory()` for async hydration |
| `js/managers/hotkeyManager.js` | Removed debug console.log |
| `js/managers/overlayManager.js` | Removed debug console.log |
| `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` | Removed debug console.log |
| `js/shell/windowControls.js` | Removed debug console.log |
| `js/components/shaderBackground.js` | Removed debug console.log |
