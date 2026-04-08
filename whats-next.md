```xml
<work_completed>

## This Session — modelRegistry.js + MpiStartingComfy Wiring

### UNIVERSAL_WORKFLOWS — Promoted to proper registry
- `UNIVERSAL_WORKFLOWS` promoted from flat `{ key: filename }` strings to
  `{ key: { workflow, dependencies[], installed } }` objects — same shape as MODELS
- `syncModelInstalled()` now syncs universal workflows too via same
  `/comfy/models/check` endpoint (namespaced as `universal:autoMaskImg` etc.)
- `autoMaskImg` deps wired: ComfyUI-Impact-Pack, ComfyUI-Impact-Subpack,
  face-yolov8n, hand-yolov8n, person-yolov8n-seg, sam-vit-b
- `interpolate` and `videoUpscale` have `dependencies: []` pending workflow
  creation — user will populate when workflows are ready
- `getUniversalWorkflow(key)` — new parallel helper to `getWorkflowFile()`
- `commandExecutor._resolveWorkflowFile()` updated to use new helper

### MpiStartingComfy — wired to engine startup

- `MpiStartingComfy` rewritten: direct body portal, bypasses Overlays queue.
  (MpiModal delegation blocked it when MpiProjectsPageOverlay was active at boot)
- `comfyController` now emits `comfy:starting`, `comfy:ready`, `comfy:error`
  via the event bus — no longer holds any component reference
- `shell.js` subscribes to those three events and drives `_startingComfy`
- Three events added to canonical `MpiEventMap` in `events.js`
- Fixed broken `_bootApp` (was non-async with `await`)

### commandRegistry.js — autoMaskImg command registered
- `autoMaskImg` added as universal command (mediaType IMAGE, requiresImages: 1)

</work_completed>

<work_remaining>

## 🔴 TOP PRIORITY — Event Bus Audit (Agent Debt)

The `MpiStartingComfy` wiring revealed a systemic failure: previous agent sessions
implemented cross-layer communication via direct function imports instead of the
event bus. This creates tight coupling between architecture layers that must never
know about each other. This must be fixed before adding more features.

### Audit Results

| File | Violation | Severity |
|---|---|---|
| `js/services/comfyController.js` | `import { showError } from '../shell.js'` | 🔴 P0 |
| `js/services/commandExecutor.js` | `import { showError } from '../shell.js'` | 🔴 P0 |
| `js/workspaces/groupHistory/groupHistory.js` | `import { StatusBar } from '../../shell/statusBar.js'` | 🟡 P2 |
| `js/workspaces/groupHistory/groupHistory.js` | `tool:running` / `tool:idle` not emitted at lines 584–686 | 🟠 P1 |
| `js/workspaces/groupHistory/groupHistory.js` | `media:updated` not emitted after `_persistGroup()` at line 700 | 🟠 P1 |
| `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js` | ✅ Clean — uses component `emit()` correctly | — |

### P0 — `showError` must become an event

**Emit (in services — already have Events import):**
```js
// comfyController.js (line 43) and commandExecutor.js (line 184):
Events.emit('ui:error', { title: 'Generation failed', message: err.message });
```

**Listen (shell.js — add once alongside the comfy event subscriptions):**
```js
Events.on('ui:error', ({ title, message }) => showError(title, message));
```

Then remove `import { showError } from '../shell.js'` from both service files.

### P1 — Dead canonical events must be emitted

`tool:running`, `tool:idle`, and `media:updated` are in the canonical map but
**never emitted**. These are the wiring points to add:

**In `groupHistory.js _runGenerate()` (around line 584):**
```js
Events.emit('tool:running', { tool: 'groupHistory', type: operation });
```

**In `groupHistory.js exec.onComplete` and `exec.onError` (lines 618, 678):**
```js
Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
```

**In `groupHistory.js _persistGroup()` (line 690) and `gallery.js _persistGroups()`:**
```js
Events.emit('media:updated', { projectId: state.currentProject?.id });
```

### P2 — `groupHistory` StatusBar import

`groupHistory.js` line 33 imports `StatusBar` from `../../shell/statusBar.js`.
This is less critical (statusBar is a utility, not a component), but ideally
the status bar should listen to `tool:running` / `tool:idle` and drive itself.
Defer until P1 is done — the events will unblock this naturally.

---

## 2. Model UI — Zero-installed state + install flow

`syncModelInstalled()` runs at startup and patches MODELS + UNIVERSAL_WORKFLOWS
in-place, but nothing reads `model.installed` or `uw.installed` yet.

### 2a. Zero-installed state (gallery / groupHistory)
- If no installed models exist, hide the prompt box / model dropdown entirely
- Show: "No models installed. Install a model to get started." + link to installer

### 2b. Installed-only model dropdown
- `getModelsByType()` callers in gallery.js + groupHistory.js: filter to
  `m.installed === true` so uninstalled models never appear in the dropdown
- MpiPromptBox: disable Run if `activeModel?.installed === false`

### 2c. Gallery card — uninstalled model warning
- If a group's `modelId` refers to a now-uninstalled model, surface a badge/icon
  so the user knows further generation is unavailable without reinstalling

### 2d. Universal workflow installed gating
- `autoMaskImg` command: show as unavailable (greyed) if
  `UNIVERSAL_WORKFLOWS.autoMaskImg.installed === false`
- `interpolate` / `videoUpscale`: same once their deps are populated

### 2e. Model installer UI
- Page/overlay: browse MODELS + UNIVERSAL_WORKFLOWS, trigger download/install
- Uses existing `POST /comfy/model/download` per dependency
- Shows per-dep progress; calls `syncModelInstalled()` on completion

---

## 3. Video Workflows

User is authoring new ComfyUI workflow files for video. When ready:

- Add required dep entries to `DEPS` in `modelRegistry.js`
- Populate `dependencies: []` arrays in `UNIVERSAL_WORKFLOWS.interpolate`
  and `UNIVERSAL_WORKFLOWS.videoUpscale`
- New video model (e.g. Wan 2.1): uncomment + fill the stub in `MODELS`
- groupHistory video group support: detect `item.type === 'video'`,
  swap canvasWrap for video preview component

---

## 4. Model Garbage Collection (uninstall)

- New route `POST /comfy/models/uninstall`
- Shared dep safety (don't delete a dep file still needed by another model)
- Call `syncModelInstalled()` after uninstall to refresh flags
- Do NOT delete user media — groups remain browsable

---

## 5. Deferred / Low priority

- `state.js` legacy flat properties (`g_currentGuide`, `g_promptEN`, etc.)
  — remove when old workspace references confirmed gone
- `PAGE_WORKSPACE` deprecated alias in `router.js` — remove when confirmed unused
- `MpiSelectionBar` — not yet in `js/pages/components.js` dev gallery

</work_remaining>

<critical_context>

## Event Bus Rules (MANDATORY for all agents)

The event bus (`js/events.js`) is the ONLY approved communication channel between:
- Services (`js/services/`) ↔ Shell (`js/shell.js`)
- Services ↔ Workspaces
- Services ↔ Components

**NEVER import shell functions into services. NEVER pass component instances into
services. If a service needs to trigger UI, it emits an event.**

```js
// ❌ WRONG — service importing shell
import { showError } from '../shell.js';

// ✅ CORRECT — service emits event
Events.emit('ui:error', { title: '...', message: '...' });
// shell listens: Events.on('ui:error', ({ title, message }) => showError(...))
```

```js
// ❌ WRONG — injecting a component reference into a service
ComfyUIController.setStartupModal(componentInstance);

// ✅ CORRECT — service emits lifecycle event
Events.emit('comfy:starting');
// shell/component listens and drives its own UI
```

## Canonical Events (js/events.js MpiEventMap)

| Event | Payload | Emitted by | Consumed by |
|---|---|---|---|
| `comfy:starting` | — | comfyController | shell → MpiStartingComfy |
| `comfy:ready` | — | comfyController | shell → MpiStartingComfy |
| `comfy:error` | `{ message }` | comfyController | shell → MpiStartingComfy |
| `ui:error` | `{ title, message }` | **TODO: services** | shell → MpiErrorDialog |
| `tool:running` | `{ tool, type }` | **TODO: commandExecutor** | status bar, HUD |
| `tool:idle` | `{ tool, type }` | **TODO: commandExecutor** | status bar, HUD |
| `media:updated` | `{ projectId }` | **TODO: gallery** | gallery refresh |
| `media:updated` | `{ projectId }` | any tool | gallery |
| `project:changed` | `{ project }` | shell | workspaces |
| `state:changed` | `{ key, value }` | state.js | any subscriber |
| `nav:tool` | `{ toolName }` | navigation | any subscriber |
| `ui:close-all-popups` | — | overlayManager | all floating UI |

## modelRegistry.js — Architecture Rules

- `js/data/modelRegistry.js` is the single source of truth for all ComfyUI models
  AND universal workflows.
- Server (CJS) cannot import modelRegistry.js (ESM). Use Option D pattern.
- `syncModelInstalled()` must be called before any UI that reads `model.installed`
  or `UNIVERSAL_WORKFLOWS[key].installed`.
- `UNIVERSAL_WORKFLOWS` values are now objects: `{ workflow, dependencies[], installed }`.
  Use `getUniversalWorkflow(key)` to resolve filenames — never index directly.

## Chromium GPU canvas corruption — willReadFrequently

Always create off-screen canvases read via `getImageData` with:
```js
ctx = canvas.getContext('2d', { willReadFrequently: true });
```

## ComfyUI mask convention

White = area to detail/inpaint, Black = background.
Call: `canvas.getMaskDataURL('black', 'white')`

## ComfyUI mapping rules

See `.agents/workflows/comfyui_mapping_rules.md`. Never use hardcoded node IDs —
always match by `_meta.title`.

## MpiCanvas API

```js
const inst = MpiCanvas.mount(wrapperEl, { onBrushSizeChange, onBrushTypeChange });
canvas.activeMode = 'crop' | 'mask' | 'compare' | 'none';
await canvas.loadImage(url);
await canvas.loadComparisonImage(url);
canvas.getMaskDataURL('black', 'white');
canvas.setCropRatio(ratio); canvas.getCropRect();
canvas.destroy();
```

## MpiHistoryTools / MpiToolActionBar / MpiSelectionBar APIs

See previous whats-next.md for full API tables.

## groupHistory mode exclusivity + mask flow

See previous whats-next.md for full rules.

## Architecture Rules

- **Tier 1 Primitives**: Cannot import anything from components
- **Tier 2 Compounds**: Can only import Primitives (+ data/, utils/, events.js, state.js)
- **Tier 3 Blocks**: Can import Primitives + Compounds
- Workspaces: NOT components — plain `mount()` functions, CAN import anything

## Key file locations

- MpiCanvas: `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- MpiStartingComfy: `js/components/Compounds/MpiStartingComfy/MpiStartingComfy.js`
- MpiHistoryTools: `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`
- MpiToolActionBar: `js/components/Compounds/MpiToolActionBar/MpiToolActionBar.js`
- MpiSelectionBar: `js/components/Compounds/MpiSelectionBar/MpiSelectionBar.js`
- groupHistory workspace: `js/workspaces/groupHistory/groupHistory.js`
- Gallery workspace: `js/workspaces/gallery/gallery.js`
- commandExecutor: `js/services/commandExecutor.js`
- comfyController: `js/services/comfyController.js`
- Model registry: `js/data/modelRegistry.js`
- Command registry: `js/data/commandRegistry.js`
- Event bus: `js/events.js`
- App state: `js/state.js`
- Router: `js/router.js`
- Comfy check route: `routes/comfy.js` → `POST /comfy/models/check`

## #tool-container class — MUST NOT be wiped

`#tool-container` has `class="tool-container"` hardcoded in index.html.
ONLY use `classList.remove('gh-workspace')` — never `element.className = ''`.

## MpiCanvas destroy rule

InputController attaches listeners to `window`. MUST call `canvas.destroy()` when
unmounted. groupHistory uses MutationObserver on `document.body` for this.

</critical_context>

<current_state>

## Deliverable Status

| Item | Status |
|------|--------|
| MpiCanvas Primitive (activeMode mutual exclusion) | Complete |
| MpiHistoryTools Compound | Complete |
| MpiToolActionBar Compound | Complete |
| groupHistory — crop tool | Complete |
| groupHistory — mask tool | Complete |
| groupHistory — modechange wiring | Complete |
| MpiCompareOverlay / gallery compare | Complete |
| gallery.js workspace | Complete |
| commandExecutor.js | Complete |
| groupHistory — selection mode + MpiSelectionBar | Complete |
| groupHistory — mask sent to ComfyUI correctly | Complete |
| groupHistory — mask visual persists across entry switches | Complete |
| gallery.js onComplete — use _persistGroups() | Complete |
| gallery.js — download handler | Complete |
| MpiGroupCard selected state — footer highlight | Complete |
| MpiGroupCard display name | Complete |
| groupHistory — history entry label shows sequenced filename | Complete |
| modelRegistry.js — runtime installed check | Complete |
| modelManager.js — deleted (orphaned LLM scaffold) | Complete |
| UNIVERSAL_WORKFLOWS — promoted to proper registry with deps + installed | Complete |
| syncModelInstalled() — covers universal workflows | Complete |
| getUniversalWorkflow() — parallel helper to getWorkflowFile() | Complete |
| commandExecutor — uses getUniversalWorkflow(), not raw UNIVERSAL_WORKFLOWS | Complete |
| MpiStartingComfy — wired to comfy:starting/ready/error events | Complete |
| Event bus audit — showError, tool:running, tool:idle, media:updated | **NOT STARTED** |
| model.installed — wired into UI (gallery, groupHistory, MpiPromptBox) | Not started |
| Universal workflow installed gating in UI | Not started |
| groupHistory — video group support | Deferred — no workflow yet |
| Video workflows (interpolate, videoUpscale) — deps to populate | Pending user |
| Model installer UI | Not started |
| Model uninstall / GC route | Not started |

## Open questions

None.

</current_state>
```
