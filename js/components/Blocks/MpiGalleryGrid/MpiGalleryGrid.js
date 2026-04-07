import { ComponentFactory } from '../../factory.js';
import { MpiGroupCard } from '../../Compounds/MpiGroupCard/MpiGroupCard.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { ce, qs } from '/js/utils/dom.js';

/**
 * MpiGalleryGrid — Block: adaptive grid of ItemGroup cards with size slider,
 * selection mode, and a generation preview slot.
 *
 * The grid has 5 size levels driven by MpiProgressBar (the existing slider component).
 * Level maps to a CSS custom property --gallery-col-size that the grid uses for
 * column sizing.
 *
 * Selection mode activates when the user checks any card. In selection mode:
 *   - Clicking a card toggles selection instead of opening the group
 *   - The footer swaps from PromptBox slot to MpiSelectionBar
 *
 * Props:
 * @param {import('../../../data/projectModel.js').ItemGroup[]} [groups=[]] - Initial groups
 *
 * Instance methods (on instance.el):
 *   setGroups(groups)                    — replace all groups and re-render
 *   addGeneratingCard(tempId, type)      — adds a generating placeholder card, returns card el
 *   removeGeneratingCard(tempId)         — removes a generating card on error/empty result
 *   finalizeCard(tempId, group)          — replaces generating card with real group data
 *   updatePreview(tempId, previewUrl)    — push latent preview url to generating card
 *
 * Emits:
 *   'open-group'  { group }              — user opened a group (navigate to history)
 *   'compare'     { groups: [g1, g2] }   — compare 2 selected groups
 *   'delete'      { groups: [...] }      — delete selected groups
 *   'download'    { groups: [...] }      — download selected groups
 */
export const MpiGalleryGrid = ComponentFactory.create({
    name: 'MpiGalleryGrid',
    css: ['js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.css'],

    template: () => `
        <div class="mpi-gallery-grid">
            <div class="mpi-gallery-grid__controls">
                <div class="mpi-gallery-grid__slider-wrap"></div>
            </div>
            <div class="mpi-gallery-grid__grid"></div>
            <div class="mpi-gallery-grid__footer">
                <div class="mpi-gallery-grid__promptbox-slot"></div>
                <div class="mpi-gallery-grid__selectionbar-slot" style="display:none"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        /** @type {import('../../../data/projectModel.js').ItemGroup[]} */
        let _groups = props.groups || [];

        /** @type {Map<string, {card: object, el: HTMLElement}>} */
        const _cardMap = new Map(); // groupId or tempId → { card instance, wrapper el }

        /** @type {Set<string>} */
        const _selectedIds = new Set();

        let _selectionMode = false;

        const grid = el.querySelector('.mpi-gallery-grid__grid');
        const sliderWrap = el.querySelector('.mpi-gallery-grid__slider-wrap');
        const promptSlot = el.querySelector('.mpi-gallery-grid__promptbox-slot');
        const selectionSlot = el.querySelector('.mpi-gallery-grid__selectionbar-slot');

        // ── Grid size slider (5 levels via MpiProgressBar) ──────────────────────

        const slider = MpiProgressBar.mount(sliderWrap, {
            min: 1, max: 5, step: 1, value: 3,
            interactive: true,
            wheel: true,
            info: 'Size: {value}',
        });

        // Level → CSS column min-width
        const SIZE_MAP = { 1: '10rem', 2: '14rem', 3: '18rem', 4: '24rem', 5: '32rem' };

        slider.on('input', ({ value }) => {
            grid.style.setProperty('--gallery-col-size', SIZE_MAP[value] || '18rem');
        });

        // Set initial size
        grid.style.setProperty('--gallery-col-size', SIZE_MAP[3]);

        // ── Selection bar ───────────────────────────────────────────────────────

        const selectionBar = MpiSelectionBar.mount(selectionSlot, { count: 0 });

        selectionBar.on('cancel', () => _exitSelectionMode());

        selectionBar.on('compare', () => {
            const selected = _getSelectedGroups();
            if (selected.length === 2) emit('compare', { groups: selected });
        });

        selectionBar.on('download', () => {
            emit('download', { groups: _getSelectedGroups() });
        });

        selectionBar.on('delete', () => {
            emit('delete', { groups: _getSelectedGroups() });
        });

        // ── Selection mode ──────────────────────────────────────────────────────

        function _enterSelectionMode() {
            if (_selectionMode) return;
            _selectionMode = true;
            _cardMap.forEach(({ card }) => card.el.setSelectionMode(true));
            promptSlot.style.display = 'none';
            selectionSlot.style.display = '';
            el.classList.add('mpi-gallery-grid--selecting');
        }

        function _exitSelectionMode() {
            _selectionMode = false;
            _selectedIds.clear();
            _cardMap.forEach(({ card }) => {
                card.el.setSelectionMode(false);
                card.el.setSelected(false);
            });
            selectionBar.el.setCount(0);
            promptSlot.style.display = '';
            selectionSlot.style.display = 'none';
            el.classList.remove('mpi-gallery-grid--selecting');
        }

        function _getSelectedGroups() {
            return _groups.filter(g => _selectedIds.has(g.id));
        }

        // ── Card factory ────────────────────────────────────────────────────────

        function _makeCard(group) {
            const wrapper = ce('div', { className: 'mpi-gallery-grid__card-wrap' });
            const card = MpiGroupCard.mount(wrapper, {
                group,
                selectionMode: _selectionMode,
                selected: _selectedIds.has(group.id),
            });

            card.on('open', ({ group: g }) => {
                emit('open-group', { group: g });
            });

            card.on('select', ({ group: g, selected }) => {
                if (selected) {
                    _selectedIds.add(g.id);
                    if (!_selectionMode) _enterSelectionMode();
                } else {
                    _selectedIds.delete(g.id);
                    if (_selectedIds.size === 0) _exitSelectionMode();
                }
                selectionBar.el.setCount(_selectedIds.size);
            });

            return { card, wrapper };
        }

        // ── Render all groups ───────────────────────────────────────────────────

        function _render() {
            grid.innerHTML = '';
            _cardMap.clear();

            _groups.forEach(group => {
                const { card, wrapper } = _makeCard(group);
                _cardMap.set(group.id, { card, el: wrapper });
                grid.appendChild(wrapper);
            });
        }

        _render();

        // ── Public API ──────────────────────────────────────────────────────────

        /**
         * Replace the full group list and re-render.
         * @param {import('../../../data/projectModel.js').ItemGroup[]} groups
         */
        el.setGroups = (groups) => {
            _groups = groups;
            _exitSelectionMode();
            _render();
        };

        /**
         * Add a generating placeholder card. Returns the card instance so the
         * caller can push latent preview updates to it.
         * @param {string} tempId  - Temporary id (e.g. crypto.randomUUID())
         * @param {'image'|'video'} type
         * @returns {object} card instance
         */
        el.addGeneratingCard = (tempId, type) => {
            const placeholderGroup = { id: tempId, type, name: 'Generating...', history: [], selectedIndex: 0 };
            const { card, wrapper } = _makeCard(placeholderGroup);
            _cardMap.set(tempId, { card, el: wrapper });
            grid.prepend(wrapper); // new generations appear at the top
            card.el.setGenerating(null);
            return card;
        };

        /**
         * Push a latent preview image to a generating card.
         * @param {string} tempId
         * @param {string} previewUrl
         */
        el.updatePreview = (tempId, previewUrl) => {
            _cardMap.get(tempId)?.card.el.updatePreview(previewUrl);
        };

        /**
         * Remove a generating card without replacing it (on error or empty result).
         * @param {string} tempId
         */
        el.removeGeneratingCard = (tempId) => {
            const entry = _cardMap.get(tempId);
            if (!entry) return;
            entry.el.remove();
            _cardMap.delete(tempId);
        };

        /**
         * Replace a generating card with the completed group data.
         * @param {string} tempId
         * @param {import('../../../data/projectModel.js').ItemGroup} group
         */
        el.finalizeCard = (tempId, group) => {
            const entry = _cardMap.get(tempId);
            if (!entry) return;
            // Replace in groups array
            _groups = _groups.filter(g => g.id !== tempId);
            _groups.unshift(group);
            // Update the existing card in-place rather than re-rendering everything
            _cardMap.delete(tempId);
            _cardMap.set(group.id, entry);
            entry.card.el.setDone(group);
        };

        /**
         * Expose the PromptBox slot so the gallery workspace can mount MpiPromptBox into it.
         * @returns {HTMLElement}
         */
        el.getPromptSlot = () => promptSlot;
    }
});
