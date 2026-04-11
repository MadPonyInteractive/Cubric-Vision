import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiInstalledDisplay } from '../../Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { renderIcon } from '../../../utils/icons.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import { MODELS } from '../../../data/modelRegistry.js';
import { reSyncInstalledModels } from '../../../data/modelRegistry.js';
import { qs, qsa, ce, on } from '../../../utils/dom.js';

/**
 * MpiModelsModal — Block: Zero-Installed State Overlay
 *
 * Self-contained overlay that displays all uninstalled models as
 * MpiInstalledDisplay cards with Install buttons. Refreshes in place.
 * Owns all model-list logic internally — no external appendToContainer.
 *
 * Props:
 * @param {string}   [icon='download']             - MpiIcon registry key
 * @param {string}   [title='Install Models']       - Modal title
 * @param {string}   [text]                         - Descriptive text below title
 * @param {string}   [footer]                       - Footer text
 * @param {boolean}  [closable=true]                - Show X close button
 *
 * Emits:
 * 'close' {} — X button clicked (overlay hide fires this)
 */
export const MpiModelsModal = ComponentFactory.create({
    name: 'MpiModelsModal',
    css: ['js/components/Blocks/MpiModelsModal/MpiModelsModal.css'],

    template: (props) => {
        const icon     = props.icon     || 'download';
        const iconSize = props.iconSize || 'xl';
        const title    = props.title    || 'Install Models';
        const text     = props.text     || '';
        const footer   = props.footer  || '';

        const titleHtml   = title   ? `<h2 class="mpi-models-modal__title">${title}</h2>`   : '';
        const textHtml    = text    ? `<p class="mpi-models-modal__text">${text}</p>`        : '';
        const footerHtml = footer  ? `<p class="mpi-models-modal__footer">${footer}</p>`    : '';

        return `
            <div class="mpi-models-modal">
                <div class="mpi-models-modal__header">
                    <div class="mpi-models-modal__icon">${renderIcon(icon, iconSize)}</div>
                    ${titleHtml}
                    ${textHtml}
                </div>
                <div class="mpi-models-modal__refresh-btn" id="refresh-btn-slot"></div>
                <div class="mpi-models-modal__separator"></div>
                <div class="mpi-models-modal__slot" id="body-slot"></div>
                ${footerHtml}
            </div>`;
    },

    setup: (el, props, emit) => {
        // ── Base overlay ─────────────────────────────────────────────────────
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: props.closable !== false,
        });
        overlay.on('close', () => emit('close', {}));

        // Mount el (the template root) INTO the overlay
        overlay.el.appendToContainer(el);

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();

        // ── DOM refs ──────────────────────────────────────────────────────────
        const bodySlot    = qs('#body-slot', el);
        const refreshSlot = qs('.mpi-models-modal__refresh-btn', el);

        const _unsubs = [];

        // ── Refresh button ───────────────────────────────────────────────────
        const refreshBtn = MpiButton.mount(refreshSlot, {
            icon: 'refresh',
            variant: 'ghost',
            size: 'md',
            info: 'Refresh model state from disk',
        });

        _unsubs.push(on(refreshBtn.el, 'click', () => {
            awaitReSync();
        }));

        // ── Install a model ──────────────────────────────────────────────────
        async function _installModel(model) {
            try {
                const res = await fetch('/comfy/model/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ modelId: model.id }),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'Download failed' }));
                    Events.emit('ui:error', {
                        title: 'Download failed',
                        message: `Could not download model "${model.name}". ${err.error || 'Check your connection and try again.'}`,
                    });
                    return;
                }

                await reSyncInstalledModels();
                renderList();

                const hasRealModel = state.s_installedModelIds.some(id => !id.startsWith('universal:'));
                if (hasRealModel) {
                    Events.emit('models:all-installed');
                }
            } catch (err) {
                Events.emit('ui:error', {
                    title: 'Download failed',
                    message: `Could not download model "${model.name}". Check your connection and try again.`,
                });
            }
        }

        // ── Re-sync wrapper ────────────────────────────────────────────────
        async function awaitReSync() {
            refreshBtn.el.setAttribute('loading', 'true');
            await reSyncInstalledModels();
            renderList();
            refreshBtn.el.removeAttribute('loading');
        }

        // ── Render card list ───────────────────────────────────────────────
        function renderList() {
            qsa('.mpi-models-modal__card', bodySlot).forEach(c => c.remove());

            const uninstalled = MODELS.filter(m => m.installed !== true);

            if (uninstalled.length === 0) {
                const emptyEl = ce('div', { className: 'mpi-models-modal__empty' }, [
                    ce('span', { textContent: 'No models available to install' }),
                ]);
                bodySlot.appendChild(emptyEl);
                return;
            }

            uninstalled.forEach(model => {
                const cardWrap = ce('div', { className: 'mpi-models-modal__card' });
                bodySlot.appendChild(cardWrap);

                const card = MpiInstalledDisplay.mount(cardWrap, {
                    title: model.name,
                    meta: model.gen_speed || '',
                    text: model.description || '',
                    image: model.image || '',
                    icon: 'warning',
                    iconText: _vramText(model),
                    deleteLabel: 'Install',
                });

                card.on('delete', async () => {
                    await _installModel(model);
                });
            });
        }

        // ── Subscribe to state changes ───────────────────────────────────
        _unsubs.push(Events.on('state:changed', ({ key, value }) => {
            if (key === 's_installedModelIds') renderList();
        }));

        // ── Initial render ─────────────────────────────────────────────────
        renderList();

        // ── Cleanup ────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
        };
    },
});

// ── Helper ─────────────────────────────────────────────────────────────────

function _vramText(model) {
    // TODO: compute VRAM text from model dependencies
    return '';
}
