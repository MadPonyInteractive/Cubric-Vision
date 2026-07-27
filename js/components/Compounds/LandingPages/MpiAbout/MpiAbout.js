import { ComponentFactory } from '../../../factory.js';
import { APP_VERSION } from '../../../../core/appVersion.js';
import { APP_STAGE_LABEL } from '../../../../core/appStage.js';
import { DEPS } from '../../../../data/modelConstants/dependencies.js';

/**
 * MpiAbout — About content for the MpiSlideOver panel.
 *
 * No longer owns overlay chrome. Renders body content only.
 *
 * Usage (via slide-over event):
 *   Events.emit('slide-over:open', { title: 'About', component: MpiAbout });
 */

/**
 * Attribution for shipped community weights whose creator requires credit.
 *
 * DERIVED from the dependency registry, never hand-listed: a dep carries a `credit`
 * block ({ author, work, url }) when its licence sets CivitAI `allowNoCredit: false`
 * (or an equivalent term), and this list is whatever those deps say. Hand-maintaining
 * the names here would rot the moment a weight is added or dropped — and a missed
 * credit is a licence breach, not a cosmetic bug.
 *
 * Authors are deduped: one creator may supply several weights.
 */
const _credits = () => {
    const byAuthor = new Map();
    for (const dep of Object.values(DEPS)) {
        if (!dep.credit?.author) continue;
        const entry = byAuthor.get(dep.credit.author)
            || { author: dep.credit.author, url: dep.credit.url, works: [] };
        if (dep.credit.work && !entry.works.includes(dep.credit.work)) entry.works.push(dep.credit.work);
        byAuthor.set(dep.credit.author, entry);
    }
    return [...byAuthor.values()].sort((a, b) => a.author.localeCompare(b.author));
};
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
                ${_credits().length ? `
                <div class="mpi-about__credits">
                    <h3 class="mpi-about__credits-title">Credits</h3>
                    <p class="mpi-about__credits-intro">Style and control models by the community:</p>
                    <ul class="mpi-about__credits-list">
                        ${_credits().map(c => `
                        <li class="mpi-about__credits-item">
                            <a class="mpi-about__credits-link" href="${c.url}" target="_blank" rel="noopener noreferrer">${c.author}</a>
                            ${c.works.length ? `<span class="mpi-about__credits-work">${c.works.join(', ')}</span>` : ''}
                        </li>`).join('')}
                    </ul>
                </div>` : ''}
            </div>
        </div>`,

    setup: (el, props, emit) => {
        // Static content — no setup logic needed.
    },
});
