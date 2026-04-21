import { ComponentFactory } from '../../factory.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { ce, qs } from '/js/utils/dom.js';
import { removeHistoryEntry } from '../../../data/projectModel.js';
import { getModelById } from '../../../data/modelRegistry.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { buildJustifiedRows } from '../../../utils/justifiedLayout.js';

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
    css: ['js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.css'],

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
                <div class="mpi-gallery-grid__slider-wrap"></div>
            </div>
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

        // Tracks group IDs whose image has already triggered a post-load rerender.
        // Prevents the rerender → new img → onload → rerender loop for cached images.
        const _stabilizedIds = new Set();

        const grid = el.querySelector('.mpi-gallery-grid__grid');
        const sliderWrap = el.querySelector('.mpi-gallery-grid__slider-wrap');

        /** @type {Array<Function>} */
        const _unsubs = [];

        // Selection state (managed externally by parent block, but grid applies it to cards)
        let _selectedIds = new Set();
        let _selectionMode = false;

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

        // Register +/- hotkeys to control slider (keyboard and numpad)
        const incrementSlider = () => {
            const input = sliderWrap.querySelector('.mpi-progress__input');
            const currentValue = parseFloat(input.value);
            const nextValue = Math.min(5, currentValue + 1);
            input.value = nextValue;
            input.dispatchEvent(new Event('input'));
        };

        const decrementSlider = () => {
            const input = sliderWrap.querySelector('.mpi-progress__input');
            const currentValue = parseFloat(input.value);
            const nextValue = Math.max(1, currentValue - 1);
            input.value = nextValue;
            input.dispatchEvent(new Event('input'));
        };

        // Regular +/= and - keys (both keyboard and numpad send + and -)
        _unsubs.push(Hotkeys.register('=', incrementSlider));
        _unsubs.push(Hotkeys.register('+', incrementSlider));
        _unsubs.push(Hotkeys.register('-', decrementSlider));

        // Set initial card width
        _cardWidth = SIZE_MAP[3];

        // ── Card rendering helper (merged from MpiGroupCard) ──────────────────

        function _makeCard(group) {
            const wrapper = ce('div', { className: 'mpi-gallery-grid__card-wrap' });
            const cardEl = ce('div', { className: 'mpi-group-card' });

            // Build card DOM from merged MpiGroupCard template
            cardEl.innerHTML = `
                <div class="mpi-group-card__media">
                    <img class="mpi-group-card__thumb" alt="" draggable="true">
                    <div class="mpi-group-card__preview">
                        <div class="mpi-group-card__spinner"></div>
                        <img class="mpi-group-card__preview-img" alt="">
                    </div>
                </div>
                <div class="mpi-group-card__fav-wrap"></div>
                <div class="mpi-group-card__reuse-wrap"></div>
                <div class="mpi-group-card__select-wrap">
                    <input type="checkbox" class="mpi-group-card__checkbox" aria-label="Select group">
                </div>
                <div class="mpi-group-card__footer">
                    <span class="mpi-group-card__name"></span>
                    <span class="mpi-group-card__badge"></span>
                    <span class="mpi-group-card__type"></span>
                </div>
            `;

            wrapper.appendChild(cardEl);

            // References to elements
            const thumb = cardEl.querySelector('.mpi-group-card__thumb');
            const preview = cardEl.querySelector('.mpi-group-card__preview');
            const spinner = cardEl.querySelector('.mpi-group-card__spinner');
            const previewImg = cardEl.querySelector('.mpi-group-card__preview-img');
            const checkbox = cardEl.querySelector('.mpi-group-card__checkbox');
            const nameEl = cardEl.querySelector('.mpi-group-card__name');
            const badgeEl = cardEl.querySelector('.mpi-group-card__badge');
            const typeEl = cardEl.querySelector('.mpi-group-card__type');
            const favWrap = cardEl.querySelector('.mpi-group-card__fav-wrap');
            const reuseWrap = cardEl.querySelector('.mpi-group-card__reuse-wrap');

            // State
            let _generating = false;
            let _showInfo = false;
            let _favourite = group?.favourite || false;

            // Mount favorite button
            const _favBtn = MpiButton.mount(favWrap, {
                icon: 'heartOutline',
                iconActive: 'heart',
                toggleable: true,
                active: _favourite,
                size: 'sm',
                variant: 'ghost',
                info: 'Favourite',
            });

            _favBtn.on('toggle', ({ active }) => {
                _favourite = active;
                if (group) {
                    group.favourite = active;
                    emit('favourite', { group, favourite: active });
                }
                cardEl.classList.toggle('mpi-group-card--favourited', active);
            });

            // Mount reuse button
            const _reuseBtn = MpiButton.mount(reuseWrap, {
                icon: 'refresh_stroke',
                size: 'sm',
                variant: 'ghost',
                info: 'Reuse Prompt',
            });

            _reuseBtn.on('click', (e) => {
                e.originalEvent?.stopPropagation();
                const selected = group?.history?.[group.selectedIndex];
                if (!selected) return;
                emit('reuse', {
                    positive: selected.prompt || '',
                    negative: selected.negativePrompt || '',
                });
            });

            // Replace <img> thumb with a <video> element (first-frame preview,
            // hover-play). Keeps same class so CSS still applies.
            let _videoThumb = null;
            function _swapThumbToVideo(src) {
                if (_videoThumb && _videoThumb.src.endsWith(src)) return;
                if (!_videoThumb) {
                    _videoThumb = document.createElement('video');
                    _videoThumb.className = 'mpi-group-card__thumb mpi-group-card__thumb--video';
                    _videoThumb.muted = true;
                    _videoThumb.loop = true;
                    _videoThumb.playsInline = true;
                    _videoThumb.preload = 'metadata';
                    _videoThumb.draggable = true;
                    _videoThumb.addEventListener('loadeddata', () => {
                        cardEl.classList.remove('mpi-group-card--missing');
                        if (group?.id && !_stabilizedIds.has(group.id)) {
                            _stabilizedIds.add(group.id);
                            _rerenderJustified();
                        }
                    });
                    _videoThumb.addEventListener('error', () => {
                        cardEl.classList.add('mpi-group-card--missing');
                        const sel = group?.history?.[group.selectedIndex];
                        emit('media-missing', { group, itemId: sel?.id });
                    });
                    cardEl.addEventListener('mouseenter', () => _videoThumb.play().catch(() => {}));
                    cardEl.addEventListener('mouseleave', () => {
                        _videoThumb.pause();
                        _videoThumb.currentTime = 0;
                    });
                    _videoThumb.addEventListener('dragstart', (e) => {
                        const sel = group?.history?.[group.selectedIndex];
                        e.dataTransfer.setData('application/mpi-media', JSON.stringify({
                            groupId: group.id,
                            itemId: sel?.id,
                            filePath: sel?.filePath,
                            type: group.type,
                        }));
                    });
                    thumb.replaceWith(_videoThumb);
                }
                _videoThumb.src = src;
            }

            // Render card from group data
            function _render() {
                if (!group) return;

                const selected = group.history?.[group.selectedIndex];
                const src = selected?.filePath || '';

                if (src) {
                    const isVideo = group.type === 'video' || selected?.type === 'video';
                    if (isVideo) {
                        // Swap <img> thumb for <video> so the first frame renders
                        // natively (no canvas/CORS) and we can hover-play.
                        _swapThumbToVideo(src);
                    } else {
                        thumb.onload = () => {
                            cardEl.classList.remove('mpi-group-card--missing');
                            if (group?.id && !_stabilizedIds.has(group.id)) {
                                _stabilizedIds.add(group.id);
                                _rerenderJustified();
                            }
                        };
                        thumb.onerror = () => {
                            cardEl.classList.add('mpi-group-card--missing');
                            emit('media-missing', { group, itemId: selected?.id });
                        };
                        thumb.src = src;
                    }
                } else {
                    thumb.onload = null;
                    thumb.onerror = null;
                    thumb.removeAttribute('src');
                }

                nameEl.textContent = selected?.operation || group.name;
                const model = getModelById(selected?.modelId);
                badgeEl.textContent = model?.name || '';
                typeEl.textContent = group.type.toUpperCase();

                // Drag support
                thumb.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('application/mpi-media', JSON.stringify({
                        groupId: group.id,
                        itemId: selected?.id,
                        filePath: selected?.filePath,
                        type: group.type,
                    }));
                });

                _favourite = group?.favourite || false;
                _favBtn.el.setActive(_favourite);
                cardEl.classList.toggle('mpi-group-card--favourited', _favourite);
            }

            // Selection state management
            let _selected = false;

            cardEl.setSelected = (val) => {
                _selected = val;
                checkbox.checked = val;
                cardEl.classList.toggle('mpi-group-card--selected', val);
            };

            // Click handling
            cardEl.addEventListener('click', (e) => {
                if (_generating) return;
                if (e.target === checkbox) return;
                if (favWrap.contains(e.target)) return;
                if (reuseWrap.contains(e.target)) return;

                if (_selectionMode) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    emit('open-group', { group });
                }
            });

            checkbox.addEventListener('change', () => {
                _selected = checkbox.checked;
                cardEl.classList.toggle('mpi-group-card--selected', _selected);
                if (_selected) {
                    _selectedIds.add(group.id);
                } else {
                    _selectedIds.delete(group.id);
                }
                emit('select', { group, selected: _selected });
            });

            // Apply initial selection state
            if (_selectedIds.has(group.id)) {
                cardEl.setSelected(true);
            }

            // Public methods
            cardEl.setGenerating = (previewUrl = null) => {
                _generating = true;
                cardEl.classList.add('mpi-group-card--generating');
                preview.classList.add('mpi-group-card__preview--visible');
                spinner.style.display = '';
                if (previewUrl) previewImg.src = previewUrl;
            };

            cardEl.updatePreview = (previewUrl) => {
                if (!_generating) return;
                previewImg.src = previewUrl;
                spinner.style.display = 'none';
            };

            cardEl.setDone = (newGroup) => {
                group = newGroup;
                _generating = false;
                cardEl.classList.remove('mpi-group-card--generating');
                preview.classList.remove('mpi-group-card__preview--visible');
                _render();
            };

            cardEl.setShowInfo = (val) => {
                _showInfo = val;
                cardEl.classList.toggle('mpi-group-card--show-info', val);
            };

            // Initial render
            _render();

            return { card: { el: cardEl }, wrapper };
        }

        // ── Justified Layout helpers ─────────────────────────────────────────

        const GAP = 2; // px, matches CSS gap (2px)

        /**
         * Get aspect ratio for a group.
         * Priority: loaded image naturalWidth/naturalHeight, then group.width/group.height
         */
        function _getAspectRatio(group) {
            const cardEntry = _cardMap.get(group.id);
            if (cardEntry) {
                const thumb = cardEntry.el.querySelector('.mpi-group-card__thumb');
                if (thumb) {
                    if (thumb.naturalWidth > 0) return thumb.naturalWidth / thumb.naturalHeight;
                    if (thumb.videoWidth   > 0) return thumb.videoWidth   / thumb.videoHeight;
                }
            }
            const sel = group.history?.[group.selectedIndex];
            const px = sel?.pixelDimensions;
            if (px?.w && px?.h) return px.w / px.h;
            if (group.width && group.height) return group.width / group.height;
            return 1.0;
        }

        /**
         * Re-render the grid using the justified layout algorithm.
         * Builds rows with correct dimensions upfront — no async resize snapping.
         */
        let _renderTimeout = null;

        function _rerenderJustified() {
            // Debounce rapid calls
            if (_renderTimeout) clearTimeout(_renderTimeout);
            _renderTimeout = setTimeout(() => {
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

                // Get container width (grid.clientWidth includes padding, so subtract it)
                const gridStyle = getComputedStyle(grid);
                const paddingX = (parseFloat(gridStyle.paddingLeft) || 0) + (parseFloat(gridStyle.paddingRight) || 0);
                const containerWidth = grid.clientWidth - paddingX;

                // Separate generating groups from normal groups
                const generatingGroups = display.filter(g => g.isGenerating);
                const normalGroups = display.filter(g => !g.isGenerating);

                // Build items with aspect ratios (generating first)
                const allGroups = [...generatingGroups, ...normalGroups];
                const items = allGroups.map(group => ({
                    id: group.id,
                    aspectRatio: _getAspectRatio(group),
                }));

                // Build justified rows
                const rows = buildJustifiedRows(items, containerWidth, _cardWidth, GAP);

                // Clear all rows
                grid.querySelectorAll('.mpi-gallery-grid__row').forEach(row => row.remove());

                const allGroupsMap = new Map(allGroups.map(g => [g.id, g]));

                rows.forEach(({ items: rowItems, rowHeight }) => {
                    const rowEl = ce('div', { className: 'mpi-gallery-grid__row' });
                    rowEl.style.height = `${rowHeight}px`;

                    rowItems.forEach(({ id, width, height }) => {
                        const group = allGroupsMap.get(id);
                        const { card, wrapper } = _makeCard(group);
                        wrapper.className = 'mpi-gallery-grid__row-wrap';
                        wrapper.style.width = `${width}px`;
                        wrapper.style.height = `${height}px`;

                        rowEl.appendChild(wrapper);

                        if (group.isGenerating) {
                            card.el.setGenerating();
                        }

                        _cardMap.set(id, { card, el: wrapper });
                    });

                    grid.appendChild(rowEl);
                });

                // Sync info state to all cards
                _cardMap.forEach(({ card }) => card.el.setShowInfo?.(state.galleryShowInfo));
            }, 16); // ~60fps debounce
        }

        // ── ResizeObserver for window resize ──────────────────────────────────

        const resizeObserver = new ResizeObserver(() => {
            _rerenderJustified();
        });
        resizeObserver.observe(grid);
        _unsubs.push(() => resizeObserver.disconnect());

        // ── Info toggle button ──────────────────────────────────────────────────
        const infoBtnSlot = el.querySelector('.mpi-gallery-grid__info-btn-slot');
        const infoBtn = MpiButton.mount(infoBtnSlot, {
            icon: 'info', size: 'sm', variant: 'ghost', toggleable: true,
            active: state.galleryShowInfo,
            info: 'Show card info',
        });
        infoBtn.on('click', () => { state.galleryShowInfo = !state.galleryShowInfo; });
        // Sync active state and propagate to all cards when galleryShowInfo changes
        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 'galleryShowInfo') {
                infoBtn.el.classList.toggle('mpi-btn--active', state.galleryShowInfo);
                _cardMap.forEach(({ card }) => card.el.setShowInfo?.(state.galleryShowInfo));
            }
        }));

        // ── Gallery organize tabs ───────────────────────────────────────────────

        const tabsEl = el.querySelector('.mpi-gallery-grid__tabs');

        // Subscribe to state.gallerySort changes
        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 'gallerySort') _rerenderJustified();
        }));

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
            _selectedIds.clear();
            _stabilizedIds.clear();
            _rerenderJustified();
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
         * Remove a card by group id (after deletion).
         * @param {string} groupId
         */
        el.removeCard = (groupId) => {
            const entry = _cardMap.get(groupId);
            if (!entry) return;
            entry.el.remove();
            _cardMap.delete(groupId);
            _groups = _groups.filter(g => g.id !== groupId);
        };

        /**
         * Set selection mode state (affects click behavior on cards).
         * @param {boolean} val
         */
        el.setSelectionMode = (val) => {
            _selectionMode = val;
            el.classList.toggle('mpi-gallery-grid--selecting', val);
        };

        /**
         * Display a generating card in a dedicated area above the normal grid.
         * @param {HTMLElement} wrapper - pre-mounted card wrapper
         * @param {number} width - card width in px
         * @param {number} height - card height in px
         */
        el.setGeneratingCard = (wrapper, width, height) => {
            const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
            if (!generatingSlot) return;

            wrapper.style.width = `${width}px`;
            wrapper.style.height = `${height}px`;
            generatingSlot.innerHTML = '';
            generatingSlot.appendChild(wrapper);
            generatingSlot.classList.add('mpi-gallery-grid__generating-slot--visible');
        };

        /**
         * Remove the generating card and restore normal grid.
         */
        el.clearGeneratingCard = () => {
            const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
            if (generatingSlot) {
                generatingSlot.innerHTML = '';
                generatingSlot.classList.remove('mpi-gallery-grid__generating-slot--visible');
            }
        };

        // ── Cleanup ─────────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _cardMap.forEach(({ card }) => card.el.destroy?.());
            _cardMap.clear();
        };
    }
});
