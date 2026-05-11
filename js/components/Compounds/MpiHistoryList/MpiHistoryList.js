/**
 * MpiHistoryList — Compound: history cards for a single ItemGroup.
 *
 * Owns history card DOM building, active entry selection, and multi-select mode.
 *
 * @param {import('../../../data/projectModel.js').HistoryItem[]} [history=[]] - Initial history array
 * @param {number} [selectedIndex=0] - Initially active entry index
 * @param {boolean} [isVideo=false] - Whether the group is a video group (disables Compare)
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
 */

import { ComponentFactory } from '../../factory.js';
import { qs } from '../../../utils/dom.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { MpiContextMenu } from '../MpiContextMenu/MpiContextMenu.js';

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
        let _devMode = false; // default: show custom menu; true = allow native (dev inspect-element)
        import('../../../../dev_configs/app_config.js')
            .then(({ APP_CONFIG }) => { _devMode = APP_CONFIG.dev_mode ?? false; })
            .catch(() => {});
        /** @type {Set<number>} */
        const _selection = new Set();
        let _anchor = 0;

        /** @type {HTMLElement[]} */
        const _historyCards = [];

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

            const status = document.createElement('span');
            status.className = 'mpi-history-list__status';

            meta.append(label, dims);
            card.append(thumb, meta, status);

            card.addEventListener('mousedown', (e) => {
                if (e.shiftKey) e.preventDefault();
            });

            card.addEventListener('click', (e) => {
                if (e.shiftKey) {
                    _rangeSelect(idx);
                } else if (e.ctrlKey || e.metaKey) {
                    if (!_selectMode && _selection.size === 0) {
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

            card.addEventListener('contextmenu', (e) => {
                if (_devMode) return;
                e.preventDefault();

                if (!_selection.has(idx)) {
                    _exitSelectMode();
                    _selection.add(idx);
                    _anchor = idx;
                    _selectMode = true;
                    _applyCardStates();
                    emit('selection-changed', { indices: [..._selection], anchor: _anchor });
                }

                const compareDisabled = _selection.size !== 2;
                MpiContextMenu.show({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                        { key: 'compare', icon: 'compare', label: 'Compare', disabled: compareDisabled },
                        { key: 'delete',  icon: 'trash',   label: 'Delete',  danger: true },
                    ],
                    onSelect: (key) => {
                        if (key === 'delete') {
                            emit('delete-selected', { indices: [..._selection] });
                        } else if (key === 'compare') {
                            const idxs = [..._selection];
                            emit('compare-requested', { indices: idxs });
                        }
                    },
                });
            });

            return card;
        }

        function _buildHistoryCards() {
            _dimsLogged = false;
            const container = qs('#cards-slot', el);
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
            const from = Math.min(_anchor, idx);
            const to   = Math.max(_anchor, idx);
            _selection.clear();
            for (let i = from; i <= to; i++) _selection.add(i);
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

        // ── Init ──────────────────────────────────────────────────────────────

        _buildHistoryCards();
    },
});
