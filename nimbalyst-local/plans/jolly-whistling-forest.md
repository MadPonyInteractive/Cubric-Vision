# Plan: Centralized LocalStorage Key Source of Truth

**Status:** Ready for implementation
**Created:** 2026-04-17
**Depends on:** None (foundational — Plan A can proceed after this)

---

## Context

localStorage keys are currently **hardcoded as string literals** across 8 files, with one key (`mpi_comfy_root_path`) duplicated as an inline `const` in `MpiEngineInstall.js` and as raw strings in `MpiSettings.js`. No centralized storage abstraction exists anywhere in the codebase.

This plan creates `js/core/storageKeys.js` — a single file exporting all storage key constants — plus optional storage utility helpers, replacing all raw localStorage string literals across the app.

---

## Critical Files to Read Before Implementing

| File | Why |
| --- | --- |
| `js/state.js` | Proxy-based reactive state — does NOT use localStorage; purely in-memory |
| `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` | Defines `mpi_comfy_root_path` as inline `const STORAGE_KEY` |
| `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` | All 3 URL/flag keys + comfy_root_path used here |
| `js/managers/projectManager.js` | `mpi_extra_project_paths` and `mpi_last_project` keys |
| `js/shell.js` | `mpi_auto_start_comfy` read at boot, `mpi_comp_debug` read |
| `js/pages/components.js` | `mpi_comp_debug` key |

---

## Inventory of All Storage Keys Found

### localStorage (9 keys)

| Key | Files | Purpose |
| --- | --- | --- |
| `mpi_comfy_root_path` | `MpiEngineInstall.js`, `MpiSettings.js` | Custom ComfyUI models folder path |
| `mpi_ollama_url` | `MpiSettings.js` | Ollama API server URL |
| `mpi_comfy_url` | `MpiSettings.js` | ComfyUI API server URL |
| `mpi_auto_start_comfy` | `MpiSettings.js`, `shell.js` | Boolean auto-start ComfyUI flag |
| `mpi_extra_project_paths` | `projectManager.js` | JSON array of extra project scan dirs |
| `mpi_last_project` | `projectManager.js` | Last opened project folder path |
| `mpi_comp_debug` | `components.js` | Dev-mode component debug toggle |

### sessionStorage (2 keys)

| Key | Files | Purpose |
| --- | --- | --- |
| `mpi_dev_page` | `shell.js` | Dev mode — last visited page |
| `mpi_dev_params` | `shell.js` | Dev mode — page navigation params |

---

## Step 1: Create `js/core/storageKeys.js`

New file. Single source of truth for all storage key constants. Grouped by category.

```javascript
// js/core/storageKeys.js

/**
 * Centralized storage key constants.
 * ALL localStorage/sessionStorage keys must be defined here.
 * No raw string literals for storage keys anywhere else in the codebase.
 */

// --- localStorage keys ---
export const STORAGE_KEYS = {
  // Engine settings
  COMFY_ROOT_PATH:    'mpi_comfy_root_path',
  OLLAMA_URL:          'mpi_ollama_url',
  COMFY_URL:           'mpi_comfy_url',
  AUTO_START_COMFY:    'mpi_auto_start_comfy',

  // Project management
  EXTRA_PROJECT_PATHS: 'mpi_extra_project_paths',
  LAST_PROJECT:        'mpi_last_project',

  // Dev tools
  COMP_DEBUG:           'mpi_comp_debug',
};

// --- sessionStorage keys ---
export const SESSION_KEYS = {
  DEV_PAGE:    'mpi_dev_page',
  DEV_PARAMS:  'mpi_dev_params',
};
```

**Notes:**
- `COMFY_ROOT_PATH`, `OLLAMA_URL`, `COMFY_URL`, `AUTO_START_COMFY` are user-preference settings that belong in localStorage (not state.js)
- `EXTRA_PROJECT_PATHS`, `LAST_PROJECT` are project-persistence settings
- `COMP_DEBUG` is a dev-only toggle

---

## Step 2: Create `js/core/storage.js`

Thin utility wrapping localStorage/sessionStorage with typed get/set. Provides defaults, JSON parsing, and error handling. Used by all managers and components.

```javascript
// js/core/storage.js

import { STORAGE_KEYS, SESSION_KEYS } from './storageKeys.js';

/** Wrap localStorage.getItem with JSON.parse + default fallback */
function get(key, defaultValue = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Wrap localStorage.setItem with JSON.stringify */
function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Remove a key */
function remove(key) {
  localStorage.removeItem(key);
}

// Convenience typed helpers (can be called without knowing the raw key)
export const Storage = {
  getComfyRootPath:   () => get(STORAGE_KEYS.COMFY_ROOT_PATH, null),
  setComfyRootPath:   (v) => set(STORAGE_KEYS.COMFY_ROOT_PATH, v),
  removeComfyRootPath: () => remove(STORAGE_KEYS.COMFY_ROOT_PATH),

  getOllamaUrl:       () => get(STORAGE_KEYS.OLLAMA_URL, 'http://localhost:8080'),
  setOllamaUrl:       (v) => set(STORAGE_KEYS.OLLAMA_URL, v),

  getComfyUrl:        () => get(STORAGE_KEYS.COMFY_URL, 'http://localhost:8188'),
  setComfyUrl:        (v) => set(STORAGE_KEYS.COMFY_URL, v),

  getAutoStartComfy:  () => get(STORAGE_KEYS.AUTO_START_COMFY, false),
  setAutoStartComfy:  (v) => set(STORAGE_KEYS.AUTO_START_COMFY, v),

  getExtraProjectPaths: () => get(STORAGE_KEYS.EXTRA_PROJECT_PATHS, []),
  setExtraProjectPaths: (v) => set(STORAGE_KEYS.EXTRA_PROJECT_PATHS, v),

  getLastProject:     () => get(STORAGE_KEYS.LAST_PROJECT, null),
  setLastProject:     (v) => set(STORAGE_KEYS.LAST_PROJECT, v),

  getCompDebug:       () => get(STORAGE_KEYS.COMP_DEBUG, false),
  setCompDebug:       (v) => set(STORAGE_KEYS.COMP_DEBUG, v),
};

export const Session = {
  getDevPage:   () => sessionStorage.getItem(SESSION_KEYS.DEV_PAGE),
  setDevPage:   (v) => sessionStorage.setItem(SESSION_KEYS.DEV_PAGE, v),
  getDevParams: () => sessionStorage.getItem(SESSION_KEYS.DEV_PARAMS),
  setDevParams: (v) => sessionStorage.setItem(SESSION_KEYS.DEV_PARAMS, v),
};
```

---

## Step 3: Replace All Raw localStorage Usages

Update each file to import from `js/core/storageKeys.js` (and optionally `js/core/storage.js`) instead of raw string literals.

### 3a. `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js`
- Replace `const STORAGE_KEY = 'mpi_comfy_root_path'` with `import { STORAGE_KEYS } from '../../../core/storageKeys.js'`
- Replace all `localStorage.getItem('mpi_comfy_root_path')` → `Storage.getComfyRootPath()`
- If keeping raw localStorage calls, use `STORAGE_KEYS.COMFY_ROOT_PATH` instead of string literal

### 3b. `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`
- Replace all 4 key string literals with imports from `storageKeys.js`
- Use `Storage` helper methods where applicable (URLs, flags)

### 3c. `js/managers/projectManager.js`
- Replace `mpi_extra_project_paths` and `mpi_last_project` string literals
- Use `Storage.getExtraProjectPaths()` / `Storage.setLastProject()`

### 3d. `js/shell.js`
- Replace `mpi_auto_start_comfy` and `mpi_comp_debug` string literals
- Use `Storage.getAutoStartComfy()`, `Storage.getCompDebug()`

### 3e. `js/pages/components.js`
- Replace `mpi_comp_debug` string literals
- Use `Storage.getCompDebug()`, `Storage.setCompDebug()`

---

## Implementation Steps

- [ ] Create `js/core/storageKeys.js` with all STORAGE_KEYS and SESSION_KEYS constants
- [ ] Create `js/core/storage.js` with typed Storage/Session helpers
- [ ] Update `MpiEngineInstall.js` — import storageKeys, remove inline const
- [ ] Update `MpiSettings.js` — import storageKeys + Storage helpers, remove all key strings
- [ ] Update `projectManager.js` — import storageKeys + Storage helpers
- [ ] Update `shell.js` — import storageKeys + Storage helpers
- [ ] Update `js/pages/components.js` — import storageKeys + Storage helpers
- [ ] Verification: grep for any remaining raw `'mpi_'` string literals for storage

---

## Verification

```bash
# Should return no results for raw storage key strings after refactor:
grep -r "localStorage.getItem.*'mpi_" js/
grep -r "localStorage.setItem.*'mpi_" js/
grep -r "localStorage.removeItem.*'mpi_" js/

# All storage access should go through js/core/storageKeys.js or js/core/storage.js
```

In browser console:
```javascript
import { STORAGE_KEYS, SESSION_KEYS } from './js/core/storageKeys.js';
import { Storage, Session } from './js/core/storage.js';

// Should all work:
Storage.getComfyRootPath();
Storage.setComfyRootPath('/custom/path');
Storage.getAutoStartComfy();
Session.getDevPage();
```

---

## Notes

- **state.js is separate** — `js/state.js` is a purely in-memory reactive state store using Proxy. It does NOT use localStorage. It holds runtime state like `currentProject`, `currentPage`, `comfyRootPath` (which is SET from localStorage-derived values in MpiSettings, but state.js itself has no localStorage awareness).
- **No existing storage abstraction found** — this is a greenfield utility. Both `storageKeys.js` and `storage.js` are required.
- **Plan ordering** — This plan should be implemented BEFORE Plan A (app versioning) since Plan A notes this as a prerequisite.
