/**
 * MpiFolderDrop — Primitive: a labeled folder path that is also an OS drop target
 * for LoRA / upscale model files. Dropping a model file copies it into THIS
 * folder via POST /comfy/import-model, then calls props.onImport(filename).
 *
 * Electron-only: resolves the dropped file's absolute disk path via
 * `webUtils.getPathForFile` (same pattern as MpiProjectDropOverlay). In browser
 * dev mode (no webUtils) drops are silently ignored.
 *
 * On a same-name collision the import route answers 409; this prompts the user
 * to confirm replacement, then retries with overwrite.
 *
 * Props:
 *   folderPath: string  — absolute target folder (must be a configured folder)
 *   bucket: 'loras' | 'upscale_models'
 *   label?: string      — display label (defaults to folderPath)
 *   primary?: boolean   — mark the primary managed folder
 *   onImport?(filename: string) — called after a successful copy
 *
 * Instance methods (on instance.el): none.
 */

import { ComponentFactory } from '../../factory.js';
import { on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';
import { Events } from '../../../events.js';
import { clientLogger } from '../../../services/clientLogger.js';

function _getWebUtils() {
    try {
        if (typeof window.require === 'function') {
            return window.require('electron').webUtils || null;
        }
    } catch (_) { /* swallow */ }
    return null;
}

const _MODEL_EXTS = ['.safetensors', '.ckpt', '.pt', '.bin', '.pth'];

export const MpiFolderDrop = ComponentFactory.create({
    name: 'MpiFolderDrop',
    css: ['js/components/Primitives/MpiFolderDrop/MpiFolderDrop.css'],

    template: (props) => {
        const label = props.label || props.folderPath || '';
        const primary = props.primary ? ' mpi-folder-drop--primary' : '';
        return `
            <div class="mpi-folder-drop${primary}" title="${label}">
                <span class="mpi-folder-drop__icon">${renderIcon('folder', 'sm')}</span>
                <span class="mpi-folder-drop__label">${label}</span>
                <span class="mpi-folder-drop__hint">
                    <span class="mpi-folder-drop__hint-icon">${renderIcon('upload', 'sm')}</span>
                    Drop model here
                </span>
            </div>
        `;
    },

    setup: (el, props, _emit) => {
        const _unsubs = [];

        const setDragging = (isOn) => el.classList.toggle('mpi-folder-drop--drag-over', isOn);

        async function _import(sourcePath, overwrite) {
            const res = await fetch('/comfy/import-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourcePath,
                    targetFolder: props.folderPath,
                    bucket: props.bucket,
                    overwrite: Boolean(overwrite),
                }),
            });
            const data = await res.json().catch(() => null);

            if (res.status === 409) {
                // Same-name file exists — confirm before replacing.
                if (window.confirm(`"${data?.filename}" already exists in this folder. Replace it?`)) {
                    return _import(sourcePath, true);
                }
                return;
            }
            if (!res.ok || !data?.success) {
                Events.emit('ui:warning', { message: `Import failed: ${data?.error || res.status}` });
                return;
            }
            props.onImport?.(data.filename);
        }

        _unsubs.push(on(el, 'dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            setDragging(true);
        }));
        _unsubs.push(on(el, 'dragleave', () => setDragging(false)));

        _unsubs.push(on(el, 'drop', async (e) => {
            // preventDefault stops the OS opening the file; do NOT stopPropagation —
            // the gallery binds drop on `window` only to HIDE its media-drop overlay
            // and reset its drag counter (it imports via its own overlay element, not
            // this zone). Swallowing the bubble here leaves that overlay stuck open
            // after a model drop on the settings modal.
            e.preventDefault();
            setDragging(false);

            const webUtils = _getWebUtils();
            if (!webUtils) return; // browser dev mode — no disk path

            const files = Array.from(e.dataTransfer?.files || []);
            if (!files.length) return;

            for (const file of files) {
                const absPath = webUtils.getPathForFile(file);
                if (!absPath) continue;
                const lower = absPath.toLowerCase();
                if (!_MODEL_EXTS.some(ext => lower.endsWith(ext))) {
                    Events.emit('ui:warning', { message: `"${file.name}" is not a model file (.safetensors/.ckpt/.pt/.bin/.pth).` });
                    continue;
                }
                try {
                    await _import(absPath, false);
                } catch (err) {
                    clientLogger.error('folder-drop', 'import failed', err);
                    Events.emit('ui:warning', { message: `Import failed: ${err.message}` });
                }
            }
        }));

        el.destroy = () => { _unsubs.forEach(fn => fn?.()); };
    },
});
