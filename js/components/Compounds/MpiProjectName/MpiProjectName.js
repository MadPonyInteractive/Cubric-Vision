import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { ce } from '/js/utils/dom.js';

/**
 * MpiProjectName — Project title bar with 2-level breadcrumb.
 *
 * Layout:  ↑  |  PROJECT NAME  ›  GROUP NAME
 *
 * The up-arrow is always an up-link (not a history back):
 *   - In group history  → emits 'up' (navigation goes to gallery)
 *   - In gallery        → emits 'up' (navigation goes to project picker / landing)
 *
 * The "Gallery" segment is a clickable link shown only when inside a group.
 * The group name segment is plain text — the current location.
 *
 * Props:
 * @param {string} [projectName='']  - Active project name shown above breadcrumb
 * @param {string} [galleryLabel=''] - e.g. 'Gallery' — shown as clickable link; empty = hidden
 * @param {string} [groupLabel='']   - e.g. 'My Group' — shown as current location; empty = hidden
 *
 * Instance methods (on instance.el):
 *   setProjectName(name)    — update project name
 *   setGalleryLabel(label)  — pass '' to hide (we are at gallery root)
 *   setGroupLabel(label)    — pass '' to hide (we are not inside a group)
 *
 * Emits:
 *   'up'      {} — up-arrow clicked (navigate up one level)
 *   'gallery' {} — gallery breadcrumb segment clicked
 */
export const MpiProjectName = ComponentFactory.create({
    name: 'MpiProjectName',
    css: ['js/components/Compounds/MpiProjectName/MpiProjectName.css'],

    template: () => `<div class="mpi-project-name"></div>`,

    setup: (el, props, emit) => {

        // ── Up button ───────────────────────────────────────────────────────────

        const upWrap = ce('div', { className: 'mpi-project-name__back' });
        const upBtn = MpiButton.mount(upWrap, {
            icon: 'back',
            size: 'sm',
            variant: 'ghost',
            info: 'Go up',
        });
        upBtn.on('click', () => emit('up', {}));

        // ── Text block ──────────────────────────────────────────────────────────

        const textBlock = ce('div', { className: 'mpi-project-name__text' });

        const projectNameEl = ce('span', {
            className: 'mpi-project-name__project',
            textContent: props.projectName || '',
        });

        // ── Breadcrumb ──────────────────────────────────────────────────────────

        const breadcrumb = ce('div', { className: 'mpi-project-name__breadcrumb' });

        // Gallery segment — clickable link, hidden when at gallery root
        const galleryEl = ce('button', {
            className: 'mpi-project-name__segment mpi-project-name__segment--link',
            type: 'button',
            textContent: (props.galleryLabel || '').toUpperCase(),
        });
        galleryEl.addEventListener('click', () => emit('gallery', {}));

        const sepEl = ce('span', {
            className: 'mpi-project-name__separator',
            textContent: '›',
            'aria-hidden': 'true',
        });

        // Group segment — plain text (current location), hidden when at gallery root
        const groupEl = ce('span', {
            className: 'mpi-project-name__segment mpi-project-name__segment--current',
            textContent: (props.groupLabel || '').toUpperCase(),
        });

        breadcrumb.append(galleryEl, sepEl, groupEl);
        textBlock.append(projectNameEl, breadcrumb);
        el.append(upWrap, textBlock);

        // ── Visibility ──────────────────────────────────────────────────────────

        function _update() {
            const hasGallery = galleryEl.textContent.trim().length > 0;
            const hasGroup   = groupEl.textContent.trim().length > 0;

            _toggle(galleryEl, !hasGallery);
            _toggle(sepEl,     !(hasGallery && hasGroup));
            _toggle(groupEl,   !hasGroup);
        }

        function _toggle(node, hidden) {
            node.classList.toggle('mpi-project-name--hidden', hidden);
        }

        _update();

        // ── Public API ──────────────────────────────────────────────────────────

        /** @param {string} name */
        el.setProjectName = (name) => {
            projectNameEl.textContent = name;
        };

        /** @param {string} label — pass '' to hide (we are at gallery root) */
        el.setGalleryLabel = (label) => {
            galleryEl.textContent = label.toUpperCase();
            _update();
        };

        /** @param {string} label — pass '' to hide (not inside a group) */
        el.setGroupLabel = (label) => {
            groupEl.textContent = label.toUpperCase();
            _update();
        };

        // ── Cleanup ─────────────────────────────────────────────────────────────

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
