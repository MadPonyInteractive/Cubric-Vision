// js/core/storageKeys.js

/**
 * Centralized storage key constants.
 * ALL localStorage/sessionStorage keys must be defined here.
 * No raw string literals for storage keys anywhere else in the codebase.
 */

// --- localStorage keys ---
export const STORAGE_KEYS = {
  // Engine settings
  COMFY_ROOT_PATH:     'mpi_comfy_root_path',
  AUTO_START_COMFY:    'mpi_auto_start_comfy',

  // RunPod remote engine — NON-secret prefs only. The API key and wrapper
  // token live in the main process (safeStorage via secrets:* IPC), never here.
  RUNPOD_CONFIG:       'mpi_runpod_config',

  // Project management
  EXTRA_PROJECT_PATHS: 'mpi_extra_project_paths',
  LAST_PROJECT:       'mpi_last_project',

  // Model selection (per-mediaType, persisted across sessions)
  SELECTED_MODELS:        'mpi_selected_models_by_type',
  LAST_SELECTED_MEDIATYPE:'mpi_last_selected_mediatype',

  // Dev tools
  COMP_DEBUG:          'mpi_comp_debug',

  // Viewer rendering
  PIXEL_MODE:          'mpi_pixel_mode',

  // PromptBox UI
  PROMPT_EXPANDED:     'mpi_prompt_expanded',

  // Reuse Prompt behavior
  PROMPT_REUSE_OPTIONS:'mpi_prompt_reuse_options',
  PROMPT_REUSE_SOURCE: 'mpi_prompt_reuse_source',

  // Changelog overlay (last APP_VERSION the user dismissed the changelog for)
  LAST_SEEN_CHANGELOG_VERSION: 'mpi_last_seen_changelog_version',
};

// --- sessionStorage keys ---
export const SESSION_KEYS = {
  DEV_PAGE:   'mpi_dev_page',
  DEV_PARAMS: 'mpi_dev_params',
};
