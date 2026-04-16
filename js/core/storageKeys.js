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
  OLLAMA_URL:          'mpi_ollama_url',
  COMFY_URL:           'mpi_comfy_url',
  AUTO_START_COMFY:    'mpi_auto_start_comfy',

  // Project management
  EXTRA_PROJECT_PATHS: 'mpi_extra_project_paths',
  LAST_PROJECT:       'mpi_last_project',

  // Dev tools
  COMP_DEBUG:          'mpi_comp_debug',
};

// --- sessionStorage keys ---
export const SESSION_KEYS = {
  DEV_PAGE:   'mpi_dev_page',
  DEV_PARAMS: 'mpi_dev_params',
};
