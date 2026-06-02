/**
 * js/core/appStage.js — Derives the app release stage from APP_VERSION.
 *
 * There is NO separate stage source of truth. The stage (alpha | beta | release)
 * is computed purely from the semantic APP_VERSION in appVersion.js, so it can
 * never drift from the version the build actually ships.
 *
 * Rule (locked MPI-2):
 *   - 0.x.x            → 'alpha'   (all pre-1.0 builds)
 *   - X.0.0 (X >= 1)   → 'release' (clean major.0.0)
 *   - X.Y.0 (Y > 0)    → 'beta'    (minor bump, no patch)
 *   - X.Y.Z (Z > 0)    → 'alpha'   (patch in flight)
 *
 * Used by the About panel label and the in-app error reporter. The error
 * reporter's BACKEND re-derives stage from the version it receives — the client
 * value is advisory only and never trusted.
 */

import { APP_VERSION } from './appVersion.js';

/** @typedef {'alpha' | 'beta' | 'release'} AppStage */

/**
 * Derive the release stage from a semantic version string.
 * Falls back to 'alpha' for any unparseable input (safest, never claims release).
 * @param {string} version - e.g. '0.0.1', '1.2.0'
 * @returns {AppStage}
 */
export function deriveStage(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
    if (!m) return 'alpha';

    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = Number(m[3]);

    if (major < 1) return 'alpha';
    if (minor === 0 && patch === 0) return 'release';
    if (patch === 0) return 'beta';
    return 'alpha';
}

/** Current app stage, derived from APP_VERSION. */
export const APP_STAGE = deriveStage(APP_VERSION);

/** Capitalized label for UI display, e.g. 'Alpha'. */
export const APP_STAGE_LABEL = APP_STAGE.charAt(0).toUpperCase() + APP_STAGE.slice(1);
