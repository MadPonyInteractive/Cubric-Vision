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
 *
 * NOTE: Copy below for 0.0.1 is PLACEHOLDER — replace with real changelog text
 * before shipping (tracked: MPI-46).
 * @type {Record<string, ReleaseNotes>}
 */
export const RELEASE_NOTES = {
  '0.0.1': {
    version: '0.0.1',
    whatIsNew: [
      'First alpha build of Cubric Studio Vision — image and video generation in a single desktop app.',
      'Project-based workspace: organize generations, history, and the gallery per project.',
      'Built-in ComfyUI engine management — install, upgrade, and auto-start handled for you.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [
      'This is an early alpha. Projects and settings may need to be recreated as the app evolves.',
    ],
    engineNotes: [],
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
