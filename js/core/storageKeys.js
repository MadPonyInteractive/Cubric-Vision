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
  GALLERY_VOLUME:      'mpi_gallery_volume',
  TOAST_SOUND:         'mpi_toast_sound',

  // MPI-573: microphone capture. Device is a deviceId from enumerateDevices (empty
  // = system default); gain is a linear multiplier applied to the recorded signal,
  // not just to the meter.
  AUDIO_INPUT_DEVICE:  'mpi_audio_input_device',
  AUDIO_INPUT_GAIN:    'mpi_audio_input_gain',

  // RunPod remote engine — NON-secret prefs only. The API key and wrapper
  // token live in the main process (safeStorage via secrets:* IPC), never here.
  RUNPOD_CONFIG:       'mpi_runpod_config',

  // Project management
  EXTRA_PROJECT_PATHS: 'mpi_extra_project_paths',
  LAST_PROJECT:       'mpi_last_project',

  // Model selection (per-mediaType, persisted across sessions)
  SELECTED_MODELS:        'mpi_selected_models_by_type',
  LAST_SELECTED_MEDIATYPE:'mpi_last_selected_mediatype',
  // Per-model GPU-arch toggle draft (MPI-209) — { [modelId]: string[] of arch tokens }
  MODEL_ARCH_DRAFT:       'mpi_model_arch_draft_by_model',

  // Dev tools
  COMP_DEBUG:          'mpi_comp_debug',

  // Viewer rendering
  PIXEL_MODE:          'mpi_pixel_mode',

  // MPI-374: global UI size (webFrame zoom factor), restored on boot
  UI_ZOOM_FACTOR:      'mpi_ui_zoom_factor',

  // OS notification prefs (per-type opt-out)
  NOTIFICATION_PREFS:  'mpi_notification_prefs',

  // MPI-270: OS floating latent window when minimized (opt-in, default on)
  FLOAT_LATENT_WINDOW: 'mpi_float_latent_window',

  // MPI-500: send uninstalled weights to the Recycle Bin (opt-in, default off)
  RECYCLE_BIN_DELETE:  'mpi_recycle_bin_delete',

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

  // MPI-334: in-app update prompt — { version, count } of the latest release the
  // user has dismissed (Cancel). Muted once count reaches 3, until a newer version lands.
  UPDATE_DISMISSED: 'mpi_update_dismissed',

  // MPI-451: per-model licence acceptance receipts, for models whose licence obliges
  // us to bind the user before they receive the weights —
  // { [modelId]: { licenceId, version, at } }. Written only by licences.js.
  LICENCE_ACCEPTED: 'mpi_model_licence_accepted',

  // MPI-696: landing-hero quote deck — { order: number[], pos } . A shuffled deck,
  // not a last-shown index, so every quote is dealt once before any repeats.
  HERO_QUOTE_DECK: 'mpi_hero_quote_deck',
};

// --- sessionStorage keys ---
export const SESSION_KEYS = {
  DEV_PAGE:   'mpi_dev_page',
  DEV_PARAMS: 'mpi_dev_params',
};
