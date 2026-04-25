# Workspace Architecture

> **AI INSTRUCTION:** This file maps out the high-level routing and workspace areas of the application.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves routing, navigation, or workspace layout.

**Three workspaces:** Landing (project select/create) → Gallery (default project view) → Group History (single card detail). See `docs/workspaces.md` for details.

**Routing:** Use `js/router.js` (`navigate()` / `back()`) — never `window.location`.
**Gallery Block:** `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — lazy-loaded by `navigation.js`.
**Group History Block:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — lazy-loaded by `navigation.js`.

**PromptBox:** Mount the `MpiPromptBox` Organism directly into `#prompt-box-mount` (`gid('prompt-box-mount')`). Block keeps the handle in `_pb`; call `_pb?.destroy?.()` before remount AND in Block `el.destroy`. Slot is shell-owned (declared in `index.html`), persists across workspace switches.

**Dev Components Gallery:** `js/pages/components.js` — hidden, gated by `test_styles: true` in `dev_configs/app_config.js`. Ask before adding components.

---

## 🗺️ Application Flow

```
Landing (#page-landing)   →   Gallery (MpiGalleryBlock)   →   Group History (MpiGroupHistoryBlock)
[projectUI.js handles UI]      [lazy import by navigation.js]   [lazy import by navigation.js]
```

1. **Landing Page** — DOM element `#page-landing`. UI logic in `js/shell/projectUI.js`. No workspace class. Mounts `MpiProjectCard`, `MpiNewProject`, Landing overlay pages (`MpiSettings`, `MpiHelp`, `MpiAbout`), and (under Electron only) `MpiProjectDropOverlay` for drag-and-drop project import — dropping a project folder or `project.json` registers the folder's parent in the extra project paths list and refreshes the grid (does not auto-open).

2. **Gallery Workspace** — `MpiGalleryBlock`. Mounts `MpiGalleryGrid` + `MpiPromptBox` (Organism) directly into `#prompt-box-mount`. Navigate to group history on card open.

3. **Group History Workspace** — `MpiGroupHistoryBlock`. Photoshop-style layout: left toolbar (`#left-slot`), centre viewer (`#centre-slot`), right panel split into props bar (`#right-top-slot`) + history list (`#right-bottom-slot`). PromptBox (Organism) mounted by Block directly into `#prompt-box-mount` (centre-bottom, CSS class `--prompt-active` shows/hides it). Active tool controlled by block-local mediator `mountOptions(mode)` — NOT a `state` key.

---

## 🛠️ Shell-Level Singletons (Always Active)

Mounted once in `js/shell.js` — never re-mount these in workspace code:

| Singleton | Trigger |
|---|---|
| `MpiErrorDialog` | `ui:error` event |
| `MpiStartingComfy` | `comfy:starting` / `comfy:ready` events |
| `MpiModelsModal` | `models:open` event / zero installed models |
| `#prompt-box-mount` slot | declared in `index.html`; Blocks mount `MpiPromptBox` Organism into it |

---

## 🛠️ The Dev Components Page (Hidden)

A dedicated testing gallery for UI components.
- **Access Rule:** Gated by `test_styles: true` in `dev_configs/app_config.js`.
- **Location:** `js/pages/components.js`.
- **Constraint:** If you build a new `MpiCompound` or UI element, ask the user if they want it added to this test page.
