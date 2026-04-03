# Handoff: shell.js Surgery + init.js Cleanup

> 🔴 **AGENT RULE**: Read `dev_docs/05_components.md` and `dev_docs/tasks/new-navigation-architecture.md` before starting. Do NOT restore any deleted legacy files.

---

## Context

A major cleanup was just performed. The following files were **deleted**:
- All `js/tools/*.js` (generator, detailer, upscaler, llm, etc.)
- All legacy templates (tpl-generator, tpl-provisioning, etc.)
- `js/formBuilder.js`, `js/elements.js`, `js/uiHelpers.js`, `js/dialogs.js`
- `js/provisioning.js`, `js/toolRegistry.js`, `js/toolState.js`, `js/mediaActions.js`
- `js/templateManager.js`, `js/handlers/imageHandlers.js`

**`js/shell.js` (45KB) and `js/init.js` were NOT cleaned yet.** They still import many deleted files and will throw errors on startup. That is this task's job.

---

## Goal

Gut `shell.js` and `init.js` down to a clean bootstrap that:
1. Shows the **landing page** (project grid, new project modal) — keep as-is
2. Transitions from Landing → **Workspace** (just the app shell with `#tool-container`)
3. Keeps: VRAM/RAM monitor, Info Bar, Window Controls, Memory Release (F5)
4. Removes: all sidebar logic, all `loadTool()` routing, all provisioning wiring, all tool-registry references

The new navigation (radial menu) will be built separately. `shell.js` just needs to stop crashing and be a clean foundation.

---

## What to KEEP in shell.js

These functions are **good and must survive**:

| Function | Lines (approx) | Keep? |
|---|---|---|
| Electron IPC setup | 9–17 | ✅ Keep |
| `initShell()` bootstrap | 97–263 | ✅ Gut but keep skeleton |
| `handleNavigation()` | 266–315 | ✅ Simplify to 2 states only |
| `showLanding()` / `showShell()` | 318–326 | ✅ Keep |
| `loadProjectGrid()` | 329–347 | ✅ Keep |
| `buildProjectCard()` | 349–394 | ✅ Keep |
| `bindModalEvents()` | 1057–1098 | ✅ Keep (new project modal) |
| `bindInfoBarEvents()` | 819–863 | ✅ Keep (status bar hover) |
| `bindWindowControls()` | 981–1055 | ✅ Keep (Electron window buttons) |
| `bindMaintenanceEvents()` | 948–978 | ✅ Keep (F5 VRAM release) |
| `triggerMemoryRelease()` | 902–946 | ✅ Keep |
| `updateMemoryStats()` | 1109–1141 | ✅ Keep |
| `updateTitlebarProject()` | 894–900 | ✅ Keep |
| `preloadComponentStyles()` | 1149–1160 | ✅ Keep |
| `escapeHtml()` | 1101–1107 | ✅ Keep |

---

## What to DELETE from shell.js

| Function / Block | Why |
|---|---|
| **All sidebar functions** (`bindSidebarEvents`, `restoreSidebarState`, `updateSidebarActive`, `updateSidebarGroupLabels`, `updateSidebarRunningIndicator`) | Sidebar is gone |
| **`loadTool()`** (lines ~397–488) | Tool routing is gone |
| **`loadToolInternal()`** (lines ~492–549) | Tool routing is gone |
| **`checkEngineStatusAndLoad()`** (lines ~551–565) | Tool routing is gone |
| **`injectModelSelector()`** (lines ~575–655) | Sidebar/legacy pattern |
| **`bindTooltipEvents()`** (lines ~785–811) | Sidebar tooltip — sidebar is gone |
| **`bindPromptBoxEvents()`** / **`restorePromptBoxState()`** (lines ~866–891) | Old prompt box pattern |
| **`handleNavigation()` tool branches** | See simplified version below |

---

## Simplified `handleNavigation()` Target

Replace the current 50-line `handleNavigation()` with this simple 2-state version:

```javascript
function handleNavigation(page, params) {
    if (page === PAGE_LANDING) {
        state.activeSubPage = null;
        showLanding();
        loadProjectGrid();
        updateTitlebarProject();
        initShaderBackground();
    } else if (page === PAGE_WORKSPACE) {
        showShell();
        updateTitlebarProject();
        stopShaderBackground();
        // NEW: Workspace entry — the radial menu and workspace are mounted here
        // For now: clear #tool-container and wait for MpiRadialMenu implementation
        toolContainer.innerHTML = '';
    }
}
```

> **Note**: Add `PAGE_WORKSPACE` to `js/router.js` as a new constant (replace the old tool/media/settings/etc. pages with a single workspace state).

---

## Simplified `initShell()` Target

Remove these calls from `initShell()`:
```javascript
// DELETE these lines from initShell():
bindSidebarEvents();          // sidebar gone
restoreSidebarState();        // sidebar gone
bindPromptBoxEvents();        // legacy
restorePromptBoxState();      // legacy
initProvisioning(...);        // provisioning.js deleted
preloadTemplates([...]);      // most templates deleted
```

Keep these:
```javascript
preloadComponentStyles([...]);  // keep, but remove dead CSS paths
bindModalEvents();
bindInfoBarEvents();
bindTooltipEvents();            // NOTE: check if this only does sidebar — if so, delete
bindMaintenanceEvents();
bindWindowControls();
updateMemoryStats();
setInterval(updateMemoryStats, 2000);
refreshModelRegistry().catch(...);
refreshComfyWorkflowRegistry().catch(...);
onNavigate((page, params) => handleNavigation(page, params));
navigate(PAGE_LANDING);
```

---

## Imports to FIX in shell.js

Current broken imports (files that were deleted):

```javascript
// DELETE these imports — files no longer exist:
import { initProvisioning, showEngineProvisioningScreen, showProvisioningScreen, showAdvancedSettingsScreen, closeActiveSubPage } from './provisioning.js';
import { TOOL_REGISTRY, COMFY_TOOLS, LLM_TOOLS, ENGINE_TOOLS, COMING_SOON_TOOLS } from './toolRegistry.js';
import { unloadModel } from './llmService.js';  // ← KEEP: llmService.js still exists!

// UPDATE this import — remove deleted PAGE_* constants:
import { navigate, onNavigate, PAGE_LANDING, PAGE_TOOL, PAGE_MEDIA, PAGE_SETTINGS, PAGE_ABOUT, PAGE_HELP, PAGE_COMPONENTS } from './router.js';
// Replace with:
import { navigate, onNavigate, PAGE_LANDING, PAGE_WORKSPACE } from './router.js';
```

Also remove the re-export line:
```javascript
// DELETE:
export { showProvisioningScreen, showAdvancedSettingsScreen, closeActiveSubPage };
```

> **Note on `llmService.js`**: Keep the import of `unloadModel` — this file was NOT deleted. It's the backend connection to llama.cpp.

---

## CSS Paths to REMOVE from `preloadComponentStyles()`

Remove any CSS paths for deleted components. The ones to strip:
```javascript
// These were for old compounds that may no longer exist — verify before removing:
'js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css',
'js/components/Compounds/MpiOkCancel/MpiOkCancel.css',
// Any others in the list that no longer have a corresponding file
```

---

## `init.js` Cleanup

Current `init.js` has broken imports. Replace the entire file:

```javascript
/**
 * init.js — Application entry point.
 */
import { initTheme } from './themeManager.js';
import { initShell } from './shell.js';

// Global alert/confirm system — will be replaced by MpiOkCancel component
// For now wire up basic browser fallbacks to prevent crashes
window.MpiAlert   = (msg) => alert(msg);
window.MpiConfirm = (msg) => confirm(msg);
window.MpiPrompt  = (msg, def) => prompt(msg, def);
window.alert      = (msg) => window.MpiAlert(msg);

// Mouse wheel on number inputs — standalone, safe to keep
document.addEventListener('wheel', (e) => {
    const el = e.target.closest('input[type="range"], input[type="number"]');
    if (el) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const step = parseFloat(el.step) || 1;
        el.value = parseFloat(el.value) + delta * step;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
}, { passive: false });

async function init() {
    initTheme();
    await initShell();
}

init();
```

> Note: `initMediaDetailModal`, `initAssetBrowserModal`, `removeImage`, `triggerToolAction` — all deleted or no longer wired. The modals will be rebuilt as proper `MpiOverlay` blocks later.

---

## router.js Cleanup

Check `js/router.js` and simplify. It currently exports many `PAGE_*` constants for every old page. Replace with just:

```javascript
export const PAGE_LANDING   = 'landing';
export const PAGE_WORKSPACE = 'workspace';  // single workspace state for all tools
```

Remove: `PAGE_TOOL`, `PAGE_MEDIA`, `PAGE_SETTINGS`, `PAGE_ABOUT`, `PAGE_HELP`, `PAGE_COMPONENTS`

---

## After This Task — Expected State

- App boots without console import errors
- Landing page shows and works (project grid, new project creation)
- Clicking a project enters the workspace (blank `#tool-container`)
- VRAM/RAM meters work
- Status bar hover info works
- Window controls (minimize/maximize/close) work
- F5 VRAM release works
- **No sidebar visible** (it will be removed from the HTML separately or hidden via CSS)
- Component gallery still accessible (keep `PAGE_COMPONENTS` if you want for dev, or add it as a special case)

---

## Files Modified by This Task

- `js/shell.js` — major surgery (target: ~250 lines, down from 1161)
- `js/init.js` — full rewrite (~25 lines)
- `js/router.js` — simplify PAGE constants

## Do NOT Touch
- `js/state.js`
- `js/events.js`
- `js/comfyController.js`
- `js/managers/`
- `js/components/`
- `js/utils/`
- `js/projectManager.js`
- `js/llmService.js`
