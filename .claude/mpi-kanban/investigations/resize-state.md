# Resize tool — State/Persistence findings

## 1. getToolSettings / setToolSettings current impl

**File:** `js/data/projectModel.js` (lines 366–388)

```js
export function getToolSettings(project, toolKey) {
    return (project.toolSettings ?? {})[toolKey] ?? { upscaleModel: null };
}

export function setToolSettings(project, toolKey, updates) {
    const current = getToolSettings(project, toolKey);
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        toolSettings: {
            ...project.toolSettings,
            [toolKey]: { ...current, ...updates },
        },
    };
}
```

**Current default:** hardcoded `{ upscaleModel: null }` as fallback.

**Plan requirement:** generalize signature to `getToolSettings(project, toolKey, defaults)` where `defaults` is optional, and existing code passes `defaults || { upscaleModel: null }` to stay backward-compatible.

## 2. Callers + signature impact

**Callers found:**

1. **`js/services/commandExecutor.js:246`** — reads tool settings for upscale model injection
   ```js
   const settings = getToolSettings(project, payload.operation);
   if (settings.upscaleModel) params['Upscale_Model'] = settings.upscaleModel;
   ```
   - **Green:** only accesses `upscaleModel`, so signature remains compatible with optional `defaults` arg

2. **`js/components/Compounds/MpiModelSettings/MpiModelSettings.js:415`** — reads tool settings for dropdown display
   ```js
   const settings = getToolSettings(state.currentProject, ctx.toolKey);
   _mountUpscaleDropdown(_depToFilename(settings.upscaleModel) || _depToFilename('4x-NMKD-Siax'), null);
   ```
   - **Green:** accesses only `upscaleModel`; no impact from signature change

3. **`js/services/projectService.js:103,138`** — initializes tool settings on demand
   ```js
   const defaults = getToolSettings(state.currentProject, toolKey);
   state.currentProject = {
       ...state.currentProject,
       updatedAt: new Date().toISOString(),
       toolSettings: { ...state.currentProject.toolSettings, [toolKey]: defaults },
   };
   ```
   - **Green:** uses return value as defaults; backward-compatible when signature adds optional param

4. **`js/services/projectService.js:111`** — applies queued updates
   ```js
   state.currentProject = setToolSettings(state.currentProject, toolKey, { [k]: v });
   ```
   - **Green:** passes updates object; no change needed

**Verdict:** All callers remain green. New Resize tool will pass `defaults` param; existing code ignores it.

## 3. state.currentProject replace pattern

**File:** `js/state.js` (lines 87–100)

```js
export const state = new Proxy(_state, {
    set(target, key, value) {
        target[key] = value;
        if (_batching) {
            _batchQueue.set(key, value);
        } else {
            Events.emit('state:changed', { key, value });
        }
        return true;
    },
});
```

**Real example:** `js/services/projectService.js:111` (line 111)

```js
state.currentProject = setToolSettings(state.currentProject, toolKey, { [k]: v });
```

**Pattern:** Every mutation creates a new top-level project object. Sub-objects (modelSettings, toolSettings) are shallow-merged via spread operator. Rule from CLAUDE.md: "Never mutate `state` sub-objects directly. Always replace `state.currentProject = { ...state.currentProject, toolSettings: {...} }`." The setToolSettings/setModelSettings functions enforce this pattern.

**Trigger:** Proxy set handler fires `state:changed` event, driving all dependent UI re-renders.

## 4. updateProjectJson signature + caller

**File:** `routes/projects.js` (lines 45–65)

```js
function updateProjectJson(jsonPath, updater) {
    const key = path.resolve(jsonPath).toLowerCase();
    const previous = projectJsonQueues.get(key) || Promise.resolve();

    const next = previous
        .catch(() => {})
        .then(async () => {
            const project = await fs.readJson(jsonPath);
            const updated = await updater(project);
            await writeJsonAtomic(jsonPath, updated);
            return updated;
        })
        .finally(() => {
            if (projectJsonQueues.get(key) === next) {
                projectJsonQueues.delete(key);
            }
        });

    projectJsonQueues.set(key, next);
    return next;
}
```

**Caller example:** `routes/projects.js:230` (inside `/update-project-settings` route)

```js
await updateProjectJson(jsonPath, project => ({
    ...project,
    ...updates,
    updatedAt: new Date().toISOString(),
}));
```

**Pattern:** Per-file queue + atomic temp-file write. Serializes concurrent writes (no corruption on parallel `/update-project` calls). Updater is a pure function: `(project: Project) => Project`.

## 5. Frontend → backend write path

**Trace for toolSettings change:**

1. **UI control change** → emit `Events.emit('settings:tool:update', { toolKey, key, value })`
   - File: `js/components/Compounds/MpiModelSettings/MpiModelSettings.js:140` (example)

2. **projectService queues** → `_enqueueToolUpdate(toolKey, key, value)` 
   - File: `js/services/projectService.js:149–150`
   - Debounces 300ms per toolKey

3. **On timer** → `state.currentProject = setToolSettings(state.currentProject, toolKey, { [k]: v })`
   - File: `js/services/projectService.js:111`
   - Triggers Proxy → `state:changed` event

4. **Disk write** → `saveProjectSettings()` → `_debouncedSaveProjectSettings()` → POST `/update-project-settings`
   - File: `js/services/projectService.js:259–260` and 37–48
   - Backend debounce: 500ms (global, batches all model/tool updates into one POST)

5. **Server route** → `routes/projects.js:226–235`
   ```js
   router.post('/update-project-settings', async (req, res) => {
       const { folderPath, updates } = req.body;
       const jsonPath = path.join(folderPath, 'project.json');
       await updateProjectJson(jsonPath, project => ({
           ...project,
           ...updates,
           updatedAt: new Date().toISOString(),
       }));
       res.json({ success: true });
   });
   ```

6. **Atomic write** → `updateProjectJson` queues and writes via temp-file rename

**Key:** Two-tier debounce (frontend 300ms per-tool + backend 500ms global) batches rapid changes; atomic queue prevents interleave corruption.

## 6. Schema doc location

**Files:**

- `docs/project-integrity.md` (line 57) — top-level schema listing; brief mention
- `docs/data.md` (line 33) — project JSON structure; lists toolSettings field
- `docs/shell.md` (lines 125–137) — detailed settings pipeline; explains `settings:tool:select` and `settings:tool:update` events; notes per-tool queue behavior

**Coverage:** No detailed schema for toolSettings structure. Currently only documents `{ upscaleModel: string|null }`. Resize will add width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, flip, rotation. **Schema doc needs update entry** for Phase 5 ("Docs + rules sync").

## 7. save-generation + replaceItemId

**Route signature:** `routes/projects.js:706` (POST `/project/save-generation`)

```js
router.post('/project/save-generation', async (req, res) => {
    const { 
        folderPath, comfyViewUrl, itemId, operation = 'generated', 
        meta = {}, generationMs, pixelDimensions, mediaType, stage, 
        frozenParams, loraSnapshot, replaceItemId  
    } = req.body;
```

**replaceItemId behavior** (lines 716–869):

- When set, forces new sidecar id to that uuid (reuses `<uuid>.json`)
- Stamps `stage: 'final'` (line 844)
- Omits frozenParams + loraSnapshot (line 845)
- Deletes previous media file (lines 856–869)
- Deletes previous thumb if any (line 862–867)
- History slot in project.json unchanged (uuid reuse)

**Memory file quote** (`feedback_sidecar_replace_in_place.md`):

> `POST /project/save-generation` accepts an optional `replaceItemId`. When set, the route forces the new sidecar id to that uuid (overwriting `<uuid>.json`), stamps `stage: 'final'`, drops `frozenParams` / `loraSnapshot`, then deletes the previous media file (and `<uuid>.thumb.jpg` if any) once the new file is committed. The history slot in `project.json` is unchanged because the uuid is reused.
>
> **Why:** Multi-stage video preview-gate Continue flow needs to "swap" the preview clip with the final clip while keeping the same gallery card position and item id. Built on existing save-generation route to keep one write path; no new endpoint.
>
> **How to apply:** Reuse for any future flow that supersedes a history item in place (e.g. detailer redo, regenerate-with-tweak, future "lock this seed and try again" UX).

**For Resize tool Phase 3:** Apply pattern identically — preview round-trip reuses same uuid via replaceItemId, final Apply commits with replaceItemId to drop preview marker.

## Key files for this phase

- `js/data/projectModel.js:366–388` — getToolSettings/setToolSettings impl
- `js/services/projectService.js` — full settings queue + disk write pipeline
- `js/state.js:87–100` — state Proxy + replace pattern
- `routes/projects.js:45–65` — updateProjectJson atomic queue
- `routes/projects.js:226–235` — /update-project-settings route
- `routes/projects.js:706–936` — /project/save-generation route
- `docs/shell.md:125–137` — settings pipeline documented
- `docs/project-integrity.md` — schema overview (needs Phase 5 update)
