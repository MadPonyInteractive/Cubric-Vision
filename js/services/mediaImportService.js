/**
 * mediaImportService — turns a finished media import into an ItemGroup.
 *
 * `media:imported` is emitted by four surfaces (PromptBox drop, the gallery's
 * MpiMediaDropOverlay, the history workspace's picker, MpiAudioRecorder), and until
 * MPI-723 its only listener lived inside MpiGalleryBlock. Navigation destroys the
 * outgoing Block before mounting the next, so exactly one Block is ever mounted —
 * an import from anywhere but the gallery wrote the file and its sidecar to disk
 * and never built the group. A silent orphan.
 *
 * So the build lives here, on an app-lifetime listener started once from the shell,
 * and the gallery keeps only the half that was ever gallery-specific: repainting its
 * grid, which its `project:group-added` listener already does for every add.
 *
 * This service NEVER navigates. A drop in an image history group adds the gallery
 * card and leaves the user on the entry they are editing (Fabio, 2026-09-11).
 */

import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { addGroup } from './projectService.js';
import {
    createImageItem,
    createVideoItem,
    createAudioItem,
    createItemGroup,
    appendToHistory,
} from '../data/projectModel.js';

function _buildGroup({ url, filename, itemId, thumbPath, thumbPathLg, proxyPath, mediaType, pixelDimensions, fps, duration, frameCount, hasAudio }) {
    const isVideo = mediaType === 'video';
    const isAudio = mediaType === 'audio';
    const dims = pixelDimensions?.w > 0 && pixelDimensions?.h > 0
        ? pixelDimensions
        : null;
    const displayName = filename
        ? filename.replace(/\.[^.]+$/, '')
        : (isVideo ? 'Imported Video' : isAudio ? 'Imported Audio' : 'Imported Image');

    const id = itemId || filename.replace(/\.[^.]+$/, '');
    const item = isVideo
        ? createVideoItem({
            id,
            filePath: url,
            thumbPath,
            proxyPath,
            uploaded: true,
            operation: 'imported',
            pixelDimensions: dims || { w: 0, h: 0 },
            // Server-probed metadata so the card shows fps/duration on
            // the very first import without a reload (MPI-83 Bug 2).
            fps:        fps        ?? 0,
            duration:   duration   ?? 0,
            frameCount: frameCount ?? 0,
            hasAudio:   hasAudio   ?? false,
        })
        : isAudio
        ? createAudioItem({
            id,
            filePath: url,
            uploaded: true,
            operation: 'imported',
            duration: duration ?? 0,
        })
        : createImageItem({
            id,
            filePath: url,
            thumbPath,
            thumbPathLg,
            uploaded: true,
            operation: 'imported',
            pixelDimensions: dims || { w: 0, h: 0 },
        });

    const group = createItemGroup(mediaType, {
        name: displayName,
        ...(dims ? { width: dims.w, height: dims.h } : {}),
    });
    return appendToHistory(group, item);
}

let _started = false;

export function start() {
    if (_started) return;
    _started = true;

    /* eslint-disable mpi/require-destroy-on-events -- app-lifetime listener; service starts once at boot */
    Events.on('media:imported', (payload) => {
        if (!state.currentProject) return;
        // addGroup persists and emits `project:group-added`, which is what repaints
        // whichever grid is mounted. Nothing here touches the view.
        addGroup(_buildGroup(payload)).catch((err) => {
            clientLogger.error('mediaImportService', 'failed to add imported group', err);
            Events.emit('ui:error', { title: 'Import failed', message: String(err?.message || err).split('\n')[0].slice(0, 160) });
        });
    });
    /* eslint-enable mpi/require-destroy-on-events */
}
