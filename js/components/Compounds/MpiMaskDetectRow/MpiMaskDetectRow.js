/**
 * MpiMaskDetectRow — Compound: the run / commit row shared by every
 * detection-based mask tool (MPI-371).
 *
 * Thumbs strip · Detect button · Add / Subtract. Mounted by Detect and Points
 * today, and by Text (MPI-361 Phase B) when it lands — the three differ only in
 * what they feed the graph, never in how a result is reviewed and committed.
 *
 * A detect run is a generation, so the whole row is blocked while Cue has real
 * jobs. Add / Subtract bake the detected region into the paint layers app-side
 * (MaskManager.bakeAutoPicksInto) — that is why they compose with the brush and
 * preserve undo.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   getAutoMaskThumbsEl?(), runAutoMaskDetect(), cancelAutoMaskDetect(),
 *   isAutoMaskRunning(), bakeAutoPicks('manual'|'subtract')
 *
 * The thumbs node is OWNED BY THE VIEWER — re-parented here, never destroyed.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs }        from '../../../utils/dom.js';
import { Events }    from '../../../events.js';
import { state }     from '../../../state.js';

const QUEUE_DISABLED_REASON = 'Auto detection is unavailable while Cue has running or queued jobs';

export const MpiMaskDetectRow = ComponentFactory.create({
    name: 'MpiMaskDetectRow',
    css: ['js/components/Compounds/MpiMaskDetectRow/MpiMaskDetectRow.css'],

    template: () => `
        <div class="mpi-mask-detect-row">
            <div class="mpi-mask-detect-row__note" id="queue-note" hidden>
                Auto detection unavailable while Cue is active
            </div>
            <div class="mpi-mask-detect-row__gated" id="gated">
                <div class="mpi-mask-detect-row__thumbs" id="thumbs-slot"></div>
                <div class="mpi-mask-detect-row__row"    id="detect-slot"></div>
                <div class="mpi-mask-detect-row__row"    id="commit-slot"></div>
            </div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];
        const gated     = qs('#gated', el);
        const queueNote = qs('#queue-note', el);
        let _blocked = false;
        // Seeded from the viewer, not from false: a tool switch mid-run mounts a
        // fresh row that missed the `automask:running` emit, and it must not show
        // Detect while a run is still in flight.
        let _running = viewer.el.isAutoMaskRunning?.() === true;

        const thumbsEl = viewer.el.getAutoMaskThumbsEl?.();
        if (thumbsEl) qs('#thumbs-slot', el).appendChild(thumbsEl);

        // MPI-421: a detect is a ComfyUI run that used to be completely invisible —
        // the button did not change, so a slow pass read as a hang, and the exec's
        // cancel() had nothing wired to it. The button IS the busy state, and it is
        // ONE button re-mounted, not two swapped by `hidden`. Two reasons, both
        // measured the hard way on 2026-08-04:
        //   1. `ComponentFactory.mount()` does `container.innerHTML = html`, so
        //      mounting a second button into this slot DELETES the first one.
        //   2. `.mpi-btn { display: inline-flex }` outranks the UA
        //      `[hidden] { display: none }`, so `el.hidden = true` does not hide a
        //      button at all — the same trap docs/masking-adjust.md records for the
        //      inert slider row.
        // Together those left Stop permanently on screen with no way to reach Detect.
        const detectSlot = qs('#detect-slot', el);
        let detectBtn = null;

        function _mountDetectBtn() {
            detectBtn?.destroy?.();
            detectBtn = MpiButton.mount(detectSlot, _running
                ? { icon: 'stop',   label: 'Stop',   size: 'sm', variant: 'danger',
                    info: 'Stop the detection' }
                : { icon: 'search', label: 'Detect', size: 'sm', variant: 'primary',
                    info: 'Run detection' });
            detectBtn.on('click', () => {
                if (_running) { viewer.el.cancelAutoMaskDetect?.(); return; }
                if (_blocked) return;
                viewer.el.runAutoMaskDetect?.();
            });
        }
        _mountDetectBtn();

        const _offRunning = Events.on('automask:running', ({ running }) => {
            const next = !!running;
            if (next === _running) return;
            _running = next;
            _mountDetectBtn();
            _syncGate();
        });

        // Add / Subtract — a run renders green (MpiCanvas._recolorMaskLayer) and
        // waits to be committed. A points run returns ONE region, so this is also
        // how multi-part selections are built: Add the first part, place new dots,
        // Add again.
        const commitRow = qs('#commit-slot', el);
        const addBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'plus', label: 'Add', size: 'sm', variant: 'secondary',
            info: 'Add the detected area to the mask',
        });
        const subBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'minus', label: 'Subtract', size: 'sm', variant: 'secondary',
            info: 'Cut the detected area out of the mask',
        });
        commitRow.appendChild(addBtn.el);
        commitRow.appendChild(subBtn.el);
        addBtn.on('click', () => viewer.el.bakeAutoPicks?.('manual'));
        subBtn.on('click', () => viewer.el.bakeAutoPicks?.('subtract'));
        _children.push(addBtn, subBtn);

        // ponytail: the gate covers this row only. Before the split it wrapped the
        // whole panel, so a busy Cue also froze the model radios / Scope slider —
        // neither of which runs anything. Blocking the Detect button is the part
        // that matters.
        function _syncGate() {
            _blocked = (state.generationQueueCount || 0) > 0;
            // MPI-421: a Cue started DURING a detect must not make the Stop button
            // inert — that is the one control the user needs while a run is in
            // flight, and the gate exists to stop new runs, not to trap live ones.
            const freeze = _blocked && !_running;
            gated.classList.toggle('mpi-mask-detect-row__gated--disabled', freeze);
            gated.setAttribute('aria-disabled', freeze ? 'true' : 'false');
            if (freeze) gated.setAttribute('inert', '');
            else gated.removeAttribute('inert');
            queueNote.hidden = !_blocked;
            // While running, the button IS Stop — never disable it, and never
            // relabel its tooltip with the reason NEW runs are blocked.
            detectBtn?.el.setDisabled?.(!_running && _blocked);
            if (!_running) {
                detectBtn?.el.setAttribute('data-info', _blocked ? QUEUE_DISABLED_REASON : 'Run detection');
            }
        }

        const _offQueueGate = Events.onState('generationQueueCount', _syncGate);
        _syncGate();

        el.destroy = () => {
            _offQueueGate();
            _offRunning();
            // Detach the viewer-owned thumbs node rather than letting it be wiped
            // with our subtree — the viewer still owns the instance.
            if (thumbsEl?.parentNode) thumbsEl.parentNode.removeChild(thumbsEl);
            detectBtn?.destroy?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
