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
  PLAY_AUDIO_ON_HOVER: 'mpi_play_audio_on_hover',
  TOAST_SOUND:         'mpi_toast_sound',

  // RunPod remote engine — NON-secret prefs only. The API key and wrapper
  // token live in the main process (safeStorage via secrets:* IPC), never here.
  RUNPOD_CONFIG:       'mpi_runpod_config',

  // Project management
  EXTRA_PROJECT_PATHS: 'mpi_extra_project_paths',
  LAST_PROJECT:       'mpi_last_project',

  // Model selection (per-mediaType, persisted across sessions)
  SELECTED_MODELS:        'mpi_selected_models_by_type',
  LAST_SELECTED_MEDIATYPE:'mpi_last_selected_mediatype',
  // Per-model operation toggle draft (MPI-122) — { [modelId]: string[] of opKeys }
  MODEL_OP_DRAFT:         'mpi_model_op_draft_by_model',
  // Per-model GPU-arch toggle draft (MPI-209) — { [modelId]: string[] of arch tokens }
  MODEL_ARCH_DRAFT:       'mpi_model_arch_draft_by_model',

  // Dev tools
  COMP_DEBUG:          'mpi_comp_debug',

  // Viewer rendering
  PIXEL_MODE:          'mpi_pixel_mode',

  // OS notification prefs (per-type opt-out)
  NOTIFICATION_PREFS:  'mpi_notification_prefs',

  // MPI-270: OS floating latent window when minimized (opt-in, default on)
  FLOAT_LATENT_WINDOW: 'mpi_float_latent_window',

  // Gallery UI (card size level + info-mode toggle)
  GALLERY_SIZE_LEVEL:  'mpi_gallery_size_level',
  GALLERY_SHOW_INFO:   'mpi_gallery_show_info',

  // PromptBox UI
  PROMPT_EXPANDED:     'mpi_prompt_expanded',

  // Reuse Prompt behavior
  PROMPT_REUSE_OPTIONS:'mpi_prompt_reuse_options',
  PROMPT_REUSE_SOURCE: 'mpi_prompt_reuse_source',

  // Changelog overlay (last APP_VERSION the user dismissed the changelog for)
  LAST_SEEN_CHANGELOG_VERSION: 'mpi_last_seen_changelog_version',

  // Adult-content / 18+ awareness overlay — true once the user has acknowledged it
  MATURITY_ACKNOWLEDGED: 'mpi_maturity_acknowledged',
};

// --- sessionStorage keys ---
export const SESSION_KEYS = {
  DEV_PAGE:   'mpi_dev_page',
  DEV_PARAMS: 'mpi_dev_params',
};
