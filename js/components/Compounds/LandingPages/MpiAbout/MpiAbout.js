import { ComponentFactory } from '../../../factory.js';

/**
 * MpiAbout — About content for the MpiSlideOver panel.
 *
 * No longer owns overlay chrome. Renders body content only.
 *
 * Usage (via slide-over event):
 *   Events.emit('slide-over:open', { title: 'About', component: MpiAbout });
 */
export const MpiAbout = ComponentFactory.create({
    name: 'MpiAbout',
    css: ['js/components/Compounds/LandingPages/MpiAbout/MpiAbout.css'],

    template: () => `
        <div class="mpi-about">
            <div class="mpi-about__content">
                <img src="assets/mascot/logo.png" alt="Cubric Vision" class="mpi-about__logo">
                <span class="mpi-wordmark mpi-about__name" aria-label="Cubric Vision">Cubric<span class="mpi-wordmark__suffix">Vision</span></span>
                <p class="mpi-about__desc">
                    A local AI workstation for image, video and audio generation, prompt engineering,
                    and creative workflows.
                </p>
                <span class="mpi-about__version">Alpha v0.0.1</span>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        // Static content — no setup logic needed.
    },
});
