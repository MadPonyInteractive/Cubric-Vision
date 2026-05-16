import { ComponentFactory } from '../../factory.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiContextMenu } from '../MpiContextMenu/MpiContextMenu.js';
import { ce, qs, on } from '/js/utils/dom.js';
import { removeHistoryEntry } from '../../../data/projectModel.js';
import { getModelById } from '../../../data/modelRegistry.js';
import { getCommand, commandAllowsBranchingContinue } from '../../../data/commandRegistry.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { buildJustifiedRows } from '../../../utils/justifiedLayout.js';
import { clientLogger } from '../../../services/clientLogger.js';

/**
 * MpiGalleryGrid — Compound: adaptive grid of ItemGroup cards with size slider
 * and selection mode.
 *
 * Uses a justified layout (like Google Photos) where rows have uniform height
 * and image widths scale to fill the container.
 *
 * Selection model (Photoshop-style, no checkbox):
 *   - Ctrl/Cmd-click: toggle card; enters selection mode on first select.
 *   - Shift-click: range-select from anchor to clicked card (rendered order).
 *   - Plain click in selection mode: toggles card.
 *   - Plain click outside selection mode: opens group.
 *   - Right-click: context menu (Compare / Download / Delete).
 *     If right-clicked card not in selection → replace selection with it first.
 *   - Escape or selection count → 0: exits selection mode.
 *
 * Props:
 * @param {import('../../../data/projectModel.js').ItemGroup[]} [groups=[]] - Initial groups
 *
 * Instance methods (on instance.el):
 *   setGroups(groups)                    — replace all groups and re-render
 *   updatePreview(tempId, previewUrl)    — push latent preview url to generating card
 *   setSelectionMode(val)                — set selection mode externally
 *
 * Emits:
 *   'open-group'  { group }              — user opened a group (navigate to history)
 *   'compare'     { groups: [g1, g2] }   — compare 2 selected groups
 *   'delete'      { groups: [...] }      — delete selected groups
 *   'download'    { groups: [...] }      — download selected groups
 *   'gc-group'    { group }              — group mutated by GC; persist to disk
 *   'gc-remove'   { groupId }            — all history entries missing; remove from grid
 *   'selection-start' {}                 — selection mode activated (hide PromptBox)
 *   'selection-end'   {}                 — selection mode exited (show PromptBox)
 *   'preview:continue'    { group, item } — preview-stage card Continue clicked (branches into new card)
 *   'preview:finish'      { group, item } — preview-stage card Finish clicked (replaces preview with final)
 *   'preview:pop-continue'{ group, item } — Pop clicked while card is queued for Finish
 */
export const MpiGalleryGrid = ComponentFactory.create({
    name: 'MpiGalleryGrid',
    css: ['js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.css'],

    template: () => `
        <div class="mpi-gallery-grid">
            <div class="mpi-gallery-grid__tabs">
                <div class="mpi-gallery-grid__zone mpi-gallery-grid__zone--left">
                    <span class="mpi-gallery-grid__zone-label">SORT</span>
                    <div class="mpi-gallery-grid__tab-slot" data-order="newest"></div>
                    <div class="mpi-gallery-grid__tab-slot" data-order="oldest"></div>
                </div>
                <div class="mpi-gallery-grid__zone mpi-gallery-grid__zone--center">
                    <div class="mpi-gallery-grid__slider-wrap"></div>
                </div>
                <div class="mpi-gallery-grid__zone mpi-gallery-grid__zone--right">
                    <div class="mpi-gallery-grid__tab-slot" data-filter="all"></div>
                    <div class="mpi-gallery-grid__tab-slot" data-filter="images"></div>
                    <div class="mpi-gallery-grid__tab-slot" data-filter="videos"></div>
                    <div class="mpi-gallery-grid__tab-slot" data-filter="previews"></div>
                    <div class="mpi-gallery-grid__tab-slot" data-filter="favorites"></div>
                    <div class="mpi-gallery-grid__info-btn-slot"></div>
                </div>
            </div>
            <div class="mpi-gallery-grid__grid"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        /** @type {import('../../../data/projectModel.js').ItemGroup[]} */
        let _groups = props.groups || [];

        /** @type {Map<string, {card: object, el: HTMLElement, renderKey?: string}>} */
        const _cardMap = new Map();

        const _stabilizedIds = new Set();
        /** @type {Map<string, {key: string, ratio: number}>} */
        const _aspectRatioCache = new Map();

        // Group ids whose preview card is mid-Continue. Survives setGroups
        // rebuilds — re-applied to fresh cards inside _rerenderJustified so
        // the spinner doesn't flash off when the grid is rebuilt.
        // `_continuingIds` / `_queuedContinueIds` apply to the Finish path only
        // (preview → final replace). Branching Continue uses `_stage2Counts`
        // to render a small xN badge instead of taking over the whole card.
        const _continuingIds = new Set();
        const _queuedContinueIds = new Set();
        /** @type {Map<string, number>} groupId → pending+running stage-2 jobs. */
        const _stage2Counts = new Map();
        /**
         * @type {Map<string, { mode: 'fallback' | 'blocked', missing?: Array }>}
         * groupId → preview-assets validation state. `fallback` shows an amber
         * "Cold fallback" badge (latent missing, snapshots OK). `blocked` shows
         * a red "Missing assets" badge and hides Continue/Finish. Re-applied in
         * _rerenderJustified so debounced rebuilds don't drop badge state.
         */
        const _previewWarnings = new Map();

        const grid = qs('.mpi-gallery-grid__grid', el);
        const sliderWrap = qs('.mpi-gallery-grid__slider-wrap', el);
        const EMPTY_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

        /** @type {Array<Function>} */
        const _unsubs = [];

        // ── Selection state ───────────────────────────────────────────────────
        const _selectedIds = new Set();
        let _selectionMode = false;
        let _anchorId = null;   // ID of anchor card for shift-click range
        let _escUnsub = null;   // hotkey cleanup for Escape

        // The currently rendered ordered group list (rebuilt each justified render)
        let _renderedOrder = [];

        function _getRenderedIndex(groupId) {
            return _renderedOrder.findIndex(g => g.id === groupId);
        }

        function _enterSelectionMode() {
            if (_selectionMode) return;
            _selectionMode = true;
            el.classList.add('mpi-gallery-grid--selecting');
            emit('selection-start', {});
            _escUnsub = Hotkeys.bind('gallery.selection.exit', _exitSelectionMode);
        }

        function _exitSelectionMode() {
            if (!_selectionMode) return;
            _selectedIds.clear();
            _selectionMode = false;
            _anchorId = null;
            el.classList.remove('mpi-gallery-grid--selecting');
            emit('selection-end', {});
            if (_escUnsub) { _escUnsub(); _escUnsub = null; }
            // Re-render to clear selected CSS on all cards
            _rerenderJustified();
        }

        function _toggleSelect(groupId) {
            if (_selectedIds.has(groupId)) {
                _selectedIds.delete(groupId);
                if (_selectedIds.size === 0) {
                    _exitSelectionMode();
                    return;
                }
            } else {
                _selectedIds.add(groupId);
                _anchorId = groupId;
                if (!_selectionMode) _enterSelectionMode();
            }
            _syncCardSelectedState();
        }

        function _rangeSelect(groupId) {
            if (!_anchorId) {
                _toggleSelect(groupId);
                return;
            }
            const anchorIdx  = _getRenderedIndex(_anchorId);
            const clickedIdx = _getRenderedIndex(groupId);
            if (anchorIdx === -1 || clickedIdx === -1) { _toggleSelect(groupId); return; }

            // Direction-aware walk from anchor → clicked so insertion order
            // is chronological. `[..._selectedIds]` yields click order even
            // after shift-range rebuild. See `el.getSelectionOrder` below.
            _selectedIds.clear();
            const step = clickedIdx >= anchorIdx ? 1 : -1;
            for (let i = anchorIdx; i !== clickedIdx + step; i += step) {
                _selectedIds.add(_renderedOrder[i].id);
            }
            if (!_selectionMode) _enterSelectionMode();
            _syncCardSelectedState();
        }

        function _replaceSelectionWith(groupId) {
            _selectedIds.clear();
            _selectedIds.add(groupId);
            _anchorId = groupId;
            if (!_selectionMode) _enterSelectionMode();
            _syncCardSelectedState();
        }

        function _syncCardSelectedState() {
            const order = [..._selectedIds];
            const showBadges = order.length >= 2;
            const numberById = new Map();
            if (showBadges) order.forEach((id, i) => numberById.set(id, i + 1));
            _cardMap.forEach(({ card }, id) => {
                card.el.setSelected(_selectedIds.has(id));
                card.el.setSelectionBadge?.(numberById.get(id) || 0);
            });
        }

        // ── Grid size slider (5 levels via MpiProgressBar) ──────────────────────

        const slider = MpiProgressBar.mount(sliderWrap, {
            min: 1, max: 5, step: 1, value: state.gallerySizeLevel,
            interactive: true,
            wheel: true,
            handle: true,
            info: 'Size: {value}',
        });

        const SIZE_MAP = { 1: 160, 2: 224, 3: 288, 4: 384, 5: 512 };
        let _cardWidth = SIZE_MAP[state.gallerySizeLevel] || 288;

        slider.on('input', ({ value }) => {
            state.gallerySizeLevel = value;
            _cardWidth = SIZE_MAP[value] || 288;
            _rerenderJustified('size');
        });

        const incrementSlider = () => {
            const input = qs('.mpi-progress__input', sliderWrap);
            const currentValue = parseFloat(input.value);
            const nextValue = Math.min(5, currentValue + 1);
            input.value = nextValue;
            input.dispatchEvent(new Event('input'));
        };

        const decrementSlider = () => {
            const input = qs('.mpi-progress__input', sliderWrap);
            const currentValue = parseFloat(input.value);
            const nextValue = Math.max(1, currentValue - 1);
            input.value = nextValue;
            input.dispatchEvent(new Event('input'));
        };

        _unsubs.push(Hotkeys.bind('gallery.size.inc', incrementSlider));
        _unsubs.push(Hotkeys.bind('gallery.size.dec', decrementSlider));

        // ── Card rendering helper ─────────────────────────────────────────────

        function _makeCard(group) {
            const wrapper = ce('div', { className: 'mpi-gallery-grid__card-wrap' });
            const cardEl = ce('div', { className: 'mpi-group-card' });

            cardEl.innerHTML = `
                <div class="mpi-group-card__media">
                    <div class="mpi-group-card__thumb mpi-group-card__thumb--empty"></div>
                    <div class="mpi-group-card__preview">
                        <div class="mpi-group-card__spinner"></div>
                    </div>
                </div>
                <div class="mpi-group-card__top-badge"></div>
                <div class="mpi-group-card__order-badge mpi-selection-order-badge" style="display:none"></div>
                <div class="mpi-group-card__fav-wrap"></div>
                <div class="mpi-group-card__reuse-wrap"></div>
                <div class="mpi-group-card__preview-badge">PREVIEW</div>
                <div class="mpi-group-card__stage2-badge" hidden></div>
                <div class="mpi-group-card__assets-badge" hidden></div>
                <div class="mpi-group-card__continue-spinner"></div>
                <div class="mpi-group-card__preview-actions">
                    <div class="mpi-group-card__continue-wrap"></div>
                    <div class="mpi-group-card__finish-wrap"></div>
                </div>
                <div class="mpi-group-card__queued-actions">
                    <div class="mpi-group-card__pop-wrap"></div>
                </div>
                <div class="mpi-group-card__overlay">
                    <span class="mpi-group-card__name"></span>
                    <span class="mpi-group-card__sub"></span>
                </div>
            `;

            wrapper.appendChild(cardEl);

            let thumb        = qs('.mpi-group-card__thumb', cardEl);
            const preview    = qs('.mpi-group-card__preview', cardEl);
            const spinner    = qs('.mpi-group-card__spinner', cardEl);
            let previewImg   = null;
            const nameEl     = qs('.mpi-group-card__name', cardEl);
            const subEl      = qs('.mpi-group-card__sub', cardEl);
            const topBadgeEl   = qs('.mpi-group-card__top-badge', cardEl);
            const favWrap      = qs('.mpi-group-card__fav-wrap', cardEl);
            const reuseWrap    = qs('.mpi-group-card__reuse-wrap', cardEl);
            const continueWrap = qs('.mpi-group-card__continue-wrap', cardEl);
            const finishWrap   = qs('.mpi-group-card__finish-wrap', cardEl);
            const popWrap      = qs('.mpi-group-card__pop-wrap', cardEl);
            const stage2Badge  = qs('.mpi-group-card__stage2-badge', cardEl);
            const assetsBadge  = qs('.mpi-group-card__assets-badge', cardEl);

            let _generating = false;
            let _showInfo   = false;
            let _favourite  = group?.favourite || false;

            const _favBtn = MpiButton.mount(favWrap, {
                icon: 'heartOutline', iconActive: 'heart',
                toggleable: true, active: _favourite,
                size: 'sm', variant: 'ghost', info: 'Favourite',
            });

            _favBtn.on('toggle', ({ active }) => {
                _favourite = active;
                if (group) {
                    group.favourite = active;
                    emit('favourite', { group, favourite: active });
                }
                cardEl.classList.toggle('mpi-group-card--favourited', active);
            });

            const _reuseBtn = MpiButton.mount(reuseWrap, {
                icon: 'refresh_stroke', size: 'sm', variant: 'ghost', info: 'Reuse Prompt',
            });

            _reuseBtn.on('click', (e) => {
                e.originalEvent?.stopPropagation();
                const selected = group?.history?.[group.selectedIndex];
                if (!selected) return;
                emit('reuse', { positive: selected.prompt || '', negative: selected.negativePrompt || '' });
            });

            const _continueBtn = MpiButton.mount(continueWrap, {
                icon: 'frameForward', size: 'sm', variant: 'primary',
                info: 'Create new from this preview',
            });

            _continueBtn.on('click', (e) => {
                e.originalEvent?.stopPropagation();
                const selected = group?.history?.[group.selectedIndex];
                if (!selected) return;
                emit('preview:continue', { group, item: selected });
            });

            const _finishBtn = MpiButton.mount(finishWrap, {
                icon: 'check', size: 'sm', variant: 'primary',
                info: 'Complete this video',
            });

            _finishBtn.on('click', (e) => {
                e.originalEvent?.stopPropagation();
                const selected = group?.history?.[group.selectedIndex];
                if (!selected) return;
                emit('preview:finish', { group, item: selected });
            });

            // Branching Continue is per-op (allowsBranchingContinue). When the
            // op disallows it (e.g. LTX, future single-LoRA models), hide the
            // Continue button — only Finish + Discard remain.
            const _sel0 = group?.history?.[group.selectedIndex];
            const _allowBranch = _sel0?.operation
                ? commandAllowsBranchingContinue(_sel0.operation)
                : false;
            continueWrap.style.display = _allowBranch ? '' : 'none';

            const _popBtn = MpiButton.mount(popWrap, {
                icon: 'close', size: 'sm', variant: 'primary',
                info: 'Cancel queued continue (returns to Continue / Discard)',
                label: 'Cancel',
            });

            _popBtn.on('click', (e) => {
                e.originalEvent?.stopPropagation();
                const selected = group?.history?.[group.selectedIndex];
                if (!selected) return;
                emit('preview:pop-continue', { group, item: selected });
            });

            let _videoThumb = null;

            function _isPreviewLoaded() {
                return previewImg?.classList.contains('mpi-group-card__preview-img--loaded')
                    && !!previewImg.getAttribute('src');
            }

            function _ensurePreviewImage() {
                if (previewImg) return previewImg;
                previewImg = document.createElement('img');
                previewImg.className = 'mpi-group-card__preview-img';
                previewImg.alt = '';
                previewImg.onload = () => {
                    previewImg?.classList.add('mpi-group-card__preview-img--loaded');
                    spinner.style.display = 'none';
                };
                preview.appendChild(previewImg);
                return previewImg;
            }

            function _setPreviewImageSrc(img, url) {
                if (!url) return;
                if (img.dataset.previewSrc === url) {
                    if (_isPreviewLoaded()) spinner.style.display = 'none';
                    return;
                }
                if (img.dataset.pendingPreviewSrc === url) return;

                img.dataset.pendingPreviewSrc = url;
                if (!_isPreviewLoaded()) spinner.style.display = '';

                const next = new Image();
                next.onload = () => {
                    if (img.dataset.pendingPreviewSrc !== url) return;
                    img.src = url;
                    img.dataset.previewSrc = url;
                    delete img.dataset.pendingPreviewSrc;
                    img.classList.add('mpi-group-card__preview-img--loaded');
                    spinner.style.display = 'none';
                };
                next.onerror = () => {
                    if (img.dataset.pendingPreviewSrc === url) delete img.dataset.pendingPreviewSrc;
                    if (!img.dataset.previewSrc) {
                        img.classList.remove('mpi-group-card__preview-img--loaded');
                        spinner.style.display = '';
                    }
                };
                next.src = url;
                if (next.complete && next.naturalWidth > 0) {
                    next.onload();
                }
            }

            function _clearPreviewImage() {
                previewImg?.remove();
                previewImg = null;
            }

            function _replaceThumb(nextThumb) {
                if (thumb === nextThumb) return;
                thumb.replaceWith(nextThumb);
                thumb = nextThumb;
            }

            function _cacheLoadedAspectRatio(mediaEl) {
                const w = mediaEl.naturalWidth || mediaEl.videoWidth || 0;
                const h = mediaEl.naturalHeight || mediaEl.videoHeight || 0;
                if (!group?.id || w <= 0 || h <= 0) return;
                _setAspectRatioCache(group, w / h);
            }

            function _requestStabilizingRender(mediaEl) {
                if (!group?.id) return;
                _cacheLoadedAspectRatio(mediaEl);
                if (_getDataAspectRatio(group)) return;
                const key = _ratioCacheKey(group);
                if (_stabilizedIds.has(key)) return;
                _stabilizedIds.add(key);
                _rerenderJustified('media-load');
            }

            function _swapThumbToImage(src, selected) {
                let imageThumb = thumb instanceof HTMLImageElement ? thumb : null;
                if (!imageThumb || imageThumb.classList.contains('mpi-group-card__thumb--video')) {
                    imageThumb = document.createElement('img');
                    imageThumb.className = 'mpi-group-card__thumb';
                    imageThumb.alt = '';
                    imageThumb.draggable = true;
                    _replaceThumb(imageThumb);
                    _videoThumb = null;
                }
                imageThumb.style.visibility = '';
                imageThumb.onload = () => {
                    imageThumb.classList.add('mpi-group-card__thumb--loaded');
                    cardEl.classList.remove('mpi-group-card--missing');
                    _requestStabilizingRender(imageThumb);
                };
                imageThumb.onerror = () => {
                    cardEl.classList.add('mpi-group-card--missing');
                    _swapThumbToEmpty();
                    emit('media-missing', { group, itemId: selected?.id });
                };

                if (imageThumb.getAttribute('src') === src) {
                    if (imageThumb.complete && imageThumb.naturalWidth > 0) {
                        imageThumb.classList.add('mpi-group-card__thumb--loaded');
                        cardEl.classList.remove('mpi-group-card--missing');
                        _cacheLoadedAspectRatio(imageThumb);
                    }
                    return;
                }

                if (!imageThumb.classList.contains('mpi-group-card__thumb--loaded')) {
                    imageThumb.classList.remove('mpi-group-card__thumb--loaded');
                }
                imageThumb.src = src;
            }

            function _swapThumbToEmpty() {
                const emptyThumb = document.createElement('div');
                emptyThumb.className = 'mpi-group-card__thumb mpi-group-card__thumb--empty';
                _replaceThumb(emptyThumb);
                _videoThumb = null;
                cardEl.classList.remove('mpi-group-card--missing');
            }

            function _swapThumbToBackgroundImage(src) {
                const bgThumb = document.createElement('div');
                bgThumb.className = 'mpi-group-card__thumb mpi-group-card__thumb--bg';
                bgThumb.style.backgroundImage = `url("${String(src).replaceAll('"', '\\"')}")`;
                _replaceThumb(bgThumb);
                _videoThumb = null;
                cardEl.classList.remove('mpi-group-card--missing');

                // CSS background-image has no naturalWidth/onload — measure via
                // hidden Image() so the card adopts input aspect when group dims
                // are unset (no-ratio-control ops like upscale with grid OFF).
                const probe = new Image();
                probe.onload = () => _requestStabilizingRender(probe);
                probe.src = src;
            }

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
                        _requestStabilizingRender(_videoThumb);
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
                    _videoThumb.dataset.mpiDragBound = '1';
                    _videoThumb.addEventListener('dragstart', (e) => {
                        const sel = group?.history?.[group.selectedIndex];
                        e.dataTransfer.setData('application/mpi-media', JSON.stringify({
                            groupId: group.id, itemId: sel?.id,
                            filePath: sel?.filePath, type: group.type,
                        }));
                    });
                    _replaceThumb(_videoThumb);
                }
                _videoThumb.src = src;
            }

            function _render() {
                if (!group) return;
                const selected = group.history?.[group.selectedIndex];
                const src = selected?.filePath || '';

                if (src) {
                    const isVideo = selected?.type === 'video' || (group.type === 'video' && selected?.type !== 'image');
                    if (selected?.inputPreview) {
                        _swapThumbToBackgroundImage(src);
                    } else if (isVideo) {
                        _swapThumbToVideo(src);
                    } else {
                        _swapThumbToImage(src, selected);
                    }
                } else {
                    _swapThumbToEmpty();
                }

                nameEl.textContent = selected?.name || group.name || '';

                // Top-left badge: SDXL · UPSCALE / IMPORTED / WAN 2.2 SMOOTH · 5S / INTERPOLATE · 12S
                const model = getModelById(selected?.modelId);
                const command = getCommand(selected?.operation);
                let badgeText = '';
                if (selected?.uploaded) {
                    badgeText = 'IMPORTED';
                } else if (group.type === 'video') {
                    const duration = Number(selected?.duration);
                    const dur = Number.isFinite(duration) && duration > 0
                        ? `${Math.max(1, Math.round(duration))}S`
                        : '';
                    const sourceLabel = command?.universal
                        ? command.label
                        : (model?.name || selected?.modelId || command?.label || selected?.operation);
                    badgeText = [sourceLabel, dur]
                        .filter(Boolean)
                        .map(s => String(s).toUpperCase())
                        .join(' · ');
                } else {
                    badgeText = [model?.name, selected?.operation]
                        .filter(Boolean)
                        .map(s => String(s).toUpperCase())
                        .join(' · ');
                }
                topBadgeEl.textContent = badgeText;
                topBadgeEl.classList.toggle('mpi-group-card__top-badge--hidden', !badgeText);

                // Bottom-left sub-line: dims · time · "prompt snippet"
                const dims = selected?.pixelDimensions;
                const dimStr = (dims?.w && dims?.h) ? `${dims.w} × ${dims.h}` : '';
                let timeStr = '';
                const ms = selected?.generationMs;
                if (ms && ms > 0) {
                    const totalSec = Math.max(1, Math.round(ms / 1000));
                    if (totalSec >= 60) {
                        const m = Math.floor(totalSec / 60);
                        const s = totalSec % 60;
                        timeStr = s ? `${m}m ${s}s` : `${m}m`;
                    } else {
                        timeStr = `${totalSec}s`;
                    }
                }
                let snippet = '';
                if (selected?.prompt) {
                    const trimmed = selected.prompt.trim();
                    if (trimmed) {
                        snippet = trimmed.length > 30 ? `"${trimmed.slice(0, 30)}…"` : `"${trimmed}"`;
                    }
                }
                subEl.textContent = [dimStr, timeStr, snippet].filter(Boolean).join(' · ');

                if (!thumb.dataset.mpiDragBound) {
                    thumb.dataset.mpiDragBound = '1';
                    thumb.addEventListener('dragstart', (e) => {
                        const sel = group?.history?.[group.selectedIndex];
                        e.dataTransfer.setData('application/mpi-media', JSON.stringify({
                            groupId: group.id, itemId: sel?.id,
                            filePath: sel?.filePath, type: group.type,
                        }));
                    });
                }

                _favourite = group?.favourite || false;
                _favBtn.el.setActive(_favourite);
                cardEl.classList.toggle('mpi-group-card--favourited', _favourite);

                const _isPreview = selected?.stage === 'preview';
                cardEl.classList.toggle('mpi-group-card--preview', _isPreview);
            }

            // ── Selection state ──────────────────────────────────────────────
            cardEl.setSelected = (val) => {
                cardEl.classList.toggle('mpi-group-card--selected', val);
            };

            const _orderBadge = qs('.mpi-group-card__order-badge', cardEl);
            cardEl.setSelectionBadge = (n) => {
                if (n && n > 0) {
                    _orderBadge.textContent = `#${n}`;
                    _orderBadge.style.display = '';
                } else {
                    _orderBadge.style.display = 'none';
                }
            };

            // ── Click handling ───────────────────────────────────────────────
            cardEl.addEventListener('click', (e) => {
                if (_generating) return;
                if (favWrap.contains(e.target)) return;
                if (reuseWrap.contains(e.target)) return;
                if (continueWrap.contains(e.target)) return;
                if (finishWrap.contains(e.target)) return;

                // Preview-stage cards behave like any other card for
                // selection (shift/ctrl/right-click) but cannot be
                // "opened" into history — they stay on the gallery.
                const _selectedNow = group?.history?.[group.selectedIndex];
                const _isPreviewNow = _selectedNow?.stage === 'preview';

                if (e.shiftKey) {
                    e.preventDefault();
                    _rangeSelect(group.id);
                } else if (e.ctrlKey || e.metaKey) {
                    _toggleSelect(group.id);
                } else if (_selectionMode) {
                    _toggleSelect(group.id);
                } else if (!_isPreviewNow) {
                    emit('open-group', { group });
                }
            });

            // ── Right-click context menu ─────────────────────────────────────
            cardEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();

                if (!_selectedIds.has(group.id)) {
                    _replaceSelectionWith(group.id);
                }

                const compareDisabled = _selectedIds.size !== 2;
                // Combine: ≥2 selected AND every selected group is a video group.
                // Selection order preserved via _selectedIds Set insertion order
                // — passed through el.getSelectionOrder() at handler time.
                const _selectedVideoCount = Array.from(_selectedIds)
                    .map(id => _groups.find(g => g.id === id))
                    .filter(g => g && g.type === 'video').length;
                const combineDisabled = _selectedIds.size < 2 || _selectedVideoCount !== _selectedIds.size;
                MpiContextMenu.show({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                        { key: 'compare',  icon: 'compare',  label: 'Compare',  disabled: compareDisabled },
                        { key: 'combine',  icon: 'merge',    label: 'Combine',  disabled: combineDisabled },
                        { key: 'download', icon: 'download', label: 'Download' },
                        { key: 'delete',   icon: 'trash',    label: 'Delete',   danger: true },
                    ],
                    onSelect: (key) => {
                        // Use insertion-order id list to preserve chronological
                        // click sequence for Combine output. Map → group objects.
                        const orderedIds = Array.from(_selectedIds);
                        const selected = orderedIds
                            .map(id => _groups.find(g => g.id === id))
                            .filter(Boolean);
                        if (key === 'compare')  emit('compare',  { groups: selected });
                        if (key === 'combine')  emit('combine',  { groups: selected });
                        if (key === 'download') emit('download', { groups: selected });
                        if (key === 'delete')   emit('delete',   { groups: selected });
                        _exitSelectionMode();
                    },
                });
            });

            // Apply initial selection state
            if (_selectedIds.has(group.id)) {
                cardEl.setSelected(true);
                if (_selectedIds.size >= 2) {
                    const idx = [..._selectedIds].indexOf(group.id);
                    if (idx >= 0) cardEl.setSelectionBadge(idx + 1);
                }
            }

            // ── Public methods ───────────────────────────────────────────────
            cardEl.setGenerating = (previewUrl = null) => {
                _generating = true;
                cardEl.classList.add('mpi-group-card--generating');
                preview.classList.add('mpi-group-card__preview--visible');
                spinner.style.display = previewUrl && _isPreviewLoaded() ? 'none' : '';
                if (thumb.getAttribute('src') !== EMPTY_IMAGE_SRC) {
                    thumb.style.visibility = '';
                } else {
                    thumb.style.visibility = 'hidden';
                }
                if (previewUrl) {
                    const img = _ensurePreviewImage();
                    _setPreviewImageSrc(img, previewUrl);
                } else {
                    _clearPreviewImage();
                }
            };

            cardEl.updatePreview = (previewUrl) => {
                if (!_generating) return;
                const img = _ensurePreviewImage();
                _setPreviewImageSrc(img, previewUrl);
            };

            cardEl.setDone = (newGroup) => {
                group = newGroup;
                _generating = false;
                cardEl.classList.remove('mpi-group-card--generating');
                preview.classList.remove('mpi-group-card__preview--visible');
                _clearPreviewImage();
                _render();
            };

            cardEl.setGroup = (newGroup) => {
                if (newGroup) group = newGroup;
            };

            cardEl.setShowInfo = (val) => {
                _showInfo = val;
                cardEl.classList.toggle('mpi-group-card--show-info', val);
            };

            cardEl.setContinuing = (val) => {
                cardEl.classList.toggle('mpi-group-card--continuing', !!val);
            };

            cardEl.setQueuedContinue = (val) => {
                cardEl.classList.toggle('mpi-group-card--queued-continue', !!val);
            };

            cardEl.setStage2Count = (n) => {
                const count = Math.max(0, Number(n) || 0);
                if (count <= 0) {
                    stage2Badge.hidden = true;
                    stage2Badge.textContent = '';
                    return;
                }
                stage2Badge.hidden = false;
                stage2Badge.textContent = `x${count}`;
            };

            cardEl.setPreviewAssetsWarning = (state) => {
                // null / undefined → clear badge + restore action buttons.
                cardEl.classList.remove(
                    'mpi-group-card--assets-fallback',
                    'mpi-group-card--assets-blocked',
                );
                if (!state || (!state.mode)) {
                    assetsBadge.hidden = true;
                    assetsBadge.textContent = '';
                    assetsBadge.removeAttribute('title');
                    return;
                }
                if (state.mode === 'fallback') {
                    assetsBadge.hidden = false;
                    assetsBadge.textContent = 'Cold';
                    assetsBadge.title = 'Latent missing — stage 1 will rerun (slower).';
                    cardEl.classList.add('mpi-group-card--assets-fallback');
                } else if (state.mode === 'blocked') {
                    assetsBadge.hidden = false;
                    assetsBadge.textContent = 'Missing';
                    const list = Array.isArray(state.missing) && state.missing.length
                        ? state.missing.map(m => m.kind === 'snapshot' ? `${m.role} image` : m.kind).join(', ')
                        : 'support assets';
                    assetsBadge.title = `Cannot continue/finish — missing ${list}. Delete this preview.`;
                    cardEl.classList.add('mpi-group-card--assets-blocked');
                }
            };

            cardEl.refreshGroup = (newGroup) => {
                if (newGroup) group = newGroup;
                if (!group?.isGenerating) {
                    _generating = false;
                    cardEl.classList.remove('mpi-group-card--generating');
                    preview.classList.remove('mpi-group-card__preview--visible');
                    _clearPreviewImage();
                }
                _render();
            };

            _render();

            return { card: { el: cardEl }, wrapper };
        }

        // ── Justified Layout helpers ─────────────────────────────────────────
        // REDESIGN-DEVIATION: Stage spec calls for asymmetric 7-5/4-4-4/5-7 strip
        // cycle, but justified layout retained — slider/+- hotkeys are a core UX
        // feature users rely on. Strip layout makes card size non-interactive.
        // Gap bumped 2px→8px for visual breathing room per Stage intent.

        const GAP = 8;

        function _ratioCacheKey(group) {
            const sel = group?.history?.[group.selectedIndex];
            return [group?.id || '', sel?.id || '', sel?.filePath || ''].join('|');
        }

        function _getDataAspectRatio(group) {
            const sel = group?.history?.[group.selectedIndex];
            const px = sel?.pixelDimensions;
            if (px?.w > 0 && px?.h > 0) return px.w / px.h;
            if (group?.width > 0 && group?.height > 0) return group.width / group.height;
            return null;
        }

        function _setAspectRatioCache(group, ratio) {
            if (!group?.id || !Number.isFinite(ratio) || ratio <= 0) return;
            _aspectRatioCache.set(group.id, { key: _ratioCacheKey(group), ratio });
        }

        function _getCachedAspectRatio(group) {
            const cached = _aspectRatioCache.get(group?.id);
            if (!cached || cached.key !== _ratioCacheKey(group)) return null;
            return cached.ratio;
        }

        function _getAspectRatio(group) {
            const dataRatio = _getDataAspectRatio(group);
            if (dataRatio) {
                _setAspectRatioCache(group, dataRatio);
                return dataRatio;
            }
            const cachedRatio = _getCachedAspectRatio(group);
            if (cachedRatio) return cachedRatio;
            return 1.0;
        }

        let _renderTimeout = null;
        let _pendingRenderReasons = new Set();
        let _lastObservedGridWidth = null;
        let _lastRenderLogAt = 0;

        function _getGroupRenderKey(group) {
            const sel = group?.history?.[group.selectedIndex];
            const dims = sel?.pixelDimensions;
            return [
                group?.id || '',
                group?.name || '',
                group?.type || '',
                group?.selectedIndex ?? '',
                group?.favourite ? 'fav' : '',
                group?.isGenerating ? 'generating' : '',
                sel?.id || '',
                sel?.filePath || '',
                sel?.thumbPath || '',
                sel?.type || '',
                sel?.stage || '',
                sel?.operation || '',
                sel?.modelId || '',
                sel?.uploaded ? 'uploaded' : '',
                dims?.w || '',
                dims?.h || '',
                sel?.duration || '',
                sel?.generationMs || '',
                sel?.prompt || '',
            ].join('|');
        }

        function _getCardEntry(group) {
            const renderKey = _getGroupRenderKey(group);
            let entry = _cardMap.get(group.id);
            if (!entry) {
                const { card, wrapper } = _makeCard(group);
                entry = { card, el: wrapper, renderKey };
                _cardMap.set(group.id, entry);
                return entry;
            }

            entry.card.el.setGroup?.(group);
            if (entry.renderKey !== renderKey) {
                entry.card.el.refreshGroup?.(group);
                entry.renderKey = renderKey;
            }
            return entry;
        }

        function _cleanupDetachedState(activeIds) {
            for (const [id, entry] of _cardMap) {
                if (activeIds.has(id)) continue;
                entry.el.remove();
                _cardMap.delete(id);
            }
            for (const [id] of _aspectRatioCache) {
                if (!activeIds.has(id) && !_groups.some(g => g.id === id)) {
                    _aspectRatioCache.delete(id);
                }
            }
            for (const key of _stabilizedIds) {
                const id = String(key).split('|')[0];
                if (!activeIds.has(id) && !_groups.some(g => g.id === id)) {
                    _stabilizedIds.delete(key);
                }
            }
        }

        function _logRender(reason, data) {
            const enabled = window.localStorage?.getItem('mpi_gallery_layout_debug') === '1';
            if (!enabled) return;
            const now = Date.now();
            if (now - _lastRenderLogAt < 500) return;
            _lastRenderLogAt = now;
            clientLogger.info('MpiGalleryGrid', `layout ${JSON.stringify({ reason, ...data })}`);
        }

        function _rerenderJustified(reason = 'manual') {
            _pendingRenderReasons.add(reason);
            if (_renderTimeout) clearTimeout(_renderTimeout);
            _renderTimeout = setTimeout(() => {
                const renderReason = [..._pendingRenderReasons].join(',');
                _pendingRenderReasons.clear();

                const { order, filter } = state.gallerySort;

                let display = _groups.filter(g => {
                    if (filter === 'images')   return g.type === 'image';
                    if (filter === 'videos')    return g.type === 'video';
                    if (filter === 'previews')  return g.history?.[g.selectedIndex]?.stage === 'preview';
                    if (filter === 'favorites') return g.favourite === true;
                    return true;
                });

                display.sort((a, b) => {
                    const ta = new Date(a.createdAt).getTime();
                    const tb = new Date(b.createdAt).getTime();
                    return order === 'newest' ? tb - ta : ta - tb;
                });

                const generatingGroups = display.filter(g => g.isGenerating);
                const normalGroups     = display.filter(g => !g.isGenerating);
                const allGroups        = [...generatingGroups, ...normalGroups];

                // Store rendered order for ID-based range selection
                _renderedOrder = allGroups;

                const gridStyle    = getComputedStyle(grid);
                const paddingX     = (parseFloat(gridStyle.paddingLeft) || 0) + (parseFloat(gridStyle.paddingRight) || 0);
                const containerWidth = Math.max(1, grid.clientWidth - paddingX);

                const items = allGroups.map(group => ({
                    id: group.id,
                    aspectRatio: _getAspectRatio(group),
                }));

                const rows = buildJustifiedRows(items, containerWidth, _cardWidth, GAP);

                const allGroupsMap = new Map(allGroups.map(g => [g.id, g]));
                const activeIds = new Set(allGroups.map(g => g.id));
                const fragment = document.createDocumentFragment();
                const prevScrollTop = grid.scrollTop;

                rows.forEach(({ items: rowItems, rowHeight }) => {
                    const rowEl = ce('div', { className: 'mpi-gallery-grid__row' });
                    rowEl.style.height = `${rowHeight}px`;

                    rowItems.forEach(({ id, width, height }) => {
                        const group = allGroupsMap.get(id);
                        const entry = _getCardEntry(group);
                        const { card } = entry;
                        const wrapper = entry.el;
                        wrapper.className = 'mpi-gallery-grid__row-wrap';
                        wrapper.style.width  = `${width}px`;
                        wrapper.style.height = `${height}px`;

                        rowEl.appendChild(wrapper);

                        if (group.isGenerating) {
                            card.el.setGenerating(group.latestPreviewUrl ?? null);
                        }

                    });

                    fragment.appendChild(rowEl);
                });

                _cleanupDetachedState(activeIds);
                grid.replaceChildren(fragment);
                if (grid.scrollTop !== prevScrollTop) {
                    const maxScrollTop = Math.max(0, grid.scrollHeight - grid.clientHeight);
                    grid.scrollTop = Math.min(prevScrollTop, maxScrollTop);
                }

                _syncCardSelectedState();
                _cardMap.forEach(({ card }) => card.el.setShowInfo?.(state.galleryShowInfo));
                _continuingIds.forEach(id => _cardMap.get(id)?.card?.el?.setContinuing?.(true));
                _queuedContinueIds.forEach(id => _cardMap.get(id)?.card?.el?.setQueuedContinue?.(true));
                _stage2Counts.forEach((n, id) => _cardMap.get(id)?.card?.el?.setStage2Count?.(n));
                _previewWarnings.forEach((s, id) => _cardMap.get(id)?.card?.el?.setPreviewAssetsWarning?.(s));

                _logRender(renderReason, {
                    groups: allGroups.length,
                    rows: rows.length,
                    width: containerWidth,
                    cardWidth: _cardWidth,
                });
            }, 16);
        }

        // ── ResizeObserver ───────────────────────────────────────────────────

        const resizeObserver = new ResizeObserver((entries) => {
            const width = Math.round(entries[0]?.contentRect?.width || grid.clientWidth || 0);
            if (width === _lastObservedGridWidth) return;
            _lastObservedGridWidth = width;
            _rerenderJustified('resize');
        });
        resizeObserver.observe(grid);
        _unsubs.push(() => resizeObserver.disconnect());

        // Forward wheel events from empty grid space to scroll the grid.
        // Native scroll already covers cards; this catches gaps/below-last-row
        // areas where Electron sometimes drops wheel-to-scroll on flex parents.
        _unsubs.push(on(grid, 'wheel', (e) => {
            if (e.ctrlKey) return;
            if (e.target?.closest?.('.mpi-group-card')) return;
            e.preventDefault();
            grid.scrollTop += e.deltaY;
        }, { passive: false }));

        // ── Info toggle button ───────────────────────────────────────────────

        const infoBtnSlot = qs('.mpi-gallery-grid__info-btn-slot', el);
        const infoBtn = MpiButton.mount(infoBtnSlot, {
            icon: 'info', size: 'sm', variant: 'ghost', toggleable: true,
            active: state.galleryShowInfo, info: 'Show card info',
        });
        infoBtn.on('click', () => { state.galleryShowInfo = !state.galleryShowInfo; });
        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 'galleryShowInfo') {
                infoBtn.el.classList.toggle('mpi-btn--active', state.galleryShowInfo);
                _cardMap.forEach(({ card }) => card.el.setShowInfo?.(state.galleryShowInfo));
            }
        }));

        // ── Gallery organize tabs ────────────────────────────────────────────

        const tabsEl = qs('.mpi-gallery-grid__tabs', el);
        const _tabInstances = [];

        const _tabDefs = [
            { order: 'newest',    label: 'Newest' },
            { order: 'oldest',    label: 'Oldest' },
            { filter: 'all',       label: 'All' },
            { filter: 'images',    label: 'Images' },
            { filter: 'videos',    label: 'Videos' },
            { filter: 'previews',  label: 'Previews' },
            { filter: 'favorites', label: 'Favs' },
        ];

        _tabDefs.forEach(({ order, filter, label }) => {
            const key  = order ? `[data-order="${order}"]` : `[data-filter="${filter}"]`;
            const slot = qs(key, tabsEl);
            if (!slot) return;
            const initialActive = order
                ? state.gallerySort.order === order
                : state.gallerySort.filter === filter;
            const btn = MpiButton.mount(slot, {
                text: label, variant: 'ghost', size: 'sm',
                extraClasses: `mpi-gallery-grid__tab${initialActive ? ' mpi-gallery-grid__tab--active' : ''}`,
            });
            btn.on('click', () => {
                if (order) state.gallerySort = { ...state.gallerySort, order };
                else       state.gallerySort = { ...state.gallerySort, filter };
            });
            _tabInstances.push({ btn, order, filter });
        });

        function _syncTabActive() {
            const { order, filter } = state.gallerySort;
            _tabInstances.forEach(({ btn, order: o, filter: f }) => {
                const active = o ? o === order : f === filter;
                btn.el.classList.toggle('mpi-gallery-grid__tab--active', active);
            });
        }

        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 'gallerySort') { _syncTabActive(); _rerenderJustified('sort'); }
        }));

        _rerenderJustified('init');

        // ── Public API ───────────────────────────────────────────────────────

        el.setGroups = (groups) => {
            _groups = groups || [];
            _selectedIds.clear();
            _rerenderJustified('setGroups');
        };

        el.updatePreview = (tempId, previewUrl) => {
            _cardMap.get(tempId)?.card.el.updatePreview(previewUrl);
        };

        el.removeCard = (groupId) => {
            const entry = _cardMap.get(groupId);
            if (!entry) return;
            entry.el.remove();
            _cardMap.delete(groupId);
            _aspectRatioCache.delete(groupId);
            for (const key of _stabilizedIds) {
                if (String(key).startsWith(`${groupId}|`)) _stabilizedIds.delete(key);
            }
            _groups = _groups.filter(g => g.id !== groupId);
        };

        el.getCardByGroupId = (groupId) => {
            const entry = _cardMap.get(groupId);
            return entry?.card?.el || null;
        };

        el.markContinuing = (groupId, val) => {
            if (val) _continuingIds.add(groupId);
            else     _continuingIds.delete(groupId);
            _cardMap.get(groupId)?.card?.el?.setContinuing?.(!!val);
        };

        el.markQueuedContinue = (groupId, val) => {
            if (val) _queuedContinueIds.add(groupId);
            else     _queuedContinueIds.delete(groupId);
            _cardMap.get(groupId)?.card?.el?.setQueuedContinue?.(!!val);
        };

        el.setStage2Count = (groupId, n) => {
            const count = Math.max(0, Number(n) || 0);
            if (count <= 0) _stage2Counts.delete(groupId);
            else            _stage2Counts.set(groupId, count);
            _cardMap.get(groupId)?.card?.el?.setStage2Count?.(count);
        };

        /**
         * Push preview-assets validation state onto a card.
         * @param {string} groupId
         * @param {{ mode: 'fallback' | 'blocked', missing?: Array }|null} state
         */
        el.setPreviewAssetsWarning = (groupId, state) => {
            if (!state || !state.mode) _previewWarnings.delete(groupId);
            else                       _previewWarnings.set(groupId, state);
            _cardMap.get(groupId)?.card?.el?.setPreviewAssetsWarning?.(state);
        };

        el.clearAllQueuedContinue = () => {
            const ids = [..._queuedContinueIds];
            _queuedContinueIds.clear();
            for (const id of ids) {
                _cardMap.get(id)?.card?.el?.setQueuedContinue?.(false);
            }
            return ids;
        };

        el.refreshGroup = (newGroup) => {
            if (!newGroup?.id) return;
            const idx = _groups.findIndex(g => g.id === newGroup.id);
            if (idx !== -1) _groups[idx] = newGroup;
            const entry = _cardMap.get(newGroup.id);
            if (entry) {
                entry.card?.el?.refreshGroup?.(newGroup);
                entry.renderKey = _getGroupRenderKey(newGroup);
            }
        };

        el.setSelectionMode = (val) => {
            if (val) _enterSelectionMode();
            else     _exitSelectionMode();
        };

        /**
         * IDs of currently selected gallery cards in click order.
         * Set iteration preserves insertion order; `_rangeSelect` walks the
         * range in click direction so the result is always chronological.
         * @returns {string[]}
         */
        el.getSelectionOrder = () => [..._selectedIds];

        el.setGeneratingCard = (wrapper, width, height) => {
            const generatingSlot = qs('.mpi-gallery-grid__generating-slot', el);
            if (!generatingSlot) return;
            wrapper.style.width  = `${width}px`;
            wrapper.style.height = `${height}px`;
            generatingSlot.innerHTML = '';
            generatingSlot.appendChild(wrapper);
            generatingSlot.classList.add('mpi-gallery-grid__generating-slot--visible');
        };

        el.clearGeneratingCard = () => {
            const generatingSlot = qs('.mpi-gallery-grid__generating-slot', el);
            if (generatingSlot) {
                generatingSlot.innerHTML = '';
                generatingSlot.classList.remove('mpi-gallery-grid__generating-slot--visible');
            }
        };

        // ── Cleanup ──────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            if (_escUnsub) { _escUnsub(); _escUnsub = null; }
            _cardMap.forEach(({ card }) => card.el.destroy?.());
            _cardMap.clear();
        };
    }
});
