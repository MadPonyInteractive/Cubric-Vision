import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { ce } from '/js/utils/dom.js';

/**
 * MpiSelectionBar — Compound: action bar shown when selection mode is active.
 *
 * Replaces the PromptBox in the gallery footer when one or more groups are selected.
 * Compare is only enabled when exactly 2 groups are selected.
 *
 * Props:
 * @param {number} [count=0] - Initial selected count
 *
 * Instance methods (on instance.el):
 *   setCount(n) — update selected count; auto-enables/disables compare button
 *
 * Emits:
 *   'compare'   {} — compare button clicked (only possible when count === 2)
 *   'download'  {} — download button clicked
 *   'delete'    {} — delete button clicked
 *   'cancel'    {} — cancel / exit selection mode
 */
export const MpiSelectionBar = ComponentFactory.create({
    name: 'MpiSelectionBar',
    css: ['js/components/Compounds/MpiSelectionBar/MpiSelectionBar.css'],

    template: () => `<div class="mpi-selection-bar"></div>`,

    setup: (el, props, emit) => {
        let _count = props.count || 0;

        // ── Count label ─────────────────────────────────────────────────────────

        const countEl = ce('span', {
            className: 'mpi-selection-bar__count',
        });

        // ── Action buttons ──────────────────────────────────────────────────────

        const compareWrap  = ce('div');
        const downloadWrap = ce('div');
        const deleteWrap   = ce('div');
        const cancelWrap   = ce('div');

        const compareBtn  = MpiButton.mount(compareWrap,  { icon: 'compare',  label: 'Compare',  variant: 'ghost', size: 'sm' });
        const downloadBtn = MpiButton.mount(downloadWrap, { icon: 'download', label: 'Download', variant: 'ghost', size: 'sm' });
        const deleteBtn   = MpiButton.mount(deleteWrap,   { icon: 'delete',   label: 'Delete',   variant: 'danger', size: 'sm' });
        const cancelBtn   = MpiButton.mount(cancelWrap,   { icon: 'close',    label: 'Cancel',   variant: 'ghost', size: 'sm' });

        compareBtn.on('click',  () => emit('compare',  {}));
        downloadBtn.on('click', () => emit('download', {}));
        deleteBtn.on('click',   () => emit('delete',   {}));
        cancelBtn.on('click',   () => emit('cancel',   {}));

        el.append(countEl, compareWrap, downloadWrap, deleteWrap, cancelWrap);

        // ── Render ──────────────────────────────────────────────────────────────

        function _render() {
            countEl.textContent = `x${_count}`;
            // Compare only makes sense with exactly 2 items
            compareWrap.style.display = _count === 2 ? '' : 'none';
            // Download and delete require at least 1
            downloadWrap.style.display = _count > 0 ? '' : 'none';
            deleteWrap.style.display   = _count > 0 ? '' : 'none';
        }

        _render();

        // ── Public API ──────────────────────────────────────────────────────────

        /** @param {number} n */
        el.setCount = (n) => {
            _count = n;
            _render();
        };
    }
});
