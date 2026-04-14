/**
 * MpiHistoryList — Compound: history cards for a single ItemGroup.
 *
 * Owns history card DOM building, active entry selection, and multi-select mode.
 *
 * @param {import('../../../data/projectModel.js').HistoryItem[]} [history=[]] - Initial history array
 * @param {number} [selectedIndex=0] - Initially active entry index
 *
 * Instance API (on el):
 *   el.setActiveIndex(idx)      — highlight active card (no events)
 *   el.setGroups(history)       — replace history array and rebuild cards
 *   el.appendEntry(item)        — add a new entry card at the end
 *   el.removeEntries(indices)   — remove cards at given sorted-descending indices
 *   el.exitSelectMode()         — programmatically exit select mode
 *
 * Emits:
 *   'entry-selected'   { idx, item }  — card clicked (not in select mode)
 *   'selection-changed' { indices }  — selection updated
 *   'selection-exited'  {}           — select mode ended
 *   'compare-requested' { idxA, idxB } — two items ready to compare
 *   'delete-requested'  { indices }  — deletion confirmed
 */

import { ComponentFactory } from '../../factory.js';
import { MpiSelectionBar } from '../MpiSelectionBar/MpiSelectionBar.js';
import { clientLogger } from '../../../services/clientLogger.js';

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

export const MpiHistoryList = ComponentFactory.create({
    name: 'MpiHistoryList',
    css: ['js/components/Compounds/MpiHistoryList/MpiHistoryList.css'],

    template: () => `
        <div class="mpi-history-list">
            <div class="mpi-history-list__cards" id="cards-slot"></div>
            <div class="mpi-history-list__selbar-slot hide" id="selbar-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        /** @type {import('../../../data/projectModel.js').HistoryItem[]} */
        let _history = props.history || [];
        let _selectedIdx = props.selectedIndex ?? 0;
        let _selectMode = false;
        /** @type {Set<number>} */
        const _selection = new Set();

        /** @type {HTMLElement[]} */
        const _historyCards = [];

        // ── URL resolver (same logic as groupHistory.js) ───────────────────────

        // ── Selection bar ────────────────────────────────────────────────────

        const selectionBar = MpiSelectionBar.mount(el.querySelector('#selbar-slot'), { count: 0 });

        selectionBar.on('compare', () => {
            if (_selection.size !== 2) return;
            const [idxA, idxB] = [..._selection];
            emit('compare-requested', { idxA, idxB });
        });

        selectionBar.on('delete', () => {
            emit('delete-requested', { indices: [..._selection] });
        });

        selectionBar.on('cancel', () => {
            _exitSelectMode();
            emit('selection-exited');
        });

        // ── Card building ─────────────────────────────────────────────────────

        function _buildHistoryCards() {
            const container = el.querySelector('#cards-slot');
            container.innerHTML = '';
            _historyCards.length = 0;

            _history.forEach((item, idx) => {
                const card = document.createElement('div');
                card.className = 'mpi-history-list__card';

                // Checkbox — checking one enters select mode
                const cbWrap = document.createElement('label');
                cbWrap.className = 'mpi-history-list__cb-wrap';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'mpi-history-list__cb';
                cb.checked = _selection.has(idx);
                cb.addEventListener('change', (e) => {
                    e.stopPropagation();
                    _toggleSelection(idx, cb.checked);
                });
                cbWrap.appendChild(cb);

                const thumb = document.createElement('img');
                thumb.className = 'mpi-history-list__thumb';
                thumb.alt = '';
                if (item.filePath) thumb.src = _resolveUrl(item.filePath);

                const meta = document.createElement('div');
                meta.className = 'mpi-history-list__meta';

                const label = document.createElement('div');
                label.className = 'mpi-history-list__label';
                label.textContent = item.operation || item.type || '';

                const date = document.createElement('div');
                date.className = 'mpi-history-list__date';
                date.textContent = item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString()
                    : '';

                meta.append(label, date);
                card.append(cbWrap, thumb, meta);

                card.addEventListener('click', (e) => {
                    if (e.target === cb || e.target === cbWrap) return;
                    if (_selectMode) {
                        _toggleSelection(idx, !_selection.has(idx));
                    } else {
                        _selectEntry(idx);
                    }
                });

                container.appendChild(card);
                _historyCards.push(card);
            });

            _applyCardStates();
        }

        function _applyCardStates() {
            _historyCards.forEach((card, idx) => {
                card.classList.toggle('mpi-history-list__card--active', idx === _selectedIdx);
                card.classList.toggle('mpi-history-list__card--selected', _selection.has(idx));
                const cb = card.querySelector('.mpi-history-list__cb');
                if (cb) cb.checked = _selection.has(idx);
            });
        }

        function _selectEntry(idx) {
            _selectedIdx = idx;
            _applyCardStates();
            emit('entry-selected', { idx, item: _history[idx] });
        }

        function _toggleSelection(idx, checked) {
            if (checked) {
                _selection.add(idx);
            } else {
                _selection.delete(idx);
            }

            if (_selection.size > 0 && !_selectMode) {
                _enterSelectMode();
            } else if (_selection.size === 0 && _selectMode) {
                _exitSelectMode();
                return;
            }

            _applyCardStates();
            selectionBar.el.setCount(_selection.size);
            emit('selection-changed', { indices: [..._selection] });
        }

        function _enterSelectMode() {
            _selectMode = true;
            el.querySelector('#selbar-slot').classList.remove('hide');
        }

        function _exitSelectMode() {
            _selectMode = false;
            _selection.clear();
            el.querySelector('#selbar-slot').classList.add('hide');
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
            _buildHistoryCards();
        };

        el.appendEntry = (item) => {
            _history = [..._history, item];
            const container = el.querySelector('#cards-slot');
            const idx = _history.length - 1;

            const card = document.createElement('div');
            card.className = 'mpi-history-list__card';

            const cbWrap = document.createElement('label');
            cbWrap.className = 'mpi-history-list__cb-wrap';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'mpi-history-list__cb';
            cb.checked = false;
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                _toggleSelection(idx, cb.checked);
            });
            cbWrap.appendChild(cb);

            const thumb = document.createElement('img');
            thumb.className = 'mpi-history-list__thumb';
            thumb.alt = '';
            if (item.filePath) thumb.src = _resolveUrl(item.filePath);

            const meta = document.createElement('div');
            meta.className = 'mpi-history-list__meta';

            const label = document.createElement('div');
            label.className = 'mpi-history-list__label';
            label.textContent = item.operation || item.type || '';

            const date = document.createElement('div');
            date.className = 'mpi-history-list__date';
            date.textContent = item.createdAt
                ? new Date(item.createdAt).toLocaleDateString()
                : '';

            meta.append(label, date);
            card.append(cbWrap, thumb, meta);

            card.addEventListener('click', (e) => {
                if (e.target === cb || e.target === cbWrap) return;
                if (_selectMode) {
                    _toggleSelection(idx, !_selection.has(idx));
                } else {
                    _selectEntry(idx);
                }
            });

            container.appendChild(card);
            _historyCards.push(card);
            _applyCardStates();
        };

        el.removeEntries = (indices) => {
            // indices are sorted descending (plan guarantees this)
            const idxSet = new Set(indices);
            _history = _history.filter((_, i) => !idxSet.has(i));
            _buildHistoryCards();
        };

        el.exitSelectMode = () => {
            _exitSelectMode();
        };

        // ── Init ──────────────────────────────────────────────────────────────

        _buildHistoryCards();
    },
});
