# Plan — Drag-and-drop project import on landing page

**Tracker:** `tsk_mo3h9h3xonrkxg` — Allow drag and drop of project JSON files and project folders onto the project page.

## Context

Today users open existing projects only via `+ New Project` + folder picker, or by clicking cards generated from `DEFAULT_PROJECTS_ROOT` + extra paths in localStorage. A user who already has a project folder on disk (from another machine, a backup, or a shared location) must first add its parent directory via settings or create a new project then overwrite — there is no direct path.

Goal: dropping either a `project.json` file OR a project folder (folder containing `project.json`) onto the landing page should:
1. Validate it's a real project (has `project.json` with expected shape).
2. Register its parent directory into the extra project paths list.
3. Re-render the grid so a card appears for it.
4. Do **not** auto-open — user sees the new card and clicks to open (matches existing "click to open" pattern).

Reuse the existing `MpiMediaDropOverlay` primitive as requested.

## Key findings from exploration

- Landing page grid container: `#projectGrid` in `index.html:77`; populated in `js/shell/projectUI.js:108` (`loadProjectGrid()`).
- Project-open flow: `openProject(project)` in `js/services/projectService.js:175` — handles migration, reconciliation, state load.
- Extra project paths lives in `localStorage` via `Storage.getExtraProjectPaths()` / `setExtraProjectPaths()` — `js/core/storage.js:40-41`. Backend `/list-projects` merges `DEFAULT_PROJECTS_ROOT` + `extraPaths` — `routes/projects.js:80-118`.
- Drop precedent: `MpiGalleryBlock.js:58-77` mounts `MpiMediaDropOverlay`, uses drag-counter + `_isFileDrag` gate on window listeners. We mirror that pattern for landing page.
- Electron config (`main.js:92-94`): `nodeIntegration: true`, `contextIsolation: false` → renderer can `require('electron').webUtils` for reliable dropped-file absolute paths.
- `MpiMediaDropOverlay.js:49-57` currently only accepts a single file and filters by MIME (`image/*` or `video/*`). For projects we need: directory entries **or** JSON files. Two options — see Design.

## Design

### 1. New Primitive: `MpiProjectDropOverlay`

Rationale: `MpiMediaDropOverlay` is tightly coded to media MIME types and single-file. Forking behavior into props would bloat the primitive and break the "dumb primitive" contract. Create a sibling primitive with identical show/hide/overlay-visual conventions but project-specific validation. Reuse styling by extending the existing CSS class or sharing tokens.

Path: `js/components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.js` + `.css`.

Props:
- `onDrop({ folderPath, source })` — called with absolute folder path after validation. `source: 'folder' | 'json'`.
- Message text: "Drop a project folder or project.json to add".

Drop handler resolves input → folder path:
- **Folder drop:** `e.dataTransfer.items[0].webkitGetAsEntry()` returns `FileSystemDirectoryEntry` with `isDirectory === true`. Absolute path comes from `webUtils.getPathForFile(e.dataTransfer.files[0])` (Electron 41 API, works on both files and directories dropped from OS).
- **File drop (****`project.json`****):** `webUtils.getPathForFile(file)` → strip `/project.json` suffix to get folder.
- Reject anything else silently (still hide overlay).

Use `require('electron').webUtils.getPathForFile` (safe because `nodeIntegration: true`).

### 2. Landing-page wiring in `js/shell/projectUI.js`

Mount overlay in `initProjectUI()`:
```js
const dropOverlay = MpiProjectDropOverlay.mount(document.createElement('div'), {
    onDrop: async ({ folderPath }) => { await handleProjectDrop(folderPath); }
});
document.getElementById('page-landing').appendChild(dropOverlay.el);
```

Drag tracking (mirror `MpiGalleryBlock.js:78-100` pattern):
- `let _dragCounter = 0;`
- `const _isFileDrag = (e) => e.dataTransfer?.types?.includes('Files');`
- Window listeners: `dragenter` → show, `dragleave` → hide when counter hits 0, `drop` → hide.
- Only active while on `PAGE_LANDING` — gate via `state.currentPage` check, OR register in `initProjectUI` (landing is the entry screen, overlay DOM lives inside `#page-landing` which navigation hides/shows). Cleanest: listen on `````#page````-landing` element, not window, since that div has `display:none` on other pages.

Store unsubs on a module-level array; call on teardown (though `initProjectUI` runs once at boot, so no teardown needed — document the assumption in a comment).

### 3. New backend route: `POST /validate-project`

Add to `routes/projects.js` (pattern mirrors `/get-project`, `routes/projects.js:134-141`):

```js
router.post('/validate-project', async (req, res) => {
    const { folderPath } = req.body;
    try {
        const jsonPath = path.join(folderPath, 'project.json');
        if (!(await fs.pathExists(jsonPath))) {
            return res.json({ success: false, error: 'No project.json found in folder' });
        }
        const project = await fs.readJson(jsonPath);
        if (!project.id || !project.name) {
            return res.json({ success: false, error: 'Invalid project.json (missing id/name)' });
        }
        res.json({ success: true, project });
    } catch (err) {
        logger.error('project', 'validate-project error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});
```

Why not reuse `/get-project`? — it crashes on missing file; we want a graceful `{success:false}` for UX feedback. Keep `/get-project` untouched.

### 4. New service function: `addProjectByFolder(folderPath)` in `js/services/projectService.js`

```js
export async function addProjectByFolder(folderPath) {
    const normalized = folderPath.replace(/\\/g, '/');
    const res = await post('/validate-project', { folderPath: normalized });
    if (!res.success) throw new Error(res.error);

    const parentDir = normalized.split('/').slice(0, -1).join('/');
    const extras = Storage.getExtraProjectPaths();
    if (!extras.includes(parentDir)) {
        extras.push(parentDir);
        Storage.setExtraProjectPaths(extras);
    }
    return res.project;
}
```

Does NOT call `openProject()` — drop = add to grid, click = open. Preserves existing mental model.

### 5. `handleProjectDrop` orchestrator in `projectUI.js`

```js
async function handleProjectDrop(folderPath) {
    try {
        const project = await addProjectByFolder(folderPath);
        await loadProjectGrid();           // refresh — new card appears
        Events.emit('ui:toast', { message: `Added "${project.name}"`, type: 'success' });
    } catch (err) {
        clientLogger.error('projectUI', 'drop import failed', err);
        Events.emit('ui:error', { title: 'Could not import project', message: err.message });
    }
}
```

Check that `ui:toast` is a real event — if not, fall back to `ui:error` only on failure and silent success (new card is the visual confirmation). Grep during implementation to confirm.

## Files to modify / create

**Create:**
- `js/components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.js`
- `js/components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.css`

**Modify:**
- `js/shell/projectUI.js` — mount overlay + wiring + `handleProjectDrop`
- `js/services/projectService.js` — add `addProjectByFolder`
- `js/shell/preloadStyles.js` — register new CSS path (mandatory per components.md rule #1)
- `js/components/types.js` — document `MpiProjectDropOverlayProps` (mandatory per components.md rule #2)
- `routes/projects.js` — add `/validate-project` route

**Check (no modify expected):**
- `js/pages/components.js` — ask user whether to add new primitive to the gallery (components.md rule #4).

## Reused utilities / patterns

- `MpiMediaDropOverlay` pattern → copy show/hide + dragover-preventDefault shape (not the module itself).
- `MpiGalleryBlock` drag-counter + `_isFileDrag` → copy pattern to `projectUI.js`.
- `Storage.getExtraProjectPaths` / `setExtraProjectPaths` → `js/core/storage.js:40-41`.
- `post()` helper → reuse `projectService.js:26`.
- `clientLogger` → `js/services/clientLogger.js`.
- `Events.on('ui:close-all-popups')` → overlay must self-close, per primitives convention.

## Verification

1. **Start the app:** `npm run electron` (or current dev command). Watch `logs/app.log` tail via `Read` offset.
2. **Happy paths:**
  - Drag a valid project folder from File Explorer onto the landing page → overlay shows on dragenter, hides on drop, new card appears in grid. Click it → opens normally.
  - Drag just the `project.json` file → same result.
3. **Edge cases:**
  - Drop a random folder without `project.json` → no card added, error toast/log shows "No project.json found".
  - Drop an image file → silently ignored (not a project).
  - Drop while already on gallery page → landing overlay must not fire (page-landing is hidden).
  - Drop a folder already known → parent dir de-duped; card still re-renders correctly.
4. **Regression:** existing `MpiGalleryBlock` media drop on gallery page still works (no window-listener collision with landing overlay — landing is unmounted at that point).
5. **Browser dev mode** (`http://127.0.0.1:3000`): `webUtils` not available — detect and show a "drop only works in desktop app" error, OR guard the feature entirely. Decide during implementation — cleanest is feature-detect `window.require` and skip overlay mount in browser.

## Resolved decisions

- **Drop action:** Add card only — do NOT auto-open. User clicks the new card as usual.
- **Browser mode:** Feature-detect `window.require`. If absent (plain browser at `127.0.0.1:3000`), do NOT mount the overlay at all. Desktop/Electron only.
- **Gallery:** Skip adding `MpiProjectDropOverlay` to `js/pages/components.js` — only meaningful on the landing page.
