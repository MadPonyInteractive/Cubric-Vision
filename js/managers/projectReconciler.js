/**
 * js/managers/projectReconciler.js
 *
 * Client-side reconciliation: loads .meta/<uuid>.json files for each history
 * ID, drops entries where the meta or media file is missing, and returns
 * fully hydrated in-memory item objects.
 *
 * Runs after server-side migration (openProject flow):
 *   1. projectManager.openProject() calls POST /migrate-project
 *   2. /migrate-project runs server migrations and writes updated project.json
 *   3. Client loads the migrated project, then calls reconcileAndHydrate()
 *   4. reconcileAndHydrate() fetches each .meta/<uuid>.json and checks the
 *      corresponding media file exists
 *   5. Broken entries are silently removed; groups that become empty are dropped
 *
 * The reconciled project is then persisted back to project.json if anything
 * was removed (so the disk state stays clean).
 */

import { state } from '../state.js';

/**
 * Reconcile a migrated project: load .meta/ files, drop broken entries,
 * hydrate history with full item objects.
 *
 * @param {Object} project — Migrated project (history = UUID string arrays)
 * @returns {{ project: Object, wasModified: boolean }}
 *   project: fully hydrated in-memory project ready for state
 *   wasModified: true if any entries/groups were removed (needs re-persist)
 */
export async function reconcileAndHydrate(project) {
    let wasModified = false;
    const hydratedGroups = [];

    for (const group of (project.itemGroups ?? [])) {
        const hydratedHistory = [];

        for (const id of (group.history ?? [])) {
            // Load .meta/<uuid>.json from server
            const meta = await _fetchMeta(id, project.folderPath);

            if (!meta) {
                // No .meta/ file found. This can happen for:
                //   a) uploaded: true items (imported by user — no .meta/ by design)
                //   b) items whose .meta/ was accidentally deleted
                // In both cases, try to construct a minimal synthetic item from
                // the media file itself so the entry isn't silently lost.
                wasModified = true;
                const synthetic = await _constructSyntheticItem(id, project.folderPath);
                if (synthetic) {
                    hydratedHistory.push(synthetic);
                }
                continue;
            }

            // Check media file still exists on disk
            const mediaExists = await _checkFileExists(meta.filePath);
            if (!mediaExists) {
                // Orphaned meta — clean it up
                await _deleteMeta(id, project.folderPath);
                wasModified = true;
                continue;
            }

            hydratedHistory.push(meta); // Full object in memory
        }

        if (hydratedHistory.length === 0) {
            wasModified = true;
            continue; // Drop empty group
        }

        hydratedGroups.push({
            ...group,
            history: hydratedHistory,
            selectedIndex: Math.min(group.selectedIndex ?? 0, hydratedHistory.length - 1),
        });
    }

    return {
        project: { ...project, itemGroups: hydratedGroups },
        wasModified,
    };
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Fetch a .meta/<uuid>.json file from the server.
 * @returns {Promise<Object|null>} Parsed meta object, or null if not found
 */
async function _fetchMeta(id, folderPath) {
    try {
        const url = `/load-meta?id=${encodeURIComponent(id)}&folderPath=${encodeURIComponent(folderPath)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Check whether the media file referenced in a meta file actually exists.
 * Extracts the absolute path from the filePath URL param.
 * @returns {Promise<boolean>}
 */
async function _checkFileExists(filePath) {
    try {
        const absPath = _extractAbsPath(filePath);
        if (!absPath) return false;
        const res = await fetch(`/file-exists?path=${encodeURIComponent(absPath)}`);
        const data = await res.json();
        return data.exists === true;
    } catch {
        return false;
    }
}

/**
 * Try to construct a minimal synthetic item for entries that have no .meta/ file.
 * This preserves uploaded items (which don't get .meta/ files) and items whose
 * .meta/ was accidentally deleted. The media file must exist.
 *
 * @param {string} id — Item UUID
 * @param {string} folderPath — Project folder path
 * @returns {Promise<Object|null>} Synthetic item, or null if media file not found
 */
async function _constructSyntheticItem(id, folderPath) {
    // Scan the Media directory to find a file named <id>.<ext>
    const files = await _listMediaFiles(folderPath);
    const hit = files.find(f => {
        const base = f.name.replace(/\.[^.]+$/, '');
        return base === id;
    });

    if (!hit) return null; // Can't locate the media file

    const isVideo = hit.type === 'video';
    return {
        id,
        type: hit.type,
        filePath: `/project-file?path=${encodeURIComponent(hit.path)}`,
        operation: 'imported',
        displayName: hit.name.replace(/\.[^.]+$/, ''),
        prompt: '',
        negativePrompt: '',
        seed: -1,
        modelId: null,
        createdAt: new Date().toISOString(),
        name: null,
        uploaded: true,
        pixelDimensions: hit.resolution
            ? _parseResolution(hit.resolution)
            : (isVideo ? { w: 0, h: 0 } : { w: 0, h: 0 }),
        generationMs: null,
    };
}

/**
 * Parse "WxH" resolution string to { w, h }.
 */
function _parseResolution(resolution) {
    const [w, h] = (resolution || '0x0').split('x').map(Number);
    return { w: w || 0, h: h || 0 };
}

/**
 * List media files in a project's Media directory (client-side scan via route).
 * Returns array of { name, type, path } objects.
 */
async function _listMediaFiles(folderPath) {
    try {
        const url = `/project-media/temp?folderPath=${encodeURIComponent(folderPath)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return data.files || [];
    } catch {
        return [];
    }
}

/**
 * Delete a .meta/<uuid>.json sidecar file via the server.
 */
async function _deleteMeta(id, folderPath) {
    try {
        await fetch(`/delete-meta?id=${encodeURIComponent(id)}&folderPath=${encodeURIComponent(folderPath)}`, {
            method: 'DELETE',
        });
    } catch {
        // Non-fatal — best effort cleanup
    }
}

/**
 * Extract absolute path from a /project-file?path=... URL or return as-is.
 * @param {string} filePath — e.g. "/project-file?path=C%3A%5C...%5Ct2i_001.png"
 * @returns {string|null}
 */
function _extractAbsPath(filePath) {
    if (!filePath) return null;
    if (filePath.startsWith('/')) {
        const match = filePath.match(/[?&]path=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
    }
    // Already an absolute path
    return filePath;
}
