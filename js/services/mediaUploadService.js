/**
 * mediaUploadService.js — Shared media-file upload helper.
 *
 * Extracted from MpiPromptBox so Gallery + PromptBox share one ingest path.
 * Uploads a File to the project's media folder, creates its sidecar with
 * measured pixel dimensions, and returns stable URL + identifiers.
 */

import { clientLogger } from './clientLogger.js';
import { Events } from '../events.js';
import { measureMediaDimensions } from '../utils/mediaDimensions.js';

/**
 * Absolute disk path of a File, or null when it has none — a File synthesised from a
 * Blob (a canvas snapshot, a recorded take) is not backed by disk, and callers pass
 * plenty of those. Same `webUtils` accessor MpiFolderDrop/MpiProjectDropOverlay use;
 * null in browser dev mode, which keeps those on the base64 path.
 */
function _sourcePathFor(file) {
    try {
        if (typeof window.require !== 'function') return null;
        const webUtils = window.require('electron').webUtils;
        return webUtils?.getPathForFile(file) || null;
    } catch (_) {
        return null;
    }
}

/**
 * @param {File} file
 * @param {'image'|'video'|'audio'} mediaType — audio has no dimensions and no thumb;
 *        the server probes its duration instead (MPI-573).
 * @param {string} projectFolderPath
 * @param {string} projectId
 * @param {Object} [opts]
 * @param {string} [opts.filenamePrefix='imported'] - Filename prefix (e.g. 'snapshot') before _NNN.<ext>
 * @param {string} [opts.operation='imported'] - Sidecar operation field (e.g. 'snapshot')
 * @returns {Promise<{filePath: string, filename: string, itemId: string, thumbPath: string|null, thumbPathLg: string|null, proxyPath: string|null, pixelDimensions: {w: number, h: number}, fps: number|null, duration: number|null, frameCount: number|null, hasAudio: boolean|null}|null>}
 */
export async function uploadMediaFile(file, mediaType, projectFolderPath, projectId, opts = {}) {
    if (!projectFolderPath || !projectId) {
        clientLogger.warn('mediaUploadService', 'Missing project context — cannot save media');
        return null;
    }
    // Announced here rather than from a drop handler because this function IS the
    // ingest path — gallery drop, PromptBox drop, snapshot and recorder all land
    // here, so one pair of events gives every surface its spinner card (MPI-671).
    // ponytail: fires for a 2 MB snapshot too, which flashes a card for an instant.
    // Gate on file.size if that flicker turns out to annoy.
    const tempId = crypto.randomUUID();
    Events.emit('media:import-started', { tempId, filename: file?.name || '', mediaType });
    try {
        const ext = file.name.split('.').pop() || (mediaType === 'image' ? 'png' : 'mp4');
        const prefix = opts.filenamePrefix || 'imported';
        const filename = `${prefix}_001.${ext}`; // backend overrides sequence via autoSequence
        const itemId = crypto.randomUUID();

        // The file is already on disk — hand the server its path and let it copy.
        // Base64 caps import at ~75mb (the bodyParser limit) and past ~384MB
        // FileReader cannot even build the string (V8 max string length), which is
        // how a 474 MiB clip imported as nothing at all. MPI-670.
        const sourcePath = _sourcePathFor(file);
        const base64 = sourcePath ? null : await _fileToBase64(file);
        const { w: width, h: height } = await measureMediaDimensions(file, mediaType);

        const res = await fetch(
            `/project-media/${projectId}/upload?folderPath=${encodeURIComponent(projectFolderPath)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename,
                    ...(sourcePath ? { sourcePath } : { base64Data: base64 }),
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
        return {
            filePath,
            filename: data.filename,
            itemId,
            thumbPath: data.thumbPath || null,
            thumbPathLg: data.thumbPathLg || null,
            proxyPath: data.proxyPath || null,
            pixelDimensions: { w: width, h: height },
            // Server-side video probe (null for images) — MPI-83 Bug 2.
            fps:        data.fps        ?? null,
            duration:   data.duration   ?? null,
            frameCount: data.frameCount ?? null,
            hasAudio:   data.hasAudio   ?? null,
        };
    } catch (e) {
        clientLogger.warn('mediaUploadService', 'Media save failed:', e);
        // Every caller treats a null return as "skip this file" and says nothing, so
        // without this the user sees an import silently do nothing at all (MPI-670).
        // `ui:danger` (toast), not `ui:error` (blocking dialog) — a batch drop of ten
        // files must not open ten modals.
        Events.emit('ui:danger', { message: `Could not import ${file?.name || 'media'}: ${e.message || e}` });
        return null;
    } finally {
        // In a `finally` so a failure clears the spinner card too — a card left
        // running beside the toast above would read as an import still in flight.
        Events.emit('media:import-settled', { tempId });
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
