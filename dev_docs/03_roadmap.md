# Mpi AI Suite — Full Stage Roadmap

Stages 1–5 are pre-Electron (single-page wizard era). This document covers the desktop app stages.

---

## ✅ Completed Stages

| Stage | Goal | Key Deliverable |
|---|---|---|
| **6** | Electron shell | Frameless window, custom titlebar, IPC bridge |
| **7** | Local LLM (`node-llama-cpp` → `llama-server.exe`) | Descriptor tool using Qwen-VL via internal binary |
| **8** | Permanent deletion & history sync | No `.trash` folder; history auto-prunes on last image delete |
| **9** | ComfyUI context-aware model manager | Asset downloader, Git custom node cloning, smart GC |
| **10** | Generator flow redesign | Chat-like vertical feed, floating prompt, metadata sidecar `.json` |
| **11** | Prompt Builder overhaul | Modular layer system, real-time synthesis, presets; removed old Prompt Enhancer |
| **12** | Image preview redesign + Interactive Canvas | Glassmorphic media detail modal, zoom/pan canvas, global Escape nav |
| **12.1** | Interactive Canvas | Zoom, pan, double-click-to-fit canvas viewer |
| **12.2** | Advanced Settings & LoRA Stack | 6-slot LoRA manager, model/clip strength controls |
| **12.3** | Negative Prompt System | Toggle positive/negative per-tool, full workflow injection |
| **12.4: Ph 1** | Masking system base | Brush/eraser + size control in `interactiveCanvas.js` |
| **12.4: Ph 2** | Masking UI integration | Opacity slider, visual brush, masking toggle in `mediaDetailModal.js` |
| **12.4: Ph 3.1** | Detailer tool UI & routing | Dual-pane layout, workflow dropdown, advanced settings |
| **12.4: Ph 3.2** | Download Manager update | Tool-aware workflow filtering, robust path resolution |
| **12.4: Ph 3.3** | Auto-populate upscale models dropdown | Reads deps from `comfy_workflows.json` |
| **12.4: Ph 3.4** | Masking tool enhancements | Mask inversion (Flip), B/E hotkeys, Space pan, zoom |
| **12.4: Ph 3.5** | Collapsible sidebar *(shared infra)* | Burger button, abbreviated group labels when collapsed |
| **12.4: Ph 3.6–3.10** | Advanced dependency management *(shared infra)* | `installed` flag, smart pruning, `syncWorkflowStates`, Finalize Setup flow |
| **12.4: Ph 4.1** | Unified path resolution *(shared infra)* | `resolveComfyPath` helper — external models root + internal custom_nodes |
| **12.4: Ph 4.2** | ComfyUI backend integration | `runEnhance` logic: image+mask upload, WS sync, title-based mapping |
| **12.4: Ph 4.3/4.4** | UI & interaction finalization | Zero-stretching layout, side-by-side grid, prompt box parity |
| **12.4: Ph 5** | Result Comparison Slider | Draggable vertical drag-bar with sync zoom/pan & mask auto-formatting |
| **13** | Auto Masking & Recursive Workflow | Box/Segment detection, thumbnail grid, result → source transfer |
| **14** | Compare Tool Implementation | Dual-pane swipe slider, unified scaling, layout symmetry overrides |
| **14.5** | Detailer & Upscaler Stability | WebSocket routing fix, grid calibration, IndexError mitigation |
| **R1** | Extract Shared Tool Utilities | `js/toolUtils.js` — canonical shared functions (upload, save, icons, run button) |
| **R2** | Centralized Tool Registry | `js/toolRegistry.js` — one entry per tool, zero shell.js edits for new tools |
| **R3** | Split shell.js | `js/provisioning.js` + `js/components/customDropdown.js`; shell: 1527→862 lines |
| **R4** | Split server.js | `routes/*.js` (6 files); server: 1601→62 lines |
| **R5** | Document shared utilities API | `implement_new_tool.md` fully rewritten; `04_technical_notes.md` expanded |
| **R6** | HTML Template Extraction | `js/templateLoader.js`; 15 templates → `templates/tpl-*.html`; index.html: 1940→695 lines |
| **R7** | Final Audit & Tool Triage | All tools verified green in live session; refactor declared stable |
| **15-pre** | Crop & Extract tool | Video trim/crop tool with FFmpeg extraction, filmstrip preview, snap handles |
| **15-post** | UI polish sessions | Light mode, neon accents, sidebar layout, system monitor redesign |
| **15-post** | Global tool indicators | Running state dot, `setRunningTool`/`clearRunningTool`, Ctrl+Enter guards |
| **15-post** | ComfyUI WS unification | Generator migrated to `runWorkflow()` — all 3 ComfyUI tools now use one code path |
| **C1** | Component Factory infrastructure | `factory.js`, `types.js`, `README.md`, `05_components.md` — 3-tier hierarchy established |
| **C2** | Primitive: MpiButton | `js/components/Primitives/MpiButton/` — 5 variants, 3 sizes, loading, disabled |
| **C3** | Primitive: MpiIcon | `js/components/Primitives/MpiIcon/` — 40+ icon registry, `export const ICONS` as single source of truth |
| **C4** | Compound: MpiIconButton | `js/components/Compounds/MpiIconButton/` — glass-morphism icon button, toggle, icon-swap, sizes |
| **C5** | Component Gallery test page | `templates/tpl-components.html` + `js/pages/components.js` — live visual registry for all components |
| **C6** | Dynamic icon gallery | `buildIconSection()` two-pass pattern — cards generated from live `ICONS` registry; new icons auto-appear |
| **C7** | `/implement_new_component` workflow | `.agents/workflows/implement_new_component.md` — 5-step guide for creating and wiring new components |



---

## 🔜 Upcoming Stages

### Stage 15 — Patreon API Integration *(Next)*
- **Goal:** Gate premium features behind active Patreon tier.
- **Action:** Implement Patreon OAuth flow. On success, unlock premium tools/extensions in the sidebar.


### Stage 16 — Final Native Packaging *(Planned)*
- **Goal:** One-click `~150MB` Windows installer via `electron-builder`.
- **Action:** Configure `electron-builder` + NSIS scripts. Ensure `engine/` and `projects/` paths resolve relative to user AppData in packaged builds.
- **Verification:** Clean-machine install test — all Stage 6–13 sequences initialize correctly.

---

## Append-Only Policy
Add new stages **below** the last entry. Do not rewrite completed stages — they are history.
