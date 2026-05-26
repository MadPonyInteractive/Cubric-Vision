# State Management (js/state.js)

> **AI INSTRUCTION:** All global, persistent data must flow through `js/state.js`. Do not go rogue and create isolated data silos.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves persistent application data.

**Source of truth:** `js/state.js` is the single source for all persistent data — selected models, current projects, generated images.

**The state object is a Proxy.** Mutate it with `state.myKey = value`. This automatically fires `state:changed` on the event bus. **Never manually call `Events.emit('state:changed', ...)`** — doing so causes double-fire.

**To react:** `Events.on('state:changed', ({ key, value }) => { ... })`. Always unsubscribe on cleanup.

**Local UI state** (dropdown open/closed, toggle state) MAY stay inside the component. Only data that must survive component unmount goes in `state.js`.

See `docs/data.md` for the state keys and their meaning.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **No Rogue States:** NEVER declare global arrays, objects, or variables outside of a component's lifecycle instance to act as "state". If data needs to persist across tool switches or component mounts, it MUST go in `js/state.js`.
2. **Auto-Reactivity:** The exported `state` object is a Proxy. Mutating it (`state.myVariable = 123;`) automatically emits a global `state:changed` event. 
3. **Never Manually Emit State:** Because of the Proxy, you MUST NOT manually run `Events.emit('state:changed', ...)` after updating a state variable. The proxy does it for you.
4. **Local vs Global:** Internal component state (like a toggle being opened or closed) CAN remain inside the component. But data (like selected models, current projects, generated images) MUST live in `state.js`.

---

## 🛠️ Implementation Patterns

### 1. Reading and Writing State
```javascript
import { state } from '../../state.js';

// Read
if (state.currentPage === 'landing') { ... }

// Write (this automatically fires the event bus!)
state.currentPage = 'project'; 
```

### 2. Reacting to State Changes
Since `state.js` fires a canonical event on mutation, components can listen to changes dynamically (remembering the Event System Cleanup rule).

```javascript
import { state } from '../../state.js';
import { Events } from '../../events.js';

setup: (el, props, emit) => {
    const unsub = Events.on('state:changed', ({ key, value }) => {
        if (key === 'currentPage') {
             console.log("Page updated to: ", value);
        }
    });

    el.destroy = () => unsub(); // Mandatory cleanup
}
```

> **Note on Architecture:** The `state.js` file contains legacy keys and is undergoing structural refactoring. However, the exact rule still applies: **use `js/state.js` as the source of truth for persistency.**

---

## Settings Persistence Rule

Server routes that modify `project.json` MUST use `updateProjectJson()` in `routes/projects.js`. It serializes writes per project file and writes atomically via temp-file replace. Do not add direct `fs.writeJson(project.json, ...)` routes for project metadata/settings; concurrent `/update-project` and `/update-project-settings` calls can otherwise corrupt the file.

`projectService` is the **sole writer** to `modelSettings`, `toolSettings`, and `shared` in `project.json`. Components must **not** directly call `setModelSettings`, `setOpSettings`, `setSharedSettings`, `setToolSettings`, or `saveProjectSettings` for these fields.

**Instead, emit:**
- `settings:model:update` `{ modelId, opName?, key, value }` — partial model setting write. `opName` selects the per-op bucket under `modelSettings[modelId].operations` (an op key like `'upscale'` or `'detail'`). Omit `opName` ONLY for model-wide keys (`loras`, `upscaleModel`); projectService routes those to the model top level. **Never use `opName: 'shared'`** — emit `settings:shared:update` instead.
- `settings:shared:update` `{ mediaType, key, value }` — cross-model shared setting write. `mediaType` is `'image' | 'video'`. Writes to `project.shared[mediaType]`.
- `settings:tool:update` `{ toolKey, key, value }` — to queue a partial tool setting write
- `settings:model:select` `{ modelId }` — when a model is first selected (ensures key exists)
- `settings:tool:select` `{ toolKey }` — when a tool is first opened (ensures key exists)

**`modelSettings[modelId]` shape (per-op only):**
```
{
  loras: Array | { high: [], low: [] },  // model-wide
  upscaleModel: string | null,            // model-wide
  operations: {
    upscale:  { denoise, useGrid, upscaleFactor },
    detail:   { denoise },
    // ... per-op buckets created on first write
  }
}
```

**`project.shared` shape (cross-model, partitioned by mediaType):**
```
{
  image: { ratioSelector, batch },
  video: { ratioSelector, batch, duration, motionIntensity, previewStage, qualityTier-via-ratioSelector }
}
```

All image models share `project.shared.image`; all video models share `project.shared.video`. Bucket key comes from `MODELS[i].mediaType` (NOT `model.type`, which is workflow family — sdxl/wan/ltx).

PromptBoxControls own the scope decision via their `scope: 'shared' | 'perOp'` field. See `.claude/rules/component-comfy.md` § "Persistence scope" + "PromptBoxControl Protocol" for the full pattern.

---

## Pixel Rendering Mode

`state.pixelMode` (`'auto' | 'smooth' | 'pixel'`, default `'auto'`) controls global `image-rendering` for canvases, masked-preview imgs, and `<video>` surfaces.

- Persisted to `localStorage` via `Storage.getPixelMode` / `setPixelMode` (key `mpi_pixel_mode`). Hydrated into `state.pixelMode` at module init in `js/state.js`.
- `state:changed` subscriber in `state.js` mirrors writes to Storage and swaps `<html>` class `pixel-mode-{value}`. Initial class applied in `shell.js` boot.
- CSS rules live in `styles/01_base.css` — never write `image-rendering` inline on canvas/img/video elements.
- Auto mode: `MpiCanvas._applyTransform` + `MpiMaskedImagePreview._applyTransform` set `dataset.zoomMode = 'pixel' | 'smooth'` on the stack el from `view.scale` vs the exported `AUTO_PIXEL_THRESHOLD` constant (3.0 = 300%). CSS only consumes `data-zoom-mode` under `html.pixel-mode-auto`.
- Video: in auto mode, video is always smooth (no zoom in viewer today). Static smooth/pixel modes apply uniformly.
- New viewer surfaces that need to honor the toggle: add their selector to the four CSS rule blocks in `styles/01_base.css` (smooth / pixel / auto-base / auto-zoom).

---

## Reuse Prompt Preferences

`state.promptReuseOptions` controls what the Reuse Prompt action applies: `{ ask, prompt, settings, model, images }`.

- Persisted to `localStorage` via `Storage.getPromptReuseOptions` / `setPromptReuseOptions` (key `mpi_prompt_reuse_options`). Hydrated into `state.promptReuseOptions` at module init in `js/state.js`.
- `ask` is a behavior flag only. It must not clear `prompt`, `settings`, `model`, or `images`; Settings disables those part controls while preserving their values.
- The Ask dialog and Settings page write the same state key. Dialog changes persist immediately, so both surfaces recall the same choices.

`state.promptReuseSource` controls the Gallery-only source for Reuse Prompt: `'original' | 'current'`.

- Persisted to `localStorage` via `Storage.getPromptReuseSource` / `setPromptReuseSource` (key `mpi_prompt_reuse_source`). Hydrated into `state.promptReuseSource` at module init in `js/state.js`.
- Applies only in Gallery. History reuses the clicked history entry.
- Default is `'original'`, meaning the first reusable, non-uploaded generated entry in the card history.
- `'current'` is strict: it reuses the card's active `selectedIndex` entry. Do not silently fall back to Original when Current is promptless; promptless generated actions may still carry model/settings/media recall.

---

## PromptBox Expansion

`state.promptExpanded` (boolean, default `true`) controls whether `MpiPromptBox`'s textarea grows with content or stays collapsed to one line.

- Persisted to `localStorage` via `Storage.getPromptExpanded` / `setPromptExpanded` (key `mpi_prompt_expanded`). Hydrated into `state.promptExpanded` at module init in `js/state.js`.
- `state:changed` subscriber in `state.js` mirrors writes to Storage. Source of truth is the proxy field; localStorage is the cold-start mirror.
- `MpiPromptBox` reads the field on mount to seed its `isExpansionLocked` local, and writes `state.promptExpanded = !isExpansionLocked` from the chevron lock button's click handler — never poke `Storage` directly from the component.
