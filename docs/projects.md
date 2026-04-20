# Project System

> **Note:** For complete details on the project data model, see `docs/project-integrity.md`. This document provides a quick reference.

## Project JSON Shape (v1)

```json
{
  "id": "proj-uuid",
  "name": "My Project",
  "folderPath": "C:\\Users\\Fabio\\Documents\\MpiAiSuite\\projects\\my-project",
  "createdAt": "2026-04-15T10:30:00Z",
  "updatedAt": "2026-04-17T14:22:15Z",
  "thumbnail": null,
  "schemaVersion": 1,
  "itemGroups": [
    {
      "id": "group-uuid",
      "type": "image",
      "name": "My Group",
      "createdAt": "2026-04-15T...",
      "selectedIndex": 0,
      "open": true,
      "favourite": false,
      "history": [
        "uuid-1",
        "uuid-2",
        "uuid-3"
      ]
    }
  ],
  "modelSettings": { /* ... */ },
  "toolSettings": { /* ... */ }
}
```

## Key Field: `schemaVersion`

Identifies the structure version of this project. On project open, if this doesn't match `SCHEMA_VERSION` from `appVersion.js`, migrations are run first. See `docs/versioning.md` for the versioning system.

## Key Field: `itemGroups[].history[]`

Array of **UUID strings only** — NOT full item objects. Each UUID corresponds to a `.meta/<uuid>.json` file in the Media folder. This keeps `project.json` small and on-disk format clean.

## `.meta/<uuid>.json` Sidecar Files

Located at `<projectFolder>/Media/.meta/<uuid>.json`. One file per history item. This is the **single source of truth** for all item metadata:

```json
{
  "id": "uuid-1",
  "type": "image",
  "filePath": "/project-file?path=C%3A%5C...%5Ct2i_001.png",
  "operation": "t2i",
  "prompt": "a hamster in the snow",
  "negativePrompt": "",
  "seed": 42,
  "modelId": "sdxl-realistic",
  "createdAt": "2026-04-15T10:35:22.340Z",
  "name": null,
  "uploaded": false,
  "pixelDimensions": { "w": 1024, "h": 1024 }
}
```

See `docs/project-integrity.md` for full details.

## In-Memory State

After loading, `state.currentProject.itemGroups[n].history[m]` is a **full object** with all fields above (not just a UUID). Components never change — they read `.operation`, `.filePath`, `.prompt`, etc. as they always did.

**Important:** Never try to hydrate UUIDs to full objects during runtime. Keep full objects in memory always. Hydration only happens on project load via `reconcileAndHydrate()`.

## Media Folder Structure

```
projects/
  my-project/
    project.json
    Media/
      t2i_001.png
      t2i_002.png
      .meta/
        uuid-1.json
        uuid-2.json
```

## Portability

Projects are self-contained folders. The `folderPath` field points to the project root. This makes projects portable — copy the folder to another machine and it works.

## Project Service (`js/services/projectService.js`)

- `openProject(projectPath)`: Loads project.json, runs migrations, reconciles/hydrates from `.meta/` files, sets `state.currentProject`, fires `project:changed`. *(Note: Initialization logic remains in root/shell helpers or `projectReconciler.js` as appropriate depending on split)*
- `updateGroup(group)`: Centralized way to update paths/favourite status and write to disk.
- Other methods: see `docs/project-integrity.md` for full API.

---

**See:** `docs/project-integrity.md` for the complete project data model, reconciliation rules, and migration system.
