// js/core/storage.js

import { STORAGE_KEYS, SESSION_KEYS } from './storageKeys.js';

export const DEFAULT_PROMPT_REUSE_OPTIONS = Object.freeze({
  ask: false,
  prompt: true,
  settings: true,
  model: true,
  images: true,
});

function normalizePromptReuseOptions(value = {}) {
  const ask = value?.ask === true;
  return {
    ask,
    prompt: value?.prompt !== false,
    settings: value?.settings !== false,
    model: value?.model !== false,
    images: value?.images !== false,
  };
}

function normalizePromptReuseSource(value) {
  return value === 'current' ? 'current' : 'original';
}

export const DEFAULT_NOTIFICATION_PREFS = Object.freeze({
  generation: true,
  downloads: true,
});

// Both default ON — preserves the prior always-notify behavior on a fresh/corrupt store.
function normalizeNotificationPrefs(value = {}) {
  return {
    generation: value?.generation !== false,
    downloads: value?.downloads !== false,
  };
}

export const DEFAULT_RUNPOD_CONFIG = Object.freeze({
  enabled: false,
  podId: null,
  datacenter: null,
  gpuType: null,
  volumeId: null,
  // wasConnected: the user reached a connected Pod and did NOT explicitly
  // Disconnect — boot uses this to auto-reconnect (start-or-recreate). Set on a
  // successful Connect/reconnect, cleared on explicit Disconnect.
  wasConnected: false,
  // deleteOnQuit: when true, app-quit DELETES the Pod instead of stopping it
  // warm (default = stop-not-delete, Step 4.3). Off keeps the Pod EXITED +
  // warm-resumable; on frees the GPU + container disk fully (volume persists).
  deleteOnQuit: false,
  // autoConnectOnStart: owns the boot auto-connect lifecycle (MPI-85), decoupled
  // from `enabled`. Default OFF = no surprise billed Pod at launch; the app boots
  // LOCAL and the user Connects when wanted. When ON, boot auto-reconnects a Pod.
  // `enabled` is now purely "remote is available / show the panel", not "force remote".
  autoConnectOnStart: false,
  // autoRetry: when ON, the GPU picker also lists out-of-stock cards and Connect
  // waits in the background (polling availability) for the picked GPU to free
  // before connecting — without blocking local generation (MPI-110). Default OFF.
  autoRetry: false,
  // idleTimeoutS: idle-watchdog timeout baked into the Pod env at create time,
  // stored in SECONDS (the wrapper unit), shown as minutes in Settings. Floor
  // 10 min (600 s), default 15 min (900 s) — mirrors MpiSettings' IDLE_* clamps.
  idleTimeoutS: 900,
  // containerDiskGb: size (GB) of the ephemeral container disk for a no-volume
  // "Any region" Pod (MPI-78). Only used when volumeId is null — models download
  // here and die with the Pod. Default 100; clamped server-side. Ignored when a
  // network volume is attached (models live on the volume).
  containerDiskGb: 100,
  // minRamGb: optional system-RAM FLOOR (GB) for the connected Pod's host (MPI-160).
  // RunPod honors minMemoryInGb as a hard placement filter, so a user whose model
  // needs a high-RAM host (LTX warm perf ~90GB) sets this and RunPod only lands a
  // host with >= that much system RAM. 0 = no floor (default). Ignored for the CPU
  // download Pod and Any-region.
  minRamGb: 0,
});

// Idle-watchdog floor/default in seconds (mirrors MpiSettings IDLE_FLOOR_MIN /
// IDLE_DEFAULT_S). A missing/corrupt value heals to the default; a sub-floor
// value clamps up so the wrapper env never gets an out-of-range timeout.
const IDLE_FLOOR_S = 600;
const IDLE_DEFAULT_S = 900;

// Non-secret RunPod prefs only — never the API key or wrapper token.
function normalizeRunpodConfig(value = {}) {
  return {
    enabled: value?.enabled === true,
    podId: value?.podId || null,
    datacenter: value?.datacenter || null,
    gpuType: value?.gpuType || null,
    volumeId: value?.volumeId || null,
    wasConnected: value?.wasConnected === true,
    deleteOnQuit: value?.deleteOnQuit === true,
    autoConnectOnStart: value?.autoConnectOnStart === true,
    autoRetry: value?.autoRetry === true,
    idleTimeoutS: normalizeIdleTimeoutS(value?.idleTimeoutS),
    containerDiskGb: normalizeContainerDiskGb(value?.containerDiskGb),
    minRamGb: normalizeMinRamGb(value?.minRamGb),
  };
}

// System-RAM floor (GB): non-negative integer, clamped to a sane ceiling. A
// missing/corrupt value heals to 0 (no floor).
function normalizeMinRamGb(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(2000, n);
}

// Ephemeral container-disk size (GB) for no-volume Pods (MPI-78). Heal a
// missing/corrupt value to the 100GB default; clamp to the same 20–500 band the
// backend enforces so a stored value never drives an out-of-range create.
function normalizeContainerDiskGb(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 100;
  return Math.min(500, Math.max(20, n));
}

function normalizeIdleTimeoutS(value) {
  const s = Number(value);
  if (!Number.isFinite(s) || s <= 0) return IDLE_DEFAULT_S;
  return Math.max(IDLE_FLOOR_S, Math.round(s));
}

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

  getRunpodConfig:     () => normalizeRunpodConfig(get(STORAGE_KEYS.RUNPOD_CONFIG, DEFAULT_RUNPOD_CONFIG)),
  setRunpodConfig:     (v) => set(STORAGE_KEYS.RUNPOD_CONFIG, normalizeRunpodConfig(v)),

  getAutoStartComfy:   () => get(STORAGE_KEYS.AUTO_START_COMFY, false),
  setAutoStartComfy:   (v) => set(STORAGE_KEYS.AUTO_START_COMFY, v),

  getPlayAudioOnHover: () => get(STORAGE_KEYS.PLAY_AUDIO_ON_HOVER, true),
  setPlayAudioOnHover: (v) => set(STORAGE_KEYS.PLAY_AUDIO_ON_HOVER, v),

  getExtraProjectPaths: () => get(STORAGE_KEYS.EXTRA_PROJECT_PATHS, []),
  setExtraProjectPaths: (v) => set(STORAGE_KEYS.EXTRA_PROJECT_PATHS, v),

  getLastProject:      () => get(STORAGE_KEYS.LAST_PROJECT, null),
  setLastProject:      (v) => set(STORAGE_KEYS.LAST_PROJECT, v),

  getCompDebug:        () => get(STORAGE_KEYS.COMP_DEBUG, false),
  setCompDebug:        (v) => set(STORAGE_KEYS.COMP_DEBUG, v),

  getSelectedModels:   () => get(STORAGE_KEYS.SELECTED_MODELS, { image: null, video: null }),
  setSelectedModels:   (v) => set(STORAGE_KEYS.SELECTED_MODELS, v),

  // Per-model operation toggle draft (MPI-122). { [modelId]: string[] } of selected opKeys.
  getModelOpDraft:     () => get(STORAGE_KEYS.MODEL_OP_DRAFT, {}),
  setModelOpDraft:     (v) => set(STORAGE_KEYS.MODEL_OP_DRAFT, v),

  // Per-model GPU-arch toggle draft (MPI-209). { [modelId]: string[] } of arch tokens.
  getModelArchDraft:   () => get(STORAGE_KEYS.MODEL_ARCH_DRAFT, {}),
  setModelArchDraft:   (v) => set(STORAGE_KEYS.MODEL_ARCH_DRAFT, v),

  getLastSelectedMediaType: () => get(STORAGE_KEYS.LAST_SELECTED_MEDIATYPE, 'image'),
  setLastSelectedMediaType: (v) => set(STORAGE_KEYS.LAST_SELECTED_MEDIATYPE, v),

  getPixelMode:        () => get(STORAGE_KEYS.PIXEL_MODE, 'auto'),
  setPixelMode:        (v) => set(STORAGE_KEYS.PIXEL_MODE, v),

  getNotificationPrefs: () => normalizeNotificationPrefs(get(STORAGE_KEYS.NOTIFICATION_PREFS, DEFAULT_NOTIFICATION_PREFS)),
  setNotificationPrefs: (v) => set(STORAGE_KEYS.NOTIFICATION_PREFS, normalizeNotificationPrefs(v)),

  // Gallery card-size level (1–4) + info-mode toggle — cross-session.
  getGallerySizeLevel: () => Math.min(4, Math.max(1, get(STORAGE_KEYS.GALLERY_SIZE_LEVEL, 3))),
  setGallerySizeLevel: (v) => set(STORAGE_KEYS.GALLERY_SIZE_LEVEL, v),

  getGalleryShowInfo:  () => get(STORAGE_KEYS.GALLERY_SHOW_INFO, false),
  setGalleryShowInfo:  (v) => set(STORAGE_KEYS.GALLERY_SHOW_INFO, !!v),

  getPromptExpanded:   () => get(STORAGE_KEYS.PROMPT_EXPANDED, true),
  setPromptExpanded:   (v) => set(STORAGE_KEYS.PROMPT_EXPANDED, !!v),

  getPromptReuseOptions: () => normalizePromptReuseOptions(get(STORAGE_KEYS.PROMPT_REUSE_OPTIONS, DEFAULT_PROMPT_REUSE_OPTIONS)),
  setPromptReuseOptions: (v) => set(STORAGE_KEYS.PROMPT_REUSE_OPTIONS, normalizePromptReuseOptions(v)),

  getPromptReuseSource: () => normalizePromptReuseSource(get(STORAGE_KEYS.PROMPT_REUSE_SOURCE, 'original')),
  setPromptReuseSource: (v) => set(STORAGE_KEYS.PROMPT_REUSE_SOURCE, normalizePromptReuseSource(v)),

  getLastSeenChangelogVersion: () => get(STORAGE_KEYS.LAST_SEEN_CHANGELOG_VERSION, null),
  setLastSeenChangelogVersion: (v) => set(STORAGE_KEYS.LAST_SEEN_CHANGELOG_VERSION, v),

  getMaturityAcknowledged: () => get(STORAGE_KEYS.MATURITY_ACKNOWLEDGED, false),
  setMaturityAcknowledged: (v) => set(STORAGE_KEYS.MATURITY_ACKNOWLEDGED, !!v),
};

export const Session = {
  getDevPage:   () => sessionStorage.getItem(SESSION_KEYS.DEV_PAGE),
  setDevPage:   (v) => sessionStorage.setItem(SESSION_KEYS.DEV_PAGE, v),
  getDevParams: () => sessionStorage.getItem(SESSION_KEYS.DEV_PARAMS),
  setDevParams: (v) => sessionStorage.setItem(SESSION_KEYS.DEV_PARAMS, v),
};
