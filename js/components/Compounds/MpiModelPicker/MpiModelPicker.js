import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiTileSheet } from '../../Primitives/MpiTileSheet/MpiTileSheet.js';
import { ce, qs, on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiModelPicker — the model overlay (MPI-356).
 *
 * Deliberately renders the SAME tile as the Model Library (MpiTileSheet): a
 * different card per surface is exactly the inconsistency this card removes.
 * Only three things differ — the list is whatever the caller passes (installed,
 * already filtered by workspace), a click SELECTS and closes instead of opening
 * a detail drawer, and the tile's state row carries a LoRA & Upscale button.
 *
 * Owns no model logic. The Block that opens it passes its own list and applies
 * the choice, exactly as it does for the op strip's `workspace:set-operation` —
 * one validated owner per workspace, no second source of truth.
 *
 * Usage:
 *   const picker = MpiModelPicker.mount(document.createElement('div'));
 *   picker.el.open({ models: installedAllModels, modelId: activeModelId });
 *   picker.on('select',   ({ model }) => applyModel(model));   // already closed
 *   picker.on('settings', ({ model }) => _settingsOverlay.el.open({ modelId: model.id }));
 *
 * Instance methods (on instance.el):
 *   open({ models, modelId })  — render + show
 *   close()                    — hide
 *
 * Emits:
 *   'select'   { model } — tile clicked (overlay closes itself first)
 *   'settings' { model } — LoRA & Upscale clicked; the opener owns MpiModelSettings
 *                          (a Compound may not import a Compound)
 */
export const MpiModelPicker = ComponentFactory.create({
    name: 'MpiModelPicker',
    css: ['js/components/Compounds/MpiModelPicker/MpiModelPicker.css'],

    template: () => `
        <div class="mpi-model-picker">
            <div class="mpi-model-picker__head">
                <h1 class="mpi-model-picker__title">Model</h1>
                <p class="mpi-model-picker__sub" id="picker-sub"></p>
            </div>
            <div class="mpi-model-picker__body" id="picker-body"></div>
        </div>`,

    setup: (el, props, emit) => {
        const TIER_WORD = { low: 'Low', balanced: 'Balanced', high: 'High' };
        const bodySlot = qs('#picker-body', el);
        const subEl    = qs('#picker-sub', el);

        const _unsubs = [];
        let _sheets = [];
        let _models = [];

        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'body',
        });
        overlay.el.appendToContainer(el);

        function _tileItem(model, activeId) {
            const tier = model.sizeTier || 'balanced';
            return {
                id: model.id,
                name: model.name,
                media: model.mediaType === 'video' ? 'video' : 'image',
                preview: model.mediaType === 'video' ? model.video : model.image,
                meta: `${model.dropdownMeta || ''}${model.dropdownMeta ? ' · ' : ''}${TIER_WORD[tier] || tier}`,
                showMediaBadge: true,
                featured: !!model.featured,
                selected: model.id === activeId,
                // A <button> may not nest inside the tile <button>, so this is a
                // span; the capture-phase handler below stops it from reaching the
                // tile's own click (which would select the model and close).
                state: model.showSettings === false ? '' :
                    `<span class="mpi-model-picker__lora" role="button">${renderIcon('settings', 'sm')}LoRA &amp; Upscale</span>`,
                source: model,
            };
        }

        function _mediaBlock(list, media, activeId) {
            const items = list.filter(m => m.mediaType === media);
            if (!items.length) return;

            const head = ce('div', {
                className: `mpi-model-picker__media-head${media === 'video' ? ' mpi-model-picker__media-head--video' : ''}`,
            });
            head.innerHTML = `${renderIcon(media, 'sm')}<span>${media === 'video' ? 'Video' : 'Image'}</span><span class="mpi-model-picker__media-head-n">${items.length}</span>`;
            bodySlot.appendChild(head);

            const sheet = MpiTileSheet.mount(ce('div'), { items: items.map(m => _tileItem(m, activeId)) });
            sheet.on('select', ({ item }) => {
                overlay.el.hide();
                emit('select', { model: item.source });
            });
            // Capture phase: the tile's own click listener sits on the inner tile
            // element, so a bubbling handler here would fire AFTER it and the
            // overlay would already be closing on the wrong intent.
            _unsubs.push(on(sheet.el, 'click', (e) => {
                const btn = e.target.closest?.('.mpi-model-picker__lora');
                if (!btn) return;
                e.stopPropagation();
                e.preventDefault();
                const tile = btn.closest('.mpi-tile');
                const item = items.find(m => sheet.el.getTile(m.id) === tile);
                if (item) emit('settings', { model: item });
            }, true));

            _sheets.push(sheet);
            bodySlot.appendChild(sheet.el);
        }

        function _render(activeId) {
            _sheets.forEach(s => s.el.destroy?.());
            _sheets = [];
            bodySlot.innerHTML = '';
            subEl.textContent = `${_models.length} installed`;
            _mediaBlock(_models, 'image', activeId);
            _mediaBlock(_models, 'video', activeId);
        }

        el.open = ({ models = [], modelId = null } = {}) => {
            _models = models;
            _render(modelId);
            overlay.el.show();
        };

        el.close = () => overlay.el.hide();

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _sheets.forEach(s => s.el.destroy?.());
            _sheets = [];
            overlay.el.destroy?.();
            el.remove();
        };

        void props;
    },
});
