# Workspace Architecture

> **AI INSTRUCTION:** This file maps out the high-level routing and workspace areas of the application.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves routing, navigation, or workspace layout.

**Three workspaces:** Landing (project select/create) → Gallery (default project view) → Group History (single card detail). See `docs/workspaces.md` for details.

**Routing:** Use `js/router.js` (`navigate()` / `back()`) — never `window.location`.
**Gallery Block:** `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — lazy-loaded by `navigation.js`.
**Group History Block:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — lazy-loaded by `navigation.js`.

**PromptBox:** NOT mounted directly by workspaces. Always use `PromptBoxService.mount(config)` to claim the shell-level PromptBox. Shell owns the `#prompt-box-mount` container.

**Dev Components Gallery:** `js/pages/components.js` — hidden, gated by `test_styles: true` in `dev_configs/app_config.js`. Ask before adding components.

---

## 🗺️ Application Flow

```
Landing (#page-landing)   →   Gallery (MpiGalleryBlock)   →   Group History (MpiGroupHistoryBlock)
[projectUI.js handles UI]      [lazy import by navigation.js]   [lazy import by navigation.js]
```

1. **Landing Page** — DOM element `#page-landing`. UI logic in `js/shell/projectUI.js`. No workspace class. Mounts `MpiProjectCard`, `MpiNewProject`, Landing overlay pages (`MpiSettings`, `MpiHelp`, `MpiAbout`), and (under Electron only) `MpiProjectDropOverlay` for drag-and-drop project import — dropping a project folder or `project.json` registers the folder's parent in the extra project paths list and refreshes the grid (does not auto-open).

2. **Gallery Workspace** — `MpiGalleryBlock`. Mounts `MpiGalleryGrid`. Drives shell PromptBox via `PromptBoxService`. Navigate to group history on card open.

3. **Group History Workspace** — `MpiGroupHistoryBlock`. Mounts `MpiHistoryTools` (left), `MpiCanvasViewer` (centre), `MpiHistoryList` (right). Drives shell PromptBox via `PromptBoxService`.

---

## 🛠️ Shell-Level Singletons (Always Active)

Mounted once in `js/shell.js` — never re-mount these in workspace code:

| Singleton | Trigger |
|---|---|
| `MpiErrorDialog` | `ui:error` event |
| `MpiStartingComfy` | `comfy:starting` / `comfy:ready` events |
| `MpiModelsModal` | `models:open` event / zero installed models |
| `PromptBoxService` | initialized in `shell.js`, claimed by each workspace |

---

## 🛠️ The Dev Components Page (Hidden)

A dedicated testing gallery for UI components.
- **Access Rule:** Gated by `test_styles: true` in `dev_configs/app_config.js`.
- **Location:** `js/pages/components.js`.
- **Constraint:** If you build a new `MpiCompound` or UI element, ask the user if they want it added to this test page.
