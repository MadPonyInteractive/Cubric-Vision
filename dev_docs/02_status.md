## 🏗️ Component Gallery — Dynamic Icon Section ✅ (2026-03-30)

### What was done
- **Exported ICONS registry**: Added `export` to `const ICONS` in `js/components/Primitives/MpiIcon/MpiIcon.js` — it is now the single source of truth for all icon keys. Consumers (the gallery, other agents) import it directly instead of maintaining their own hardcoded lists.
- **Dynamic gallery section**: Replaced ~240 lines of hardcoded `comp-card` HTML in `templates/tpl-components.html` with a single `<div id="grid-MpiIcon"></div>` shell. `js/pages/components.js` now builds all icon cards programmatically via `buildIconSection()`.
- **Two-pass DOM pattern**: `buildIconSection()` uses a two-pass approach — (1) build all card shells into a `DocumentFragment` and flush to DOM via `grid.appendChild(frag)`, then (2) call all `mount()` calls. This is required because `document.getElementById()` returns `null` for nodes still inside a `DocumentFragment`, silently skipping the render.
- **Full registry coverage**: The old hardcoded list was missing 13 icons (`menu`, `chevronDown`, `chevronRight`, `back`, `minus`, `seed`, `unload`, `negative`, `volumeOff`, `volumeLow`, `volumeHigh`, and all `ratio_*` icons). All are now shown automatically.
- **`makeIconCard()` helper**: Extracted a reusable factory for `.comp-card` shells used by all gallery sections.
- **`filterComponents()` updated**: Added `'MpiIcon'` to the section ID list to match the new dynamic section ID.
- **Workflow created**: `/.agents/workflows/implement_new_component.md` — callable via `/implement_new_component`. Teaches agents the 5-step process for creating a new component and wiring it to the gallery, including the DOM-before-mount rule.

### Key pattern (DOM-before-mount)
> Adding icon cards to a DocumentFragment and calling `mount()` before `grid.appendChild()` silently no-ops — `document.getElementById` returns `null` for non-live nodes. Always flush to DOM first, then mount.

---

## 🏗️ Component Factory Architecture — Phase 1 Infrastructure ✅ (2026-03-30)

### What was done
- **Core Engine Implementation:** Created `js/components/factory.js` as the standard lifecycle manager (mount, update, destroy) for all future components.
- **AI-Optimized Metadata:** Created `js/components/types.js` to house centralized JSDoc types, significantly reducing AI token usage for future UI work.
- **Architectural Guardrails:** Updated `dev_docs/05_components.md` and created `js/components/README.md` to define the 3-tier hierarchy (Primitives, Compounds, Blocks) and styling standards.
- **Path Calibration:** Fixed initial relative import issues for standard ESM modules without a bundler.
- **Verified Discovery:** Confirmed the system works as intended with a test toggle (since removed) before finalizing infrastructure.

---

## 🎬 UI Components — Slider & Mute standardization ✅ (2026-03-30)

### What was done
- **Standardized Slider Component:** Created `js/components/Slider.js` as a premium, recursive UI element supporting horizontal/vertical orientations, popup modes, container-based mouse wheel support, and editable value labels.
- **Standardized MuteIcon Component:** Created `js/components/MuteIcon.js` to provide consistent volume/mute visual feedback across all video-enabled tools.
- **Unified VolumeControl Component:** Created `js/components/VolumeControl.js` to encapsulate the orchestration between `MuteIcon` and the `Slider` popup, significantly reducing boilerplate in tool implementations.
- **Hover "Bridge" Pattern:** Implemented an invisible `::after` bridge in `03_forms.css` for `.mpi-slider--popup`. This fills the interaction gap between triggers and popups, preventing premature closure during slow mouse movements.
- **Logic Refactoring:** Migrated `cropExtract.js` and `videoPlayerCore.js` to the new `VolumeControl` component, enabling `showValue: false` for a cleaner, more premium toolbar aesthetic.
- **InteractiveCanvas Restoration:** Fixed a critical property regression in `InteractiveCanvas.js` by restoring the `imgAfter` setter, resolving `TypeError` crashes in the `Compare` tool.
- **DOM Stability:** Fixed a structural bug in `tpl-cropExtract.html` by replacing an SVG container with a `div` for the mute icon, ensuring correctly rendered button injection.

---


### What was done
- **Pixel-Perfect Centering:** Refined `.ce-volume-slider` CSS in `05_tools.css`. Set matching 18px height for both input and thumb, adjusting `margin-top` to `-3px` to achieve cross-browser vertical centering after rotation.
- **Enhanced Scroll Interaction:** Shifted the `wheel` event listener from the thin slider track to the entire `ce-volume-popup` container, providing a much larger and more intuitive hit area for volume adjustment.
- **Volume & Mute Recall:** Implemented full state persistence for audio. Volume levels and muted status are now tracked in `state.js` and `toolState.js`, ensuring they are correctly restored when navigating between tools or returning to the tool.
- **Mute-Sync Logic:** Fixed the volume slider to correctly jump to 0% and drain the "liquid" fill when muted, and restore to the previous level when unmuted.
- **Visual Sync:** Ensured the visual gradient track (`--val`) updates immediately during scroll and mute actions.

---

## 🎬 Crop & Extract — UI/UX & Media Pipeline Fixes ✅ (2026-03-29)

### What was done
- **Volume Slider Fix:** Removed legacy `writing-mode`/`direction` CSS hacks from `.ce-volume-slider`, relying fully on `-webkit-appearance: slider-vertical` to fix horizontal squishing in Chromium.
- **Aspect Ratio State Sync:** Re-injected `ce-currentRatioText` and `ce-currentRatioIcon` DOM updates into `initCropExtract()` to fix the visual desync when returning to the tool after navigation.
- **Media Card Video Cropping:** Split `.media-card video` from `img` in `04_comfy.css`. Applied `object-fit: contain` and a fallback background so thumbnail videos render their native aspect ratio (letterboxing) instead of cropping destructively.
- **Data/Temp Extraction Bypass:** Implemented a `saveToLibrary` boolean flag for `extractClip()`. Pure downloads (false) now temporarily route through `<projectFolder>/data/temp` rather than the `Media` folder, preventing single-frame downloads from automatically populating the project's permanent asset library.
- **Modal Video Canvas Push Logic:** Wrapped the `previewContainer.appendChild(interactiveCanvas.canvas)` inside the modal strictly under the `item.type === 'image'` conditional. This fixed the layout pushing bug where the `<video>` element was squeezed aside, and also eradicated the persistent "ghost image" bug when alternating between images and videos.

---

## 🎬 Crop & Extract — Full Tool Integration ✅ (2026-03-29)

### What was done
- **Core Infrastructure** — Implemented high-performance binary streaming for large videos and per-project isolated state persistence.
- **Precision Cropping** — Created an aspect-ratio-locked resizing engine with `getVideoBounds()` logic that compensates for letterboxing/pillarboxing.
- **Interaction Model** — Draggable In/Out trim markers with magnetic playhead snapping and a 48ms throttled seeking engine for fluid previews.
- **Visual Context** — Dynamic 10-frame filmstrip timeline and a context-aware Rule-of-Thirds grid (active only on drag).
- **Backend Processing** — Built a high-performance FFmpeg extraction route for cropping and trimming sub-clips into high-quality `.mp4` format.
- **Library Integration** — Direct-save frame capture and asset browser video filtering with hover-previews.

---

> **This is the first file an agent should read.** It answers: "where are we, what's active, what's next?"

---

## 🏁 Detailer Full Restoration & UI Cleanup ✅ (2026-03-28)

### What was done
- **Detailer ComfyUI 400 fixes** — `Checkpoint` only injected when non-null; `sams` always sends a real model filename with `bbox/` prefix (e.g. `bbox/face_yolov8n.pt`) — required by `UltralyticsDetectorProvider`; empty string in ckpt_name nodes causes graph validation failure.
- **Mask indexing** — `Selected_Masks_Input` indices are 1-based in ComfyUI; thumbnail `dataset.index` corrected from `index` → `index + 1`.
- **Output node capture** — `runWorkflow` collects images from ALL executed nodes; `triggerEnhance` now captures only the node titled `'Output'` in the callback, ignoring `Detected` / `Output_Mask` intermediate outputs.
- **Mask from modal → Manual mode** — When `state.detailerInputMask` arrives, `state.detailerMaskMode` is forced to `'manual'` before UI sync.
- **Raw mask separation (`currentMaskRaw`)** — Display overlay (`maskOverlay` canvas) and raw mask (white=painted) kept as separate data. Modal re-edit receives `currentMaskRaw`; ComfyUI receives `_buildComfyMask()` output.
- **ComfyUI mask encoding** — `LoadImage` derives mask from alpha and INVERTS it (`mask = 1 - alpha/255`). Painted areas → `A=0` (transparent → mask=1.0 → selected for detail). Background → `A=255` (opaque → mask=0.0 → skipped). Previous solid-opaque PNG caused all-zero mask tensor → "Empty mask" error.
- **Save button removed from prompt bars** — Detailer & Upscaler save buttons removed from templates and JS; save is now via right-click context menu on result image.
- **Clear removed from context menu** — `clear` action removed from `mediaActions.js`.
- **`isSaved` fix in shell.js** — Right-click on right side of comparison canvas (comp URL) → `isSaved=false` → Save appears. Left side (source, already in library) → `isSaved=true` → Save hidden.

---

## 🏁 Detailer Recovery & Global Media Intercept ✅ (2026-03-28)

### What was done
- **Global Media Context Menu** — Migrated from scattered tool-specific context bindings to a single global listener in `js/shell.js`. It natively intercepts right-clicks on any `<img>` or Interactive Canvas, automatically parsing standard and comparative states to feed the Context Menu.
- **Detailer Tool Recovery** — Completely reconstructed `js/tools/detailer.js` after an accidental editor deletion. Integrated the `isReady` auto-masking preview loop, detection thumbnails, and ComfyUI JSON mapping variables exactly as they were previously engineered but it needs continuous reconstruction with support from the developer.
- **DevTools Shortcut Fixed** — Added the `toggle-dev-tools` IPC listener into `main.js` so `Ctrl+Shift+I` correctly opens the Chrome DevTools inspector in the compiled Electron window.

---

## 🏁 Seed Generation Standardization ✅ (2026-03-28)

### What was done
- **Standardized Seed Logic in Generator** — Replaced hardcoded `Math.floor(Math.random() * 100000000000000)` calls in `js/tools/generator.js` with the centralized `generateSeed()` utility from `js/uiHelpers.js`.
- **Verified Detailer Compliance** — Confirmed that the Detailer tool is already using the centralized utility.
- **Consistency Audit** — Ensured all generative tools now use the same 14-digit random range for seeds, improving maintainability and cross-tool consistency.

---

## 🏁 Universal PromptBox Architecture & Universal Refactoring ✅ (2026-03-28)

### What was done
- **Created `js/components/PromptBox.js`** — Centralized, reusable text/image prompt input wrapper.
- **Unified Event Handling** — Centralized drop-and-drag handling (images, URLs, raw text), hotkeys (`Ctrl+Enter`, `Enter`), and clipboard interactions inside a unified controller instance.
- **Feature Standardization** — Advanced features like pos/neg toggles, visual prompt lengths, and URL extraction are now built-in.
- **Refactored 7 Tools** to use `PromptBox.js` directly:
  - Generator
  - Detailer
  - Upscaler
  - Prompt Builder (with `readonly` injection)
  - LLM
  - Descriptor
  - Translator
  - JSON Formatter
- **Purged Legacy Handlers** — Hundreds of lines of redundant `<textarea>` manual logic, auto-expand scripts, and ad-hoc copy buttons deleted from individual tool instances.
- **Updated Workflows** — Documented the new pattern in `start.md`, `implement_new_tool.md`, and `debug_and_fix.md`.

---

## 🏁 Refactor Stage R7 — Final Audit & Triage ✅ (2026-03-27)

### Audit Results — ALL TOOLS VERIFIED GREEN

Tested by navigating every tool in a live browser session against the Node server (`node server.js`). Zero console errors observed across the full navigation flow.

| Tool | Status | Notes |
|---|---|---|
| Landing Page | ✅ | Shader background, project grid, New Project modal |
| Project Creation | ✅ | Creates project, navigates to shell |
| Prompt Builder | ✅ | Layer system, preset selector, floating prompt bar |
| LLM | ✅ | Model selector present, chat UI renders |
| Descriptor | ✅ | Drop zone, describe button, model selector |
| Translator | ✅ | Text input, translation UI |
| JSON Formatter | ✅ | Textarea, model selector, submit button |
| Generator | ✅ | Full prompt UI, model selector, advanced controls |
| Editor | ✅ | Correctly shows "Coming Soon" state |
| Detailer | ✅ | Source image zone, masking control, prompt bar, action buttons |
| Upscaler | ✅ | Grid controls, canvas layout |
| Resizer | ✅ | Correctly shows "Coming Soon" state |
| Compare | ✅ | Left/right drop slots, swipe handle |
| Media Library | ✅ | Tab nav, empty state, grid |
| Settings | ✅ | API URLs, auto-start toggle, LLM manager |
| Help | ✅ | Keyboard shortcuts guide |
| About | ✅ | App info |

### Template loading confirmed
All 15 templates are lazily fetched from `/templates/tpl-*.html` on first navigation and cached in `<head>` — no inline templates in `index.html`. Zero HTTP errors.

### Refactor declared complete
**R1 ✅ R2 ✅ R3 ✅ R4 ✅ R5 ✅ R6 ✅ R7 ✅ — All stages complete.**

Pre-existing tool function bugs (seed persistence, canvas centering, etc.) are tracked in their own sessions and are unrelated to the refactor architecture.

---



### What was done
- **Created `js/templateLoader.js`** — lazy HTML template loader:
  - `ensureTemplate(tplId)` — fetches `templates/<id>.html`, parses it with `DOMParser`, adopts + injects the `<template>` element into `<head>` on first use; subsequent calls return from DOM instantly (zero fetch cost)
  - `preloadTemplates(ids[])` — parallel warm-up for always-needed templates
  - Request de-duplication via in-flight `Map` — concurrent calls for the same ID share one fetch
- **Extracted 15 `<template>` blocks** from `index.html` into `templates/*.html`:
  - `tpl-promptBuilder`, `tpl-comingSoon`, `tpl-compare`, `tpl-provisioning`, `tpl-settings`, `tpl-about`, `tpl-help`, `tpl-descriptor`, `tpl-translator`, `tpl-jsonFormatter`, `tpl-llm`, `tpl-generator`, `tpl-detailer`, `tpl-upscaler`, `tpl-mediaLibrary`
- **Stripped `index.html`** — **1,940 → 695 lines, 103KB → 37KB**; replaced each block with a one-line `<!-- tpl-xxx → templates/tpl-xxx.html -->` stub
- **Updated `js/shell.js`**:
  - Added `import { ensureTemplate, preloadTemplates } from './templateLoader.js'`
  - Made `loadTool()` `async`
  - Converted all 7 `document.getElementById('tpl-xxx')` calls to `await ensureTemplate('tpl-xxx')`
  - Added `preloadTemplates(['tpl-provisioning', 'tpl-comingSoon', 'tpl-settings', 'tpl-about', 'tpl-help'])` in `initShell()` for zero-latency common navigation
- **Updated `js/provisioning.js`**:
  - Added `import { ensureTemplate } from './templateLoader.js'`
  - Made `showEngineProvisioningScreen()` `async`
  - Converted all 3 `document.getElementById('tpl-provisioning')` calls to `await ensureTemplate('tpl-provisioning')`

### File responsibility map after R6
| Location | Purpose |
|---|---|
| `index.html` | 695 lines — app shell, sidebar, modals, static DOM only |
| `templates/tpl-*.html` | 15 HTML fragments, one per tool/screen |
| `js/templateLoader.js` | Lazy fetcher — `ensureTemplate()` + `preloadTemplates()` |

### Adding a new tool's template (agent guide)
1. Create `templates/tpl-yourtool.html` containing exactly `<template id="tpl-yourtool">...</template>`
2. In `index.html` add a one-line stub: `<!-- tpl-yourtool → templates/tpl-yourtool.html -->`
3. In `js/shell.js` sidebar: add a `<button data-tool="yourtool">` (no template logic needed in JS)
4. `shell.js` will call `ensureTemplate('tpl-yourtool')` automatically via the registry

### Next: R7 — Final Audit & Triage
Systematically test every tool, document broken ones, and fix them.

---



### What was done
- **Rewrote `.agents/workflows/start.md`** — expanded from a 2-line stub to a full project orientation guide:
  - Complete frontend + backend + CSS file responsibility map (post-R4 architecture)
  - Critical rules for adding tools, routes, and utilities
  - Explicit "do not touch" list (engine/, node_modules/, workflow JSON files)
- **Rewrote `.agents/workflows/debug_and_fix.md`** — updated for post-R4 structure:
  - Symptom → location table now maps to `routes/*.js` instead of `server.js`
  - Correct CSS file names (no longer `styles.css` — use `styles/01_base.css` → `05_tools.css`)
  - Added entries for provisioning, dropdown component, and tool registry bugs
  - Backend fix rules updated to route-level granularity
- **Rewrote `.agents/workflows/implement_new_tool.md`** step 3:
  - Removed outdated "edit shell.js lists" instruction
  - Replaced with correct `js/toolRegistry.js` single-entry pattern with full field documentation
- **Updated `dev_docs/04_technical_notes.md`**:
  - Added **Shared Tool Utilities API** section at the top (complete `toolUtils.js` export reference with signatures and code examples)
  - Fixed 3 outdated `server.js` references → correct `routes/shared.js` and `routes/comfy.js` references
- **Updated `dev_docs/06_refactor_plan.md`** — full rewrite:
  - R1–R4 marked complete with exact implementation details (what was created, what was changed, key design decisions)
  - R5 expanded into an actionable spec
  - Current architecture tree diagram
  - "Adding a new tool" 5-file checklist
  - CSS inventory with sizes (confirms CSS was already modular — no reorganization needed)

### Net effect
An agent starting fresh from `/start` or `/implement_new_tool` will now get the correct architecture on the first read, without needing to grep through source code to discover what changed.

### Next: Stage R6 — HTML Template Extraction (Deferred)
Break `index.html` (~103KB) into per-tool template files. High risk — defer until app is fully stable.

---



### What was done
- **Created `routes/shared.js`** — all cross-cutting server concerns in one place:
  - Constants: `DEFAULT_PROJECTS_ROOT`, `MODELS_ROOT`, `LLM_CONFIG_PATH`, `COMFY_WORKFLOWS_PATH`, etc.
  - Process state object (`activeLlamaProcess`, `activeComfyProcess`, `activeModelId`) — shared by reference across all route modules
  - `stopLlamaServer()`, `stopComfyUI()` — process killers
  - `streamDownload()` — memory-efficient streaming download with redirect
  - `runPipCommand()`, `isPackageRequiredElsewhere()` — pip wrappers
  - `resolveComfyPath()`, `getCustomRoot()`, `findFileRecursive()`, `cleanEmptyDirs()`, `isWorkflowInstalled()`, `syncWorkflowStates()`
- **Created `routes/system.js`** — `/system/stats`, `/choose-folder`, `/open-folder`
- **Created `routes/projects.js`** — all project CRUD and media library endpoints
- **Created `routes/llm.js`** — `/llm/models`, `/llm/download`, `/llm/delete`, `/llm/unload`, `/llm/generate`
- **Created `routes/engine.js`** — `/engine/status`, `/engine/download`
- **Created `routes/comfy.js`** — all `/comfy/*` endpoints (10 routes)
- **Replaced `server.js`** — **1,601 → 62 lines**; pure orchestrator, zero inline handlers

### File responsibility map after R4
| Concern | File |
|---|---|
| Express app, middleware, startup | `server.js` |
| System stats, OS dialogs | `routes/system.js` |
| Project CRUD, media library | `routes/projects.js` |
| LLM model management + inference | `routes/llm.js` |
| Engine binary provisioning | `routes/engine.js` |
| ComfyUI process + workflow/model mgmt | `routes/comfy.js` |
| All shared helpers and constants | `routes/shared.js` |

### Next: Stage R5 — CSS Modularisation
Audit and split the monolithic CSS file into scoped component stylesheets.

---



### What was done
- **Created `js/components/customDropdown.js`** — extracted `truncatePath()` + `renderCustomDropdown()` from shell.js into a proper reusable component with JSDoc usage examples
- **Created `js/provisioning.js`** — extracted ~500 lines of provisioning/settings UI builders:
  - `initProvisioning(toolContainer, loadToolInternal)` — dependency injector (avoids circular imports)
  - `showEngineProvisioningScreen(toolName, type, isManual)` — binary download screen
  - `showProvisioningScreen(toolName, isManual)` — Download Manager / model manager
  - `showAdvancedSettingsScreen(toolName)` — model + LoRA stack settings overlay
  - `closeActiveSubPage(toolName, isManual)` — subpage close/restore
- **Refactored `js/shell.js`** — **1,527 → 862 lines (44% reduction)**:
  - Imports and re-exports the 4 public provisioning functions (zero call-site changes needed)
  - Calls `initProvisioning()` in `initShell()` to inject `toolContainer` and `loadToolInternal`
  - All old inline bodies removed

### Responsibility map after R3
| Concern | File |
|---|---|
| App shell, navigation, sidebar | `shell.js` |
| Tool registration | `toolRegistry.js` |
| Shared tool utilities (upload/save/URL) | `toolUtils.js` |
| Download Manager, Advanced Settings | `provisioning.js` |
| Collapsible file-picker dropdown | `components/customDropdown.js` |

### Next: Stage R4 — Split server.js
Decompose server.js into domain-specific route modules (projects, media, llm, comfy, system).

---



### What was done
- **Created `js/toolRegistry.js`** — single source of truth for all tool metadata:
  - `TOOL_REGISTRY` — map of every tool with `type`, `comfyType`, `hasAdvancedSettings`, `tplId`, `module`
  - `COMFY_TOOLS` (Set), `LLM_TOOLS` (Set), `ENGINE_TOOLS` (Set), `COMING_SOON_TOOLS` (Set) — derived at module load, zero maintenance
- **Refactored `js/shell.js`** — replaced all 9 hardcoded tool registration points with registry lookups:
  - `COMING_SOON_TOOLS` Set (line 65) → imported from registry
  - `COMING_SOON_LABELS` map → derived from registry entries
  - `generativeToolsWithComfy` array → `ENGINE_TOOLS.has()`
  - `generativeToolsLlama` arrays (×2) → `LLM_TOOLS.has()`
  - `generator || detailer || upscaler` checks (×4) → `COMFY_TOOLS.has()`
  - `stage2Tools` inline object (9 entries) → `TOOL_REGISTRY[toolName]` lookup
  - `expectedType` inline ternary (×2) → `toolDef.comfyType`
  - `hasAdvanced` inline ternary → `toolDef.hasAdvancedSettings`
  - `skipModelSelector` check → `toolDef.skipModelSelector`

### Adding a new tool now requires editing exactly ONE file
Add an entry to `js/toolRegistry.js`. Shell.js is the generic executor and does not need touching.

### Next: Stage R3 — Split shell.js
Extract `showProvisioningScreen`, `showAdvancedSettingsScreen`, and `renderCustomDropdown` into separate modules.

---



See `dev_docs/06_refactor_plan.md` for the full refactoring roadmap. Stage R1 is complete.

### What was done
- **Created `js/toolUtils.js`** — single source of truth for patterns that were copy-pasted across tools:
  - `getLoadableUrl(url)` — URL normalization (was duplicated in `detailer.js` + `upscaler.js`)
  - `uploadImageToProject(file, prefix)` — drag/drop/paste file upload (was duplicated in both tools)
  - `saveResultToLibrary(resultUrl, prefix)` — blob→base64→POST save pattern (was in 3 tools)
  - `setRunButtonState(btn, isRunning)` — run/stop button toggle
  - `applyPromptMode(mode, ...)` — positive/negative prompt mode styling
  - `ICON_POSITIVE`, `ICON_NEGATIVE`, `ICON_RUN`, `ICON_STOP` — shared SVG path constants
- **Updated `js/tools/detailer.js`** — imports from `toolUtils.js`, removed 3 duplicate implementations
- **Updated `js/tools/upscaler.js`** — imports from `toolUtils.js`, removed 3 duplicate implementations
- **Rewrote `implement_new_tool.md`** — accurate registration steps + full Shared Utilities section

### Next: Stage R2 — Tool Registry
Create `js/toolRegistry.js` to eliminate the 8-place registration tax in `shell.js`.

---

## Current Stage: 14 — Patreon Integration & Gating



- **Stage 14.7: Upscaler Seed Persistence & Standardization** (2026-03-27)
  - **Standardized Seed Pattern**: Aligned the Upscaler with the Generator and Detailer tools by implementing the `currentSeed` pattern and `generateSeed()` helper from `uiHelpers.js`.
  - **Sticky Seed Logic**: Ensured the Upscaler seed is persistent across runs and tool transitions, only changing when explicitly requested via the "New Seed" button.
  - **Persistence Integration**: Linked the seed value to `toolState.js` for per-project, per-tool restoration.
  - **Diagnostic Logging**: Maintained engine-level console logging in `js/comfyController.js` for real-time verification of seed injection into ComfyUI nodes (titles: `Seed`, `Noise_Seed`).

- **Stage 14.6: Media Library & Tool Integration Stability** (2026-03-27)
  - **Explicit Tool Integration**: Replaced the generic "Reuse" button in the Media detail modal with dedicated **"Send to Upscaler"** and **"Send to Detailer (Enhance)"** buttons. 
  - **URL Normalization (`getLoadableUrl`)**: Implemented a standardized helper in both tools to wrap absolute file paths (e.g., `C:/...`) in the `/project-file?path=` endpoint. This fixes the "Not allowed to load local resource" browser security block.
  - **Interactive Canvas Hardening**: Resolved a critical **Infinite Recursion** (`RangeError`) by removing recursive `resize()` calls from the `draw()` method.
  - **TypeError Mitigation**: Fixed a crash where the canvas attempted to set `onload` on a null image. Added a `clearImage()` method for safe object-oriented cleanup.
  - **Unified Drag & Drop**: Both Upscaler and Detailer now support dropping local files (auto-uploads to project) and dragging assets directly from the Media Library (URL-aware).
  - **Paste Support**: Added clipboard image paste support to the Upscaler, synchronizing its behavior with the Detailer.
  - **Rendering Race Conditions**: Implemented `requestAnimationFrame` hooks in `renderUpscaler()` and `renderDetailer()` to ensure the canvas resizes only after the DOM layout has settled.

- **Stage 14.5: Detailer & Upscaler Stability** (2026-03-27)
  - **Session Persistence**: Integrated `toolState.js` into both the Upscaler and Detailer, enabling per-project, per-tool state restoration. 
  - **Result Maintenance**: Updated the 'Transfer to Source' logic to maintain the result URL in the session state. This ensures the comparison view and 'Save to Library' button remain persistent even after navigating away and returning.
  - **Centralized Rendering**: Refactored the Upscaler to use a centralized `renderUpscaler()` function, fixing a bug where the 'Drag & Drop' empty state would remain hidden incorrectly.
  - **ComfyUI Asset Validation**: Expanded `runWorkflow` in `js/comfyController.js` to correctly detect and re-upload `http://` result URLs. This fixed the "Prompt outputs failed validation" error during iterative 'Transfer -> Run' cycles.
  - **WebSocket Routing Fix**: Resolved a critical bug where the WebSocket listener became stale after tool transitions.
  - **Live Preview & Result Mapping**: Fixed metadata injection order in `runWorkflow` to restore live previews and final result display.
  - **Grid Overlay Calibration**: Relocated grid drawing logic in `InteractiveCanvas.js` to correctly align with image coordinates.
  - **IndexError & Batch Failure Mitigation**: Standardized `ComfyUI-MpiNodes` to handle empty list scenarios, preventing server-side crashes.

- **Stage 14: Compare Tool Implementation** (2026-03-27)
  - Implemented the **Compare Tool**: A dedicated interface for side-by-side image comparison using an interactive swipe slider.
  - **Dynamic 3-Column Layout**: Features a central `InteractiveCanvas` flanked by two high-visibility input slots (responsive thumbnails with premium styling).
  - **Maximized Vertical Space**: The tool occupies the full available height of the viewport with balanced top/bottom margins and no prompt-box buffer.
  - **Responsive Layout**: Side slots use `clamp()` to scale down on narrower windows, protecting the central comparison area.
  - **Media Library Integration**: Added a "Compare Selected" button that appearing when exactly 2 items are selected, with automatic state transfer.
  - **Unified Scaling**: Automatically scales comparison images to match the base image's display size while preserving aspect ratios, resolving the "small vs big" resolution mismatch issue.
  - **Robust Lifecycle Management**: Implemented `InteractiveCanvas.destroy()` and mandatory re-initialization in `compare.js` to fix navigation persistence and prevent event listener leaks.

- **Stage 12.7: Unified Tool Headers & Layout Fix** (2026-03-26)
  - Implemented a **Unified Tool Header Architecture**: The global `injectModelSelector` now automatically detects and targets `.tool-header` within a panel, ensuring consistent model selector placement across all tools.
  - **Layout Regression Fix**: Restored the proper sticky header offset (`top: -1.25rem`) to maintain visual alignment with tool container padding.
  - **Universal Header Structure**: Updated all tool templates (`llm`, `generator`, `detailer`, `promptBuilder`, `descriptor`, `translator`, `formatter`) to use a standardized `.tool-header-text` wrapper, protecting titles from overlapping with selectors.
  - **Architectural Cleanup**: Removed manual injection logic from `generator.js` and `detailer.js`, centralizing UI orchestration in `shell.js`.

- **Stage 13: Auto Masking & Detailer Improvements** (2026-03-26)
  - Added **Box/Segment** detection mode toggle (full-width, no label) and **Detect** button below the Masking control dropdown.
  - Integrated a **Detected Objects** thumbnail grid — each thumbnail is selectable; selections build a comma-separated index string injected into the `Selected_Masks_Input` ComfyUI node.
  - **WebSocket result filtering** via a `nodeTitleMap`: only nodes titled `"Detected"` populate the thumbnail grid; only `"Output"` triggers the comparison view.
  - **Selection state persistence**: highlighted thumbnails are preserved when moving from detection to detailing phase.
  - **Title-based node injection** for all Auto Masking nodes: `Auto_Mask`, `sams`, `Box`, `Ready`, `Selected_Masks_Input`, `Output_Mask`.
  - **Visual Feedback Improvements**: Implemented a "silent preview" system where selecting a detected object thumbnail triggers a non-disruptive ComfyUI run to update the spotlight mask overlay in real-time.
  - **Standardized Mask Polarity**: Verified and enforced the "White = Mask / Spotlight" standard for all auto-mask processing, fixing the previous inversion issue.
  - **Result-to-Source Transfer**: Implemented an arrow icon for recursive detailing; automatically bypasses media library auto-save.
  - **Manual Save Icon**: Added a save icon in the prompt box to commit generated results to the media library.
  - Updated `comfyui_mapping_rules.md` with all new node titles and `picks` input type.

- **Stage 12.8: Keyboard Shortcut Standardization** (2026-03-26)
  - **Standardized Prompt Box Behavior**: Implemented `Enter` to submit for LLM tools and `Ctrl + Enter` for ComfyUI tools.
  - **Global Escape Fix**: Keyboard listeners in `init.js` re-engineered to prevent `Enter` from blocking `Escape`.
  - **Generation Cancellation**: Linked `Escape` key to `AbortController` in LLM tools for instant stoppage.
  - **Help Page Update**: Synchronized the "Help" overlay with the new standardized keys.

- **Stage 12.6: Sidebar & Help Page Refactoring** (2026-03-26)
  - **Sidebar Reorganization**: Repositioned "Media" to the top of the tools list. Reordered "Upscaler" and "Resizer" tools. Added "Compare" tool placeholder with "Soon" badge.
  - **Dedicated Help Page**: Created a new `tpl-help` template and migrated all Keyboard Shortcuts from the About page for better discoverability.
  - **Unified Layout Strategy (Infrastructure)**: Re-engineered the tool layout to use a single, unified vertical scroller. Implemented **Sticky Tool Headers** and a **180px Safe Zone** padding to ensure content never overlaps with the floating prompt box.
  - **Local LLM Manager repositioning**: Moved the LLM manager to the bottom of the Settings page for better information hierarchy.

- **Stage 12.5: UI/UX & QoL Refinements** (2026-03-26)
  - **Generation Image Deletion**: Updated `js/tools/generator.js` to iterate and call the backend `DELETE` API for all images in a generation when it is removed from history.
  - **Robust Parameter Injection**: Introduced `_injectValue(nodeId, val)` in `generator.js` to handle polymorphic node inputs (`int`, `value`, `boolean`, etc.), fixing `MpiInt` compatibility for Resolution and Batch Size.
  - **Auto-start ComfyUI**: Added an "Auto-start ComfyUI on Launch" toggle in Settings with persistence to `localStorage`.
  - **Infinite Zoom-out**: Modified `interactiveCanvas.js` to allow zooming out until the image is 1% of the container size (min scale 0.01), removing the previous "contain" limit.
  - **Universal Tool Trigger**: Added the **Detailer** to the global `Ctrl + Enter` listener in `js/init.js`, ensuring all primary tool actions share this shortcut.
  - **Prompt Mode Visualization**: Replaced `+/-` icons with **Checkmark** (Positive) and **Prohibited** (Negative) icons in Generator and Detailer. Implemented **Red Status Color** for the toggle button in negative mode for both tools.
  - **Keyboard Shortcuts Reference**: Added a comprehensive, styled shortcuts list to the **About** section for better user onboarding.
  - **Detailer Ergonomics**: Rearranged the prompt action bar to place the mode toggle right after the "Add Media" button.

- **Stage 12.4: Detailer Tool** (fully functional as of 2026-03-25)
  - Brush/eraser masking system in `interactiveCanvas.js`
  - **Adaptive Dual-Pane Layout**: Source pane (260px) now matches image aspect ratio (no black padding) vs. large result pane.
  - **Spotlight Masking**: High-contrast visualization (darkened unmasked areas) for better focus in small previews.
  - **Interactive Onboarding**: Professional empty states with built-in Drag & Drop and asset browser triggers.
  - **Phase 5.1 Comparison Slider**: Vertical drag-bar in right pane with synchronized zoom/pan (Original vs. Result).
  - **Dynamic Mask Formatting**: Automatic conversion of transparent masks to solid White/Black (Exclude/Detail) format for ComfyUI compatibility.
  - **Keyboard Shortcuts**: Added `Enter` (Send/Enhance) and `M` (Toggle Mask Mode) for streamlined workflow.
- **Generator UI & Logic Refinement**:
  - **Unified Seed Group**: Seed input, DNA generate icon, and Auto-toggle grouped into a glassmorphic container.
  - **Turbo & Refiner Toggles**: Replaced checkboxes with icon-based toggles ("Sparkles" for Refiner, "Lightning" for Turbo) with mutual exclusivity logic.
  - **Robust Node Injection**: Fixed `findNodeIds` for mapping-rule compliant seed injection and unified 14-digit random seed range.
  - ComfyUI backend integration (image + mask upload, WebSocket sync, title-based node injection)
  - Advanced Settings (upscale model dropdown linked to workflow deps)
  > **Note:** Several Stage 12.4 sub-phases (collapsible sidebar, persistent dependency management, unified path resolution) were **shared infrastructure improvements**, not Detailer-specific. They benefit all current and future tools.

- All non-Detailer tools are fully functional: LLM, Descriptor, Translator, JSON Formatter, Prompt Builder, Generator


### 🔄 Active / Next Up

| **1 — Next** | Stage 15: Patreon API OAuth integration, premium feature gating | TBD |
| 2 | Stage 16: `electron-builder` NSIS packaging, one-click installer | `package.json`, build config |

### 📋 Outstanding Items (Minor)
- Metadata verification: ensure `width`/`height` are always passed to the Media detail modal for all workflows.
- Env path resolution for packaged builds (`engine/` and `projects/` must resolve relative to user AppData).


---

## CSS Split — DONE

`styles.css` is now a thin `@import` entry point. All rules live in `styles/` partials:

| File | Content |
|---|---|
| `styles/01_base.css` | Design tokens, reset, utilities, animations (~182 lines) |
| `styles/02_shell.css` | App shell, titlebar, sidebar, landing page, project cards (~1056 lines) |
| `styles/03_forms.css` | Modals, forms, buttons, wizard, model cards, provisioning (~1299 lines) |
| `styles/04_comfy.css` | ComfyUI preview, generator flow, prompt box, media library (~1245 lines) |
| `styles/05_tools.css` | Prompt builder, masking panel, detailer tool (~668 lines) |

When adding new tool-specific styles, append to the most relevant partial (or create a new one and add an `@import` line to `styles.css`).

---

---

## Stage: Memory Release Enhancement — DONE

Enhanced the sidebar memory release functionality with dual modes and global shortcuts.

| Goal | Done |
|---|---|
| Deep Clean Mode | Ctrl + Click unloads models AND clears ComfyUI cache to release RAM. |
| Keyboard Shortcuts | F5 = Release VRAM; Ctrl + F5 = Deep Clean. |
| Visual Feedback | Standard hover (Blue), Deep Clean (Red + Pulse), Status Popups updated. |
| Help Docs | Updated `tpl-help.html` with new shortcuts. |

---

## Stage History Summary
See `03_roadmap.md` for the complete stage-by-stage history (Stages 1–14).

---

## Stage: Unified Tool Execution, Resource Handoff & Running Indicator — DONE (2026-03-29)

### What was done

**Unified Keyboard Contract**
- `Enter` = newline everywhere; `Ctrl+Enter` = run/cancel for ALL tools (LLM and ComfyUI).
- `js/init.js` is the single global Ctrl+Enter dispatcher — no tool registers its own handler.

**Resource Handoff (fire-and-forget, non-blocking)**
- LLM start → `POST /comfy/unload` (`deep: true`) → ComfyUI unloads models + flushes cache. ComfyUI process stays alive.
- ComfyUI start → `POST /llm/unload` → kills `llama-server` process (restarts fast in 2–5s).
- Both helpers live in `toolUtils.js`: `onLlmRunStart()`, `onComfyRunStart()`.

**Running Tool Indicator (sidebar green dot)**
- `state.runningComfyTool` / `state.runningLlmTool` — track active run owner.
- `setRunningTool(toolId, type)` / `clearRunningTool(type)` in `toolUtils.js` fire `tool:running-changed` custom event.
- `shell.js` listens and injects/removes `.running-dot` span on the nav-item.
- CSS: expanded sidebar → dot floats right in label row; collapsed sidebar → 8px absolute dot at icon top-right.
- **Gotcha:** `.sidebar.collapsed .nav-item span` catches ALL spans including `.running-dot`. Fixed with `:not(.running-dot)` + `display:block !important`.

**Cross-tool Ctrl+Enter guard**
- If `state.runningComfyTool === 'generator'` and user is on the Detailer page, Ctrl+Enter is swallowed.
- Only the tool that owns the run can cancel it.

**Bug fixes**
- `llm.js`: `export { runLlm }` at module scope can't reference a closure-scoped inner function → fixed with `_runLlmRef` module-level pattern.
- `shell.js` F5: was blocked when a textarea was focused (first press did nothing) → moved F5 guard before the textarea focus check.
- `routes/comfy.js` `/comfy/unload`: sent `free_cache: true` (ignored by ComfyUI) → corrected to `free_memory: true` (the real field name). ComfyUI memory now actually releases when LLM starts.

**Spinner not spinning (open issue, deferred)**
- `.modal-overlay` has `backdrop-filter: blur(8px)` which can pause child CSS animations in Chromium/Electron compositing.
- Added `will-change: transform` to `.spinner` (partially mitigates, may need deeper Electron-level fix).

### Files changed
`js/state.js`, `js/toolUtils.js`, `js/shell.js`, `js/init.js`, `js/tools/generator.js`, `js/tools/detailer.js`, `js/tools/upscaler.js`, `js/tools/llm.js`, `js/tools/translator.js`, `js/tools/jsonFormatter.js`, `js/tools/descriptor.js`, `routes/comfy.js`, `styles/01_base.css`, `styles/02_shell.css`

