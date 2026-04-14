import { ComponentFactory } from '../../factory.js';
import { MpiGroupCard } from '../../Compounds/MpiGroupCard/MpiGroupCard.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { ce, qs } from '/js/utils/dom.js';
import { removeHistoryEntry } from '../../../data/projectModel.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { packItemsIntoRows, resizeRowImages } from '../../../utils/justifiedLayout.js';

/**
 * MpiGalleryGrid — Block: adaptive grid of ItemGroup cards with size slider,
 * selection mode, and a generation preview slot.
 *
 * Uses a justified layout (like Google Photos) where rows have uniform height
 * and image widths scale to fill the container. Cards are not forced to square
 * aspect ratios — images display in their true ratios with object-fit: contain.
 *
 * The grid has 5 size levels driven by MpiProgressBar. Level maps to a target
 * card width in pixels (160/224/288/384/512).
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
 *   'gc-group'    { group }              — group was mutated by GC (missing file); persist to disk
 *   'gc-remove'   { groupId }            — all history entries missing; group removed from grid
 *   'selection-start' {}                  — selection mode activated (hide PromptBox)
 *   'selection-end'   {}                  — selection mode exited (show PromptBox)
 */
export const MpiGalleryGrid = ComponentFactory.create({
    name: 'MpiGalleryGrid',
    css: ['js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.css'],

    template: () => `
        <div class="mpi-gallery-grid">
            <div class="mpi-gallery-grid__tabs">
                <div class="mpi-gallery-grid__tab-group">
                    <button class="mpi-gallery-grid__tab mpi-gallery-grid__tab--active" data-order="newest">Newest</button>
                    <button class="mpi-gallery-grid__tab" data-order="oldest">Oldest</button>
                </div>
                <div class="mpi-gallery-grid__tab-sep"></div>
                <div class="mpi-gallery-grid__tab-group">
                    <button class="mpi-gallery-grid__tab mpi-gallery-grid__tab--active" data-filter="all">All</button>
                    <button class="mpi-gallery-grid__tab" data-filter="images">Images</button>
                    <button class="mpi-gallery-grid__tab" data-filter="videos">Videos</button>
                    <button class="mpi-gallery-grid__tab" data-filter="favorites">Favorites</button>
                    <div class="mpi-gallery-grid__info-btn-slot"></div>
                </div>
            </div>
            <div class="mpi-gallery-grid__controls">
                <div class="mpi-gallery-grid__slider-wrap"></div>
            </div>
            <div class="mpi-gallery-grid__generating-slot"></div>
            <div class="mpi-gallery-grid__grid"></div>
            <div class="mpi-gallery-grid__footer">
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
        const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
        const sliderWrap = el.querySelector('.mpi-gallery-grid__slider-wrap');
        const selectionSlot = el.querySelector('.mpi-gallery-grid__selectionbar-slot');

        // ── Grid size slider (5 levels via MpiProgressBar) ──────────────────────

        const slider = MpiProgressBar.mount(sliderWrap, {
            min: 1, max: 5, step: 1, value: 3,
            interactive: true,
            wheel: true,
            info: 'Size: {value}',
        });

        // Level → target card width (px)
        const SIZE_MAP = { 1: 160, 2: 224, 3: 288, 4: 384, 5: 512 };
        let _cardWidth = SIZE_MAP[3];

        slider.on('input', ({ value }) => {
            _cardWidth = SIZE_MAP[value] || 288;
            _rerenderJustified();
        });

        // Set initial card width
        _cardWidth = SIZE_MAP[3];

        // ── Justified Layout helpers ─────────────────────────────────────────

        const GAP = 12; // px, matches CSS gap

        /**
         * Re-render the grid using the justified layout algorithm.
         * Cards are rendered immediately with natural image heights (CSS flex),
         * then resized proportionally after images load so rows fill the container.
         */
        let _renderTimeout = null;

        async function _rerenderJustified() {
            // Debounce rapid calls
            if (_renderTimeout) clearTimeout(_renderTimeout);
            _renderTimeout = setTimeout(async () => {
                const { order, filter } = state.gallerySort;

                // Filter
                let display = _groups.filter(g => {
                    if (filter === 'images')   return g.type === 'image';
                    if (filter === 'videos')    return g.type === 'video';
                    if (filter === 'favorites') return g.favourite === true;
                    return true;
                });

                // Sort
                display.sort((a, b) => {
                    const ta = new Date(a.createdAt).getTime();
                    const tb = new Date(b.createdAt).getTime();
                    return order === 'newest' ? tb - ta : ta - tb;
                });

                // Update active tab styling
                tabsEl.querySelectorAll('[data-order]').forEach(btn => {
                    btn.classList.toggle('mpi-gallery-grid__tab--active', btn.dataset.order === order);
                });
                tabsEl.querySelectorAll('[data-filter]').forEach(btn => {
                    btn.classList.toggle('mpi-gallery-grid__tab--active', btn.dataset.filter === filter);
                });

                // Get container width
                const containerWidth = grid.clientWidth - 2 * 16; // 16px padding each side

                // Clear and rebuild with plain flex rows (images drive their own height initially)
                grid.innerHTML = '';
                _cardMap.clear();

                // Pack into rows using justified layout utility
                const targetCardWidth = _cardWidth;
                const items = display.map(group => ({
                    id: group.id,
                    targetWidth: targetCardWidth,
                }));
                const rows = packItemsIntoRows(items, containerWidth, GAP, targetCardWidth);

                rows.forEach(({ items: rowItems }) => {
                    const rowEl = ce('div', { className: 'mpi-gallery-grid__row' });
                    rowEl.style.height = '200px';

                    rowItems.forEach(({ id, targetWidth }) => {
                        const group = display.find(g => g.id === id);
                        const { card, wrapper } = _makeCard(group);
                        wrapper.className = 'mpi-gallery-grid__row-wrap';
                        wrapper.style.width = `${targetWidth}px`;
                        rowEl.appendChild(wrapper);
                        _cardMap.set(id, { card, el: wrapper });
                    });

                    grid.appendChild(rowEl);
                    resizeRowImages(rowEl, '.mpi-gallery-grid__row-wrap', '.mpi-group-card__thumb', GAP, containerWidth);
                });

                // Sync info state to all cards
                _cardMap.forEach(({ card }) => card.el.setShowInfo?.(state.galleryShowInfo));
            }, 16); // ~60fps debounce
        }

        // ── Info toggle button ──────────────────────────────────────────────────
        const infoBtnSlot = el.querySelector('.mpi-gallery-grid__info-btn-slot');
        const infoBtn = MpiButton.mount(infoBtnSlot, {
            icon: 'info', size: 'sm', variant: 'ghost', toggleable: true,
            active: state.galleryShowInfo,
            info: 'Show card info',
        });
        infoBtn.on('click', () => { state.galleryShowInfo = !state.galleryShowInfo; });
        // Sync active state and propagate to all cards when galleryShowInfo changes
        const _unsubInfoBtn = Events.on('state:changed', ({ key }) => {
            if (key === 'galleryShowInfo') {
                infoBtn.el.classList.toggle('mpi-btn--active', state.galleryShowInfo);
                _cardMap.forEach(({ card }) => card.el.setShowInfo?.(state.galleryShowInfo));
            }
        });

        // ── Gallery organize tabs ───────────────────────────────────────────────

        const tabsEl = el.querySelector('.mpi-gallery-grid__tabs');

        // Subscribe to state.gallerySort changes
        const _unsubSort = Events.on('state:changed', ({ key }) => {
            if (key === 'gallerySort') _rerenderJustified();
        });

        // Tab click delegation
        tabsEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-order], [data-filter]');
            if (!btn) return;
            if (btn.dataset.order) {
                state.gallerySort = { ...state.gallerySort, order: btn.dataset.order };
            } else if (btn.dataset.filter) {
                state.gallerySort = { ...state.gallerySort, filter: btn.dataset.filter };
            }
        });

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
            state.galleryShowInfo = true;
            _cardMap.forEach(({ card }) => card.el.setSelectionMode(true));
            emit('selection-start');
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
            emit('selection-end');
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

            card.on('media-missing', ({ group: g, itemId }) => {
                // Find the missing entry index
                const missingIdx = g.history.findIndex(item => item.id === itemId);
                if (missingIdx === -1) return;

                if (g.history.length <= 1) {
                    // Last entry is missing — remove the card entirely
                    el.removeCard(g.id);
                    emit('gc-remove', { groupId: g.id });
                } else {
                    // Prune the missing entry and promote the next best
                    const pruned = removeHistoryEntry(g, missingIdx);
                    const idx = _groups.findIndex(x => x.id === g.id);
                    if (idx !== -1) _groups[idx] = pruned;
                    card.el.setDone(pruned);
                    emit('gc-group', { group: pruned });
                }
            });

            card.on('reuse', ({ positive, negative }) => {
                Events.emit('workspace:inject-prompts', { positive, negative });
            });

            card.on('favourite', ({ group: g, favourite }) => {
                const idx = _groups.findIndex(x => x.id === g.id);
                if (idx !== -1) {
                    _groups[idx] = { ..._groups[idx], favourite };
                    emit('favourite', { group: _groups[idx] });
                }
            });

            return { card, wrapper };
        }

        // ── Render all groups ───────────────────────────────────────────────────
        // (removed — replaced by _rerenderJustified for justified layout)

        // Initial justified layout render
        _rerenderJustified();

        // ── Public API ──────────────────────────────────────────────────────────

        /**
         * Replace the full group list and re-render.
         * @param {import('../../../data/projectModel.js').ItemGroup[]} groups
         */
        el.setGroups = (groups) => {
            _groups = groups;
            _exitSelectionMode();
            _rerenderJustified();
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
            generatingSlot.prepend(wrapper); // new generations appear at the top
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
            // Remove generating card element
            entry.el.remove();
            _cardMap.delete(tempId);
            // Add group to front of groups array and re-run justified layout
            _groups = _groups.filter(g => g.id !== tempId);
            _groups.unshift(group);
            _rerenderJustified();
        };

        /**
         * Remove a card by group id (after deletion).
         * @param {string} groupId
         */
        el.removeCard = (groupId) => {
            const entry = _cardMap.get(groupId);
            if (!entry) return;
            entry.el.remove();
            _cardMap.delete(groupId);
            _groups = _groups.filter(g => g.id !== groupId);
            _selectedIds.delete(groupId);
            if (_selectedIds.size === 0 && _selectionMode) _exitSelectionMode();
            else selectionBar.el.setCount(_selectedIds.size);
        };
    }
});
