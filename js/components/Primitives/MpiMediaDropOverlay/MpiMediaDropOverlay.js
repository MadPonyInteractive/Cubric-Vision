/**
 * MpiMediaDropOverlay — Primitive: full-area OS-file drop target.
 *
 * Dumb primitive. Handles show/hide, dragover preventDefault, and calls
 * props.onDrop({ files }) once per drop event with all valid image/video/audio
 * files. No upload, no Events.emit — all side effects live in the caller.
 *
 * Props:
 *   onDrop({ files: Array<{ file: File, mediaType: 'image'|'video'|'audio' }> })
 *     — called on valid drop (callback receives all files in one call)
 *
 * Instance methods (on instance.el):
 *   show() — make overlay visible (adds visible modifier)
 *   hide() — hide overlay
 */

import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';

export const MpiMediaDropOverlay = ComponentFactory.create({
    name: 'MpiMediaDropOverlay',
    css: ['js/components/Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.css'],

    template: () => `
        <div class="mpi-media-drop-overlay">
            <div class="mpi-media-drop-overlay__message">
                <span class="mpi-media-drop-overlay__icon">${renderIcon('media', 'lg')}</span>
                <span class="mpi-media-drop-overlay__text">Drop image, video, or audio to import</span>
            </div>
        </div>
    `,

    setup: (el, props, _emit) => {
        const _unsubs = [];

        el.show = () => el.classList.add('mpi-media-drop-overlay--visible');
        el.hide = () => el.classList.remove('mpi-media-drop-overlay--visible');

        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.hide();

            const fileList = e.dataTransfer?.files;
            if (!fileList || !fileList.length) return;

            const files = [];
            for (const file of fileList) {
                const mediaType = file.type.startsWith('image/') ? 'image'
                                : file.type.startsWith('video/') ? 'video'
                                : file.type.startsWith('audio/') ? 'audio'
                                : null;
                if (!mediaType) continue;
                files.push({ file, mediaType });
            }
            if (!files.length) return;

            props.onDrop?.({ files });
        });

        _unsubs.push(Events.on('ui:close-all-popups', () => el.hide()));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
        };
    },
});
