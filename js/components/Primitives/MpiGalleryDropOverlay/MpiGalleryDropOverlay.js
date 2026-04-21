/**
 * MpiGalleryDropOverlay — Primitive: full-area OS-file drop target for Gallery.
 *
 * Model-agnostic import. Accepts any image/video file dragged from the OS
 * and emits `media:imported` so MpiGalleryBlock's existing listener creates
 * the ItemGroup and persists. Ignores internal `application/mpi-media`
 * drags (only OS files trigger show()).
 *
 * Props: (none)
 *
 * Instance methods (on instance.el):
 *   show() — make overlay visible (adds visible modifier)
 *   hide() — hide overlay
 *
 * Emits:
 *   (none — uses global Events.emit('media:imported', ...) so the gallery
 *    listener picks it up through the normal ingest path)
 */

import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { state } from '../../../state.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { clientLogger } from '../../../services/clientLogger.js';

export const MpiGalleryDropOverlay = ComponentFactory.create({
    name: 'MpiGalleryDropOverlay',
    css: ['js/components/Primitives/MpiGalleryDropOverlay/MpiGalleryDropOverlay.css'],

    template: () => `
        <div class="mpi-gallery-drop-overlay">
            <div class="mpi-gallery-drop-overlay__message">
                <span class="mpi-gallery-drop-overlay__icon">${renderIcon('media', 'lg')}</span>
                <span class="mpi-gallery-drop-overlay__text">Drop image or video to import</span>
            </div>
        </div>
    `,

    setup: (el, _props, _emit) => {
        const _unsubs = [];

        el.show = () => el.classList.add('mpi-gallery-drop-overlay--visible');
        el.hide = () => el.classList.remove('mpi-gallery-drop-overlay--visible');

        // Required so drop fires on the overlay
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.hide();

            const file = e.dataTransfer?.files?.[0];
            if (!file) return;

            const mediaType = file.type.startsWith('image/') ? 'image'
                            : file.type.startsWith('video/') ? 'video'
                            : null;
            if (!mediaType) return; // silent reject (e.g. .zip)

            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) {
                clientLogger.warn('MpiGalleryDropOverlay', 'No current project');
                return;
            }

            const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
            if (!uploaded) return;

            Events.emit('media:imported', {
                url: uploaded.filePath,
                filename: uploaded.filename,
                itemId: uploaded.itemId,
                mediaType,
            });
        });

        // Escape during drag — shell fires this global event
        _unsubs.push(Events.on('ui:close-all-popups', () => el.hide()));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
        };
    },
});
