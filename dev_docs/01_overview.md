# Mpi AI Suite — App Overview

**What it is:** A multi-tool local AI workstation. Users create projects and run generative AI workflows entirely offline using local LLMs and ComfyUI — no cloud required.

**Platform:** Electron desktop app (Cross platform target). Backend is Node.js/Express. Frontend is a vanilla JS SPA with a custom router — no bundler, no React.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Native wrapper | Electron (`main.js`) |
| Backend | Node.js + Express (`server.js`) |
| Frontend | Vanilla JS SPA (`js/`) |
| Image/video/audio generation | ComfyUI (embedded Python, port 8188) |
| LLM inference | `llama-server.exe` (standalone binary, various GGUF models) |
| Styling | `styles.css` (import entry point) + `styles/` partials (5 files, vanilla CSS) |

---

## Key Files

| File | Role |
|---|---|
| `main.js` | Electron entry — window config, IPC, header spoofing for ComfyUI WS |
| `server.js` | Express backend orchestrator (routes in `routes/*.js`) |
| `index.html` | App shell HTML — static DOM, sidebar, lazy-loads templates |
| `templates/tpl-*.html`| HTML fragments for individual tools |
| `styles.css` | All styling (*@import* entry point for `styles/` partials) |
| `js/shell.js` | Main frontend orchestrator — navigation, model selector injection |
| `js/toolRegistry.js` | Single source of truth for tool setup, type, and templates |
| `js/router.js` | Lightweight SPA router |
| `js/state.js` | Global reactive state store |
| `js/toolState.js` | Per-project, per-tool state persistence |
| `js/components/factory.js` | Core Component Factory engine (Lifecycle, CSS, Events) |
| `js/components/types.js` | Centralized JSDoc type definitions for AI agents |
| `js/components/README.md` | Component architecture guide — read before any UI work |
| `js/components/Primitives/` | Atomic components (MpiButton, MpiIcon) — zero dependencies |
| `js/components/Compounds/` | Composed components (MpiIconButton) — imports Primitives only |
| `js/components/Blocks/` | Full sections — imports Compounds + Primitives |
| `js/pages/components.js` | Component Gallery page controller (dynamic mount logic) |
| `templates/tpl-components.html` | Component Gallery test page template |
| `js/components/PromptBox.js` | Universal prompt generation / image-drop component |
| `js/tools/cropExtract/CaptureEngine.js` | HTML5 Video frame-to-image capture engine |
| `dev_configs/comfy_workflows.json` | ComfyUI workflow registry (deps, install flags) |
| `dev_configs/llm_models.json` | LLM model registry (download URLs, VRAM needs) |
| `dev_configs/system_dependencies.json` | Python/ComfyUI release versions to provision |

---

## Folder Map

```
MpiAiSuite/
├── main.js                 # Electron entry
├── server.js               # Node/Express backend orchestrator
├── index.html              # SPA shell
├── styles.css              # CSS entry point (@import only)
├── styles/                 # CSS partials (01_base → 05_tools)
│   ├── 01_base  → tokens, reset, utilities, animations
│   ├── 02_shell → app shell, titlebar, sidebar, landing page + project cards
│   ├── 03_forms → modals, forms, buttons, wizard, model cards, provisioning
│   ├── 04_comfy → ComfyUI preview monitor, generator flow, prompt box, media library
│   ├── 05_tools → prompt builder, masking panel, detailer tool
├── Start.bat               # Dev launch shortcut
├── templates/              # Tool HTML fragments (lazy-loaded)
├── routes/                 # Express route modules
│   ├── shared.js           # Shared context, constants, process mgmt
│   ├── comfy.js            # ComfyUI workflow & asset handlers
│   ├── engine.js           # Node/Python binary provisioning
│   ├── llm.js              # Llama server interactions
│   ├── projects.js         # Project and Media Library CRUD
│   └── system.js           # OS folder dialogs and system stats
├── js/
│   ├── shell.js            # App orchestrator
│   ├── router.js           # SPA router
│   ├── state.js            # Global state
│   ├── toolState.js        # Tool state cache
│   ├── toolRegistry.js     # Tool definitions & routing table
│   ├── toolUtils.js        # Shared tool constants and logic
│   ├── comfyController.js  # ComfyUI WS client & execution runner
│   ├── comfyModelManager.js# ComfyUI dep manager UI logic
│   ├── llmService.js       # LLM API client
│   ├── templateLoader.js   # Lazy HTML template fetcher/cacher
│   ├── imageProcessor.js   # Canvas/thumbnail logic
│   ├── projectManager.js   # Project CRUD
│   ├── uiHelpers.js        # Shared DOM utilities
│   ├── dialogs.js          # Custom MpiAlert/MpiConfirm/MpiPrompt
│   ├── elements.js         # Shared DOM element references
│   ├── init.js             # App boot sequence & global shortcuts
│   ├── mediaActions.js     # Media actions registry
│   ├── provisioning.js     # Provisioning UI logic
│   ├── components/
│   │   ├── factory.js             # Core Component Factory engine (mount/update/destroy)
│   │   ├── types.js               # Centralized JSDoc type definitions (read before UI work)
│   │   ├── README.md              # Architectural guide
│   │   ├── Primitives/            # Tier 1 — atomic, zero dependencies
│   │   │   ├── MpiButton/         # MpiButton.js + MpiButton.css
│   │   │   └── MpiIcon/           # MpiIcon.js (exports ICONS registry) + MpiIcon.css
│   │   ├── Compounds/             # Tier 2 — composes Primitives only
│   │   │   └── MpiIconButton/     # MpiIconButton.js + MpiIconButton.css
│   │   ├── Blocks/                # Tier 3 — full sections (none yet)
│   │   ├── PromptBox.js           # Universal text/image prompt container
│   │   ├── Slider.js              # Premium slider component (popups, wheel, minimal)
│   │   ├── MuteIcon.js            # Standardized mute/volume icon button
│   │   ├── VolumeControl.js       # Unified mute + slider popup orchestrator
│   │   ├── mediaContextMenu.js    # Native right-click menu system
│   │   ├── customDropdown.js      # Reusable collapsible picker component
│   │   ├── mediaDetailModal.js    # Image preview modal
│   │   ├── assetBrowserModal.js   # Media browser overlay
│   │   ├── modelManagerModal.js   # Download manager modal
│   │   └── shaderBackground.js    # WebGL landing page bg
│   ├── interactiveCanvas/         # Modularized canvas sub-managers
│   │   ├── ViewManager.js         # Zoom/pan logic
│   │   ├── MaskManager.js         # Masking/brush logic
│   │   ├── ComparisonManager.js   # A/B slider logic
│   │   └── InputController.js     # Input event orchestration
│   ├── pages/
│   │   ├── components.js          # Component Gallery — dynamic mount logic (buildIconSection)
│   │   ├── mediaLibrary.js        # Media Library page
│   │   └── settings.js            # Settings page
│   └── tools/
│       ├── generator.js           # SDXL image generator
│       ├── detailer.js            # Region detailer tool
│       ├── upscaler.js            # Image upscaler tool
│       ├── cropExtract.js         # Video crop & trim tool
│       ├── compare.js             # 3-column image comparison tool
│       ├── promptBuilder.js       # Modular prompt builder
│       ├── llm.js                 # LLM chat tool
│       ├── descriptor.js          # Image descriptor tool
│       ├── translator.js          # Translator tool
│       ├── jsonFormatter.js       # JSON formatter utility
│       └── cropExtract/
│           └── CaptureEngine.js   # HTML5 Canvas frame extractor
├── templates/              # Tool HTML fragments (lazy-loaded via templateLoader.js)
│   └── tpl-components.html # Component Gallery test page (icon section is JS-generated)
├── dev_configs/            # App-controlled config JSONs
├── comfy_workflows/        # ComfyUI workflow JSON files
├── engine/                 # Embedded ComfyUI & Python
├── .agents/workflows/      # Agent slash-command workflows (implement_new_component, etc.)
├── data/models/            # Local GGUF model files
├── projects/               # User project folders (project.json + Media/)
├── resources/              # Static assets (icons, etc.)
└── dev_docs/               # AI agent documentation
```

---

## ComfyUI Integration Notes

- **Port:** `8188`
- **Node injection:** Title-based via `_meta.title` (e.g. `"Positive"`, `"Negative"`, `"Seed"`, `"Width"`). Never use hardcoded node IDs.
- **Model paths:** External models go in custom models root (user-configurable in Settings). `custom_nodes/` is always internal to `engine/`.
- **Previews:** `--preview-method taesd` is injected at startup by `server.js`.
- **WS security:** `main.js` spoofs `Origin` header to `http://127.0.0.1:8188` for all local requests.

### The `runWorkflow` Contract

**All ComfyUI tools use `ComfyUIController.runWorkflow()`. No exceptions.**

The Generator, Detailer, and Upscaler all follow the same execution pattern:

```js
await ComfyUIController.runWorkflow(workflowOrId, params, (msg) => {
    if (msg.type === 'preview')  { /* latent frame — update canvas */  }
    if (msg.type === 'progress') { /* step count — update progress bar */ }
    if (msg.type === 'executed') { /* msg.data.node_title injected by controller */ }
});
```

- Pass a **workflow ID string** and `params` object (controller handles loading + title injection), OR
- Pass a **pre-injected workflow JSON** object as the first arg and `{}` as params (Generator pattern — does its own complex injection first).
- The controller resolves the promise when `executing { node: null }` arrives (generation complete or interrupted).
- `msg.data.node_title` is always populated by the controller before the callback fires — use it to filter for `"output"` nodes.

> See `04_technical_notes.md` — *ComfyUI WebSocket Architecture* section — for the full rationale.
