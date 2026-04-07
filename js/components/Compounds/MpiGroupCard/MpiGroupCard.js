import { ComponentFactory } from '../../factory.js';
import { ce } from '/js/utils/dom.js';

/**
 * MpiGroupCard — Compound: displays a single ItemGroup in the gallery grid.
 *
 * States:
 *   default      — shows thumbnail of selected entry, hover reveals select checkbox
 *   generating   — shows ComfyUI latent preview + progress indicator instead of thumbnail
 *   selected     — checkbox is checked, card has selection highlight
 *
 * The card never navigates itself — it emits events and the parent (MpiGalleryGrid)
 * decides whether a click opens the group or toggles selection.
 *
 * Props:
 * @param {import('../../../data/projectModel.js').ItemGroup} group  - The item group to display
 * @param {boolean} [selectionMode=false] - When true, clicks toggle selection instead of opening
 * @param {boolean} [selected=false]      - Whether this card is currently selected
 *
 * Instance methods (on instance.el):
 *   setGenerating(previewUrl)  — switches to generating state with optional latent preview image
 *   setDone(group)             — generation complete, update group data and return to normal state
 *   setSelected(bool)          — toggle selection highlight externally
 *   setSelectionMode(bool)     — switch between open-on-click and select-on-click
 *
 * Emits:
 *   'open'          { group }              — card clicked in normal mode (open group history)
 *   'select'        { group, selected }    — checkbox toggled or card clicked in selection mode
 *   'media-missing' { group, itemId }      — selected item's file returned 404; parent should promote or remove
 */
export const MpiGroupCard = ComponentFactory.create({
    name: 'MpiGroupCard',
    css: ['js/components/Compounds/MpiGroupCard/MpiGroupCard.css'],

    template: () => `
        <div class="mpi-group-card">
            <div class="mpi-group-card__media">
                <img class="mpi-group-card__thumb" alt="" draggable="true">
                <div class="mpi-group-card__preview">
                    <div class="mpi-group-card__spinner"></div>
                    <img class="mpi-group-card__preview-img" alt="">
                </div>
            </div>
            <div class="mpi-group-card__select-wrap">
                <input type="checkbox" class="mpi-group-card__checkbox" aria-label="Select group">
            </div>
            <div class="mpi-group-card__footer">
                <span class="mpi-group-card__name"></span>
                <span class="mpi-group-card__type"></span>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        let _group        = props.group || null;
        let _selectionMode = props.selectionMode || false;
        let _selected     = props.selected || false;
        let _generating   = false;

        const thumb       = el.querySelector('.mpi-group-card__thumb');
        const preview     = el.querySelector('.mpi-group-card__preview');
        const spinner     = el.querySelector('.mpi-group-card__spinner');
        const previewImg  = el.querySelector('.mpi-group-card__preview-img');
        const checkbox    = el.querySelector('.mpi-group-card__checkbox');
        const nameEl      = el.querySelector('.mpi-group-card__name');
        const typeEl      = el.querySelector('.mpi-group-card__type');
        const card        = el; // el IS the .mpi-group-card root element

        // ── Render from group data ──────────────────────────────────────────────

        function _render() {
            if (!_group) return;

            const selected = _group.history[_group.selectedIndex];
            const src = selected?.filePath || '';

            if (src) {
                thumb.onload  = () => card.classList.remove('mpi-group-card--missing');
                thumb.onerror = () => {
                    card.classList.add('mpi-group-card--missing');
                    emit('media-missing', { group: _group, itemId: selected?.id });
                };
                thumb.src = src;
            } else {
                thumb.onload  = null;
                thumb.onerror = null;
                thumb.removeAttribute('src');
            }
            nameEl.textContent = _group.name;
            typeEl.textContent = _group.type.toUpperCase();

            // Drag the selected media item to PromptBox for i2i / i2v
            thumb.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/mpi-media', JSON.stringify({
                    groupId: _group.id,
                    itemId:  selected?.id,
                    filePath: selected?.filePath,
                    type:    _group.type,
                }));
            });

            _applySelected(_selected);
        }

        // ── Selection state ─────────────────────────────────────────────────────

        function _applySelected(val) {
            _selected = val;
            checkbox.checked = val;
            card.classList.toggle('mpi-group-card--selected', val);
        }

        // ── Generating state ────────────────────────────────────────────────────

        function _applyGenerating(val) {
            _generating = val;
            card.classList.toggle('mpi-group-card--generating', val);
            preview.classList.toggle('mpi-group-card__preview--visible', val);
            if (val) spinner.style.display = '';
        }

        // ── Click handling ──────────────────────────────────────────────────────

        card.addEventListener('click', (e) => {
            if (_generating) return;
            // Checkbox click is handled separately
            if (e.target === checkbox) return;

            if (_selectionMode) {
                _applySelected(!_selected);
                emit('select', { group: _group, selected: _selected });
            } else {
                emit('open', { group: _group });
            }
        });

        checkbox.addEventListener('change', () => {
            _applySelected(checkbox.checked);
            emit('select', { group: _group, selected: _selected });
        });

        // ── Public API ──────────────────────────────────────────────────────────

        /**
         * Switch card to generating state with an optional latent preview URL.
         * @param {string|null} previewUrl
         */
        el.setGenerating = (previewUrl = null) => {
            _applyGenerating(true);
            if (previewUrl) previewImg.src = previewUrl;
        };

        /**
         * Update the latent preview image mid-generation.
         * @param {string} previewUrl
         */
        el.updatePreview = (previewUrl) => {
            if (!_generating) return;
            previewImg.src = previewUrl;
            spinner.style.display = 'none';
        };

        /**
         * Generation complete — update group data and return to normal state.
         * @param {import('../../../data/projectModel.js').ItemGroup} group
         */
        el.setDone = (group) => {
            _group = group;
            _applyGenerating(false);
            _render();
        };

        /**
         * Toggle selection highlight externally (e.g. select-all).
         * @param {boolean} val
         */
        el.setSelected = (val) => {
            _applySelected(val);
        };

        /**
         * Switch between open-on-click and select-on-click modes.
         * @param {boolean} val
         */
        el.setSelectionMode = (val) => {
            _selectionMode = val;
            card.classList.toggle('mpi-group-card--selection-mode', val);
        };

        // ── Init ────────────────────────────────────────────────────────────────

        if (_group) _render();
    }
});
