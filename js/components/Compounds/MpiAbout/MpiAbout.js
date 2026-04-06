import { ComponentFactory } from '../../factory.js';
import { MpiProjectsPageOverlay } from '../../Primitives/MpiProjectsPageOverlay/MpiProjectsPageOverlay.js';

/**
 * MpiAbout — About overlay compound for the landing page.
 *
 * Wraps MpiProjectsPageOverlay and renders app info and version.
 * Callers only call show()/hide().
 *
 * Usage:
 *   const about = MpiAbout.mount(document.createElement('div'));
 *   about.el.show();
 *
 * Emits:
 *   'close' {} — overlay closed
 */
export const MpiAbout = ComponentFactory.create({
    name: 'MpiAbout',
    css: ['js/components/Compounds/MpiAbout/MpiAbout.css'],

    template: () => `<div class="mpi-about"></div>`,

    setup: (el, props, emit) => {
        const content = document.createElement('div');
        content.className = 'mpi-about__content';
        content.innerHTML = `
            <img src="favicon.png" alt="Cubric Studio" class="mpi-about__logo">
            <h2 class="mpi-about__name">Cubric Studio</h2>
            <p class="mpi-about__desc">
                A local AI workstation for image generation, prompt engineering,
                and creative workflows.
            </p>
            <span class="mpi-about__version">Alpha v0.0.1</span>`;

        const overlay = MpiProjectsPageOverlay.mount(el, { closable: true });
        overlay.el.appendToContainer(content);
        overlay.on('close', () => emit('close', {}));

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();
    }
});
