/**
 * js/managers/versioningManager.js — Semver utilities + operation compatibility helpers.
 *
 * Used by Plan B migration runner and Plan C version bump tooling.
 */

import { OPERATION_REGISTRY } from '../core/operationRegistry.js';

/**
 * Compare two semver strings.
 * Returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2.
 * Handles standard 'MAJOR.MINOR.PATCH' format only.
 * @param {string} v1
 * @param {string} v2
 * @returns {-1 | 0 | 1}
 */
export function compareSemVer(v1, v2) {
    const parse = (v) => v.split('.').map(Number);
    const [a1, a2, a3] = parse(v1);
    const [b1, b2, b3] = parse(v2);
    if (a1 !== b1) return a1 < b1 ? -1 : 1;
    if (a2 !== b2) return a2 < b2 ? -1 : 1;
    if (a3 !== b3) return a3 < b3 ? -1 : 1;
    return 0;
}

/**
 * Returns true if the operation was available in the given app version.
 * Used when validating projects opened in older app versions.
 * @param {string} operationId
 * @param {string} appVersion
 * @returns {boolean}
 */
export function isOperationAvailableIn(operationId, appVersion) {
    const meta = OPERATION_REGISTRY[operationId];
    if (!meta) return false;
    return compareSemVer(meta.appVersionIntroduced, appVersion) <= 0;
}

/**
 * Returns all operations that were introduced in a specific app version.
 * Used by the version bump script to list what's new in a release.
 * @param {string} appVersion
 * @returns {string[]}
 */
export function getOperationsIntroducedIn(appVersion) {
    return Object.entries(OPERATION_REGISTRY)
        .filter(([, meta]) => meta.appVersionIntroduced === appVersion)
        .map(([id]) => id);
}