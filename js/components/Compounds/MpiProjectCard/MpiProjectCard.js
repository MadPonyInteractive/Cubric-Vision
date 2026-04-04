import { ComponentFactory } from '../../factory.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiProjectCard (Compound)
 * Renders a project folder card with optional media background.
 * Composes MpiIcon and MpiButton primitives using the mount() pattern.
 */
export const MpiProjectCard = ComponentFactory.create({
    name: 'MpiProjectCard',
    css: ['js/components/Compounds/MpiProjectCard/MpiProjectCard.css'],

    template: () => `
        <div class="mpi-project-card" role="button">
            <div class="mpi-project-card__preview">
                <div class="mpi-project-card__media-slot"></div>
                <div class="mpi-project-card__icon-slot"></div>
                <div class="mpi-project-card__delete-slot"></div>
            </div>
            <div class="mpi-project-card__footer">
                <div class="mpi-project-card__title" id="pc-title"></div>
                <div class="mpi-project-card__date" id="pc-date"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { title = 'Untitled', date = '', media } = props;

        // 1. Media handling
        const mediaSlot = qs('.mpi-project-card__media-slot', el);
        if (media) {
            if (media.type === 'video') {
                const video = document.createElement('video');
                video.src = media.src;
                video.className = 'mpi-project-card__media';
                video.autoplay = true;
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                on(video, 'loadeddata', () => video.play().catch(() => { }));
                mediaSlot.appendChild(video);
            } else if (media.type === 'image') {
                const img = document.createElement('img');
                img.src = media.src;
                img.className = 'mpi-project-card__media';
                img.alt = title;
                mediaSlot.appendChild(img);
            }
        }

        // 2. Folder Icon (Primitive)
        const iconSlot = qs('.mpi-project-card__icon-slot', el);
        const icon = MpiIcon.mount(document.createElement('div'), {
            name: 'folder',
            size: 'lg'
        });
        iconSlot.appendChild(icon.el);
        iconSlot.className = 'mpi-project-card__icon-wrap'; // Preserve existing style class

        // 3. Delete Button (Primitive)
        const deleteSlot = qs('.mpi-project-card__delete-slot', el);
        const deleteBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'trash',
            variant: 'danger',
            size: 'sm',
            info: 'Delete Project'
        });
        deleteSlot.appendChild(deleteBtn.el);
        deleteSlot.className = 'mpi-project-card__delete-mount'; // Preserve existing style class

        deleteBtn.on('click', (e) => {
            // Note: MpiButton internally manages click, we just listen to its event
            emit('delete');
        });

        // 4. Metadata
        qs('#pc-title', el).textContent = title;
        qs('#pc-title', el).title = title;
        qs('#pc-date', el).textContent = date;

        // 5. Card Click
        on(el, 'click', (e) => {
            // If the event target is inside the delete slot, the event is handled by deleteBtn
            if (deleteSlot.contains(e.target)) return;
            emit('click');
        });
        
        el.setAttribute('aria-label', `Open project ${title}`);
    }
});
