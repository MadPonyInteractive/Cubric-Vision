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
  getComfyRootPath:     () => get(STORAGE_KEYS.COMFY_ROOT_PATH, null),
  setComfyRootPath:     (v) => set(STORAGE_KEYS.COMFY_ROOT_PATH, v),
  removeComfyRootPath:  () => remove(STORAGE_KEYS.COMFY_ROOT_PATH),

  getOllamaUrl:        () => get(STORAGE_KEYS.OLLAMA_URL, 'http://localhost:8080'),
  setOllamaUrl:        (v) => set(STORAGE_KEYS.OLLAMA_URL, v),

  getComfyUrl:         () => get(STORAGE_KEYS.COMFY_URL, 'http://localhost:8188'),
  setComfyUrl:         (v) => set(STORAGE_KEYS.COMFY_URL, v),

  getAutoStartComfy:   () => get(STORAGE_KEYS.AUTO_START_COMFY, false),
  setAutoStartComfy:   (v) => set(STORAGE_KEYS.AUTO_START_COMFY, v),

  getExtraProjectPaths: () => get(STORAGE_KEYS.EXTRA_PROJECT_PATHS, []),
  setExtraProjectPaths: (v) => set(STORAGE_KEYS.EXTRA_PROJECT_PATHS, v),

  getLastProject:      () => get(STORAGE_KEYS.LAST_PROJECT, null),
  setLastProject:      (v) => set(STORAGE_KEYS.LAST_PROJECT, v),

  getCompDebug:        () => get(STORAGE_KEYS.COMP_DEBUG, false),
  setCompDebug:        (v) => set(STORAGE_KEYS.COMP_DEBUG, v),

  getSelectedModels:   () => get(STORAGE_KEYS.SELECTED_MODELS, { image: null, video: null }),
  setSelectedModels:   (v) => set(STORAGE_KEYS.SELECTED_MODELS, v),

  getLastSelectedMediaType: () => get(STORAGE_KEYS.LAST_SELECTED_MEDIATYPE, 'image'),
  setLastSelectedMediaType: (v) => set(STORAGE_KEYS.LAST_SELECTED_MEDIATYPE, v),
};

export const Session = {
  getDevPage:   () => sessionStorage.getItem(SESSION_KEYS.DEV_PAGE),
  setDevPage:   (v) => sessionStorage.setItem(SESSION_KEYS.DEV_PAGE, v),
  getDevParams: () => sessionStorage.getItem(SESSION_KEYS.DEV_PARAMS),
  setDevParams: (v) => sessionStorage.setItem(SESSION_KEYS.DEV_PARAMS, v),
};
