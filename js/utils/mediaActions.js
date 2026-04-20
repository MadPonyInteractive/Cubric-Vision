/**
 * mediaActions.js — Shared media file utilities.
 *
 * Extracts repeated media-related operations from MpiGalleryBlock
 * and MpiGroupHistoryBlock into reusable functions.
 */

import { clientLogger } from '../services/clientLogger.js';

/**
 * Extract the absolute path from a /project-file?path=... URL.
 * @param {string} filePath — e.g. "/project-file?path=C%3A%5C...%5Ct2i_001.png"
 * @returns {string|null} The decoded absolute path, or null if not parseable
 */
export function extractAbsPath(filePath) {
    if (!filePath) return null;
    const match = filePath.match(/[?&]path=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Extract just the filename from a filePath URL.
 * @param {string} filePath — e.g. "/project-file?path=C%3A%5CUsers%5C...%5Ct2i_001.png"
 * @returns {string|null}
 */
export function extractFilenameFromPath(filePath) {
    const absPath = extractAbsPath(filePath);
    if (!absPath) return null;
    return absPath.replace(/\\/g, '/').split('/').pop();
}

/**
 * Normalize a filePath to a URL the <img>/<video> tag can load.
 * Already-absolute URLs (http, blob, data) and project-file URLs pass through.
 * Raw Windows paths get wrapped in /project-file?path=....
 * @param {string} filePath
 * @returns {string}
 */
export function resolveMediaUrl(filePath) {
    if (!filePath) return '';
    if (filePath.startsWith('http') || filePath.startsWith('blob:') ||
        filePath.startsWith('data:') || filePath.includes('project-file')) {
        return filePath;
    }
    return `/project-file?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

/**
 * Download media files by creating temporary <a> elements.
 * @param {Object} project — state.currentProject (needs .folderPath)
 * @param {Array<{filePath: string}>} items — array of history items to download
 */
export function downloadMediaFiles(project, items) {
    if (!project?.folderPath) return;
    for (const item of items) {
        const filename = extractFilenameFromPath(item.filePath);
        if (!filename) continue;
        const url = `/project-file?path=${encodeURIComponent(
            `${project.folderPath}/Media/${filename}`.replace(/\\/g, '/')
        )}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

/**
 * Delete media files for the given items from a project.
 * Calls DELETE /project-media/:projectId/:filename for each item.
 * @param {Object} project — state.currentProject
 * @param {Array<{filePath: string}>} items — items whose files to delete
 */
export async function deleteMediaFiles(project, items) {
    if (!project) return;
    for (const item of items) {
        const filename = extractFilenameFromPath(item.filePath);
        if (!filename) continue;
        try {
            await fetch(
                `/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}`,
                { method: 'DELETE' }
            );
        } catch (err) {
            clientLogger.warn('mediaActions', 'delete file failed:', err);
        }
    }
}
