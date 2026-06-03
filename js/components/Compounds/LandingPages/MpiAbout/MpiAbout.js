import { ComponentFactory } from '../../../factory.js';
import { APP_VERSION } from '../../../../core/appVersion.js';
import { APP_STAGE_LABEL } from '../../../../core/appStage.js';

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
                    Create images and video through local inference, with projects, prompts, models,
                    and workflows kept on your machine. Cubric Vision is built for open-ended creation
                    with mostly uncensored models, and is the first part of a wider Cubric creative ecosystem.
                </p>
                <span class="mpi-about__version">${APP_STAGE_LABEL} v${APP_VERSION}</span>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        // Static content — no setup logic needed.
    },
});
