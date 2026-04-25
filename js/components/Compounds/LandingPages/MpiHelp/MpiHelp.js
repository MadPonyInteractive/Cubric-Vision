import { ComponentFactory } from '../../../factory.js';
import { MpiOverlay } from '../../../Primitives/MpiOverlay/MpiOverlay.js';
import { Hotkeys } from '../../../../managers/hotkeyManager.js';

/**
 * MpiHelp — Help overlay compound for the landing page.
 *
 * Wraps MpiOverlay (body-mount) and renders keyboard shortcuts and app guidance.
 * Callers only call show()/hide().
 *
 * Usage:
 *   const help = MpiHelp.mount(document.createElement('div'));
 *   help.el.show();
 *
 * Emits:
 *   'close' {} — overlay closed
 */
export const MpiHelp = ComponentFactory.create({
    name: 'MpiHelp',
    css: ['js/components/Compounds/LandingPages/MpiHelp/MpiHelp.css'],

    template: () => `<div class="mpi-help"></div>`,

    setup: (el, props, emit) => {
        const content = document.createElement('div');
        content.className = 'mpi-help__content';

        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'mpi-help__header';
        header.innerHTML = `
            <h2 class="mpi-help__title">Help</h2>
            <p class="mpi-help__desc">Support and accessibility guide.</p>`;
        content.appendChild(header);

        // ── Shortcuts — built from registry ──────────────────────────────────
        const shortcutsBlock = document.createElement('div');
        shortcutsBlock.className = 'mpi-help__shortcuts';

        const shortcutsTitle = document.createElement('h3');
        shortcutsTitle.className = 'mpi-help__shortcuts-title';
        shortcutsTitle.textContent = 'Keyboard Shortcuts';
        shortcutsBlock.appendChild(shortcutsTitle);

        const grid = document.createElement('div');
        grid.className = 'mpi-help__shortcuts-grid';

        // Group by category, then by scopeLabel within each category.
        // Skip entries without a description or with .up type (they're pairs — down entry covers display).
        const registry = Hotkeys.getRegistry();
        const byCategory = new Map();

        for (const entry of registry) {
            if (!entry.description) continue;
            // Skip keyup mirror entries — description already conveyed by the down entry
            if (entry.id.endsWith('.up')) continue;

            if (!byCategory.has(entry.category)) byCategory.set(entry.category, new Map());
            const byScope = byCategory.get(entry.category);
            if (!byScope.has(entry.scopeLabel)) byScope.set(entry.scopeLabel, []);
            byScope.get(entry.scopeLabel).push(entry);
        }

        for (const [, byScope] of byCategory) {
            const group = document.createElement('div');
            group.className = 'mpi-help__shortcut-group';

            // Single <ul> per group; scopeLabel changes rendered as subheading <li>
            let firstScope = true;
            const ul = document.createElement('ul');

            for (const [scopeLabel, entries] of byScope) {
                if (firstScope) {
                    const h4 = document.createElement('h4');
                    h4.textContent = scopeLabel;
                    group.appendChild(h4);
                    firstScope = false;
                } else {
                    const subheading = document.createElement('li');
                    subheading.className = 'mpi-help__subheading';
                    subheading.innerHTML = `<strong>${scopeLabel}</strong>`;
                    ul.appendChild(subheading);
                }

                for (const entry of entries) {
                    const li = document.createElement('li');
                    const keySpan = document.createElement('span');
                    keySpan.textContent = entry.key.toUpperCase();
                    const descSpan = document.createElement('span');
                    descSpan.textContent = entry.description;
                    li.appendChild(keySpan);
                    li.appendChild(descSpan);
                    ul.appendChild(li);
                }
            }

            group.appendChild(ul);
            grid.appendChild(group);
        }

        shortcutsBlock.appendChild(grid);
        content.appendChild(shortcutsBlock);

        const overlay = MpiOverlay.mount(el, { closable: true, mountTarget: 'body' });
        overlay.el.appendToContainer(content);
        overlay.on('close', () => emit('close', {}));

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();
    }
});
