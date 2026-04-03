import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { ce } from '/js/utils/dom.js';

/**
 * MpiProjectName — Compound: back-arrow (MpiButton) + project title + current page label.
 *
 * Sits top-left in the workspace HUD. No background — floats over the canvas.
 * Clicking the back arrow emits 'back' so the shell can navigate to the landing page.
 *
 * Props:
 * @param {string} [projectName='']  - Active project name
 * @param {string} [pageName='']     - Current page / context label (e.g. 'Main Menu', 'Image')
 *
 * Instance methods (on instance.el):
 *   setProjectName(name)  — update project name text
 *   setPageName(name)     — update page/context label text
 *
 * Emits:
 *   'back' {} — back-arrow clicked; shell handles the navigation
 */
export const MpiProjectName = ComponentFactory.create({
    name: 'MpiProjectName',
    css: ['js/components/Compounds/MpiProjectName/MpiProjectName.css'],

    template: () => `<div class="mpi-project-name"></div>`,

    setup: (el, props, emit) => {

        // ── Back button (MpiButton primitive, icon mode) ────────────────────────

        const backWrap = ce('div', { className: 'mpi-project-name__back' });
        const backBtn = MpiButton.mount(backWrap, {
            icon: 'back',
            size: 'sm',
            variant: 'ghost',
            info: 'Back to projects',
        });
        backBtn.on('click', () => emit('back', {}));

        // ── Text block ──────────────────────────────────────────────────────────

        const textWrap = ce('div', { className: 'mpi-project-name__text' });

        const titleEl = ce('span', {
            className: 'mpi-project-name__title',
            textContent: props.projectName || ''
        });

        const pageEl = ce('span', {
            className: 'mpi-project-name__page',
            textContent: props.pageName || ''
        });

        textWrap.append(titleEl, pageEl);
        el.append(backWrap, textWrap);

        // ── Public API ──────────────────────────────────────────────────────────

        /** @param {string} name */
        el.setProjectName = (name) => { titleEl.textContent = name; };

        /** @param {string} name */
        el.setPageName = (name) => { pageEl.textContent = name; };

        // ── Cleanup ─────────────────────────────────────────────────────────────

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
