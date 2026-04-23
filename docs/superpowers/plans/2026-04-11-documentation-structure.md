# Documentation Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the project documentation hub — `docs/PROJECT.md` + 8 flat subsystem docs — and add a Documentation Drift reminder to CLAUDE.md.

**Architecture:**

Hub-and-spoke — `docs/PROJECT.md` is a lightweight orientation hub pointing to flat subsystem docs (`docs/workspaces.md`, `docs/data.md`, etc.). Rule files (`.claude/rules/*.md`) contain behavioral constraints only. `## Sub-Agent Briefing` sections redirect to the corresponding doc. Rules say **HOW**, docs say **WHAT**. No duplication.

**Final doc structure:**
```
docs/
  PROJECT.md       (hub)
  workspaces.md
  data.md
  comfy.md
  components.md
  projects.md
  shell.md
  utils.md         ← NEW
  events.md        ← NEW
```

---

## Task 0: Add Documentation Drift reminder to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read CLAUDE.md to find the Documentation Drift section**

Run: `grep -n "Documentation Drift" CLAUDE.md`

- [ ] **Step 2: Add one-liner if section doesn't exist, or confirm existing line is sufficient**

If the section exists and already mentions updating docs after code changes, leave it — the existing language may already cover it. If it only mentions the backlog rule, add:

```markdown
## Documentation Drift

After any session where code was written, briefly note in your response whether any docs or rules look stale. If unsure, ask. Keep docs and rules in sync as a matter of course — not as a cargo-cult checklist.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Documentation Drift reminder to CLAUDE.md"
```

---

## Task 1: Create `docs/PROJECT.md` hub

**Files:**
- Create: `docs/PROJECT.md`

- [ ] **Step 1: Write the file**

```markdown
# MpiAiSuite — Project Documentation

> Orientation hub for new agents. Start here, then drill into subsystem docs.

## What Is This App?

MpiAiSuite is a desktop application (Electron) that wraps [ComfyUI](https://github.com/comfyanonymous/ComfyUI) as its generation engine. Users manage projects containing image/video generation history, configure models and LoRAs, and run generation workflows through a 3-workspace UI.

## 3-Workspace Flow

```
[Landing] → select/create project → [Gallery] → click card → [Group History]
```

- **Landing:** Project selection and creation.
- **Gallery:** Default project view — all media items in a radial grid. Contains PromptBox for running model-tied commands.
- **Group History:** Single card detail — history timeline, canvas, PromptBox for running model-tied + universal commands.

## Key Subsystems

| Subsystem | Doc | What it covers |
|---|---|---|
| Workspaces | [workspaces.md](workspaces.md) | Landing, Gallery, Group History, routing |
| Data Layer | [data.md](data.md) | modelRegistry, commandRegistry, projectModel |
| ComfyUI Integration | [comfy.md](comfy.md) | comfyController, commandExecutor, workflow injection |
| Components | [components.md](components.md) | ComponentFactory, 3-tier hierarchy, overlay/hotkey rules |
| Projects | [projects.md](projects.md) | Project JSON shape, media folder, portability |
| Shell | [shell.md](shell.md) | navigation, overlayManager, hotkeyManager, shell.js |
| Utilities | [utils.md](utils.md) | dom.js, icons.js, ratios.js, seed.js, and all js/utils/ |
| Events | [events.md](events.md) | EventBus, canonical event names, cross-component communication |

## Key Architectural Invariants

1. **Never hardcode colors** — CSS variables from `styles/01_base.css` only.
2. **Never modify `js/components/factory.js`** — it is locked.
3. **Never emit `state:changed` manually** — the state Proxy fires it automatically.
4. **Never emit `project:changed` via `Events.emit`** — use native `CustomEvent` dispatch (known bug).
5. **Title-based workflow injection** — target nodes by `_meta.title`, not ID.
6. **Output node** is the canonical result capture point.
7. **All blocking UI uses `Overlays.request/release`** — never bypass.
8. **All hotkeys go through `Hotkeys.register/unregister`** — never raw `window.addEventListener`.

## How to Orient in an Unfamiliar File

1. Read the relevant subsystem doc above.
2. Check `.claude/rules/<subsystem>.md` for behavioral constraints.
3. Skim the actual file — patterns should now make sense.

## ComfyUI Portability

ComfyUI portable engine lives at `engine/ComfyUI_windows_portable/`. Projects are self-contained in `documents/MpiAiSuite/projects/`. Model files are stored separately under `documents/MpiAiSuite/models/`. This split allows projects to be portable while model files stay on the user's fast storage.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PROJECT.md
git commit -m "docs: add PROJECT.md hub with 3-workspace flow and subsystem map"
```

---

## Task 2: Create subsystem docs (8 flat files)

**Files:**
- Create: `docs/workspaces.md`
- Create: `docs/data.md`
- Create: `docs/comfy.md`
- Create: `docs/components.md`
- Create: `docs/projects.md`
- Create: `docs/shell.md`
- Create: `docs/utils.md`
- Create: `docs/events.md`

- [ ] **Step 1: Write `docs/workspaces.md`**

```markdown
# Workspaces

Three primary workspaces + one hidden dev area.

## Flow

```
Landing → Gallery → Group History
```

## Landing (`js/pages/landing.js`)
Handles project selection and creation. Entry point when no project is open.

## Gallery (`js/workspaces/gallery/gallery.js`)
Default view when a project opens. Shows all item groups in a radial grid.
- Contains MpiPromptBox (for model-tied commands: t2i, i2i, upscale, detail, etc.)
- Compare overlay for viewing two cards side by side.
- Select mode swaps PromptBox for MpiSelectionBar.

## Group History (`js/workspaces/groupHistory/groupHistory.js`)
Opened when user clicks a card from gallery. Shows single card's history timeline.
- Left: MpiHistoryTools (model-tied + universal command buttons)
- Centre: MpiCanvas (view/input/crop/mask)
- Right: history panel (history entries for the active card)
- Bottom: MpiPromptBox (for model-tied commands)
- Crop bar (when crop tool active)

Universal commands (interpolate, videoUpscale, autoMaskImg) run from the toolbar in Group History — they do not require a model and have their own workflows in `UNIVERSAL_WORKFLOWS`.

## Routing
- `js/router.js` defines `PAGE_LANDING`, `PAGE_GALLERY`, `PAGE_GROUP_HISTORY`.
- `js/shell/navigation.js` manages the history stack via `navigate()` / `back()`.
- Never use `window.location` — always go through the router.
```

- [ ] **Step 2: Write `docs/data.md`**

```markdown
# Data Layer

Three core data files. All are plain JS objects — no ORM, no database.

## modelRegistry (`js/data/modelRegistry.js`)

**Single source of truth for all generative models.**

- `MODELS`: Array of `ModelDef` objects `{ id, name, mediaType, supportedOps, workflows, dependencies }`.
- `getModelsByType(mediaType, opts?)`: Returns models filtered by media type. Accepts `{ installed: true|false }` to filter by install state.
- `getModelById(id)`: Lookup by ID.
- `getWorkflowFile(modelId, op)`: Returns the workflow JSON filename for a model+op combination.
- `syncModelInstalled()`: Hits `GET /comfy/models/check` with all deps, populates `installed: true/false` at runtime. **Never hardcode `installed: true` in MODELS.**
- `resolveDep(depId)`, `getModelDependencies(modelId)`: Resolve dependency graph.

## commandRegistry (`js/data/commandRegistry.js`)

**Defines what operations are available for a given model+media context.**

- `CommandDef`: `{ key, name, mediaType, supportedOps, inputRequirements }`
- `getAvailableCommands(mediaType, model, ctx)`: Filters commands by model's `supportedOps` and input availability.
- `getToolCommands(mediaType)`: Returns universal-only commands (interpolate, videoUpscale, autoMaskImg) — these do not require a model.
- Commands: t2i, i2i, upscale, edit, detail, change, remove, t2v, i2v, extend, interpolate, videoUpscale, autoMaskImg, createGroupFromSelection (stub), promoteToNewGroup (stub).

## projectModel (`js/data/projectModel.js`)

**Plain serializable objects — the project file shape on disk.**

Project JSON: `{ id, name, folderPath, createdAt, updatedAt, thumbnail, itemGroups, tutorialSeen, modelSettings, toolSettings }`

- `createImageItem() / createVideoItem()`: Make a media item for a group.
- `createItemGroup()`: Makes a group containing items.
- `getSelectedItem() / appendToHistory() / promoteHistoryEntry() / removeHistoryEntry()`: History management.
- `createProject() / updateGroupInProject() / addGroupToProject() / removeGroupFromProject()`: Project-level operations.
- `getModelSettings(project, modelId) / setModelSettings(project, modelId, settings)`: Model-specific settings (LoRA slots, upscale model).
- `getToolSettings(project, toolKey) / setToolSettings(project, toolKey, settings)`: Tool-specific settings.

Model settings are persisted to the project JSON. LoRA picks and upscale model selections live here.
```

- [ ] **Step 3: Write `docs/comfy.md`**

```markdown
# ComfyUI Integration

ComfyUI is the generation engine. Communication is via REST + WebSocket.

## comfyController (`js/services/comfyController.js`)

Singleton that manages the ComfyUI server lifecycle and workflow execution.

- `ensureServerRunning()`: Starts ComfyUI if not running (calls `POST /comfy/start`).
- `queuePrompt(workflow, prompt)`: Enqueues a workflow via REST.
- `runWorkflow(workflowFile, params, onProgress?)`: Loads workflow JSON, uploads input assets, injects params by node `_meta.title`, captures `Output` node results via WebSocket.
- `interrupt()`: Aborts running generation.
- `generateRandomSeed()`: Returns a random seed for the Seed node.

## commandExecutor (`js/services/commandExecutor.js`)

Orchestrates a full generation request.

- `runCommand(commandKey, modelId, params, ctx, onProgress?)`: Resolves workflow file, builds title-keyed param map, runs via comfyController, captures Output node.
- `runAutoMask(imageData, modelId, params, onProgress?)`: Runs auto-mask workflow, captures both `Detected` and `Output` nodes.
- `_depFilename(depId)`: Maps dep ID to filename.
- `_resolveWorkflowFile(commandKey, modelId)`: Returns workflow JSON path.
- `_buildParams(commandKey, params, ctx)`: Builds the title→value map for injection.

## Workflow Injection Pattern

Nodes are matched by `_meta.title` (case-insensitive). Example:

```javascript
const params = {
    "Positive": "A landscape",
    "Seed": 45678,
    "Checkpoint": "sdxl-realistic.safetensors",
    "Lora_1": { lora_name: "my_lora.safetensors", strength_model: 0.8, strength_clip: 0.8 },
    "Input_Image": "data:image/png;base64,..."
};
```

Known titles: "Positive", "Negative", "Seed", "Checkpoint", "Lora_1"…"Lora_6", "Input_Image", "Input_Mask", "Output", "Detected", "Upscale_Model", etc. See `.claude/rules/comfy_injection.md` for the full table.

**Static filenames for uploads** (e.g. `mpi_detailer_input.png`) enable ComfyUI execution caching.

## assetService (`js/services/assetService.js`)

Loads available LoRA and upscale model filenames from `GET /comfy/list-files` into `state.availableLoras` and `state.upscaleModels`. Called lazily on ModelSettings open.
```

- [ ] **Step 4: Write `docs/components.md`**

```markdown
# Component System

## ComponentFactory (`js/components/factory.js`)

**Locked — never modify.**

All components are created via `ComponentFactory.create(spec)`. Returns an instance with `mount(container)`, `emit(event, data)`, `on(event, handler)`, `update(props)`, `destroy()`.

```javascript
export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    css: ['js/components/Tier/MyComponent/MyComponent.css'],
    template: (props) => `<div class="mpi-my-comp">${props.text}</div>`,
    setup: (el, props, emit) => {
        // All logic here. Return nothing — instance methods are attached to el.
    }
});
```

## 3-Tier Hierarchy

**Primitives** (Tier 1): Buttons, inputs, icons. Import nothing.
**Compounds** (Tier 2): Cards, forms, modals. Import Primitives only.
**Blocks** (Tier 3): Sidebars, grids. Import Primitives + Compounds.

**Never import up.** A Compound cannot import another Compound's JS — only its CSS if needed.

## Every New Component Checklist

1. Add CSS path to `js/shell/preloadStyles.js`.
2. Document props in `js/components/types.js`.
3. Ask user if it should be added to `js/pages/components.js` (dev gallery).

## Blocking UI (Modals/Overlays)

- Call `Overlays.request({ show, hide, id: el })` to open.
- Call `Overlays.release(el)` to close.
- Portal to `document.body`. Clean up own wrapper + backdrop on close.
- Self-close on `ui:close-all-popups` event.

## Floating UI (Dropdowns/Popups)

- No Overlays registration.
- Self-close on `ui:close-all-popups`.
- Use `MutationObserver` to remove portal from `document.body` when anchor is removed from DOM.

## Hotkeys

- `Hotkeys.register(key, fn)` to bind.
- `Hotkeys.unregister(key, fn)` on `el.destroy()` or `el.hide()`.
- Never use raw `window.addEventListener('keydown')`.

## Events

Components communicate via the EventBus. See `docs/events.md` for the full pattern and canonical event names.
```

- [ ] **Step 5: Write `docs/projects.md`**

```markdown
# Project System

## Project JSON Shape

```json
{
  "id": "uuid",
  "name": "My Project",
  "folderPath": "documents/MpiAiSuite/projects/my-project/",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "thumbnail": "relative/path.png",
  "itemGroups": [Group],
  "tutorialSeen": false,
  "modelSettings": {
    "flux_dev": { "lora_1": null, "upscaleModel": "4x_NMKD-Siax_200k.pth" }
  },
  "toolSettings": {}
}
```

## Group Shape

```json
{
  "id": "uuid",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "items": [Item],
  "selectedIndex": 0,
  "cardWidth": 512,
  "cardHeight": 512,
  "seed": 12345
}
```

## Item Shape

```json
{
  "id": "uuid",
  "createdAt": "ISO8601",
  "type": "image|video",
  "mediaPath": "relative/path.png",
  "thumbnailPath": "relative/thumb.png",
  "prompt": "positive prompt text",
  "negativePrompt": "negative prompt text",
  "params": { "steps": 20, "seed": 12345, "model": "flux_dev", ... },
  "history": [HistoryEntry]
}
```

## Media Folder Structure

```
projects/
  my-project/
    project.json
    media/
      item-uuid.png
      item-uuid-thumb.png
```

## Portability

Projects are self-contained folders. The `folderPath` field points to the project root on disk. `mediaPath` fields inside items are relative to that root. This makes projects portable — copy the folder to another machine and it works (as long as models are also available there).

## Project Manager (`js/managers/projectManager.js`)

- `createProject(name)`: Creates folder + project.json.
- `listProjects()`: Lists all projects under `documents/MpiAiSuite/projects/`.
- `openProject(id)`: Loads project, sets `state.currentProject`, fires `project:changed`.
- `updateProject(project)`: Saves project JSON to disk.
- `saveProjectSettings()`: Persists modelSettings + toolSettings to the open project.
- `deleteProject(id)`: Deletes project folder.

**Known bug:** `openProject()` fires `project:changed` as a native `CustomEvent`, not via `Events.emit()`. Subscribers using `Events.on('project:changed', ...)` will miss it.
```

- [ ] **Step 6: Write `docs/shell.md`**

```markdown
# Shell

The shell wires the application together — global dialogs, window controls, project UI, memory ops, StatusBar, and navigation.

## shell.js (`js/shell.js`)

Entry point that runs after the HTML shell loads. Calls `initShell()` which:
- Wires global error dialog (`ui:error` → show error dialog)
- Binds window controls (minimize, maximize, close)
- Sets up project UI (model badge, gallery title)
- Initializes memory ops
- Wires StatusBar
- Calls `initNavigation()`

## navigation.js (`js/shell/navigation.js`)

History-stack router. Key functions:
- `handleNavigation()`: Dispatches to `_showLanding` or `_loadView` (lazy-imports workspace).
- `navigate(route, params?)`: Pushes to history stack.
- `back()`: Pops history.
- `refreshRadial()`: Rebuilds gallery radial items when data changes.
- `MpiRadialMenu` context switching via `OP_ICONS` map.

## overlayManager.js (`js/managers/overlayManager.js`)

Queue-based blocking overlay controller.
- `Overlays.request({ show, hide, id })`: Pushes overlay onto queue, shows it, blocks input.
- `Overlays.release(el)`: Pops from queue, shows previous or resumes.
- `Overlays.reset()`: Clears all overlays (used after navigation to fix stale state).

## hotkeyManager.js (`js/managers/hotkeyManager.js`)

- `Hotkeys.register(key, fn)`: Registers a hotkey. Modifier keys: `control+shift+i`, etc.
- `Hotkeys.unregister(key, fn)`: Removes a registration.
- F11 toggles fullscreen. Ctrl+Shift+I opens devtools (dev mode only).

## statusBar.js (`js/shell/statusBar.js`)

Bottom status bar. Shows ComfyUI engine status, active model, generation progress.
- Listens to `comfy:starting`, `comfy:ready`, `comfy:error`, `tool:running`, `tool:idle`.

## windowControls.js (`js/shell/windowControls.js`)

Electron window controls — minimize, maximize, close. Uses Electron `remote` API.

## projectUI.js (`js/shell/projectUI.js`)

Project-scoped UI elements — project name display, breadcrumb, up-arrow navigation.

## memoryOps.js (`js/shell/memoryOps.js`)

Project export/import (portability).
```

- [ ] **Step 7: Write `docs/utils.md`**

```markdown
# Utilities

**Authoritative sources of truth for generic functionality.** If a utility exists in `js/utils/`, use it — do not reimplement the same logic elsewhere. Always check here before writing generic data-processing or DOM-manipulation code.

## dom.js (`js/utils/dom.js`) — DOM shorthands

**Most under-used utility file.** Most agents only use `qs()` but leave the rest behind.

| Function | What it does |
|---|---|
| `qs(sel, ctx)` | Short for `querySelector` — returns first match |
| `qsAll(sel, ctx)` | Returns all matches as array |
| `on(el, evt, fn, opts?) | Short for `addEventListener` — returns unsubscribe fn |
| `ready(fn)` | Calls fn when DOM is ready |
| `createElement(html)` | Creates an element from an HTML string |
| `attr(el, k, v?) | Gets or sets an attribute |
| `remove(el)` | Removes element from DOM |

**Rule:** Never use raw `document.querySelector` or `addEventListener`. Always use the shorthands here.

## icons.js (`js/utils/icons.js`) — SVG icon library

**The only permitted source of SVG icons.** Never paste raw SVG into templates.

- `icons.get(name)`: Returns the SVG string for the named icon.
- All icon names are defined in this file — if an icon doesn't exist, add it here first.
- Icons are referenced by name string, not by raw SVG.

## ratios.js (`js/utils/ratios.js`) — Aspect ratios

**Source of truth for all image/canvas aspect ratios.**

- `RATIOS` constant: named aspect ratio definitions (e.g. `RATIOS.square`, `RATIOS.landscape16x9`).
- Used by workspaces and components to maintain consistent proportional layouts.

## seed.js (`js/utils/seed.js`) — Random seed generation

- `generateRandomSeed()`: Returns a random integer seed.
- Used by ComfyUI generation payloads to randomize output.

## Other utilities

| File | Purpose |
|---|---|
| `async.js` | Async helpers (retry, timeout, etc.) |
| `file.js` | File path manipulation and I/O helpers |
| `images.js` | Image processing helpers |
| `video.js` | Video processing helpers |
| `string.js` | String manipulation helpers |
| `promptOptions.js` | Prompt template and option helpers |
```

- [ ] **Step 8: Write `docs/events.md`**

```markdown
# Events

Cross-component and cross-layer communication. Not just UI — events span the entire application.

## EventBus (`js/events.js`)

- `Events.on(event, handler)`: Subscribe. Returns an unsubscribe function — **always store and call it on cleanup.**
- `Events.emit(event, data)`: Broadcast an event.
- `Events.once(event, handler)`: One-time subscription.
- `Events.channel(namespace)`: Returns a namespaced bus (`bus.emit('subevent')` → `'namespace:subevent'` globally).

## Key Rule

**Never tight-couple components.** Do not directly call methods on other components. Emit an event instead.

## Canonical Event Map

Defined in `js/events.js` as `MpiEventMap`. Key events:

| Event | When it fires |
|---|---|
| `ui:error` | Request the shell to show an error dialog |
| `ui:close-all-popups` | Signal to close all floating UIs |
| `state:changed` | Global reactive state mutation (auto-fired by state Proxy) |
| `project:changed` | User switched active project |
| `comfy:starting` | ComfyUI engine is starting |
| `comfy:ready` | ComfyUI engine is ready |
| `comfy:error` | ComfyUI engine error |
| `tool:running` | A tool is actively running |
| `tool:idle` | All tools are idle |
| `nav:tool` | Navigation tool was activated |

## Cleanup Pattern (mandatory)

```javascript
setup: (el, props, emit) => {
    const unsub = Events.on('state:changed', handleStateChange);
    el.destroy = () => unsub(); // Always call unsubscribe
}
```

## State vs Events

- `state:changed` is auto-fired by the state Proxy. **Never manually call `Events.emit('state:changed', ...)`** — it fires twice if you do.
- `project:changed` is dispatched as a native `CustomEvent` in `projectManager.js` (known bug). Use `Events.on('project:changed', ...)` to subscribe.
- Other events (`comfy:*`, `tool:*`, `nav:*`) are emitted by their respective services/managers.
```

- [ ] **Step 9: Commit**

```bash
git add docs/workspaces.md docs/data.md docs/comfy.md docs/components.md docs/projects.md docs/shell.md docs/utils.md docs/events.md
git commit -m "docs: add all subsystem docs (workspaces, data, comfy, components, projects, shell, utils, events)"
```

---

## Task 3: Tighten `.claude/rules/` Sub-Agent Briefings

**Files:**
- Modify: `.claude/rules/workspaces.md`
- Modify: `.claude/rules/state.md`
- Modify: `.claude/rules/comfy_engine.md`
- Modify: `.claude/rules/comfy_injection.md`

- [ ] **Step 1: Read each rule file to find the existing `## Sub-Agent Briefing` section**

Run: Read `.claude/rules/workspaces.md`, `.claude/rules/state.md`, `.claude/rules/comfy_engine.md`, `.claude/rules/comfy_injection.md` — locate the `## Sub-Agent Briefing` section in each.

- [ ] **Step 2: Update workspaces.md briefing**

```markdown
## Sub-Agent Briefing

Read this section verbatim into any sub-agent prompt involving routing, navigation, or workspace layout.

**Three workspaces:** Landing (project select/create) → Gallery (default project view, all media) → Card History (single card detail, history, params). See `docs/workspaces.md` for details.

**Routing:** Use `js/router.js` (`navigate()` / `back()`) — never `window.location`.
**Gallery:** `js/workspaces/gallery/gallery.js`. Contains PromptBox for model-tied commands.
**Group History:** `js/workspaces/groupHistory/groupHistory.js`. Toolbar runs model-tied + universal commands. Universal commands (interpolate, videoUpscale, autoMaskImg) do not require a model.

**Dev Gallery:** `js/pages/components.js` — hidden, gated by `test_styles: true` in `dev_configs/app_config.js`. Ask before adding components.
```

- [ ] **Step 3: Update state.md briefing**

```markdown
## Sub-Agent Briefing

Read this section verbatim into any sub-agent prompt involving persistent application data.

**Source of truth:** `js/state.js` is the single source for all persistent data — selected models, current projects, generated images.

**The state object is a Proxy.** Mutate it with `state.myKey = value`. This automatically fires `state:changed` on the event bus. **Never manually call `Events.emit('state:changed', ...)`** — doing so causes double-fire.

**To react:** `Events.on('state:changed', ({ key, value }) => { ... })`. Always unsubscribe on cleanup.

**Local UI state** (dropdown open/closed, toggle state) MAY stay inside the component. Only data that must survive component unmount goes in `state.js`.

See `docs/data.md` for the state keys and their meaning.
```

- [ ] **Step 4: Update comfy_engine.md briefing**

```markdown
## Sub-Agent Briefing

Read this section verbatim into any sub-agent prompt involving the ComfyUI backend, model registry, or Python engine.

**Model registry source of truth:** `js/data/modelRegistry.js` — all generative models (checkpoints, LoRAs, custom nodes) are defined here. Add new models to `MODELS` or `DEPS` here only.

**Install status:** Never hardcode `installed: true` in the registry. `syncModelInstalled()` in modelRegistry hits `GET /comfy/models/check` and sets `installed` dynamically at runtime.

**No direct Python/pip:** All engine management is via `routes/comfy.js` and `routes/shared.js`. Never spawn Python manually.

**New model checklist:** (1) Add to `MODELS` in modelRegistry, (2) check `DEPS` in `modelConstants/dependencies.js` for dependency array, (3) provide `workflows` map with op→workflowFile entries.

See `docs/comfy.md` for the ComfyUI integration overview and `docs/data.md` for the registry structure.
```

- [ ] **Step 5: Update comfy_injection.md briefing**

```markdown
## Sub-Agent Briefing

Read this section verbatim into any sub-agent prompt involving ComfyUI workflow execution.

**Title-based injection:** Target nodes exclusively by `_meta.title` (case-insensitive). Never hardcode node IDs. Use `filter` not `find` when locating nodes — multiple nodes can share a title.

**Never call ComfyUI directly** from UI components. All workflow calls go through `ComfyUIController.runWorkflow(...)` in `js/services/comfyController.js`.

**Required capture node:** Every workflow must have a node titled `"Output"` (case-insensitive). This is the canonical result node.

**Upload images/masks:** Pass Data URIs, blob URLs, http URLs, or local paths to `Input_Image` / `Input_Mask` — the controller uploads automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching.

**Standard title map:** `"Positive"`/`"Negative"` → `inputs.value`, `"Seed"` → `inputs.int`, `"Checkpoint"` → `inputs.ckpt_name`, `"Lora_1"`…`"Lora_6"` → `{ lora_name, strength_model, strength_clip }`, `"Input_Image"`/`"Input_Mask"` → auto-uploaded. Full table in `docs/comfy.md`.

See `docs/comfy.md` for the full injection pattern and example.
```

- [ ] **Step 6: Commit**

```bash
git add .claude/rules/workspaces.md .claude/rules/state.md .claude/rules/comfy_engine.md .claude/rules/comfy_injection.md
git commit -m "docs: tighten Sub-Agent Briefings to point to subsystem docs"
```

---

## Self-Review Checklist

### Spec coverage
- [ ] **docs/PROJECT.md hub** — Task 1
- [ ] **8 flat subsystem docs** (workspaces, data, comfy, components, projects, shell, utils, events) — Task 2
- [ ] **Documentation Drift one-liner in CLAUDE.md** — Task 0
- [ ] **4 rule briefing tightens** (workspaces, state, comfy_engine, comfy_injection) — Task 3

### Placeholder scan
- [ ] No "TBD" / "TODO" / "implement later" in steps
- [ ] No "add appropriate error handling" without actual code
- [ ] No "similar to X" without repeating code

### Type consistency
- [ ] All doc paths are flat files (e.g. `docs/workspaces.md`, not `docs/workspaces/README.md`)
- [ ] All briefings point to `.md` files (e.g. `docs/workspaces.md`)
- [ ] Canonical event names in events.md match `MpiEventMap` in `js/events.js`
