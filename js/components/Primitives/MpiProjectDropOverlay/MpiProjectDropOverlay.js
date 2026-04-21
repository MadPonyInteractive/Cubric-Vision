/**
 * MpiProjectDropOverlay — Primitive: full-area OS drop target for project folders / project.json.
 *
 * Dumb primitive. Handles show/hide, dragover preventDefault, and calls
 * props.onDrop({ folderPath, source }) after resolving the drop to an
 * absolute folder path. Validation of the folder's contents is the caller's
 * responsibility (via /validate-project). No Events.emit, no network calls.
 *
 * Props:
 *   onDrop({ folderPath: string, source: 'folder'|'json' }) — called after a
 *   drop is resolved. Not called for unsupported drops (e.g. image files).
 *
 * Instance methods (on instance.el):
 *   show() — make overlay visible
 *   hide() — hide overlay
 */

import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';

function _getWebUtils() {
    try {
        if (typeof window.require === 'function') {
            return window.require('electron').webUtils || null;
        }
    } catch (_) { /* swallow */ }
    return null;
}

export const MpiProjectDropOverlay = ComponentFactory.create({
    name: 'MpiProjectDropOverlay',
    css: ['js/components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.css'],

    template: () => `
        <div class="mpi-project-drop-overlay">
            <div class="mpi-project-drop-overlay__message">
                <span class="mpi-project-drop-overlay__icon">${renderIcon('folder', 'lg')}</span>
                <span class="mpi-project-drop-overlay__text">Drop a project folder or project.json to add</span>
            </div>
        </div>
    `,

    setup: (el, props, _emit) => {
        const _unsubs = [];

        el.show = () => el.classList.add('mpi-project-drop-overlay--visible');
        el.hide = () => el.classList.remove('mpi-project-drop-overlay--visible');

        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.hide();

            const webUtils = _getWebUtils();
            if (!webUtils) return;

            const file = e.dataTransfer?.files?.[0];
            if (!file) return;

            const absPath = webUtils.getPathForFile(file);
            if (!absPath) return;

            const normalized = absPath.replace(/\\/g, '/');

            // Project folder dropped: File has no type but FileSystemEntry reports directory.
            const entry = e.dataTransfer.items?.[0]?.webkitGetAsEntry?.();
            if (entry?.isDirectory) {
                props.onDrop?.({ folderPath: normalized, source: 'folder' });
                return;
            }

            // project.json dropped: strip trailing filename → parent folder path.
            if (/\/project\.json$/i.test(normalized)) {
                const folderPath = normalized.replace(/\/project\.json$/i, '');
                props.onDrop?.({ folderPath, source: 'json' });
                return;
            }

            // Anything else: silently ignore.
        });

        _unsubs.push(Events.on('ui:close-all-popups', () => el.hide()));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
        };
    },
});
