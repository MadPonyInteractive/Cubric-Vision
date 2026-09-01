/**
 * js/core/appStage.js — Derives the app release stage from APP_VERSION.
 *
 * There is NO separate stage source of truth. The stage (alpha | beta | release)
 * is computed purely from the semantic APP_VERSION in appVersion.js, so it can
 * never drift from the version the build actually ships.
 *
 * Rule:
 *   - 0.x.x            → 'alpha'   (internal pre-1.0 builds, never shipped)
 *   - X.Y.Z (X >= 1)   → 'release' (every public build; alpha/beta staging retired)
 *
 * Used by the About panel label and the in-app error reporter. THIS IS THE ONLY
 * IMPLEMENTATION. routes/system.js used to carry a mirrored copy for labelling
 * auto-filed issues, and the two had already drifted — the mirror still answered
 * 'alpha' for 1.4.2 — when MPI-675 deleted that route (it needed a GITHUB_TOKEN
 * the portable build strips). Do not reintroduce a second copy: the stage now
 * travels as text in a prefilled issue form the reporter can see and correct.
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

    if (major < 1) return 'alpha';
    return 'release';
}

/** Current app stage, derived from APP_VERSION. */
export const APP_STAGE = deriveStage(APP_VERSION);

/** Capitalized label for UI display, e.g. 'Alpha'. */
export const APP_STAGE_LABEL = APP_STAGE.charAt(0).toUpperCase() + APP_STAGE.slice(1);
