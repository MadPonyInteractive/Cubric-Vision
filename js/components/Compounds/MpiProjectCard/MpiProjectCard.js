import { ComponentFactory } from '../../factory.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * @typedef {Object} MpiProjectCardMedia
 * @property {'image'|'video'} type - Media type to render as background.
 * @property {string}          src  - URL or local path to the media file.
 */

/**
 * @typedef {Object} MpiProjectCardProps
 * @property {string}                [title='Untitled'] - Project name shown in the card footer.
 * @property {string}                [date='']          - Formatted date string shown below the title.
 * @property {MpiProjectCardMedia}   [media]            - Optional image or video background for the preview area.
 */

/**
 * MpiProjectCard (Compound)
 *
 * Renders a project folder card with an optional image or video background,
 * a glassmorphic folder icon, a hover-reveal delete button, and a footer
 * with project name and date.
 *
 * Composed from `MpiIcon` and `MpiButton` primitives using the `mount()` pattern.
 * CSS lives in `MpiProjectCard.css` (co-located, BEM-scoped).
 *
 * @example
 * // Basic card (no media)
 * const card = MpiProjectCard.mount(container, {
 *     title: 'My Project',
 *     date: '4 Apr 2026',
 * });
 * card.on('click',  () => openProject());
 * card.on('delete', () => confirmAndDelete());
 *
 * @example
 * // Card with image background
 * MpiProjectCard.mount(container, {
 *     title: 'Landscape Renders',
 *     date: '3 Apr 2026',
 *     media: { type: 'image', src: 'path/to/thumbnail.png' },
 * });
 *
 * @example
 * // Card with looping video background
 * MpiProjectCard.mount(container, {
 *     title: 'Motion Graphics',
 *     date: '2 Apr 2026',
 *     media: { type: 'video', src: 'path/to/preview.mp4' },
 * });
 *
 * Emits:
 * - `'click'`  {} — The card body was clicked (excluding the delete button).
 * - `'delete'` {} — The delete button was clicked.
 */
export const MpiProjectCard = ComponentFactory.create({
    name: 'MpiProjectCard',
    css: ['js/components/Compounds/MpiProjectCard/MpiProjectCard.css'],

    /**
     * Returns the HTML structure for the card.
     * Slots are populated by `setup` after mounting.
     * @returns {string} HTML string
     */
    template: () => `
        <div class="mpi-project-card" role="button">
            <div class="mpi-project-card__preview">
                <div class="mpi-project-card__media-slot"></div>
                <div class="mpi-project-card__icon-slot"></div>
                <div class="mpi-project-card__delete-slot"></div>
            </div>
            <div class="mpi-project-card__footer">
                <div class="mpi-project-card__title" id="pc-title"></div>
                <div class="mpi-project-card__date"  id="pc-date"></div>
            </div>
        </div>
    `,

    /**
     * Wires up media, icon, delete button, metadata, and click handling.
     *
     * @param {HTMLElement}          el    - The mounted root element (`.mpi-project-card`).
     * @param {MpiProjectCardProps}  props - Component props.
     * @param {function(string, *): void} emit - Factory emit function.
     */
    setup: (el, props, emit) => {
        const { title = 'Untitled', date = '', media } = props;

        // ── 1. Media background ──────────────────────────────────────────────
        const mediaSlot = qs('.mpi-project-card__media-slot', el);

        if (media?.type === 'video') {
            const video = document.createElement('video');
            video.src        = media.src;
            video.className  = 'mpi-project-card__media';
            video.autoplay   = true;
            video.muted      = true;
            video.loop       = true;
            video.playsInline = true;
            on(video, 'loadeddata', () => video.play().catch(() => {}));
            mediaSlot.appendChild(video);
        } else if (media?.type === 'image') {
            const img = document.createElement('img');
            img.src       = media.src;
            img.className = 'mpi-project-card__media';
            img.alt       = title;
            mediaSlot.appendChild(img);
        }

        // ── 2. Folder icon (MpiIcon Primitive) ───────────────────────────────
        const iconSlot = qs('.mpi-project-card__icon-slot', el);
        const icon = MpiIcon.mount(document.createElement('div'), {
            name: 'folder',
            size: 'lg',
        });
        iconSlot.appendChild(icon.el);
        // Rename slot to apply icon-wrap styles (glassmorphic circle)
        iconSlot.className = 'mpi-project-card__icon-wrap';

        // ── 3. Delete button (MpiButton Primitive) ───────────────────────────
        const deleteSlot = qs('.mpi-project-card__delete-slot', el);
        const deleteBtn = MpiButton.mount(document.createElement('div'), {
            icon:    'trash',
            variant: 'danger',
            size:    'sm',
            info:    'Delete Project',
        });
        deleteSlot.appendChild(deleteBtn.el);
        // Rename slot to apply absolute positioning + hover reveal styles
        deleteSlot.className = 'mpi-project-card__delete-mount';

        deleteBtn.on('click', () => emit('delete'));

        // ── 4. Footer metadata ───────────────────────────────────────────────
        const titleEl = qs('#pc-title', el);
        titleEl.textContent = title;
        titleEl.title       = title; // Tooltip for truncated names

        qs('#pc-date', el).textContent = date;

        // ── 5. Card click (excluding delete area) ────────────────────────────
        on(el, 'click', (e) => {
            if (deleteSlot.contains(e.target)) return;
            emit('click');
        });

        el.setAttribute('aria-label', `Open project ${title}`);
    },
});
