/**
 * mediaUploadService.js — Shared media-file upload helper.
 *
 * Extracted from MpiPromptBox so Gallery + PromptBox share one ingest path.
 * Uploads a File to the project's media folder, creates its sidecar with
 * measured pixel dimensions, and returns stable URL + identifiers.
 */

import { clientLogger } from './clientLogger.js';
import { measureMediaDimensions } from '../utils/mediaDimensions.js';

/**
 * @param {File} file
 * @param {'image'|'video'} mediaType
 * @param {string} projectFolderPath
 * @param {string} projectId
 * @param {Object} [opts]
 * @param {string} [opts.filenamePrefix='imported'] - Filename prefix (e.g. 'snapshot') before _NNN.<ext>
 * @param {string} [opts.operation='imported'] - Sidecar operation field (e.g. 'snapshot')
 * @returns {Promise<{filePath: string, filename: string, itemId: string}|null>}
 */
export async function uploadMediaFile(file, mediaType, projectFolderPath, projectId, opts = {}) {
    if (!projectFolderPath || !projectId) {
        clientLogger.warn('mediaUploadService', 'Missing project context — cannot save media');
        return null;
    }
    try {
        const ext = file.name.split('.').pop() || (mediaType === 'image' ? 'png' : 'mp4');
        const prefix = opts.filenamePrefix || 'imported';
        const filename = `${prefix}_001.${ext}`; // backend overrides sequence via autoSequence
        const itemId = crypto.randomUUID();

        const base64 = await _fileToBase64(file);
        const { w: width, h: height } = await measureMediaDimensions(file, mediaType);

        const res = await fetch(
            `/project-media/${projectId}/upload?folderPath=${encodeURIComponent(projectFolderPath)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename,
                    base64Data: base64,
                    autoSequence: true,
                    itemId,
                    mediaType,
                    width,
                    height,
                    operation: opts.operation || undefined,
                }),
            }
        );
        if (!res.ok) throw new Error(`upload failed: ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'upload failed');
        const filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
        return { filePath, filename: data.filename, itemId, thumbPath: data.thumbPath || null };
    } catch (e) {
        clientLogger.warn('mediaUploadService', 'Media save failed:', e);
        return null;
    }
}

function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
