# Resize tool — commandRegistry/Executor/Injection findings

## 1. commandRegistry universal op shape

**File:** `js/data/commandRegistry.js:185–216`

Template from existing `videoUpscale` universal op:

```js
videoUpscale: {
    label: 'Video Upscale',
    mediaType: MEDIA_TYPE.VIDEO,
    requiresImages: 0,
    requiresVideo: 1,
    mediaInputs: [
        { key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true },
    ],
    promptRequired: false,
    universal: true,        // ← required field; triggers universal workflow lookup
    // components: [],      // ← optional, not used by current universal ops
},
```

For `resize` (image):
- `mediaType: MEDIA_TYPE.IMAGE`
- `requiresImages: 1`
- `mediaInputs: [{ key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true }]`
- `promptRequired: false`
- `universal: true`

For `resizeVideo` (video):
- `mediaType: MEDIA_TYPE.VIDEO`
- `requiresVideo: 1`
- `mediaInputs: [{ key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true }]`
- `promptRequired: false`
- `universal: true`

**Fields in CommandDef:**
- `label` — display name
- `mediaType` — 'image' | 'video'
- `requiresImages` / `requiresVideo` — min count (deprecated, mediaInputs preferred)
- `mediaInputs[]` — named slots injected by Comfy node title
- `promptRequired` — bool
- `universal` — bool (gates universal workflow lookup)
- `components[]` — optional IDs of PromptBox sub-controls (not used by universal tools)
- `requiresMask` — optional bool
- `stub` — optional bool

**No `injector` field exists yet** — the kanban scope proposes adding one per resize.

---

## 2. commandExecutor flow

**File:** `js/services/commandExecutor.js`

**Entry point:** `runCommand(payload)` at line 415.

**Key functions:**

1. **`_resolveWorkflowFile(modelId, operation)`** (lines 106–114)
   - Calls `getUniversalWorkflow(operation)` first (checks UNIVERSAL_WORKFLOWS)
   - Falls back to `getWorkflowFile(modelId, operation)` for model-tied ops
   - Returns workflow filename string (e.g. 'video_upscale.json')
   - Throws if not found

2. **`_buildParams(payload)`** (lines 125–252)
   - Takes RunPayload → returns title-keyed param Record<string, any>
   - Called at line 437: `const params = _buildParams(payload);`
   - Handles:
     - Positive/Negative/Seed (lines 130–133)
     - Operation-specific `injectionParams` (line 136)
     - Preview_Only injection for `_ms` ops (lines 138–140)
     - Media slot assignment via `getCommandMediaInputs` (lines 145–203)
     - LoRA + upscale model injection from modelSettings (lines 207–249)
   - **Tool context injection at lines 244–248:**
     ```js
     } else if (payload.operation) {
         // Tool/universal context: inject upscale model only
         const settings = getToolSettings(project, payload.operation);
         if (settings.upscaleModel) params['Upscale_Model'] = settings.upscaleModel;
     }
     ```
     **This is where tool-specific params currently inject.** Currently only `upscaleModel` is injected.

3. **Main `runCommand` async flow** (lines 415–608):
   - Line 437: `const params = _buildParams(payload);` ← **single param-building path**
   - Line 444: Fetch workflow JSON
   - Line 456–460: Identify Output node ids by title
   - Line 597: Submit via `ComfyUIController.runWorkflow(workflow, params, onMessage)`

**Where injector would route:**

Currently, there is **no routing for a separate injector field**. The kanban scope proposes:
- Check for `payload.operation` in commandRegistry for an `injector` field
- If present, call injector-specific param builder instead of (or after) `_buildParams`
- Route: `if (operation.injector) { params = injectors[operation.injector](payload, params); }`

**Proposed entry point for injector:**
- **Before line 437** (after workflow file resolution but before _buildParams)
- **Or after line 437** (post-_buildParams, as a param enrichment pass)
- **Most sensible:** post-_buildParams enrichment, since _buildParams already handles media + seed.

---

## 3. UNIVERSAL_WORKFLOWS lookup

**File:** `js/data/modelConstants/universal_workflows.js:1–25`

```js
export const UNIVERSAL_WORKFLOWS = {
    interpolate: {
        workflow: 'video_interpolate.json',
    },
    videoUpscale: {
        workflow: 'video_upscale.json',
    },
    autoMaskImg: {
        workflow: 'img_auto_mask.json',
    },
};
```

**Who reads it:**

1. **commandExecutor.js:108** — `getUniversalWorkflow(operation)` imported from modelRegistry
2. **commandExecutor.js:270–279** (autoMask) — `getUniversalWorkflow('autoMaskImg')`

**modelRegistry.js source (not fully read, but inferred):**
- Likely has a `getUniversalWorkflow(operation)` export that looks up UNIVERSAL_WORKFLOWS[operation].workflow

**For resize, add entries:**
```js
resize: {
    workflow: 'resize.json',
},
resizeVideo: {
    workflow: 'resize_video.json',
},
```

---

## 4. save-generation + replaceItemId

**Backend route:** `routes/projects.js:706–937` — `POST /project/save-generation`

**API signature (from req.body destructure at line 708):**
```js
const {
    folderPath,      // required, project Media folder parent
    comfyViewUrl,    // required, ComfyUI server view URL
    itemId,          // generated item UUID (fallback if replaceItemId absent)
    operation = 'generated',  // op key for filename prefix
    meta = {},       // { prompt, negativePrompt, seed, modelId }
    generationMs,    // elapsed ms
    pixelDimensions, // { w, h }
    mediaType,       // 'image' | 'video'
    stage,           // optional: 'preview' | 'final'
    frozenParams,    // optional: preview-locked params
    loraSnapshot,    // optional: LoRA state at generation time
    replaceItemId,   // optional: UUID of existing item to supersede (reuse uuid, delete old media)
} = req.body;
```

**replaceItemId behavior (lines 716–869):**
- If supplied, **force the resulting sidecar id to match** (line 720): `const id = replaceItemId || itemId || uuidv4();`
- Capture old media + thumb paths before overwrite (lines 729–745)
- Write new sidecar at same uuid (line 851)
- Delete old media file + thumb (lines 856–868)
- **Result:** in-memory item slot reused; media files swapped; old refs purged

**Frontend caller:** `js/services/generationService.js` (partial read)

Lines 203, 289–316:
```js
replaceItemId:     config.replaceItemId ?? null,
// ...
const _replaceItemId = config.replaceItemId || null;
// ...
replaceItemId: (_replaceItemId && i === 0) ? _replaceItemId : undefined,
```

---

## 5. Existing injector pattern

**Finding:** No existing workflow-targeted injector folder or pattern.

- Grep for "injector" returns only 2 results (both in kanban.md + docs/comfy.md — no code)
- No `js/services/workflowInjectors/` folder exists
- `_buildParams` in commandExecutor is the single universal param-building path

**Conclusion:** New pattern must be designed from scratch per kanban scope.

---

## 6. toolSettings UI persistence path

**projectModel.js definitions (lines 360–388):**

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

**Current signature:** `setToolSettings(project, toolKey, updates)` where `updates` only contains `{ upscaleModel?: ... }`.

**Kanban scope notes:** generalize signature to `(project, toolKey, defaults)` so existing videoUpscale callers stay green.

**UI consumption example:** `MpiToolOptionsUpscale` (lines 34–85)
- Does not directly read/write toolSettings
- Emits `apply` event to Block mediator (_handleApply)
- Block routes to _runVideoTool with injectionParams
- **Block does NOT persist toolSettings after apply** — that's a gap for resize tool Phase 2

**Persistence path (for Phase 2):**
1. MpiToolOptionsResize emits `apply { width, height, ..., upscale_method, ... }`
2. Block._handleApply calls custom handler (not yet in pattern)
3. Handler calls `setToolSettings(project, 'resize', { width, height, ... })`
4. Handler calls `updateProjectJson(jsonPath, p => setToolSettings(p, 'resize', ...))` (line 45 in routes/projects.js)
5. Frontend state.currentProject updated via project:updated event

---

## 7. Universal op orchestration

**Who calls submit:**

1. **commandExecutor.runCommand(payload)** (line 415–608)
   - Takes RunPayload with operation='videoUpscale', model={id:null, mediaType:'video'}, mediaItems=[{url, mediaType, source}]
   - Builds params via _buildParams (line 437)
   - Submits workflow via ComfyUIController.runWorkflow (line 597)

2. **Entry point:** Block._runVideoTool (lines 578–589)
   - Collects media from history
   - Calls `startGeneration(payload, callbacks, config)`
   - Sets `operation='videoUpscale'`, `model={id:null, mediaType:'video'}`

**Who handles result:**

1. **generationService.startGeneration** (inferred from grep results + pattern)
   - Calls commandExecutor.runCommand(payload)
   - Attaches .onComplete handler
   - onComplete handler calls save-generation route (lines 303–329 suggest fetch POST /project/save-generation)
   - Result item appended to history group (line 358: `historyList.el.appendEntry(item)`)

2. **save-generation route (routes/projects.js:706–937)**
   - Downloads media from ComfyUI
   - Probes dims if missing (lines 793–804 for images; video probed at line 784)
   - Writes sidecar + media to disk
   - Calls updateProjectJson if replaceItemId (implied by atomicity rule)
   - Returns `{ success, itemId, filename, relativePath, filePath }`

3. **updateProjectJson queueing (routes/projects.js:45–65)**
   - Per-file promise queue for atomic writes
   - Serializes concurrent requests to the same project.json
   - Returns updated project object

**For resize tool apply (Phase 3):**
- MpiToolOptionsResize emits apply → Block._handleApply
- Handler calls injector.buildParams(payload) (if implemented)
- Calls startGeneration with injectionParams={Width, Height, upscale_method, ...}
- On complete, calls save-generation with replaceItemId=currentItem.id
- updateProjectJson atomically persists toolSettings + project state

---

## Key files for this phase

- `js/data/commandRegistry.js:56–336` — op definitions + queries
- `js/data/modelConstants/universal_workflows.js:1–25` — workflow filenames
- `js/services/commandExecutor.js:100–114` — workflow file resolution
- `js/services/commandExecutor.js:125–252` — param building (_buildParams)
- `js/services/commandExecutor.js:415–608` — runCommand entry point
- `routes/projects.js:45–65` — updateProjectJson queuing
- `routes/projects.js:706–937` — save-generation endpoint
- `js/data/projectModel.js:360–388` — getToolSettings / setToolSettings
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:240–272` — tool mediator (_handleApply, _runVideoTool)
- `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js:41–80` — tool list definitions (IMAGE_TOOLS, VIDEO_TOOLS)
- `js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js:1–86` — organism pattern for tool options UI
