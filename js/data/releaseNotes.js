/**
 * js/data/releaseNotes.js — Runtime-readable release notes, keyed by APP_VERSION.
 *
 * This is the SINGLE runtime source the changelog overlay (MpiChangelogDialog)
 * consumes on startup. It is intentionally a JS module, not parsed markdown:
 * the browser never reads `docs/releases/*.md` (those remain archival/user-facing
 * docs). When cutting a release with /mpi-version-bump, add a new entry here for
 * the new APP_VERSION in addition to writing the markdown release note.
 *
 * Payload shape (all section arrays optional; empty/missing = hidden in the UI):
 *   {
 *     version: string,            // matches APP_VERSION
 *     whatIsNew:        string[], // headline features / additions
 *     fixes:            string[], // bug fixes
 *     breakingChanges:  string[], // backward-incompatible changes (prominent)
 *     importantChanges: string[], // non-breaking but notable (prominent)
 *     engineNotes:      string[], // ComfyUI engine / dependency notes
 *   }
 *
 * The changelog overlay describes the already-running app version after a
 * bump/update. It is NOT an updater: do not add network checks, release polling,
 * or update bundles here (that is MPI-8 / portable-distribution scope).
 */

/**
 * @typedef {Object} ReleaseNotes
 * @property {string}   version
 * @property {string[]} whatIsNew
 * @property {string[]} fixes
 * @property {string[]} breakingChanges
 * @property {string[]} importantChanges
 * @property {string[]} engineNotes
 */

/**
 * Release notes by version string. Newest entries can be added on top; lookup is
 * by exact version key, so order does not affect behavior.
 * @type {Record<string, ReleaseNotes>}
 */
export const RELEASE_NOTES = {
  '0.0.10': {
    version: '0.0.10',
    whatIsNew: [],
    fixes: [
      'Video zoom now works on macOS and Linux — scroll to zoom and double-click to reset in the video viewer.',
      'History thumbnails for video entries now render correctly (no more "missing video/image link").',
      'Apple Silicon: the memory monitor now shows only RAM (your Mac shares one memory pool — there is no separate VRAM to display).',
      'The status bar now shows generation progress reliably, and each finished generation reports how long it took.',
      'macOS: applying an offline update now works even when Safari has already unzipped the update into a folder.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.8': {
    version: '0.0.8',
    whatIsNew: [
      'First macOS (Apple Silicon) build — Cubric Vision now runs on Windows, Linux, and Mac.',
    ],
    fixes: [
      'macOS: the app now uses your Mac’s GPU (Metal) for generation instead of the CPU.',
      'macOS: bundled tools and launchers keep their permissions so the app starts correctly.',
      'Opening an image or video in the history view no longer fails on Linux.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.7': {
    version: '0.0.7',
    whatIsNew: [
      'Online-update test build — verifies the no-curl online updater end to end. No functional changes.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.6': {
    version: '0.0.6',
    whatIsNew: [],
    fixes: [
      'Online update (Linux/macOS) no longer requires curl to be installed — it now uses the app’s own bundled runtime, so it works on minimal systems out of the box.',
      'After an update, the launchers stay runnable (“Run as program” / double-click) on Linux and macOS instead of losing their executable flag.',
      'Clearer messages if an update can’t be found or downloaded, instead of the window closing with no explanation.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.5': {
    version: '0.0.5',
    whatIsNew: [
      'Model preview cards now use sharper still images, and video models play a short preview clip when you hover over them.',
    ],
    fixes: [
      'Large model downloads now resume where they left off after you close and reopen the app, instead of starting over. A partially downloaded model is no longer mistaken for a finished one.',
      'Closing the app mid-download now warns you: models in flight will resume on next launch; the engine download restarts.',
      'Linux/macOS: launchers stay executable after applying an update, so "Run as program" and double-click keep working (previously an update could strip the executable bit).',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.4': {
    version: '0.0.4',
    whatIsNew: [],
    fixes: [
      'First-run install now keeps the models folder you pick before pressing Install, instead of silently reverting to the default location.',
      'Linux: the no-terminal launcher (start.sh) now starts the app when run via the file manager’s "Run as program", not only from a terminal.',
      'Engine install no longer shows a Pause/Resume button that could vanish mid-download — the engine download runs straight through (Pause/Resume remains for model downloads).',
      'Gallery cards: the favourite and reuse buttons no longer overlap as the UI is scaled up or in preview state.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.3': {
    version: '0.0.3',
    whatIsNew: [],
    fixes: [
      'Linux: applying an update from a zip now installs the full update correctly instead of stopping partway through.',
      'Linux: the no-terminal launcher (start.sh) now starts the app reliably; previously it could silently fail to launch.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.2': {
    version: '0.0.2',
    whatIsNew: [
      'New keyboard shortcuts to change the UI size: Ctrl and Plus to enlarge, Ctrl and Minus to shrink — matching the existing Ctrl + mouse-wheel control.',
    ],
    fixes: [
      'More reliable ComfyUI engine setup: stale install artifacts are cleared and the Python runtime is verified before continuing, with a smarter Retry.',
      'Engine download Pause/Resume controls no longer disappear or misbehave while background dependencies are installing.',
      'Changing the models folder in Settings no longer leaves a stale "no models installed" message.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.1': {
    version: '0.0.1',
    whatIsNew: [
      'First alpha build of Cubric Studio Vision for local image and video generation in a desktop project workspace.',
      'Project-based workspace: organize generations, history, and the gallery per project.',
      'Model-aware workflows run through the local ComfyUI engine, with in-app engine setup and model discovery.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [
      'This is alpha-quality software. Platform validation, portable updates, and project/settings compatibility may change before public release.',
      'Windows is the maintainer-tested path first. Linux and macOS release notes should be checked for the latest validation status before sharing artifacts.',
    ],
    engineNotes: [
      'Generation uses the configured local ComfyUI engine and local model files for this release.',
    ],
  },
};

/**
 * Empty/fallback notes for a version that has no entry. Deterministic so callers
 * can treat "no notes" uniformly. Returned only when `getReleaseNotes` is asked
 * to fall back; `getReleaseNotes` itself returns null for unknown versions so the
 * overlay can be skipped entirely.
 * @param {string} version
 * @returns {ReleaseNotes}
 */
export function emptyReleaseNotes(version) {
  return {
    version: String(version || ''),
    whatIsNew: [],
    fixes: [],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  };
}

/**
 * Look up release notes for a version. Returns the entry for a known version,
 * or null when no notes exist (the overlay should be skipped in that case).
 * @param {string} version - e.g. APP_VERSION ('0.0.1')
 * @returns {ReleaseNotes|null}
 */
export function getReleaseNotes(version) {
  const key = String(version || '').trim();
  return RELEASE_NOTES[key] || null;
}

/**
 * True when a notes payload has at least one non-empty section worth showing.
 * @param {ReleaseNotes|null} notes
 * @returns {boolean}
 */
export function hasReleaseContent(notes) {
  if (!notes) return false;
  return [
    notes.whatIsNew,
    notes.fixes,
    notes.breakingChanges,
    notes.importantChanges,
    notes.engineNotes,
  ].some((arr) => Array.isArray(arr) && arr.length > 0);
}
