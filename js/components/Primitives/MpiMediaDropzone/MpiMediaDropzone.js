import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiMediaDropzone — Drag-and-Drop Media Upload Zone
 * 
 * Props:
 * @param {string}   [icon='media'] - Icon name from MpiIcon registry
 * @param {string}   title           - Header title (uppercase by CSS)
 * @param {string}   text            - Description below the icon
 * @param {string}   [footer]        - Optional footer text (e.g., dimensions)
 * @param {string[]} [mediaType]     - Array of strings: 'image', 'video', 'audio'.
 *                                     Used for filtering dropped files.
 * @param {string}   [width]         - Fixed width for the dropzone (defaults to 250px)
 */
export const MpiMediaDropzone = ComponentFactory.create({
    name: 'MpiMediaDropzone',
    css: ['js/components/Primitives/MpiMediaDropzone/MpiMediaDropzone.css'],

    template: (props) => {
        const iconName = props.icon || 'media';
        const widthStyle = props.width ? ` style="--mz-width: ${props.width}"` : '';
        const value = props.value || null;
        const type = props.type || 'image';
        
        let mediaPreview = '';
        if (value) {
            if (type === 'video') {
                mediaPreview = `<video src="${value}" class="mpi-media-dropzone__preview" playsinline muted loop autoplay></video>`;
            } else if (type === 'audio') {
                mediaPreview = `
                    <div class="mpi-media-dropzone__preview mpi-media-dropzone__preview--audio">
                        ${renderIcon('audio', 'lg')}
                        <audio src="${value}" controls></audio>
                    </div>`;
            } else {
                mediaPreview = `<img src="${value}" class="mpi-media-dropzone__preview" alt="Preview">`;
            }
        }

        const modifier = value ? ' mpi-media-dropzone--has-value' : '';
        
        // Hide UI elements when media is present
        const titleHtml = value ? '' : `<div class="mpi-media-dropzone__title">${props.title || 'Source'}</div>`;
        const footerHtml = (value || !props.footer) ? '' : `<div class="mpi-media-dropzone__footer">${props.footer}</div>`;

        const dropContent = value ? `
            <div class="mpi-media-dropzone__content mpi-media-dropzone__content--has-value">
                ${mediaPreview}
                <button class="mpi-media-dropzone__remove" title="Remove Media">
                    ${renderIcon('close', 'xs')}
                </button>
            </div>
        ` : `
            <div class="mpi-media-dropzone__content mpi-media-dropzone__content--empty">
                <div class="mpi-media-dropzone__icon">
                    ${renderIcon(iconName, 'xl')}
                </div>
                <div class="mpi-media-dropzone__text">${props.text || 'Drop here'}</div>
            </div>
        `;

        return `
            <div class="mpi-media-dropzone${modifier}"${widthStyle}>
                ${titleHtml}
                ${dropContent}
                ${footerHtml}
            </div>`;
    },

    setup: (el, props, emit) => {
        const allowedTypes = props.mediaType || ['image', 'video', 'audio'];

        // ── Remove Button Logic ──────────────────────────────────────
        const removeBtn = el.querySelector('.mpi-media-dropzone__remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                emit('remove', { title: props.title });
            });
        }

        // ── Click Behaviour ───────────────────────────────────────────
        el.addEventListener('click', () => {
            // Only trigger click if no media or if specifically clicking the background
            emit('click', { title: props.title });
        });

        // ── Drag & Drop Logic ────────────────────────────────────────
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            el.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        el.addEventListener('dragenter', () => el.classList.add('mpi-media-dropzone--drag-over'));
        el.addEventListener('dragover',  () => el.classList.add('mpi-media-dropzone--drag-over'));
        el.addEventListener('dragleave', () => el.classList.remove('mpi-media-dropzone--drag-over'));
        
        el.addEventListener('drop', (e) => {
            el.classList.remove('mpi-media-dropzone--drag-over');
            
            const file = e.dataTransfer.files[0];
            if (!file) return;

            // Filter by media type if provided 
            const isAllowed = allowedTypes.some(type => file.type.startsWith(type));

            if (!isAllowed) {
                console.warn(`[MpiMediaDropzone] Refused ${file.type}. Allowed: ${allowedTypes.join(', ')}`);
                return;
            }

            const url = URL.createObjectURL(file);
            const mediaType = file.type.split('/')[0]; // 'image', 'video', etc.
            
            emit('drop', {
                url: url,
                file: file,
                title: props.title,
                mediaType: mediaType
            });
        });
    }
});
