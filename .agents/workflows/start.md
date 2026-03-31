---
description: Understanding this project
---

# Start Here — MpiAiSuite Project Orientation

## Step 1: Read the Docs First

Before writing a single line of code, read these in order:

1. **`dev_docs/06_refactor_master_plan.md`** — ⭐ **READ THIS FIRST if R8 refactor is active.** Check which phase is current and what files have been deleted/moved.
2. **`dev_docs/01_overview.md`** — product overview, user goals, app structure, full folder map
3. **`dev_docs/04_technical_notes.md`** — critical gotchas; read the section relevant to your task before touching anything

## Step 2: Know the Architecture

The app has been fully refactored (R1–R7 + R8 in progress). The file map is:

### Frontend (Browser — ES Modules)
| File | Purpose |
|---|---|
| `js/toolRegistry.js` | ⭐ Single source of truth for ALL tools — add a tool here, nowhere else |
| `js/toolUtils.js` | ⭐ Shared tool utilities — `getLoadableUrl`, `uploadImageToProject`, `saveResultToLibrary`, etc. |
| `js/events.js` | ⭐ Central Event Bus — use `Events.emit/on` for cross-module communication |
| `js/utils/dom.js` | DOM helpers: `qs`, `qsa`, `on`, `off` |
| `js/utils/async.js` | Timing: `debounce`, `throttle`, `sleep` |
| `js/utils/seed.js` | `generateSeed()` — 14-digit random seed |
| `js/shell.js` | App orchestrator — navigation, sidebar, project grid, model selector injection |
| `js/provisioning.js` | Download Manager + Advanced Settings screens |
| `js/tools/*.js` | Individual tool modules — each exports `init*()` and `destroy()` |
| `js/comfyController.js` | WebSocket lifecycle + ComfyUI workflow runner |
| `js/state.js` | Global app state |
| `js/toolState.js` | Per-project, per-tool persistence + Project Templates API |
| `js/uiHelpers.js` | Legacy helpers (`generateSeed` re-exports from utils) |
| `js/dialogs.js` | `MpiAlert()`, `MpiConfirm()`, `MpiPrompt()` — use these, NOT native alert/confirm |

### Component System (Factory — js/components/)
| Path | Purpose |
|---|---|
| `js/components/factory.js` | Core lifecycle engine (mount, update, destroy, emit) |
| `js/components/types.js` | ⭐ Read this for all component props before using any component |
| `js/components/Primitives/` | Atomic: MpiButton, MpiIcon, MpiInput, MpiBadge, MpiSpinner, MpiToast, MpiProgressBar, MpiPopup |
| `js/components/Compounds/` | Composed: MpiIconButton, MpiSlider, MpiMediaDropzone, MpiPopupButton, MpiScrollableBox, MpiDragList, MpiMuteIcon, MpiVolumeControl |
| `js/components/Blocks/` | Sections: MpiPromptBox, MpiDropdown, MpiRatioSelector |

> ⚠️ **R8 NOTE:** `PromptBox.js`, `Slider.js`, `MuteIcon.js`, `VolumeControl.js`, `customDropdown.js`, `videoPlayerCore.js` have been DELETED. Import from the Compounds/Blocks paths above.

### Backend (Node.js — CommonJS)
| File | Purpose |
|---|---|
| `server.js` | ⭐ 62 lines — Express mount only. Do NOT add routes here |
| `routes/shared.js` | All shared constants + helper functions |
| `routes/projects.js` | All project CRUD + media library + template routes |
| `routes/llm.js` | `/llm/*` — model management + inference |
| `routes/engine.js` | `/engine/*` — binary provisioning |
| `routes/comfy.js` | `/comfy/*` — process management + workflow/model routes |

### CSS
| File | Purpose |
|---|---|
| `styles/01_base.css` | Design tokens, CSS resets |
| `styles/02_shell.css` | Sidebar, landing page, shell layout |
| `styles/03_forms.css` | Form elements, modals (global only — no component internals) |
| `styles/04_comfy.css` | ComfyUI panels (global only) |
| `styles/05_tools.css` | Tool layout skeletons (global only) |
| `js/components/*/  *.css` | Component-specific styles (co-located with each component) |

## Step 3: Critical Rules

- **New UI element?** → Check `types.js` for an existing component first. Use factory system.
- **Adding a new tool?** → Run `/implement_new_tool`. Only touch `toolRegistry.js`, a new `js/tools/*.js`, `templates/tpl-yourtool.html`, and `index.html` (sidebar button).
- **New backend route?** → Add to the relevant `routes/*.js` file. Never add to `server.js`.
- **Cross-module event?** → Use `Events.emit/on` from `js/events.js`. Never `document.dispatchEvent` in tool files.
- **Shared utility needed?** → Check `js/utils/` first, then `js/toolUtils.js`.
- **ComfyUI tool?** → Use `ComfyUIController.runWorkflow()`. **Never** create a raw WebSocket.
- **DO NOT edit** anything in `engine/`, `node_modules/`, or `data/`.
- **R8 Refactor active?** → Read `dev_docs/06_refactor_master_plan.md` before touching anything.

## Step 4: Before You Write

Check `dev_docs/04_technical_notes.md` for the section matching your task. That file documents known bugs, established patterns, and non-obvious constraints.
- **DO NOT edit** `dev_configs/comfy_workflows.json` workflow files (the `.json` files in `comfy_workflows/` folder). Workflow files are authored in the ComfyUI UI and exported.
- **ComfyUI mappings** — always inject by `_meta.title`, never by node ID. Run `/comfyui_mapping_rules` for the full dictionary.
Check `dev_docs/04_technical_notes.md` for the section matching your task. That file documents known bugs, established patterns, and non-obvious constraints that you will hit if you don't read them first.
