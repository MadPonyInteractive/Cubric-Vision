/**
 * MpiHistoryList — Compound: history cards for a single ItemGroup.
 *
 * Owns history card DOM building, active entry selection, and multi-select mode.
 *
 * @param {import('../../../data/projectModel.js').HistoryItem[]} [history=[]] - Initial history array
 * @param {number} [selectedIndex=0] - Initially active entry index
 * @param {boolean} [isVideo=false] - Whether the group is a video group (disables Compare)
 * @param {(idx:number)=>Promise<boolean>|boolean} [hasMaskForIndex] - Optional per-entry mask availability check
 *
 * Instance API (on el):
 *   el.setActiveIndex(idx)      — highlight active card (no events)
 *   el.setGroups(history)       — replace history array and rebuild cards
 *   el.appendEntry(item)        — add a new entry card at the end
 *   el.removeEntries(indices)   — remove cards at given sorted-descending indices
 *   el.exitSelectMode()         — programmatically exit select mode
 *
 * Emits:
 *   'entry-selected'    { idx, item }              — card clicked (single-select)
 *   'selection-changed' { indices, anchor }         — selection updated
 *   'selection-exited'  {}                          — select mode ended
 *   'delete-selected'   { indices }                 — delete action from context menu
 *   'compare-requested' { indices: [number, number] } — compare action from context menu
 *   'combine-requested' { indices }                  — combine selected videos (video group, ≥2)
 *   'add-to-gallery'    { index }                    — add single selected entry to gallery
 *   'download-selected' { indices }                  — download selected entries
 *   'download-mask'     { index }                    — download single entry mask
 *   'reuse'             { positive, negative }       — reuse prompt button clicked on a card
 */

import { ComponentFactory } from '../../factory.js';
import { qs } from '../../../utils/dom.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { MpiContextMenu } from '../MpiContextMenu/MpiContextMenu.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

let _dimsLogged = false;

export const MpiHistoryList = ComponentFactory.create({
    name: 'MpiHistoryList',
    css: ['js/components/Compounds/MpiHistoryList/MpiHistoryList.css'],

    template: () => `
        <div class="mpi-history-list">
            <div class="mpi-history-list__cards" id="cards-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        /** @type {import('../../../data/projectModel.js').HistoryItem[]} */
        let _history = props.history || [];
        let _selectedIdx = props.selectedIndex ?? 0;
        const _isVideo = props.isVideo ?? false;
        let _selectMode = false;
        /** @type {Set<number>} */
        const _selection = new Set();
        let _anchor = 0;
        const _delUnsub = Hotkeys.bind('history.selection.delete', () => {
            if (_selectMode && _selection.size > 0) {
                emit('delete-selected', { indices: [..._selection] });
                return;
            }
            if (_history[_selectedIdx]) {
                emit('delete-selected', { indices: [_selectedIdx] });
            }
        });

        /** @type {HTMLElement[]} */
        const _historyCards = [];
        /** @type {Array<{el: HTMLElement, destroy: Function}>} */
        const _reuseBtns = [];

        // ── Dims helper ───────────────────────────────────────────────────────

        function _formatFps(value) {
            const fps = Number(value);
            if (!Number.isFinite(fps) || fps <= 0) return null;
            return `${Number.isInteger(fps) ? fps : fps.toFixed(1)} fps`;
        }

        function _formatDuration(value) {
            const duration = Number(value);
            if (!Number.isFinite(duration) || duration <= 0) return null;
            return `${Math.max(1, Math.round(duration))}s`;
        }

        function _dimsLabel(item, idx) {
            const w = item.pixelDimensions?.w;
            const h = item.pixelDimensions?.h;
            if (!_dimsLogged) {
                clientLogger.info('MpiHistoryList', 'entry dims', {
                    itemId: item.id,
                    w: w || 0,
                    h: h || 0,
                    source: 'pixelDimensions',
                });
                _dimsLogged = true;
            }
            const dims = (w && w > 0) ? `${w}×${h}` : '?×?';
            if (item.type === 'video' || _isVideo) {
                const duration = _formatDuration(item.duration ?? item.videoMeta?.duration);
                const fps = _formatFps(item.fps ?? item.videoMeta?.fps);
                return [dims, duration, fps].filter(Boolean).join(' \u00b7 ');
            }
            return dims;
        }

        // ── Card building ─────────────────────────────────────────────────────

        function _makeCard(item, idx) {
            const card = document.createElement('div');
            card.className = 'mpi-history-list__card';

            const thumb = document.createElement('img');
            thumb.className = 'mpi-history-list__thumb';
            thumb.alt = '';
            const srcPath = (item.type === 'video' && item.thumbPath) ? item.thumbPath : item.filePath;
            if (srcPath) thumb.src = _resolveUrl(srcPath);

            const meta = document.createElement('div');
            meta.className = 'mpi-history-list__meta';

            const label = document.createElement('div');
            label.className = 'mpi-history-list__label';
            label.textContent = item.displayName || item.operation || item.type || '';

            const dims = document.createElement('div');
            dims.className = 'mpi-history-list__dims';
            dims.textContent = _dimsLabel(item, idx);

            const extended = document.createElement('div');
            extended.className = 'mpi-history-list__extended-from';
            const extName = item.extendedFrom?.displayName;
            if (extName) {
                extended.textContent = `↳ ${extName}`;
            } else {
                extended.style.display = 'none';
            }

            const actions = document.createElement('div');
            actions.className = 'mpi-history-list__actions';

            const reuseWrap = document.createElement('span');
            reuseWrap.className = 'mpi-history-list__reuse-wrap';
            actions.append(reuseWrap);

            const status = document.createElement('span');
            status.className = 'mpi-history-list__status';

            const badge = document.createElement('span');
            badge.className = 'mpi-history-list__badge mpi-selection-order-badge';
            badge.style.display = 'none';

            meta.append(label, dims, extended);
            card.append(thumb, meta, actions, status, badge);

            const hasPrompt = !!(item.prompt || item.negativePrompt);
            if (hasPrompt) {
                const reuseBtn = MpiButton.mount(reuseWrap, {
                    icon: 'refresh_stroke', size: 'sm', variant: 'ghost', info: 'Reuse Prompt',
                });
                reuseBtn.on('click', (e) => {
                    e.originalEvent?.stopPropagation();
                    emit('reuse', { positive: item.prompt || '', negative: item.negativePrompt || '' });
                });
                _reuseBtns.push(reuseBtn);
            } else {
                reuseWrap.style.display = 'none';
            }

            card.addEventListener('mousedown', (e) => {
                if (e.shiftKey) e.preventDefault();
            });

            card.addEventListener('click', (e) => {
                if (e.shiftKey) {
                    // First shift-click without prior selection anchors at the
                    // currently-active entry, not at the stale _anchor (which
                    // defaults to 0 until something else moves it).
                    if (!_selectMode && _selection.size === 0) _anchor = _selectedIdx;
                    _rangeSelect(idx);
                } else if (e.ctrlKey || e.metaKey) {
                    if (!_selectMode && _selection.size === 0 && idx !== _selectedIdx) {
                        _selection.add(_selectedIdx);
                        _anchor = _selectedIdx;
                        _selectMode = true;
                    }
                    _toggleSelect(idx);
                } else {
                    const wasSelectMode = _selectMode;
                    _exitSelectMode();
                    _anchor = idx;
                    _selectEntry(idx);
                    if (wasSelectMode) emit('selection-exited', {});
                }
            });

            card.addEventListener('contextmenu', async (e) => {
                e.preventDefault();

                // Use existing selection if right-clicked card is part of it;
                // otherwise act on the right-clicked card alone WITHOUT entering
                // selection mode (no visual selection, no state mutation).
                const useSelection = _selection.has(idx) && _selection.size > 0;
                const targetIdxs = useSelection ? [..._selection] : [idx];

                const compareDisabled = targetIdxs.length !== 2;
                const combineDisabled = !_isVideo || targetIdxs.length < 2;
                const addToGalleryDisabled = targetIdxs.length !== 1;
                const downloadMaskDisabled = _isVideo
                    || targetIdxs.length !== 1
                    || !(await props.hasMaskForIndex?.(targetIdxs[0]));
                const items = [
                    { key: 'compare',        icon: 'compare',  label: 'Compare',        disabled: compareDisabled },
                ];
                if (_isVideo) {
                    items.push({ key: 'combine', icon: 'merge', label: 'Combine', disabled: combineDisabled });
                }
                items.push(
                    { key: 'download',       icon: 'download', label: 'Download' },
                    ...(_isVideo ? [] : [{ key: 'download-mask', icon: 'download', label: 'Download mask', disabled: downloadMaskDisabled }]),
                    { key: 'add-to-gallery', icon: 'plus',     label: 'Add to gallery', disabled: addToGalleryDisabled },
                    { key: 'delete',         icon: 'trash',    label: 'Delete',         danger: true },
                );
                MpiContextMenu.show({
                    x: e.clientX,
                    y: e.clientY,
                    items,
                    onSelect: (key) => {
                        if (key === 'delete') {
                            emit('delete-selected', { indices: targetIdxs });
                        } else if (key === 'compare') {
                            emit('compare-requested', { indices: targetIdxs });
                        } else if (key === 'combine') {
                            emit('combine-requested', { indices: targetIdxs });
                        } else if (key === 'download') {
                            emit('download-selected', { indices: targetIdxs });
                        } else if (key === 'download-mask') {
                            emit('download-mask', { index: targetIdxs[0] });
                        } else if (key === 'add-to-gallery') {
                            emit('add-to-gallery', { index: targetIdxs[0] });
                        }
                    },
                });
            });

            return card;
        }

        function _buildHistoryCards() {
            _dimsLogged = false;
            const container = qs('#cards-slot', el);
            _reuseBtns.forEach((btn) => btn.destroy?.());
            _reuseBtns.length = 0;
            container.innerHTML = '';
            _historyCards.length = 0;

            _history.forEach((item, idx) => {
                const card = _makeCard(item, idx);
                container.appendChild(card);
                _historyCards.push(card);
            });

            _applyCardStates();
        }

        function _applyCardStates() {
            _historyCards.forEach((card, idx) => {
                card.classList.toggle('mpi-history-list__card--active',   idx === _selectedIdx);
                card.classList.toggle('mpi-history-list__card--selected', _selection.has(idx));
            });
            _applyBadgeNumbers();
        }

        function _applyBadgeNumbers() {
            const order = [..._selection];
            const showBadges = order.length >= 2;
            const numberByIdx = new Map();
            if (showBadges) order.forEach((sel, i) => numberByIdx.set(sel, i + 1));
            _historyCards.forEach((card, idx) => {
                const badge = qs('.mpi-history-list__badge', card);
                if (!badge) return;
                const n = numberByIdx.get(idx);
                if (n) {
                    badge.textContent = `#${n}`;
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            });
        }

        function _selectEntry(idx) {
            _selectedIdx = idx;
            _applyCardStates();
            emit('entry-selected', { idx, item: _history[idx] });
        }

        function _toggleSelect(idx) {
            if (_selection.has(idx)) {
                _selection.delete(idx);
            } else {
                _selection.add(idx);
                _anchor = idx;
            }

            if (_selection.size > 0 && !_selectMode) _selectMode = true;
            if (_selection.size === 0 && _selectMode) {
                _exitSelectMode();
                emit('selection-exited', {});
                return;
            }

            _applyCardStates();
            emit('selection-changed', { indices: [..._selection], anchor: _anchor });
        }

        function _rangeSelect(idx) {
            // Direction-aware: walk from anchor to idx so insertion order
            // reflects chronology (anchor first, click target last).
            // `[..._selection]` therefore returns chronological order even after
            // a shift-range rebuild. See `el.getSelectionOrder` below.
            _selection.clear();
            const step = idx >= _anchor ? 1 : -1;
            for (let i = _anchor; i !== idx + step; i += step) _selection.add(i);
            _selectMode = true;
            _applyCardStates();
            emit('selection-changed', { indices: [..._selection], anchor: _anchor });
        }

        function _exitSelectMode() {
            _selectMode = false;
            _selection.clear();
            _applyCardStates();
        }

        // ── Instance API ──────────────────────────────────────────────────────

        el.setActiveIndex = (idx) => {
            _selectedIdx = idx;
            _applyCardStates();
        };

        el.setGroups = (history) => {
            _history = history;
            _selectedIdx = 0;
            _anchor = 0;
            _buildHistoryCards();
        };

        el.appendEntry = (item) => {
            _history = [..._history, item];
            const container = qs('#cards-slot', el);
            const idx = _history.length - 1;
            const card = _makeCard(item, idx);
            container.appendChild(card);
            _historyCards.push(card);
            _selectedIdx = idx;
            _anchor = idx;
            _applyCardStates();
        };

        el.replaceEntry = (item) => {
            if (!item?.id) return;
            const idx = _history.findIndex(entry => entry.id === item.id);
            if (idx === -1) return;
            _history = _history.slice();
            _history[idx] = item;
            _selectedIdx = idx;
            _anchor = idx;
            _buildHistoryCards();
        };

        el.removeEntries = (indices, newSelectedIdx = 0) => {
            const idxSet = new Set(indices);
            _history = _history.filter((_, i) => !idxSet.has(i));
            _selectedIdx = Math.max(0, Math.min(newSelectedIdx, _history.length - 1));
            _anchor = _selectedIdx;
            _buildHistoryCards();
        };

        el.exitSelectMode = () => {
            _exitSelectMode();
        };

        /**
         * Indices of currently selected history cards in click order.
         * Set iteration preserves insertion order; `_rangeSelect` walks the
         * range in click direction so the result is always chronological.
         * @returns {number[]}
         */
        el.getSelectionOrder = () => [..._selection];

        el.destroy = () => {
            _delUnsub?.();
            _reuseBtns.forEach((btn) => btn.destroy?.());
            _reuseBtns.length = 0;
        };

        // ── Init ──────────────────────────────────────────────────────────────

        _buildHistoryCards();
    },
});
