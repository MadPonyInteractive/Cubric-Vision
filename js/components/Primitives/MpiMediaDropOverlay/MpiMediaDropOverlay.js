/**
 * MpiMediaDropOverlay — Primitive: full-area OS-file drop target.
 *
 * Dumb primitive. Handles show/hide, dragover preventDefault, and calls
 * props.onDrop({ file, mediaType }) when a valid OS file is dropped.
 * No upload, no Events.emit — all side effects live in the caller.
 *
 * Props:
 *   onDrop({ file: File, mediaType: 'image'|'video' }) — called on valid drop
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
                <span class="mpi-media-drop-overlay__text">Drop image or video to import</span>
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

            const file = e.dataTransfer?.files?.[0];
            if (!file) return;

            const mediaType = file.type.startsWith('image/') ? 'image'
                            : file.type.startsWith('video/') ? 'video'
                            : null;
            if (!mediaType) return;

            props.onDrop?.({ file, mediaType });
        });

        _unsubs.push(Events.on('ui:close-all-popups', () => el.hide()));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
        };
    },
});
