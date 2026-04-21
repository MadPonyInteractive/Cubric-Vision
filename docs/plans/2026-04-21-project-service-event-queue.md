# Project Service Event Queue — 2026-04-21

**Status:** Ready for Implementation
**Goal:** Decouple settings persistence from UI components via an event-driven pipeline, and fix the ratio-change-not-persisting bug.

---

## Context

### Current Architecture

`PromptBoxControls.js` and `MpiModelSettings.js` directly import and call `projectService.js` methods:

```
PromptBoxControls.js                       MpiModelSettings.js
        │                                          │
        ├── setModelSettings()                     ├── setModelSettings()
        ├── state.currentProject = updated         ├── setToolSettings()
        └── saveProjectSettings()                  └── saveProjectSettings()
```

**Bug:** `saveProjectSettings` debounces at 500ms. Rapid changes (ratio → orientation → quality) from `PromptBoxControls` all call `saveProjectSettings()` — the debounce resets each time, but the last call may use a stale or incomplete `state.currentProject` if key creation races with the debounce flush. Additionally, components are directly responsible for both mutating state AND triggering persistence — a design that makes key-existence bugs easy to introduce.

### Why This Happens

- Components are responsible for both mutating state AND triggering persistence
- No centralized place ensures keys exist before partial updates
- Debounce shared across all callers — rapid multi-field updates race

### Target Architecture

```
Component change fires
        │
        ▼
Events.emit('settings:model:update', { modelId, key, value })
        │
        ▼
projectService listener → per-modelId queue
        │
        ├── key missing? → create with getModelSettings() defaults → saveProjectSettings()
        │
        ▼
pending[key] deep-merged (ratioSelector) or replaced (loras, upscaleModel)
        │
        ▼
debounce timer reset (300ms) → apply all pending → saveProjectSettings()
```

Components: fire-and-forget. `projectService`: sole writer to `project.json`.

---

## New Event Schema

Add four new canonical events to `MpiEventMap` in `js/events.js`:

| Event | Payload | Description |
|---|---|---|
| `settings:model:select` | `{ modelId: string }` | Model first selected — create key with defaults if missing |
| `settings:tool:select` | `{ toolKey: string }` | Tool first selected — create key with defaults if missing |
| `settings:model:update` | `{ modelId: string, key: string, value: any }` | Partial update to a model setting |
| `settings:tool:update` | `{ toolKey: string, key: string, value: any }` | Partial update to a tool setting |

`key` corresponds to top-level fields in the model/tool settings object:
- Model: `loras`, `upscaleModel`, `ratioSelector`
- Tool: `upscaleModel`

---

## Step-by-Step Implementation

### Step 1 — Add new canonical events to `js/events.js`

Add to `MpiEventMap`:

```javascript
// js/events.js — additions to MpiEventMap
/**
 * Settings events (emitted by UI components, consumed by projectService):
 * 'settings:model:select' { modelId: string } — model first selected, create key if missing
 * 'settings:tool:select'  { toolKey: string }  — tool first selected, create key if missing
 * 'settings:model:update' { modelId: string, key: string, value: any } — partial model update
 * 'settings:tool:update'  { toolKey: string,  key: string, value: any } — partial tool update
 */
```

---

### Step 2 — Add queue infrastructure to `projectService.js`

Add imports at top of file:

```javascript
import { getModelSettings, getToolSettings } from '../data/projectModel.js';
```

Add queue state and helpers alongside existing debounce timer:

```javascript
// Per-model queues: Map<modelId, { timer: number|null, pending: Object }>
const _modelQueues = new Map();

// Per-tool queues: Map<toolKey, { timer: number|null, pending: Object }>
const _toolQueues = new Map();

const _QUEUE_DEBOUNCE_MS = 300;

function _enqueueModelUpdate(modelId, key, value) {
    if (!_modelQueues.has(modelId)) _modelQueues.set(modelId, { timer: null, pending: {} });
    const q = _modelQueues.get(modelId);

    // Deep-merge ratioSelector sub-keys; replace everything else
    q.pending[key] = (key === 'ratioSelector')
        ? { ...(q.pending[key] ?? {}), ...value }
        : value;

    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
        try {
            if (!state.currentProject) return;
            // Ensure key exists before applying updates
            if (!state.currentProject.modelSettings?.[modelId]) {
                const defaults = getModelSettings(state.currentProject, modelId);
                state.currentProject = {
                    ...state.currentProject,
                    updatedAt: new Date().toISOString(),
                    modelSettings: { ...state.currentProject.modelSettings, [modelId]: defaults },
                };
            }
            // Apply all pending updates
            for (const [k, v] of Object.entries(q.pending)) {
                const { setModelSettings } = await import('../data/projectModel.js');
                state.currentProject = setModelSettings(state.currentProject, modelId, { [k]: v });
            }
            q.pending = {};
            await saveProjectSettings();
        } catch (err) {
            clientLogger.error('projectService', 'Failed to flush model queue', err);
            Events.emit('ui:error', { title: 'Save failed', message: 'Failed to save model settings.' });
        }
    }, _QUEUE_DEBOUNCE_MS);
}

function _enqueueToolUpdate(toolKey, key, value) {
    if (!_toolQueues.has(toolKey)) _toolQueues.set(toolKey, { timer: null, pending: {} });
    const q = _toolQueues.get(toolKey);
    q.pending[key] = value;

    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
        try {
            if (!state.currentProject) return;
            if (!state.currentProject.toolSettings?.[toolKey]) {
                const defaults = getToolSettings(state.currentProject, toolKey);
                state.currentProject = {
                    ...state.currentProject,
                    updatedAt: new Date().toISOString(),
                    toolSettings: { ...state.currentProject.toolSettings, [toolKey]: defaults },
                };
            }
            for (const [k, v] of Object.entries(q.pending)) {
                const { setToolSettings } = await import('../data/projectModel.js');
                state.currentProject = setToolSettings(state.currentProject, toolKey, { [k]: v });
            }
            q.pending = {};
            await saveProjectSettings();
        } catch (err) {
            clientLogger.error('projectService', 'Failed to flush tool queue', err);
            Events.emit('ui:error', { title: 'Save failed', message: 'Failed to save tool settings.' });
        }
    }, _QUEUE_DEBOUNCE_MS);
}
```

Wire up event subscriptions. **Store unsubs** per `events.md` rule (service is singleton — never called, but rule satisfied):

```javascript
// Module-level — store all unsubs even though service never tears down
const _settingsUnsubs = [
    Events.on('settings:model:select', ({ modelId }) => {
        if (!state.currentProject) return;
        if (state.currentProject.modelSettings?.[modelId]) return;
        const defaults = getModelSettings(state.currentProject, modelId);
        state.currentProject = {
            ...state.currentProject,
            updatedAt: new Date().toISOString(),
            modelSettings: { ...state.currentProject.modelSettings, [modelId]: defaults },
        };
        saveProjectSettings();
    }),
    Events.on('settings:tool:select', ({ toolKey }) => {
        if (!state.currentProject) return;
        if (state.currentProject.toolSettings?.[toolKey]) return;
        const defaults = getToolSettings(state.currentProject, toolKey);
        state.currentProject = {
            ...state.currentProject,
            updatedAt: new Date().toISOString(),
            toolSettings: { ...state.currentProject.toolSettings, [toolKey]: defaults },
        };
        saveProjectSettings();
    }),
    Events.on('settings:model:update', ({ modelId, key, value }) => {
        _enqueueModelUpdate(modelId, key, value);
    }),
    Events.on('settings:tool:update', ({ toolKey, key, value }) => {
        _enqueueToolUpdate(toolKey, key, value);
    }),
];
// If service ever needs hot-teardown: _settingsUnsubs.forEach(u => u());
```

**Key design notes:**
- `ratioSelector` updates are **deep-merged** in the queue — rapid partial updates (`orientation`, `qualityTier`, `selectedRatio`) accumulate without dropping each other
- `loras` and `upscaleModel` are full replacements — correct, as they're always sent in full
- Error handling in queue flush emits `ui:error` — matches pattern from original `_autoSave`
- Key creation uses `getModelSettings()` / `getToolSettings()` from `projectModel.js` — no default duplication

---

### Step 3 — Migrate `PromptBoxControls.js`

**Remove imports:**
```javascript
// DELETE these lines:
import { getModelSettings, setModelSettings } from '../../../data/projectModel.js';
import { saveProjectSettings } from '../../../services/projectService.js';
```

**Add import:**
```javascript
import { Events } from '../../../events.js';
```

**Replace three event handlers** (lines 52, 64, 74):

```javascript
// BEFORE — change handler (line 52):
this._instance.on('change', ({ value, w, h, orientation }) => {
    this.value = { label: value, w, h };
    if (state.currentProject && modelId) {
        const updated = setModelSettings(state.currentProject, modelId, {
            ratioSelector: { selectedRatio: value, orientation },
        });
        state.currentProject = updated;
        saveProjectSettings();
    }
});

// AFTER:
this._instance.on('change', ({ value, w, h, orientation }) => {
    this.value = { label: value, w, h };
    if (modelId) {
        Events.emit('settings:model:update', {
            modelId,
            key: 'ratioSelector',
            value: { selectedRatio: value, orientation },
        });
    }
});
```

```javascript
// BEFORE — orientation_change handler (line 64):
this._instance.on('orientation_change', ({ orientation }) => {
    if (state.currentProject && modelId) {
        const updated = setModelSettings(state.currentProject, modelId, {
            ratioSelector: { orientation },
        });
        state.currentProject = updated;
        saveProjectSettings();
    }
});

// AFTER:
this._instance.on('orientation_change', ({ orientation }) => {
    if (modelId) {
        Events.emit('settings:model:update', {
            modelId,
            key: 'ratioSelector',
            value: { orientation },
        });
    }
});
```

```javascript
// BEFORE — quality_change handler (line 74):
this._instance.on('quality_change', ({ qualityTier }) => {
    if (state.currentProject && modelId) {
        const updated = setModelSettings(state.currentProject, modelId, {
            ratioSelector: { qualityTier },
        });
        state.currentProject = updated;
        saveProjectSettings();
    }
});

// AFTER:
this._instance.on('quality_change', ({ qualityTier }) => {
    if (modelId) {
        Events.emit('settings:model:update', {
            modelId,
            key: 'ratioSelector',
            value: { qualityTier },
        });
    }
});
```

Note: All three emit `key: 'ratioSelector'` — the queue deep-merges them so rapid firing doesn't drop sub-keys.

---

### Step 4 — Migrate `MpiModelSettings.js`

**Remove from imports:**
```javascript
// DELETE:
import { saveProjectSettings } from '../../../services/projectService.js';
import {
    getModelSettings,
    setModelSettings,
    getToolSettings,
    setToolSettings,
} from '../../../data/projectModel.js';
```

(`Events` is already imported at line 32.)

**Replace `_autoSave` function** (lines 115–138):

```javascript
// BEFORE:
async function _autoSave() {
    if (!state.currentProject || !_context) return;
    try {
        const depId = _filenameToDep(_upscaleValue) || null;
        if (_context.modelId) {
            state.currentProject = setModelSettings(state.currentProject, _context.modelId, { loras: _loraSlots, upscaleModel: depId });
        } else if (_context.toolKey) {
            state.currentProject = setToolSettings(state.currentProject, _context.toolKey, { upscaleModel: depId });
        }
        await saveProjectSettings();
        emit('saved', {});
    } catch (err) {
        clientLogger.error('model-settings', 'Failed to auto-save model settings', err);
        Events.emit('ui:error', { message: 'Failed to save settings. Please try again.' });
    }
}

// AFTER:
function _autoSave() {
    if (!_context) return;
    try {
        const depId = _filenameToDep(_upscaleValue) || null;
        if (_context.modelId) {
            Events.emit('settings:model:update', { modelId: _context.modelId, key: 'loras', value: _loraSlots });
            Events.emit('settings:model:update', { modelId: _context.modelId, key: 'upscaleModel', value: depId });
        } else if (_context.toolKey) {
            Events.emit('settings:tool:update', { toolKey: _context.toolKey, key: 'upscaleModel', value: depId });
        }
        emit('saved', {});
    } catch (err) {
        clientLogger.error('model-settings', 'Failed to emit model settings update', err);
        Events.emit('ui:error', { message: 'Failed to save settings. Please try again.' });
    }
}
```

> **Note on `emit('saved', {})`:** This now fires immediately after emitting events, not after disk write. If any consumer of `saved` depends on persistence being complete, it will need to be audited. Check for `.on('saved', ...)` listeners in `MpiModelSettings` and its parent mount before implementing.

**Update `el.open`** (line 252) — emit select event after setting `_context`:

```javascript
// In el.open(), after _context = ctx, before overlay.el.show():
if (ctx.modelId) {
    Events.emit('settings:model:select', { modelId: ctx.modelId });
} else if (ctx.toolKey) {
    Events.emit('settings:tool:select', { toolKey: ctx.toolKey });
}
```

---

### Step 5 — Emit `settings:model:select` from `MpiPromptBox.js`

Model dropdown change handler (lines 496–499):

```javascript
// BEFORE:
_modelDropdown.on('change', ({ value }) => {
    const selected = modelList.find(m => m.id === value);
    if (selected) emit('model-change', { model: selected });
});

// AFTER:
_modelDropdown.on('change', ({ value }) => {
    const selected = modelList.find(m => m.id === value);
    if (selected) {
        Events.emit('settings:model:select', { modelId: selected.id });
        emit('model-change', { model: selected });
    }
});
```

Ensures `modelSettings[modelId]` key exists before any ratio/lora/upscale events fire for that model.

---

### Step 6 — Update documentation

**`.claude/rules/state.md`** — add rule:

> `projectService` is the sole writer to `modelSettings` and `toolSettings` in `project.json`. Components must not directly call `setModelSettings`, `setToolSettings`, or `saveProjectSettings` for these fields. Emit `settings:model:update` / `settings:tool:update` instead.

**`docs/shell.md`** — update `projectService.js` section:

```markdown
## projectService.js (`js/services/projectService.js`)

**Settings pipeline:** projectService subscribes to `settings:model:*` and `settings:tool:*`
events and processes them through per-model/per-tool debounced queues. All writes to
`modelSettings` and `toolSettings` in `project.json` are centralized here.

**Queue behavior:** Each modelId (and toolKey) has its own queue (300ms debounce).
Multiple models write in parallel. `ratioSelector` sub-keys are deep-merged in the queue
so rapid partial updates don't drop each other. `loras` and `upscaleModel` are replaced.

**Key creation:** Keys are created on first `select` event using defaults from
`getModelSettings` / `getToolSettings`. Components never need to check key existence.

**Events consumed:**
- `settings:model:select` — create modelSettings[modelId] key with defaults if missing
- `settings:tool:select`  — create toolSettings[toolKey] key with defaults if missing
- `settings:model:update` — queue partial update, debounced write
- `settings:tool:update`  — queue partial update, debounced write
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `js/events.js` | Add 4 canonical events to `MpiEventMap` |
| `js/services/projectService.js` | Add queue infrastructure, unsub array, event subscriptions, key creation, error handling |
| `js/components/Blocks/MpiPromptBox/PromptBoxControls.js` | Remove direct projectService/projectModel calls; emit 3 settings events |
| `js/components/Compounds/MpiModelSettings/MpiModelSettings.js` | Remove direct calls; emit settings events in `_autoSave`; emit select on `el.open` |
| `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` | Emit `settings:model:select` on model dropdown change |
| `.claude/rules/state.md` | Document projectService as sole settings writer |
| `docs/shell.md` | Document projectService event pipeline and queue behavior |

---

## Pre-Implementation Checklist

- [ ] Search for `.on('saved', ...)` listeners in `MpiModelSettings` mount chain — verify none depend on disk write being complete before `saved` fires
- [ ] Confirm `Events` is already imported in `PromptBoxControls.js` (add if missing)
- [ ] Confirm `clientLogger` is imported in `projectService.js` (needed for queue error handler)

---

## Bug Fix Verification

**Before:** Rapid ratio/orientation/quality changes → multiple `saveProjectSettings()` debounce resets → last flush may have incomplete state → fields lost on reload.

**After:** All three changes emit `settings:model:update` with `key: 'ratioSelector'` → queue deep-merges sub-keys → single flush after 300ms → complete `ratioSelector` object written → all fields persist.

**Test sequence:**
1. Open project, select model with no prior settings
2. Change ratio → change orientation → change quality tier (rapid)
3. Reload app
4. Open project — verify ratio, orientation, quality tier all persisted correctly

---

## Key Design Decisions

1. **Queue-per-modelId** — rapid changes to multiple models don't block each other.

2. **Deep-merge `ratioSelector` in queue** — `change`, `orientation_change`, `quality_change` all emit partial `ratioSelector` objects. Queue accumulates them so no sub-key is lost to debounce replacement.

3. **Full replacement for `loras` and `upscaleModel`** — these are always sent as complete values, so replace is correct.

4. **Key creation on `select`, not on first `update`** — explicit intent; key guaranteed to exist before updates process.

5. **`getModelSettings()` / `getToolSettings()` used for defaults** — no duplication of default values in the service.

6. **`Events.on` unsubs stored** — `_settingsUnsubs` array at module level satisfies `events.md` rule even though service is a permanent singleton.

7. **Error handling in queue flush** — mirrors original `_autoSave` pattern: log + emit `ui:error`.

8. **`saveProjectSettings()` stays exported** — queue calls it internally; stays available for future manual-save UI.

9. **No schema change** — `project.json` structure unchanged.
